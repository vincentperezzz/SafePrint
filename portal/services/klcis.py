"""
KLCiS Dashboard Automation Service

Automates voucher creation and payment verification on KLCiS by:
1. Logging into the KLCiS dashboard via requests session
2. Creating vouchers via the direct API (core/create_voucher_core)
3. Verifying payments by checking the sold_vouchers table on voucher_status page
4. Constructing direct checkout URLs that bypass the shop

Session Management:
- Uses a thread-safe SINGLETON client so only ONE session is shared across
  all requests (multiple students, background polling, etc.)
- Logs in once, keeps the PHPSESSID cookie alive for subsequent requests
- Automatically re-logs in if the session expires (detected by redirect to /login)
- Thread-safe via threading.Lock() — safe for Django's multi-threaded request handling

Discovered API endpoints:
- POST /login                        → Login with username/password
- POST /core/create_voucher_core     → Create voucher (data: voucher, amount)
- POST /core/delete_voucher_core     → Delete voucher (data: id)
- GET  /voucher_import               → Voucher management page
- GET  /voucher_status               → Transaction history (sold_vouchers table)
- Direct checkout (bypasses shop):
    GET /xendit/payment?token={API_KEY}&amount={PRICE}&number={PHONE}

Customer-facing shop URL (not used in direct flow):
    https://s2.klinternetservices.com/shop/v1?key={API_KEY}
"""

import re
import time
import logging
import threading
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# KLCiS API Key (from dashboard)
KLCIS_API_KEY = 'C5O1dhQ8ElS60irmTr1CsBe9X'

# KLCiS Dashboard URL paths
LOGIN_PATH = '/login'
CREATE_VOUCHER_PATH = '/core/create_voucher_core'
DELETE_VOUCHER_PATH = '/core/delete_voucher_core'
VOUCHER_STATUS_PATH = '/voucher_status'
VOUCHER_IMPORT_PATH = '/voucher_import'
XENDIT_PAYMENT_PATH = '/xendit/payment'
TRANSACTION_PATH = '/transactions'

# Session lifetime before forced re-login (25 minutes, PHP default is 24 min)
SESSION_MAX_AGE = 25 * 60


class KLCiSError(Exception):
    """Custom exception for KLCiS integration errors."""
    pass


