# Ticket Refund & Audit Log System

## Overview

The ticket refund auditing system tracks every action taken on support tickets, from creation through resolution. It provides a complete audit trail for accountability, refund processing via GCash, and administrative oversight.

---

## Data Model

### SupportTicket — New Refund Fields

| Field | Type | Description |
|---|---|---|
| `gcash_number` | CharField(20) | Customer's GCash number for refund (optional, provided at submission) |
| `refund_amount` | DecimalField(10,2) | Amount to be refunded, set when admin approves refund |
| `refund_status` | CharField(20) | `none` / `pending` / `completed` / `rejected` |
| `refund_completed_at` | DateTimeField | Timestamp when refund was marked completed |
| `refund_reference` | CharField(100) | GCash transaction reference number entered by admin |

### TicketAuditLog

Table: `ticket_audit_logs`

| Field | Type | Description |
|---|---|---|
| `id` | AutoField | Primary key |
| `ticket` | ForeignKey(SupportTicket) | The ticket being audited |
| `action` | CharField(50) | One of the action types below |
| `old_status` | CharField(50) | Previous ticket status (blank if N/A) |
| `new_status` | CharField(50) | New ticket status (blank if N/A) |
| `performed_by` | CharField(100) | Username or "System" / "Customer" |
| `details` | TextField | Human-readable description of the action |
| `timestamp` | DateTimeField(auto_now_add) | When the action occurred |

**Action Types:**

| Action | When Logged |
|---|---|
| `created` | Customer submits a new ticket |
| `status_changed` | Ticket status changes (generic) |
| `refund_approved` | Admin clicks "Refund" on an active ticket |
| `refund_completed` | Admin enters GCash reference and marks refund complete |
| `refund_rejected` | Admin rejects a refund (future use) |
| `voided` | Admin voids a ticket |
| `note_added` | Admin adds a note (future use) |
| `verified` | Admin verifies/resolves a ticket (future use) |

---

## Customer Flow

1. Customer encounters a print issue on the confirmation page
2. Customer goes through the Problem Report wizard (identify issue → describe → reprint attempt → result)
3. If the issue persists, customer is shown the **Submit a Ticket** form
4. Form fields include:
   - Customer ID (auto-filled, read-only)
   - Document ID (auto-filled, read-only)
   - Document Name (auto-filled, read-only)
   - Customer Name
   - Email
   - Contact Number
   - **GCash Number** (optional — for refund if applicable)
   - Receipt Code
   - Receipt Screenshot
   - Issue Description
5. On submission, a `TicketAuditLog` entry with action `created` is recorded
6. Customer sees confirmation: _"We are working on it! Your ticket number is #TKT-XXXX."_

---

## Admin Flow

### Dashboard — Active Tickets

Active tickets appear in the dashboard ticket list. Each row has three action buttons:

- **Void** — Marks the ticket as voided. Logs `voided` action.
- **Verify** — Opens the ticket detail modal with full info.
- **Refund** — Sets `refund_status` to `pending`, records `refund_amount` (from payment amount), and logs `refund_approved`. Shows a confirmation with GCash number info.

### Ticket Detail Modal

The modal displays:

| Section | Fields |
|---|---|
| Customer Info | Customer ID, Customer Name, Email, Phone |
| Document Info | Document ID, Document Name, Problem Type, Was Reprinted |
| Payment Info | **GCash Number**, **Payment Amount** |
| Issue | Full description text |
| Refund Pending | Shown only when `refund_status = pending`. Displays refund amount, GCash number, and a text input for the GCash reference number with a "Mark Completed" button |
| Activity Log | Chronological list of all audit log entries for this ticket |

### Completing a Refund

1. Admin processes the GCash transfer externally
2. Admin opens the ticket modal → sees the "Refund Pending" section
3. Admin enters the GCash transaction reference number
4. Admin clicks "Mark Completed"
5. System sets `refund_status = completed`, `refund_completed_at = now`, `refund_reference = <ref>`
6. A `refund_completed` audit log entry is created
7. The refund section disappears and the audit log refreshes

### Dashboard — Resolved Tickets

Resolved tickets (including refunded ones) appear in the resolved list with a "View Details" button that also shows all refund and audit data in the modal.

---

## API Endpoints

### POST `/api/submit-ticket/`

Customer-facing. Accepts multipart form data including optional `gcash_number`.

### POST `/api/refund-ticket/`

Admin-facing. Body: `{ "ticket_id": <id> }`

- Sets ticket status to `refunded`
- Sets `refund_status = pending`, `refund_amount = payment_amount`
- Logs `refund_approved` audit entry
- Returns: `{ "success": true, "gcash_number": "...", "refund_status": "pending" }`

### POST `/portal/api/complete-refund/`

Admin-facing. Body: `{ "ticket_id": <id>, "refund_reference": "..." }`

- Validates `refund_status == pending`
- Sets `refund_status = completed`, `refund_completed_at = now`, `refund_reference`
- Logs `refund_completed` audit entry
- Returns: `{ "success": true }`

### POST `/portal/api/ticket-audit-log/`

Admin-facing. Body: `{ "ticket_id": <id> }`

- Returns all audit log entries for the ticket, newest first
- Returns: `{ "success": true, "audit_logs": [{ "action": "...", "old_status": "...", "new_status": "...", "performed_by": "...", "details": "...", "timestamp": "..." }, ...] }`

### GET `/portal/api/get-active-tickets/`

Returns active and resolved tickets. Active tickets include `gcash_number`. Resolved tickets include `gcash_number`, `refund_amount`, `refund_status`, `refund_reference`, `refund_completed_at`.

---

## Database Migration

Migration: `portal/migrations/0025_supportticket_gcash_number_and_more.py`

Adds:
- 5 new fields to `support_tickets` table
- New `ticket_audit_logs` table

---

## Files Modified

| File | Changes |
|---|---|
| `portal/models.py` | Added `TicketAuditLog` model, added refund fields to `SupportTicket` |
| `portal/views.py` | Updated `void_ticket`, `refund_ticket`; added `complete_refund`, `get_ticket_audit_log`; updated `get_active_tickets_api` |
| `portal/urls.py` | Added `api/complete-refund/` and `api/ticket-audit-log/` routes |
| `main/problem_report_api.py` | Added `gcash_number` extraction and audit log on submit |
| `templates/dashboard.html` | Added GCash, payment amount, refund section, audit log to ticket modal |
| `templates/confirmation.html` | Added GCash Number field to ticket submission form |
| `static/js/admin.js` | Modal population for new fields, audit log fetch, refund completion handler |
| `static/js/scripts.js` | Sends `gcash_number` in ticket form submission |
