# KLCiS Payment Integration — SafePrint

> **Last Updated:** February 2026
> **Author:** SafePrint Dev Team
> **Status:** Production-ready

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Payment Flow (Student Perspective)](#payment-flow-student-perspective)
4. [Payment Flow (System Perspective)](#payment-flow-system-perspective)
5. [KLCiS API Endpoints](#klcis-api-endpoints)
6. [Session Management](#session-management)
7. [Files Modified](#files-modified)
8. [Configuration](#configuration)
9. [Database Changes](#database-changes)
10. [Frontend Changes](#frontend-changes)
11. [JavaScript Fixes (admin.js)](#javascript-fixes-adminjs)
12. [Troubleshooting](#troubleshooting)

---

## Overview

SafePrint integrates with **KLCiS (KL Internet Services)** as a transaction middleman to the **Xendit** payment gateway. This allows students to pay for their print jobs via **GCash, Maya, and other e-wallets** without SafePrint needing a direct Xendit merchant account.

### Why KLCiS?

- SafePrint runs on a **local network** (Dell Optiplex behind Pi-hole/DuckDNS) and is **not publicly accessible** — webhooks from Xendit can't reach it.
- KLCiS handles the Xendit integration and provides a web dashboard where we can verify payments.
- We use a **"Pull" model** — SafePrint polls the KLCiS dashboard to check payment status instead of waiting for webhook callbacks.

### Key Design Decision: Direct Checkout ("Boss" Flow)

Instead of sending students to the KLCiS shop page (where they'd need to browse products and enter a phone number), we use a **direct checkout URL** that bypasses the shop entirely:

```
https://s2.klinternetservices.com/xendit/payment?token={API_KEY}&amount={PRICE}&number={PHONE}
```

This takes the student **straight to GCash/Xendit** — zero extra steps.

---

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Student    │         │   SafePrint  │         │    KLCiS     │
│   Browser    │         │   (Django)   │         │  Dashboard   │
└──────┬──────┘         └──────┬───────┘         └──────┬───────┘
       │                       │                        │
       │  1. Enter phone       │                        │
       │  + Click "Pay Now"    │                        │
       │──────────────────────>│                        │
       │                       │                        │
       │                       │  2. POST /core/        │
       │                       │  create_voucher_core   │
       │                       │───────────────────────>│
       │                       │                        │
       │                       │  3. "success"          │
       │                       │<───────────────────────│
       │                       │                        │
       │  4. Open GCash in     │                        │
       │     new tab (direct   │                        │
       │     checkout URL)     │                        │
       │<──────────────────────│                        │
       │                       │                        │
       │  5. Pay via GCash     │                        │
       │─────────────────────────────────────────────>  │ (Xendit)
       │                       │                        │
       │  6. Click "I Have     │                        │
       │     Paid" (or auto-   │                        │
       │     poll every 5s)    │                        │
       │──────────────────────>│                        │
       │                       │                        │
       │                       │  7. GET /voucher_status│
       │                       │  (check sold_vouchers  │
       │                       │   table for voucher)   │
       │                       │───────────────────────>│
       │                       │                        │
       │                       │  8. Found in table     │
       │                       │  = Payment confirmed   │
       │                       │<───────────────────────│
       │                       │                        │
       │  9. "Payment verified!│                        │
       │     Redirect to       │                        │
       │     confirmation"     │                        │
       │<──────────────────────│                        │
       │                       │                        │
       │                       │  10. doc_status =      │
       │                       │      'Queued'          │
       │                       │  (triggers WRR print)  │
       │                       │                        │
```

---

## Payment Flow (Student Perspective)

1. **Upload documents** → Get Customer ID (e.g., `CID-4405`)
2. **Redirected to payment page** → See document list + total price
3. **Enter phone number** (09XX XXX XXXX) → Click **"Pay ₱45 Now"**
4. **GCash opens in new tab** → Complete the payment
5. **Return to SafePrint tab** → Click **"I Have Paid ✓"** (or wait for auto-detection)
6. **"Payment verified!"** → Auto-redirect to confirmation page
7. **Documents are queued** for printing automatically

### Auto-Polling

The payment page automatically polls every 5 seconds in the background. Even if the student doesn't click "I Have Paid", the system will detect the payment and redirect them automatically.

- **Max polling duration:** 5 minutes (60 attempts × 5 seconds)
- **Polling stops** when: payment confirmed, max attempts reached, or page closed

---

## Payment Flow (System Perspective)

### Step 1: Initiate Payment (`action=initiate`)

**Request:** `POST /payment/`
```json
{
    "action": "initiate",
    "customer_id": "CID-4405",
    "doc_ids": ["DOC-1001", "DOC-1002"],
    "phone_number": "09171234567"
}
```

**Backend actions:**
1. Calculate total price from `Payment` records
2. Generate random 8-character voucher code (e.g., `sp4a05bx`)
3. Create voucher on KLCiS via `POST /core/create_voucher_core`
4. Store `voucher_code` and `payment_method='klcis'` in all `Payment` records
5. Build direct checkout URL

**Response:**
```json
{
    "success": true,
    "message": "Payment link created",
    "checkout_url": "https://s2.klinternetservices.com/xendit/payment?token=...&amount=45&number=09171234567",
    "voucher_code": "sp4a05bx",
    "amount": 45
}
```

### Step 2: Verify Payment (`action=verify`)

**Request:** `POST /payment/`
```json
{
    "action": "verify",
    "customer_id": "CID-4405"
}
```

**Backend actions:**
1. Find unpaid `Payment` records for this customer that have a `voucher_code`
2. Log into KLCiS (reuses singleton session)
3. Check `voucher_status` page → look for voucher in `sold_vouchers` table
4. Also check `voucher_import` page for status column changes
5. If found as paid: mark all payments as `Paid`, set documents to `Queued`

**Response (success):**
```json
{
    "success": true,
    "message": "Payment verified! Your documents are now queued for printing.",
    "redirect_url": "/confirmation/CID-4405/"
}
```

**Response (pending):**
```json
{
    "success": false,
    "error": "Payment not yet confirmed. Please complete the payment and try again.",
    "status": "pending"
}
```

---

## KLCiS API Endpoints

All endpoints are on `https://s2.klinternetservices.com`:

| Method | Path | Purpose | Data |
|--------|------|---------|------|
| `POST` | `/login` | Dashboard login | `username`, `password` |
| `POST` | `/core/create_voucher_core` | Create a voucher | `voucher`, `amount` → returns `"success"` |
| `POST` | `/core/delete_voucher_core` | Delete a voucher | `id` → returns `"success"` |
| `POST` | `/core/edit_voucher_core` | Edit a voucher | (not used) |
| `GET` | `/voucher_import` | Voucher management page | Table: Code, Status, Amount, Date, Actions |
| `GET` | `/voucher_status` | Transaction history | Table `#sold_vouchers`: Date, Code, Amount, Status, Number, TxID |
| `GET` | `/xendit/payment?token=...&amount=...&number=...` | Direct checkout (public) | Bypasses shop, goes to Xendit |
| `GET` | `/shop/v1?key=...` | Shop page (not used) | — |

### KLCiS Credentials

```
Username: Safeprint2025
Password: @Safeprint2025
API Key:  C5O1dhQ8ElS60irmTr1CsBe9X
```

These are configured in `venv/.env` and read via `python-decouple`.

---

## Session Management

### The Problem

SafePrint is a local server. When multiple students pay simultaneously and each polls every 5 seconds, a naive implementation would log into KLCiS on **every single request** — potentially 10+ login requests every 5 seconds.

### The Solution: Thread-Safe Singleton

The `KLCiSClient` class implements the **Singleton pattern** with thread safety:

```python
class KLCiSClient:
    _instance = None
    _instance_lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    instance = super().__new__(cls)
                    cls._instance = instance
        return cls._instance
```

**How it works:**

1. **First request:** Creates a new `KLCiSClient`, logs into KLCiS, stores the PHPSESSID cookie
2. **Subsequent requests:** Returns the SAME instance — no re-login, reuses the existing session
3. **Session expiry:** If KLCiS redirects to `/login` (session expired), automatically re-authenticates
4. **Safety net:** Forces re-login after 25 minutes (PHP default session timeout is ~24 minutes)
5. **Thread safety:** All operations acquire a `threading.Lock()` — safe for Django's multi-threaded request handling

### Session Lifecycle Diagram

```
Student A pays    ──► KLCiSClient() ──► Login ──► Session created (PHPSESSID)
Student B pays    ──► KLCiSClient() ──► Same instance! ──► Reuse session
Student C polls   ──► KLCiSClient() ──► Same instance! ──► Reuse session
... (25 min pass) ...
Student D polls   ──► KLCiSClient() ──► Session expired ──► Auto re-login
Student E pays    ──► KLCiSClient() ──► Same instance! ──► Reuse new session
```

### Key Methods

| Method | Purpose |
|--------|---------|
| `_ensure_logged_in()` | Checks session age, logs in if expired |
| `_request_with_reauth()` | Makes HTTP request, auto-retries on session expiry |
| `_is_session_expired()` | Checks if session exceeds 25-minute max age |
| `_is_login_page()` | Detects if KLCiS redirected us to the login page |

---

## Files Modified

### New Files

| File | Purpose |
|------|---------|
| `portal/services/__init__.py` | Package init (empty) |
| `portal/services/klcis.py` | KLCiS dashboard automation service (singleton client) |
| `portal/migrations/0014_add_voucher_code_to_payment.py` | Migration for Payment model fields |
| `docs/KLCIS_PAYMENT_INTEGRATION.md` | This documentation |

### Modified Files

| File | Changes |
|------|---------|
| `SafePrint/settings.py` | Added `KLCIS_BASE_URL`, `KLCIS_USERNAME`, `KLCIS_PASSWORD` settings |
| `venv/.env` | Added KLCiS credentials |
| `requirements.txt` | Added `requests` library |
| `portal/models.py` | Added `voucher_code` and `payment_method` fields to `Payment` model |
| `portal/views.py` | Rewrote `payment()` view with `initiate` and `verify` actions |
| `templates/payment.html` | New UX: phone number → GCash → auto-poll verify |
| `static/js/admin.js` | Fixed SSE reconnection bugs, removed duplicate modal handlers |
| `staticfiles/js/admin.js` | Copied from `static/js/admin.js` |

---

## Configuration

### Environment Variables (`venv/.env`)

```ini
KLCIS_BASE_URL=https://s2.klinternetservices.com
KLCIS_USERNAME=Safeprint2025
KLCIS_PASSWORD=@Safeprint2025
```

### Django Settings (`SafePrint/settings.py`)

```python
# KLCiS Payment Integration
KLCIS_BASE_URL = config('KLCIS_BASE_URL', default='https://s2.klinternetservices.com')
KLCIS_USERNAME = config('KLCIS_USERNAME', default='')
KLCIS_PASSWORD = config('KLCIS_PASSWORD', default='')
```

### Dependencies (`requirements.txt`)

```
requests  # HTTP client for KLCiS dashboard automation
```

---

## Database Changes

### Migration: `0014_add_voucher_code_to_payment`

Added two fields to the `Payment` model:

| Field | Type | Purpose |
|-------|------|---------|
| `voucher_code` | `CharField(max_length=50, unique=True, null=True)` | KLCiS voucher code (e.g., `sp4a05bx`) |
| `payment_method` | `CharField(max_length=50, null=True)` | Payment method identifier (`klcis`, etc.) |

### Payment Model (Updated)

```python
class Payment(models.Model):
    doc = models.ForeignKey(Document, ...)
    price = models.DecimalField(...)
    payment_status = models.CharField(...)          # 'Unpaid' → 'Paid'
    voucher_code = models.CharField(...)            # NEW: KLCiS voucher code
    payment_method = models.CharField(...)          # NEW: 'klcis'
    approved_by = models.CharField(...)             # Set to 'KLCiS-Auto' on verify
    approved_at = models.DateTimeField(...)         # Timestamp of verification
```

---

## Frontend Changes

### `templates/payment.html` — Complete Rewrite

**Before:** Card payment form (card number, CVV, expiry) + PayPal button — non-functional placeholder.

**After:** Two-step GCash flow:

#### Step 1: Phone Number + Pay Now
- Phone number input with PH format validation (`/^(\+?63|0)(9\d{9})$/`)
- "Pay ₱XX Now" button
- On submit: AJAX to backend → opens Xendit checkout in new tab → shows Step 2

#### Step 2: Waiting for Payment
- "I Have Paid ✓" button (manual trigger)
- Background auto-polling every 5 seconds (automatic detection)
- Success: green message + auto-redirect to `/confirmation/{CID}/`
- Pending: red message "Payment not yet detected"

### JavaScript (payment.html)

| Function | Purpose |
|----------|---------|
| `initiatePayment()` | AJAX POST action=initiate, validates phone, opens GCash tab |
| `verifyPayment()` | AJAX POST action=verify, checks payment status |
| `startAutoPolling()` | Background poll every 5s (max 60 attempts = 5 min) |
| `stopAutoPolling()` | Clears interval on success or page unload |
| `getCookie()` | Reads CSRF token from Django cookie |

---

## JavaScript Fixes (admin.js)

### Fix 1: SSE Printer Status Reconnection

**Bug:** When the EventSource connection dropped and reconnected, the new instance didn't get `onerror`/`onmessage` handlers re-attached. After the first reconnection, subsequent drops were never recovered.

**Fix:** Wrapped in `setupPrinterSSE()` function that re-attaches all handlers on each reconnection:

```javascript
function setupPrinterSSE() {
    let evtSource = new EventSource('/sse/printer-status/');
    evtSource.onerror = function (err) {
        evtSource.close();
        setTimeout(setupPrinterSSE, 5000);  // Recursive — re-attaches handlers
    };
    evtSource.onmessage = function (event) { ... };
}
setupPrinterSSE();
```

### Fix 2: SSE Dashboard Reconnection

Same bug and fix pattern as Fix 1, applied to the dashboard SSE stream (`/sse/dashboard-status/`).

### Fix 3: Duplicate Modal Event Handlers

**Bug:** `feedbackBtn` and `problemBtn` had both `addEventListener('click', ...)` (which fetched data via AJAX) AND `.onclick = ...` (which only opened the modal). Both fired on click, causing redundant modal opens.

**Fix:** Removed the redundant `.onclick` assignments. The `addEventListener` handlers already open the modal AND fetch the data.

Also changed `window.onclick = ...` to `window.addEventListener('click', ...)` to avoid overwriting other global click handlers, and added null checks for modal elements.

---

## Troubleshooting

### "Payment setup failed" error

1. Check KLCiS credentials in `venv/.env`
2. Verify KLCiS is reachable: `curl -v https://s2.klinternetservices.com/login`
3. Check Django logs for `KLCiSError` messages
4. Try logging in manually at https://s2.klinternetservices.com/login

### Payment not detected after paying

1. The polling checks the `sold_vouchers` table and `voucher_import` page
2. KLCiS may take a few seconds to process the Xendit callback
3. Wait for the next auto-poll (every 5 seconds) or click "I Have Paid" again
4. Check the KLCiS dashboard manually at `/voucher_status`

### Session-related errors

1. The singleton client auto-handles session expiry
2. Force reset: restart the Django server (clears the singleton)
3. Check logs for "KLCiS session expired" messages

### Multiple students paying simultaneously

The singleton client is thread-safe:
- All operations acquire a `threading.Lock()`
- One student's request completes before the next begins (for KLCiS-bound operations)
- The checkout URL generation doesn't need the lock (it's just URL construction)

### Running migrations

```bash
cd /home/safeprint/dev/SafePrint
source venv/bin/activate
python3 manage.py migrate portal
```

### Collecting static files

After modifying `static/js/admin.js`:

```bash
python3 manage.py collectstatic --noinput
# Or manually:
cp static/js/admin.js staticfiles/js/admin.js
```
