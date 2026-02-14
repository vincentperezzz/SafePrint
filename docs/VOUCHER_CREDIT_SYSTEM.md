# Voucher Credit System

## Overview

SafePrint uses KLCiS (via Xendit) as its payment gateway. Xendit enforces a **₱5 minimum** per transaction. When a student's print job costs less than ₱5, the system charges ₱5 and saves the excess as **reusable credit** on a voucher code. Students can apply this credit on future transactions to reduce or eliminate the cash amount owed.

---

## Design Decisions

| Question | Answer |
|---|---|
| **Transferable?** | Yes — credit is tied to a code, not a phone number or account. Anyone with the code can use it. |
| **Stackable?** | No — only one voucher credit code can be applied per transaction. |
| **Expiry** | 120 days from creation (`VOUCHER_CREDIT_EXPIRY_DAYS = 120`). |
| **Code reuse** | If a student already has a code and earns more excess credit, the balance is added to the **same code** rather than creating a new one. |
| **Minimum amount** | `XENDIT_MIN_AMOUNT = 5` (₱5). Configured as a constant in `portal/views.py`. |

---

## Data Model

**Table:** `voucher_credits` — Django model: `portal.models.VoucherCredit`

| Field | Type | Description |
|---|---|---|
| `code` | CharField(20), unique, indexed | The credit code shown to the student |
| `original_amount` | Decimal(10,2) | Initial credit amount when first created |
| `remaining_balance` | Decimal(10,2) | Current available balance |
| `is_active` | Boolean (default True) | False when fully used or manually deactivated |
| `created_at` | DateTime (auto) | When the voucher was first created |
| `expires_at` | DateTime | 120 days from creation |
| `last_used_at` | DateTime (nullable) | Last time credit was deducted from this voucher |

**Properties:**
- `is_expired` — `True` if `now > expires_at`
- `is_usable` — `True` if active, not expired, and balance > 0

**Migration:** `portal/migrations/0020_voucher_credit.py`

---

## API Endpoint

### `POST /api/check-voucher/`

**Handler:** `portal.views.check_voucher_api`

Validates a voucher credit code and returns balance info.

**Request:**
```json
{ "code": "ABC123XYZ" }
```

**Success Response:**
```json
{
  "valid": true,
  "code": "ABC123XYZ",
  "balance": 3.00,
  "expires_at": "2026-05-28"
}
```

**Error Responses:**
```json
{ "valid": false, "error": "Voucher not found" }
{ "valid": false, "error": "Voucher has expired" }
{ "valid": false, "error": "Voucher has no remaining balance" }
```

---

## Payment Flow — Three Scenarios

### Scenario 1: Credit Fully Covers the Job

- Job costs ₱3, student has ₱5 credit
- Credit applied: ₱3 → remaining balance: ₱2
- **No charge to KLCiS** — payment is marked as paid immediately
- Student redirected directly to confirmation page

### Scenario 2: Balance Due < ₱5 (Minimum Kicks In)

- Job costs ₱6, student has ₱3 credit
- Credit applied: ₱3 → balance due: ₱3
- ₱3 < ₱5 minimum → **charge ₱5**, excess = ₱2
- After verification: ₱2 added back to the same voucher code
- Net cost to student: ₱6 (₱3 credit + ₱5 charged − ₱2 returned as credit)

### Scenario 3: Balance Due ≥ ₱5 (Normal)

- Job costs ₱20, student has ₱8 credit
- Credit applied: ₱8 → balance due: ₱12
- ₱12 ≥ ₱5 → **charge ₱12** via KLCiS
- No excess credit generated

### Scenario 4: No Credit, Job < ₱5

- Job costs ₱2, no voucher applied
- ₱2 < ₱5 → **charge ₱5**, excess = ₱3
- New voucher credit created with ₱3 balance
- Code shown on confirmation page

---

## Implementation Details

### Initiate Action (`portal/views.py` → `payment()`, action=`initiate`)

