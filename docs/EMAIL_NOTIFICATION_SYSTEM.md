# SafePrint Email Notification System

## Overview

SafePrint uses **Gmail SMTP** via Django's built-in email system to send admin alerts for critical system events. Emails are sent server-side (not browser-based), which means events detected by background processes (like the SNMP printer poller) or API views can trigger notifications.

## Architecture

```
┌─────────────────────────────────────────┐
│           Event Sources                  │
│                                          │
│  poll_printer_snmp.py  (every 1 sec)     │
│  ├─ Printer goes offline                 │
│  ├─ Paper tray needs refill              │
│  ├─ Ink level drops below threshold      │
│  └─ Document stuck in Printing >10 min   │
│                                          │
│  problem_report_api.py                   │
│  └─ New support ticket submitted         │
│                                          │
│  portal/services/klcis.py                │
│  └─ KLCiS login/session failure          │
├──────────────────────────────────────────┤
│       portal/services/email_notify.py    │
│  ┌──────────────────────────────────┐    │
│  │  notify_admins(subject, message, │    │
│  │    event_type, identifier)       │    │
│  │                                  │    │
│  │  1. Check cooldown (30 min)      │    │
│  │  2. Query AdminUser emails       │    │
│  │  3. django.core.mail.send_mail() │    │
│  │  4. Mark cooldown                │    │
│  └──────────────────────────────────┘    │
├──────────────────────────────────────────┤
│       Gmail SMTP (smtp.gmail.com:587)    │
│       From: safeprint2025@gmail.com      │
│       To: All AdminUser.email addresses  │
└──────────────────────────────────────────┘
```

## Configuration

### Environment Variables (`venv/.env`)

```env
# Email Notification (Gmail SMTP)
EMAIL_HOST_USER=safeprint2025@gmail.com
EMAIL_HOST_PASSWORD=xxxx xxxx xxxx xxxx   # Gmail App Password (not account password)
EMAIL_FROM_NAME=SafePrint Alerts
```

### Django Settings (`SafePrint/settings.py`)

```python
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')
EMAIL_FROM_NAME = config('EMAIL_FROM_NAME', default='SafePrint Alerts')
DEFAULT_FROM_EMAIL = f"{EMAIL_FROM_NAME} <{EMAIL_HOST_USER}>"
```

### Gmail App Password Setup

1. Sign in to your Gmail account
2. Go to https://myaccount.google.com/security
3. Enable **2-Step Verification** (required)
4. Go to https://myaccount.google.com/apppasswords
5. Create an App Password for "Mail" → "Other (Custom name)" → "SafePrint Server"
6. Copy the 16-character password into `EMAIL_HOST_PASSWORD` in `.env`

> **Important:** Regular Gmail passwords do NOT work for SMTP. You must use an App Password.

## Alert Events

### 1. Printer Offline
- **Trigger:** `printer_status` transitions from any state → `Offline`
- **Detected by:** `poll_printer_snmp.py` (runs every 1 second)
- **Cooldown:** 30 minutes per printer
- **Function:** `alert_printer_offline(printer_name, ip_address)`

### 2. Paper Tray Needs Refill
- **Trigger:** `tray_level` transitions from `Full` → `Low` or `Needs Refill`
- **Detected by:** `poll_printer_snmp.py`
- **Cooldown:** 30 minutes per printer
- **Function:** `alert_paper_refill(printer_name, tray_level)`

### 3. Ink Low
- **Trigger:** `ink_status` transitions from `OK` → any non-OK value (e.g., `bc` = Black + Cyan low)
- **Detected by:** `poll_printer_snmp.py`
- **Cooldown:** 30 minutes per printer
- **Function:** `alert_ink_low(printer_name, ink_status)`

### 4. New Support Ticket
- **Trigger:** Student submits a support ticket via the confirmation page
- **Detected by:** `submit_ticket()` in `main/problem_report_api.py`
- **Cooldown:** 30 minutes per ticket number (effectively once per ticket)
- **Function:** `alert_new_ticket(ticket_number, customer_name, problem_type, description)`

