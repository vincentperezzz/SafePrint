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
7. [Transaction Deduplication](#transaction-deduplication)
8. [Files & Structure](#files--structure)
9. [Configuration](#configuration)
10. [Database Schema](#database-schema)
11. [Frontend Architecture](#frontend-architecture)
12. [Deletion & Cleanup Audit](#deletion--cleanup-audit)
13. [Troubleshooting](#troubleshooting)

---

## Overview

SafePrint integrates with **KLCiS (KL Internet Services)** as a transaction middleman to the **Xendit** payment gateway. Students pay for print jobs via **GCash, Maya, ShopeePay, GrabPay**, and other e-wallets without SafePrint needing a direct Xendit merchant account.

### Why KLCiS?

- SafePrint runs on a **local network** (Dell Optiplex behind Pi-hole/DuckDNS) — **not publicly accessible** — Xendit webhooks can't reach it.
- KLCiS handles the Xendit integration and provides a web dashboard.
- We use a **"Pull" model** — SafePrint polls the KLCiS `/transactions` page to check payment status.

### Direct Checkout ("Boss" Flow)

Instead of sending students to the KLCiS shop page, we use a **direct checkout URL** that bypasses the shop:

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
       │                       │  2. Create voucher      │
       │                       │  + Snapshot existing    │
       │                       │    PAID transactions    │
       │                       │───────────────────────>│
       │                       │                        │
       │  3. Full-screen       │                        │
       │     loading overlay   │                        │
       │                       │                        │
       │  4. Auto-open GCash   │                        │
       │     in new tab        │                        │
       │<──────────────────────│                        │
       │                       │                        │
       │  5. Pay via GCash     │                        │
       │─────────────────────────────────────────────>  │ (Xendit)
       │                       │                        │
       │  6. Auto-poll every   │                        │
       │     5s (or click      │                        │
       │     "I Have Paid")    │                        │
       │──────────────────────>│                        │
       │                       │                        │
       │                       │  7. GET /transactions   │
       │                       │  → parse PAID rows     │
       │                       │  → match phone+amount  │
       │                       │  → exclude baseline +  │
       │                       │    used txn IDs        │
       │                       │───────────────────────>│
       │                       │                        │
       │                       │  8. New PAID txn found  │
       │                       │  → save to persistent  │
       │                       │    UsedKLCiSTransaction │
       │                       │<───────────────────────│
       │                       │                        │
       │  9. Alert: "Payment   │                        │
       │     verified!"        │                        │
       │  → redirect to        │                        │
       │     confirmation      │                        │
       │<──────────────────────│                        │
       │                       │                        │
       │                       │  10. doc_status =       │
       │                       │      'Queued'           │
       │                       │  (triggers WRR print)   │
```

---

## Payment Flow (Student Perspective)

1. **Upload documents** → Get Customer ID (e.g., `CID-5925`)
2. **Redirected to payment page** → See document list + total price
3. **Enter phone number** (09XX XXX XXXX) → Click **"Pay ₱6 Now"**
4. **Full-screen loading overlay** appears while setting up
5. **GCash opens automatically** in new tab (or "Redirect to Payment" button appears immediately if popup was blocked on iOS)
6. **Auto-detection** polls every 5 seconds — or click **"I Have Paid ✓"** manually
7. **Alert: "Payment verified!"** → Auto-redirect to confirmation page
8. **Documents are queued** for printing automatically

### Cancel Flow

At any step, the student can click **Cancel** (red button):
- Confirmation dialog: "Are you sure?"
- Backend deletes all unpaid Payment + Document records + uploaded files
- Student is redirected to the homepage

### Auto-Polling

- **Interval:** Every 5 seconds
- **Max duration:** 5 minutes (60 attempts)
- **Stops when:** payment confirmed, max attempts reached, or page closed/cancelled

---

## Payment Flow (System Perspective)

### Step 1: Initiate Payment (`action=initiate`)

**Request:** `POST /payment/`
```json
{
    "action": "initiate",
    "customer_id": "CID-5925",
    "doc_ids": ["DOC-XHJZ"],
    "phone_number": "09171234567"
}
```

**Backend actions:**
1. Calculate total price from `Payment` records
2. Generate random 8-character voucher code
3. Create voucher on KLCiS via `POST /core/create_voucher_core`
4. **Snapshot existing PAID transactions** on KLCiS for this phone+amount → store in session as `baseline_txn_ids`
5. Store `voucher_code`, `payment_method='klcis'`, `phone_number` in all Payment records
6. Build direct checkout URL
7. Store `pending_payment_cid` and `pending_payment_doc_ids` in session

**Response:**
```json
{
    "success": true,
    "message": "Payment link created",
    "checkout_url": "https://s2.klinternetservices.com/xendit/payment?token=...&amount=6&number=09171234567",
    "voucher_code": "sp4a05bx",
    "amount": 6
}
```

### Step 2: Verify Payment (`action=verify`)

**Request:** `POST /payment/`
```json
{
    "action": "verify",
    "customer_id": "CID-5925"
}
```

**Backend actions:**
1. Find unpaid `Payment` records for this customer with a `voucher_code`
2. Build exclusion set: `used_txn_ids` (from Payment table) + `UsedKLCiSTransaction` table + `baseline_txn_ids` (from session)
3. Fetch KLCiS `/transactions` page
4. Parse table rows: match STATUS == "PAID" + phone matches + amount matches + txn_id NOT in exclusion set
5. If found: save txn_id to `UsedKLCiSTransaction` (persistent), mark payments as `Paid`, set documents to `Queued`, clear session flags

**Response (success):**
```json
{
    "success": true,
    "message": "Payment verified! Your documents are now queued for printing.",
    "redirect_url": "/confirmation/CID-5925/"
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

### Step 3: Cancel Payment (`action=cancel`)

**Request:** `POST /payment/`
```json
{
    "action": "cancel",
    "customer_id": "CID-5925"
}
```

**Backend actions:**
1. Find all unpaid Payment records for this customer
2. Delete uploaded PDF files from `media/uploads/{customer_id}/`
3. Delete Payment and Document records
4. Remove empty customer folder
5. Clear session flags

---

## KLCiS API Endpoints

All endpoints on `https://s2.klinternetservices.com`:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/login` | Dashboard login (`username`, `password`) |
| `POST` | `/core/create_voucher_core` | Create voucher (`voucher`, `amount`) → `"success"` |
| `POST` | `/core/delete_voucher_core` | Delete voucher (`id`) → `"success"` |
| `GET` | `/voucher_status` | Sold vouchers table (backup check) |
| `GET` | `/voucher_import` | Voucher management page |
| `GET` | `/transactions` | **Primary verification** — Transaction Logs table |
| `GET` | `/xendit/payment?token=...&amount=...&number=...` | Direct checkout (public, no login) |

### Transaction Logs Table Columns (6 cells)

| Index | Column | Example |
|-------|--------|---------|
| 0 | Date | `2026-02-08 10:30:15` |
| 1 | Amount | `₱6.00` |
| 2 | Status | `PAID` / `PENDING` / `FAILED` |
| 3 | Contact | `09171234567` |
| 4 | Transaction ID | `txn_abc123...` |
| 5 | Action | (buttons) |

### KLCiS Credentials

```
Username: Safeprint2025
Password: @Safeprint2025
API Key:  C5O1dhQ8ElS60irmTr1CsBe9X
```

Configured in `venv/.env`, read via `python-decouple`.

---

## Session Management

### Thread-Safe Singleton Client

`KLCiSClient` implements Singleton + thread safety:

```python
class KLCiSClient:
    _instance = None
    _instance_lock = threading.Lock()
    # Only ONE instance across all requests
    # All methods acquire self._lock before operating
```

**Lifecycle:**
1. **First request:** Login → store PHPSESSID cookie
2. **Subsequent requests:** Reuse same session (no re-login)
3. **Session expiry detected:** Auto re-authenticate (via redirect-to-login detection)
4. **Safety net:** Force re-login after 25 minutes

**Concurrency:**
- Django serves requests in threads — `threading.Lock()` prevents race conditions
- If Student A and Student B poll simultaneously, one waits for the other

---

## Transaction Deduplication

### The Problem

Old PAID transactions on KLCiS with the same phone+amount can cause **false positives**:
1. Student pays → transaction PAID on KLCiS
2. Student picks up documents → Payment record deleted (loses `klcis_transaction_id`)
3. Student uploads new docs, pays again with same phone+amount
4. Verify immediately matches the **old** PAID transaction → false positive!

### Three-Layer Protection

#### Layer 1: Active Payment Records
```python
used_txn_ids = set(
    Payment.objects.filter(klcis_transaction_id__isnull=False)
    .exclude(klcis_transaction_id='')
    .values_list('klcis_transaction_id', flat=True)
)
```

#### Layer 2: Persistent `UsedKLCiSTransaction` Table
Survives Payment/Document deletion (e.g., on pickup):
```python
used_txn_ids |= set(
    UsedKLCiSTransaction.objects.values_list('transaction_id', flat=True)
)
```

#### Layer 3: Baseline Snapshot (Session-Based)
At payment initiation, snapshot ALL existing PAID transactions for this phone+amount:
```python
baseline_ids = set(request.session.get('baseline_txn_ids', []))
exclude_ids = used_txn_ids | baseline_ids
```

**Result:** Only transactions that appear AFTER initiation AND are not in the persistent table can match.

---

## Files & Structure

### Core Files

| File | Purpose |
|------|---------|
| `portal/services/klcis.py` | KLCiS dashboard automation (singleton client, 550+ lines) |
| `portal/views.py` | Payment view: `initiate`, `verify`, `cancel` actions |
| `portal/models.py` | `Payment`, `UsedKLCiSTransaction` models |
| `portal/admin.py` | Admin registration with full field display |
| `templates/payment.html` | Payment page template (minimal — JS externalized) |
| `static/js/scripts.js` | Payment JS functions (bottom of file, IIFE) |
| `static/css/styles.css` | Payment CSS classes |

### KLCiS Client Methods

| Method | Purpose |
|--------|---------|
| `login()` | Authenticate with KLCiS dashboard |
| `create_voucher()` | Create voucher via API |
| `get_direct_checkout_url()` | Build Xendit checkout URL |
| `check_transaction_paid()` | Find PAID transaction matching phone+amount |
| `get_paid_transaction_ids()` | Snapshot all matching PAID transactions |
| `check_voucher_paid()` | Check voucher in sold_vouchers table |
| `_normalize_phone()` | Standardize PH phone numbers for comparison |
| `_find_paid_transaction()` | Parse table HTML for matching PAID row |
| `_collect_paid_transaction_ids()` | Parse table HTML to collect all matching IDs |

### Public Convenience Functions

| Function | Purpose |
|----------|---------|
| `create_and_upload_voucher()` | Create voucher (singleton, thread-safe) |
| `get_checkout_url()` | Get direct checkout URL |
| `verify_transaction_payment()` | Check transaction page for PAID entry |
| `snapshot_existing_transactions()` | Get existing PAID txn IDs for baseline |
| `verify_voucher_payment()` | Check voucher status page (backup) |

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
KLCIS_BASE_URL = config('KLCIS_BASE_URL', default='https://s2.klinternetservices.com')
KLCIS_USERNAME = config('KLCIS_USERNAME', default='')
KLCIS_PASSWORD = config('KLCIS_PASSWORD', default='')
```

---

## Database Schema

### `payments` Table (Payment Model)

| Field | Type | Purpose |
|-------|------|---------|
| `doc` | FK → Document(doc_id) | Related document |
| `price` | Decimal(10,2) | Amount for this document |
| `payment_status` | CharField(50) | `Unpaid` → `Paid` |
| `voucher_code` | CharField(50), unique, nullable | KLCiS voucher code |
| `payment_method` | CharField(50), nullable | `klcis` |
| `phone_number` | CharField(20), nullable | Student phone (PH format) |
| `klcis_transaction_id` | CharField(64), unique, nullable | Matched KLCiS Transaction ID |
| `approved_by` | CharField(255), nullable | `KLCiS-Auto` on verify |
| `approved_at` | DateTimeField, nullable | Verification timestamp |

### `used_klcis_transactions` Table (UsedKLCiSTransaction Model)

| Field | Type | Purpose |
|-------|------|---------|
| `transaction_id` | CharField(64), unique | KLCiS Transaction ID (permanent) |
| `phone_number` | CharField(20) | Phone number at time of match |
| `amount` | Decimal(10,2) | Amount at time of match |
| `used_at` | DateTimeField (auto) | When the transaction was matched |

### Migrations

| Migration | Purpose |
|-----------|---------|
| `0014` | Add `voucher_code` to Payment |
| `0015` | Add `phone_number` to Payment |
| `0016` | Add `klcis_transaction_id` to Payment |
| `0019` | Create `UsedKLCiSTransaction` table |

---

## Frontend Architecture

### Template (`payment.html`)

Minimal template — only contains:
- Document list + price display (price on right, doc_id under filename)
- Step 1: Phone input + Pay/Cancel buttons
- Step 2: I Have Paid / Redirect to Payment / Cancel buttons
- Small `<script>` block setting `window.PAYMENT_DATA` from Django context

### JavaScript (`scripts.js` — Payment IIFE)

All payment logic is in a self-contained IIFE at the bottom of scripts.js:

```javascript
(function () {
    if (!window.PAYMENT_DATA) return;  // Only runs on payment page
    
    const PAYMENT = window.PAYMENT_DATA;
    // ... initiatePayment, verifyPayment, cancelPayment, etc.
})();
```

| Function | Scope | Purpose |
|----------|-------|---------|
| `initiatePayment()` | window | Phone validation → API → open checkout → show step 2 |
| `verifyPayment()` | window | API verify → alert result → redirect on success |
| `startAutoPolling()` | local | Background poll every 5s |
| `stopAutoPolling()` | local | Clear polling interval |
| `cancelPayment()` | window | Confirm → API cancel → redirect home |
| `redirectToPayment()` | window | Re-open checkout URL in new tab |
| `showOverlay()` | local | Show `#loading-overlay` (full-screen spinner) |
| `hideOverlay()` | local | Hide `#loading-overlay` |

### CSS Classes (`styles.css`)

| Class | Purpose |
|-------|---------|
| `.card-payment-details` | Payment card container (flex column, stretch, light blue bg) |
| `.card-pay-btn` | Black pill button (Pay / I Have Paid) |
| `.card-cancel-btn` | Red pill button (Cancel) |
| `.card-redirect-btn` | Yellow pill button (Redirect to Payment) |
| `.payment-hint` | Instruction text (Space Grotesk, 14px, #555) |
| `.phone-input` | Phone number input (letter-spacing, 16px) |
| `.payment-error-msg` | Error text styling (red, hidden by default) |
| `.payment-success-msg` | Success text styling (green, hidden by default) |

### Loading Behavior

Uses the **shared full-screen loading overlay** (`#loading-overlay` from `layout.html`) — same as the index→uploads transition. Shows during API calls (initiate, verify).

### iOS Popup Handling

`window.open()` is often blocked on iOS Safari. After initiating payment:
1. Try `window.open(checkoutUrl, '_blank')`
2. Check return value — if `null` or `closed` (popup blocked)
3. Immediately show "Redirect to Payment" button (no delay)

### Error/Success Messages

All messages use native `alert()` dialogs instead of inline text — works reliably on all devices including iPhone.

---

## Deletion & Cleanup Audit

| # | Action | Trigger | Deletes Files? | Deletes DB Records? | Conflicts with Payment? |
|---|--------|---------|---------------|---------------------|------------------------|
| 1 | `clean_empty_upload_folders.py` | Hourly cron + post-pickup | Orphan files only (10-min grace) | No | **No** |
| 2 | `delete_all_uploads_view` | X/close on index.html | Session uploads | No | **No** — only before Proceed |
| 3 | `delete_document` | X button on uploads.html | Single file | Document only | **No** — pre-payment stage |
| 4 | `delete_all_documents` | X button on uploads.html | All preview files | Documents only | **No** — pre-payment stage |
| 5 | Cancel (`payment.html`) | Cancel button | Uploaded PDFs | Payment + Document | **No** — `klcis_transaction_id` is null |
| 6 | `picked_up_document` | Picked Up button | PDF file | Payment + Document | **Protected** — txn ID in `UsedKLCiSTransaction` |
| 7 | `finish_transaction` | All Good button | All PDF files | Payment + Document | **Protected** — txn ID in `UsedKLCiSTransaction` |

### Key Safeguard

Before Payment records are deleted (pickup/finish), the `klcis_transaction_id` is already persisted in the `UsedKLCiSTransaction` table (saved during verification). This ensures old transactions are never re-matched.

---

## Troubleshooting

### "Payment setup failed"

1. Check KLCiS credentials in `venv/.env`
2. Test connectivity: `curl -v https://s2.klinternetservices.com/login`
3. Check Django logs for `KLCiSError`
4. Verify manually at https://s2.klinternetservices.com/login

### Payment not detected after paying

1. Polling checks `/transactions` page for STATUS == "PAID" + phone + amount match
2. KLCiS may take a few seconds to process Xendit callback
3. Check exclusion sets — transaction may be in `used_txn_ids` or `baseline_txn_ids`
4. Check `UsedKLCiSTransaction` in admin for the transaction ID
5. Verify on KLCiS dashboard: `/transactions` page

### False positive (confirmed before paying)

1. An old PAID transaction matched. Check:
   - `baseline_txn_ids` in session — was snapshot taken?
   - `UsedKLCiSTransaction` table — is the old txn ID recorded?
2. The three-layer dedup should prevent this — if it still happens, check `klcis.py` logs

### Popup blocked on iPhone

The "Redirect to Payment" button appears immediately when `window.open()` returns null (blocked by iOS Safari). Student can tap it to open the checkout manually.

### Deploying changes

```bash
cd /home/safeprint/dev/SafePrint
cp static/css/styles.css staticfiles/css/styles.css
cp static/js/scripts.js staticfiles/js/scripts.js
kill -HUP 1146894  # Graceful reload — zero downtime
```

### Running migrations

```bash
source venv/bin/activate
python manage.py migrate portal
```