1. Accept optional `voucher_credit_code` from POST data
2. Validate the voucher via `VoucherCredit.objects.get(code=..., is_active=True)`
3. Calculate: `credit_applied = min(voucher.remaining_balance, total_price)`
4. Calculate: `balance_due = total_price - credit_applied`
5. **Optimistically deduct** credit from voucher immediately
6. Determine path:
   - `balance_due == 0` → credit_only mode (skip KLCiS entirely)
   - `balance_due < XENDIT_MIN` → bump to ₱5, track `pending_excess_credit`
   - `balance_due >= XENDIT_MIN` → charge exact amount
7. Store session flags: `pending_credit_code`, `pending_credit_applied`, `pending_excess_credit`

### Verify Action

1. After successful KLCiS transaction verification:
2. If `pending_excess_credit > 0`:
   - If `pending_credit_code` exists → add excess to same voucher's balance
   - Otherwise → create new `VoucherCredit` with generated code
3. Store `credit_info` dict in session for confirmation page display

### Cancel Action

1. If `pending_credit_code` exists → **refund** the optimistically deducted credit
2. Restore `remaining_balance` on the voucher
3. Clean up all session flags

---

## Frontend Components

### Payment Page (`templates/payment.html`)

- **Voucher input section** (`.voucher-credit-section`): Code input + "Apply" button
- **Discount summary** (`.discount-summary`): Shows original total, credit applied, minimum charge adjustment, final charge
- **Minimum disclaimer** (`.minimum-disclaimer`): Yellow banner explaining the ₱5 minimum
- Dynamic updates via `scripts.js`: `applyVoucher()`, `removeVoucher()`, `updatePriceDisplay()`

### Confirmation Page (`templates/confirmation.html`)

- **Credit voucher banner** (`.credit-voucher-banner`): Green card showing:
  - Voucher code (selectable text)  
  - Remaining balance
  - Expiry date
  - Hint: "Use this code on your next print job to save!"
- Only rendered when `credit_info` is present in context

### JavaScript (`static/js/scripts.js`)

Key functions in the Payment IIFE:
- `window.applyVoucher()` — AJAX call to `/api/check-voucher/`, updates UI
- `window.removeVoucher()` — Resets credit state, restores original display
- `updatePriceDisplay(creditAmount, creditCode)` — Recalculates all amounts and updates DOM
- `initiatePayment()` — Passes `voucher_credit_code` in payload; handles `credit_only` response

---

## Admin Panel

Registered in `portal/admin.py` as `VoucherCreditAdmin`:
- **List display:** code, original_amount, remaining_balance, is_active, expires_at, last_used_at
- **Filters:** is_active
- **Search:** code
- **Read-only:** created_at

---

## FAQ References

- **FAQ #11:** "Can I give my leftover credit to a friend?" — Yes, codes are transferable.
- **FAQ #12:** "Why do I have to pay ₱5 if my job only costs ₱2?" — Explains the minimum and excess credit.

---

## Constants

```python
# portal/views.py
XENDIT_MIN_AMOUNT = 5           # ₱5 Xendit minimum
VOUCHER_CREDIT_EXPIRY_DAYS = 120  # 120-day expiry
```

---

## File Inventory

| File | Changes |
|---|---|
| `portal/models.py` | `VoucherCredit` model |
| `portal/views.py` | `check_voucher_api()`, credit logic in `payment()` (initiate/verify/cancel) |
| `portal/urls.py` | `api/check-voucher/` route |
| `portal/admin.py` | `VoucherCreditAdmin` registration |
| `portal/migrations/0020_voucher_credit.py` | Database migration |
| `templates/payment.html` | Voucher input section, discount summary, disclaimer |
| `templates/confirmation.html` | Credit voucher banner |
| `templates/index.html` | FAQ items 11–12 |
| `static/js/scripts.js` | `applyVoucher`, `removeVoucher`, `updatePriceDisplay` |
| `static/css/styles.css` | All voucher/credit CSS classes |
| `main/views.py` | `credit_info` in confirmation context |