### 5. KLCiS Connection Failure
- **Trigger:** Login to the KLCiS payment gateway fails (invalid credentials or network error)
- **Detected by:** `KLCiSClient.login()` in `portal/services/klcis.py`
- **Cooldown:** 30 minutes
- **Function:** `alert_klcis_failure(error_message)`

### 6. Document Stuck in Printing
- **Trigger:** A document has `doc_status='Printing'` and `status_updated_at` is older than 10 minutes
- **Detected by:** `poll_printer_snmp.py` (after each polling cycle)
- **Cooldown:** 30 minutes per document ID
- **Function:** `alert_document_stuck(doc_id, customer_id, printer_name, minutes_stuck)`

## Cooldown System

To prevent email spam (the printer poller runs every second), a **30-minute cooldown** is enforced per event type + identifier combination.

```
Cooldown Key = "{event_type}:{identifier}"

Examples:
  "printer_offline:Printer A"  → One "Printer A Offline" email per 30 min
  "ink_low:Printer B"          → One "Printer B Ink Low" email per 30 min
  "new_ticket:TKT-00001"       → One email per ticket (effectively once)
  "klcis_failure:klcis"        → One KLCiS failure email per 30 min
```

Cooldown is tracked in-memory using a thread-safe dictionary with `threading.Lock()`. It resets when Gunicorn workers restart.

To bypass cooldown for testing, pass `force=True` to `notify_admins()`.

## Admin Email Management

### Setting Your Own Email
1. Go to **Account Settings** (`/portal/settings/`)
2. Click **Edit** next to the Email field
3. Enter your email address → Click **Done**
4. Leave blank to disable email notifications for your account

### Adding Email for New Users
1. Go to **Account Settings** → **Manager Settings**
2. Click **Create New Account**
3. Fill in Name, **Email**, Username, Password
4. Email is optional — accounts without email won't receive notifications

### API Endpoints
- `POST /api/update-email/` — Update own email (`new_email` form field)
- `POST /api/add_user_ajax/` — Create user with optional `email` field

## Database

### AdminUser Model Changes
```sql
ALTER TABLE admin_users ADD COLUMN email VARCHAR(255) NULL;
```

Migration: `portal/migrations/0023_adminuser_email.py`

## Files Modified

| File | Change |
|------|--------|
| `portal/models.py` | Added `email` field to `AdminUser` |
| `portal/services/email_notify.py` | **New** — Core notification service with cooldown |
| `portal/management/commands/poll_printer_snmp.py` | Added alerts for offline, ink, paper, stuck docs |
| `main/problem_report_api.py` | Added alert on new ticket creation |
| `portal/services/klcis.py` | Added alert on login failure |
| `portal/views.py` | Added `update_email` view, updated `add_user_ajax` |
| `portal/urls.py` | Added `api/update-email/` route |
| `templates/settings.html` | Added email field (profile + create account form) |
| `static/js/admin.js` | Added edit-email handler, email in create account |
| `SafePrint/settings.py` | Added `EMAIL_*` settings |
| `venv/.env` | Added `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_FROM_NAME` |

## Testing

### Send a Test Email
```bash
cd /home/safeprint/dev/SafePrint
source venv/bin/activate
python manage.py shell
```

```python
from portal.services.email_notify import notify_admins
notify_admins("Test Alert", "This is a test email from SafePrint.", force=True)
```

### Verify Email Config
```python
from django.core.mail import send_mail
from django.conf import settings
send_mail(
    "SafePrint Test",
    "Email is working!",
    settings.DEFAULT_FROM_EMAIL,
    ["your-email@gmail.com"],
)
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "SMTPAuthenticationError" | Wrong App Password or 2FA not enabled on Gmail |
| Emails not sending | Check `EMAIL_HOST_USER` and `EMAIL_HOST_PASSWORD` in `.env` |
| No recipients | Add email addresses to admin accounts in Settings |
| Too many emails | Cooldown is 30 min — adjust `COOLDOWN_SECONDS` in `email_notify.py` |
| Poller crashes after adding alerts | Should never happen — all alerts are wrapped in `_send_alert_safe()` try/except |
| "Connection timed out" on SMTP | Firewall blocking port 587. Check: `nc -zv smtp.gmail.com 587` |