class KLCiSClient:
    """
    Thread-safe singleton client for KLCiS dashboard operations.

    Uses a persistent requests.Session to maintain the PHPSESSID cookie
    across all operations — login happens once, then all subsequent
    voucher/payment operations reuse the same session.

    Thread safety:
    - All public methods acquire self._lock before operating
    - Django serves requests in threads; this ensures no race conditions
    - If two students hit "Pay Now" at the same time, one waits for the other

    Session lifecycle:
    - Login on first use
    - Reuse session for all subsequent requests
    - Auto-detect session expiry (KLCiS redirects to /login) and re-login
    - Force re-login after SESSION_MAX_AGE seconds as a safety net
    """

    _instance = None
    _instance_lock = threading.Lock()

    def __new__(cls):
        """Singleton: only one KLCiSClient instance exists across the app."""
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    instance = super().__new__(cls)
                    instance._initialized = False
                    cls._instance = instance
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self.base_url = settings.KLCIS_BASE_URL.rstrip('/')
        self.username = settings.KLCIS_USERNAME
        self.password = settings.KLCIS_PASSWORD
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
                          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
        self._logged_in = False
        self._login_time = 0
        self._lock = threading.Lock()
        self._initialized = True
        logger.info('KLCiS singleton client initialized')

    def _is_session_expired(self):
        """Check if the session has exceeded the max age."""
        if not self._logged_in:
            return True
        return (time.time() - self._login_time) > SESSION_MAX_AGE

    def _is_login_page(self, response):
        """Check if KLCiS redirected us to the login page (session expired)."""
        return '/login' in response.url and 'Sign in' in response.text

    def login(self):
        """
        Log into the KLCiS dashboard.
        Returns True on success, raises KLCiSError on failure.
        Called internally — no need to call from outside.
        """
        login_url = f'{self.base_url}{LOGIN_PATH}'

        try:
            resp = self.session.post(
                login_url,
                data={
                    'username': self.username,
                    'password': self.password,
                },
                timeout=15,
                allow_redirects=True
            )
            resp.raise_for_status()

            if self._is_login_page(resp):
                raise KLCiSError('Login failed: Invalid credentials')

            self._logged_in = True
            self._login_time = time.time()
            logger.info('Successfully logged into KLCiS dashboard (session started)')
            return True

        except requests.RequestException as e:
            self._logged_in = False
            raise KLCiSError(f'KLCiS login request failed: {str(e)}')

    def _ensure_logged_in(self):
        """Ensure we have an active, non-expired session. Re-login if needed."""
        if not self._logged_in or self._is_session_expired():
            logger.info('KLCiS session expired or not logged in — re-authenticating')
            self.login()

    def _request_with_reauth(self, method, url, **kwargs):
        """
        Make an HTTP request, automatically re-authenticating if session expired.
        This handles the case where KLCiS silently expires our session mid-operation.
        """
        self._ensure_logged_in()

        resp = self.session.request(method, url, **kwargs)
        resp.raise_for_status()

        # If KLCiS redirected to login page, session expired — re-auth and retry
        if self._is_login_page(resp):
            logger.warning('KLCiS session expired mid-request — re-authenticating')
            self._logged_in = False
            self.login()
            resp = self.session.request(method, url, **kwargs)
            resp.raise_for_status()

        return resp

    def create_voucher(self, voucher_code, amount):
        """
        Create a single voucher on KLCiS via the direct API endpoint.

        Args:
            voucher_code: The unique voucher code (e.g., 'sp4a05bx')
            amount: The amount in pesos (will be converted to integer)

        Returns:
            True on success, raises KLCiSError on failure.
        """
        with self._lock:
            create_url = f'{self.base_url}{CREATE_VOUCHER_PATH}'
            amount_int = int(round(float(amount)))

            try:
                resp = self._request_with_reauth(
                    'POST', create_url,
                    data={'voucher': voucher_code, 'amount': amount_int},
                    timeout=15
                )

                if resp.text.strip().lower() == 'success':
                    logger.info(f'Created voucher {voucher_code} (₱{amount_int}) on KLCiS')
                    return True
                else:
                    raise KLCiSError(
                        f'Voucher creation failed: KLCiS returned "{resp.text.strip()}"'
                    )

            except requests.RequestException as e:
                raise KLCiSError(f'KLCiS voucher creation request failed: {str(e)}')

    def get_direct_checkout_url(self, amount, phone_number):
        """
        Construct the direct checkout URL that bypasses the KLCiS shop page
        and takes the student directly to Xendit/GCash payment.

        No login needed — this is a public URL.

        Args:
            amount: The amount in pesos (integer)
            phone_number: Student's phone number for SMS receipt

        Returns:
            The direct checkout URL string
        """
        amount_int = int(round(float(amount)))
        return (
            f'{self.base_url}{XENDIT_PAYMENT_PATH}'
            f'?token={KLCIS_API_KEY}'
            f'&amount={amount_int}'
            f'&number={phone_number}'
        )

    def check_voucher_paid(self, voucher_code):
        """
        Check if a voucher has been paid by looking at the KLCiS
        voucher_status page's 'sold_vouchers' (Paid and Settled) table.

        Args:
            voucher_code: The voucher code to check

        Returns:
            True if the voucher appears in the sold/paid table, False otherwise
        """
        with self._lock:
            status_url = f'{self.base_url}{VOUCHER_STATUS_PATH}'

            try:
                resp = self._request_with_reauth('GET', status_url, timeout=15)

                # Find the sold_vouchers table content
                sold_table = re.search(
                    r'<table[^>]*id="sold_vouchers"[^>]*>(.*?)</table>',
                    resp.text, re.DOTALL | re.IGNORECASE
                )

                if sold_table and voucher_code in sold_table.group(1):
                    logger.info(f'Voucher {voucher_code} found in paid/sold table')
                    return True

                # Also check the voucher_import page for status changes
                import_url = f'{self.base_url}{VOUCHER_IMPORT_PATH}'
                resp2 = self._request_with_reauth('GET', import_url, timeout=15)

                # Look for the voucher code and check its status in the table
                # The table columns are: Voucher Code | Status | Amount | Date | Actions
                voucher_idx = resp2.text.find(voucher_code)
                if voucher_idx > -1:
                    row_start = resp2.text.rfind('<tr', 0, voucher_idx)
                    row_end = resp2.text.find('</tr>', voucher_idx)
                    if row_start > -1 and row_end > -1:
                        row_html = resp2.text[row_start:row_end + 5]
                        cells = re.findall(r'<td[^>]*>(.*?)</td>', row_html, re.DOTALL)
                        if len(cells) >= 2:
                            status_cell = re.sub(r'<[^>]+>', '', cells[1]).strip().lower()
                            if status_cell in ('sold', 'paid', 'used', 'redeemed'):
                                logger.info(
                                    f'Voucher {voucher_code} status="{status_cell}" on import page'
                                )
                                return True

                return False

            except requests.RequestException as e:
                logger.error(f'Failed to check voucher status: {str(e)}')
                return False

    def check_transaction_paid(self, phone_number, amount):
        """
        Check if a payment has been completed by checking the KLCiS
        Transaction Logs page (/transactions) for a PAID entry matching
        the given phone number and amount.

        The direct checkout URL creates transactions (not voucher sales),
        so this is the correct verification method for the "Boss" flow.

        Table columns: Claim Key | Date | Amount | Status | Contact | Email | Transaction ID | Action

        Args:
            phone_number: The student's phone number used during checkout
            amount: The expected payment amount in pesos

        Returns:
            True if a matching PAID transaction is found, False otherwise
        """
        with self._lock:
            transactions_url = f'{self.base_url}{TRANSACTION_PATH}'

            try:
                resp = self._request_with_reauth('GET', transactions_url, timeout=15)

                # Normalize phone number for matching (remove leading +63, spaces, dashes)
                clean_phone = re.sub(r'[\s\-\+]', '', phone_number)
                if clean_phone.startswith('63') and len(clean_phone) > 10:
                    clean_phone = '0' + clean_phone[2:]

                amount_int = int(round(float(amount)))

                # Parse all table rows
                rows = re.findall(r'<tr[^>]*>(.*?)</tr>', resp.text, re.DOTALL)

                for row in rows:
                    cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
                    if not cells or len(cells) < 5:
                        continue

                    # Actual rendered columns (6 cells):
                    # 0=Date, 1=Amount, 2=Status, 3=Contact, 4=Transaction ID, 5=Action
                    status_text = re.sub(r'<[^>]+>', '', cells[2]).strip().upper()
                    contact_text = re.sub(r'<[^>]+>', '', cells[3]).strip()
                    amount_text = re.sub(r'<[^>]+>', '', cells[1]).strip()

                    # Normalize contact number
                    clean_contact = re.sub(r'[\s\-\+]', '', contact_text)
                    if clean_contact.startswith('63') and len(clean_contact) > 10:
                        clean_contact = '0' + clean_contact[2:]

                    # Extract numeric amount (strip ₱, commas, spaces)
                    amount_match = re.search(r'[\d,]+\.?\d*', amount_text)
                    if not amount_match:
                        continue
                    row_amount = float(amount_match.group().replace(',', ''))
                    row_amount_int = int(round(row_amount))

                    # Match: PAID status + matching phone + matching amount
                    if (status_text == 'PAID'
                            and clean_contact == clean_phone
                            and row_amount_int == amount_int):
                        txn_id = re.sub(r'<[^>]+>', '', cells[4]).strip()
                        logger.info(
                            f'Transaction PAID found: phone={contact_text}, '
                            f'amount=₱{row_amount_int}, txn_id={txn_id}'
                        )
                        return True

                logger.debug(
                    f'No PAID transaction found for phone={phone_number}, amount=₱{amount_int}'
                )
                return False

            except requests.RequestException as e:
                logger.error(f'Failed to check transaction status: {str(e)}')
                return False

    def delete_voucher(self, voucher_id):
        """Delete a voucher from KLCiS by its internal ID."""
        with self._lock:
            delete_url = f'{self.base_url}{DELETE_VOUCHER_PATH}'
            try:
                resp = self._request_with_reauth(
                    'POST', delete_url,
                    data={'id': voucher_id},
                    timeout=15
                )
                return resp.text.strip().lower() == 'success'
            except requests.RequestException as e:
                logger.warning(f'Failed to delete voucher {voucher_id}: {str(e)}')
                return False


# ─────────────────────────────────────────────
# PUBLIC CONVENIENCE FUNCTIONS
# These use the singleton client — no login/logout per call
# ─────────────────────────────────────────────

def _get_client():
    """Get the singleton KLCiS client instance."""
    return KLCiSClient()


def create_and_upload_voucher(voucher_code, amount):
    """
    Create a voucher on KLCiS and return the result.

    Uses the singleton client — reuses existing session if available.
    Multiple simultaneous calls are thread-safe.

    Args:
        voucher_code: The unique voucher code
        amount: The amount in pesos

    Returns:
        dict with 'success' and 'message' keys
    """
    try:
        client = _get_client()
        client.create_voucher(voucher_code, amount)
        return {
            'success': True,
            'message': f'Voucher {voucher_code} created successfully'
        }
    except KLCiSError as e:
        logger.error(f'KLCiS voucher creation failed: {str(e)}')
        return {
            'success': False,
            'message': str(e)
        }
    except Exception as e:
        logger.error(f'Unexpected error in KLCiS integration: {str(e)}')
        return {
            'success': False,
            'message': f'Unexpected error: {str(e)}'
        }


def verify_voucher_payment(voucher_code):
    """
    Check if a voucher has been paid on KLCiS.

    Uses the singleton client — no re-login unless session expired.

    Args:
        voucher_code: The voucher code to verify

    Returns:
        dict with 'success' (True if paid) and 'message' keys
    """
    try:
        client = _get_client()
        is_paid = client.check_voucher_paid(voucher_code)
        return {
            'success': is_paid,
            'message': 'Payment verified' if is_paid else 'Payment not yet confirmed'
        }
    except KLCiSError as e:
        logger.error(f'KLCiS payment verification failed: {str(e)}')
        return {
            'success': False,
            'message': str(e)
        }
    except Exception as e:
        logger.error(f'Unexpected error in payment verification: {str(e)}')
        return {
            'success': False,
            'message': f'Unexpected error: {str(e)}'
        }


def get_checkout_url(amount, phone_number):
    """
    Get the direct checkout URL for Xendit/GCash payment.

    No login needed — constructs the URL directly.

    Args:
        amount: Amount in pesos
        phone_number: Student's phone number

    Returns:
        The direct checkout URL string
    """
    client = _get_client()
    return client.get_direct_checkout_url(amount, phone_number)


def verify_transaction_payment(phone_number, amount):
    """
    Check if a direct-checkout payment has been completed on KLCiS
    by checking the Transaction Logs page for a PAID entry matching
    the given phone number and amount.

    This is the primary verification method for the direct checkout flow
    (student → GCash → Xendit → KLCiS transaction log).

    Args:
        phone_number: Student's phone number used during checkout
        amount: Expected payment amount in pesos

    Returns:
        dict with 'success' (True if paid) and 'message' keys
    """
    try:
        client = _get_client()
        is_paid = client.check_transaction_paid(phone_number, amount)
        return {
            'success': is_paid,
            'message': 'Payment verified' if is_paid else 'Payment not yet confirmed'
        }
    except KLCiSError as e:
        logger.error(f'KLCiS transaction verification failed: {str(e)}')
        return {
            'success': False,
            'message': str(e)
        }
    except Exception as e:
        logger.error(f'Unexpected error in transaction verification: {str(e)}')
        return {
            'success': False,
            'message': f'Unexpected error: {str(e)}'
        }
