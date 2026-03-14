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

---

## Admin Refund Audit Guide

### How to Audit a Refund Request

When a customer submits a ticket requesting a refund, follow this checklist to verify the claim before processing:

#### Step 1 — Open the Ticket Detail Modal

- Go to **Dashboard → Active Tickets**
- Click **Verify** on the ticket row to open the detail modal
- Review all fields: Customer ID, Document Name, Problem Type, Issue Description

#### Step 2 — Check the Activity Log

The **Activity Log** section at the bottom of the ticket modal shows every action taken on the ticket in chronological order. Verify:

| What to Check | Where to Look |
|---|---|
| **Ticket was created by customer** | Look for `Ticket Created` entry with timestamp and details like "Customer submitted ticket for document [name]" |
| **Who approved the refund** | Look for `Refund Approved` entry — it shows the admin name and the refund amount |
| **Refund completion** | Look for `Refund Completed` entry — it shows the GCash reference number and admin who completed it |
| **Previous status changes** | Any `Status Changed` or `Ticket Voided` entries show the full ticket lifecycle |

These logs are stored in the `ticket_audit_logs` database table and are **never deleted** during normal operations.

#### Step 3 — Verify Payment Proof

- **Receipt Code**: Shown in the ticket — cross-reference with payment provider records
- **Receipt Screenshot**: Uploaded by the customer and stored in `media/receipt_screenshots/` (named after the ticket number, e.g., `TKT-250128-1234.jpg`)
- **Payment Amount**: Shown in the modal — matches the original payment for the document

#### Step 4 — Verify the GCash Number

- The customer-provided **GCash Number** is shown in the modal
- Confirm this matches the number used for the original payment (if applicable)
- When a refund is marked complete, the admin enters the **GCash Transaction Reference** — this is stored and visible in the audit log

#### Step 5 — Cross-Reference with Database

For deeper auditing, the following database tables can be queried directly:

| Table | What It Stores | Survives Document Deletion? |
|---|---|---|
| `support_tickets` | Full ticket details: customer info, issue description, receipt code, GCash number, refund amount, refund status, refund reference, timestamps | **Yes** — tickets are never deleted through normal operations |
| `ticket_audit_logs` | Every action taken on each ticket: created, voided, refund approved, refund completed, with timestamps and admin names | **Yes** — persists as long as the ticket exists |
| `payments` | Payment records: amount, status, voucher code, payment method, approved by/at | **No** — deleted when document is picked up or transaction is finished |
| `documents` | Document records: filename, customer ID, file info, status, printer assigned | **No** — deleted when document is picked up or transaction is finished |
| `reroute_history` | Printer assignment history for documents | **No** — deleted with the document (CASCADE) |

---

### What Data Survives After a Customer Finishes Printing?

When a document is picked up (admin clicks "Done" / "Handed Over") or the transaction is finished, the system **deletes**:

1. **The uploaded file** from disk (`media/uploads/<customer_id>/<stored_name>`)
2. **The Payment record** from the `payments` table
3. **The Document record** from the `documents` table
4. **Empty upload folder** is cleaned up via background script

What is **preserved**:

1. **Support Tickets** (`support_tickets` table) — The ticket's `document` foreign key is set to `NULL` (because `on_delete=SET_NULL`), but all other ticket data remains: customer name, email, phone, GCash number, problem description, receipt code, refund amount, refund reference, refund status, all timestamps
2. **Receipt Screenshots** (`media/receipt_screenshots/`) — These are stored separately from the document upload and are only deleted if the ticket itself is deleted (which never happens through normal admin operations)
3. **Audit Logs** (`ticket_audit_logs` table) — Full history of every action on the ticket, with timestamps and admin names
4. **Document Name** is stored on the ticket itself (`document_name` field), so even after the document record is deleted, the ticket still shows which document was involved

### Key Audit Fields Per Ticket

| Field | Always Available | Notes |
|---|---|---|
| `ticket_number` | Yes | Unique ticket identifier (e.g., #TKT-250128-1234) |
| `customer_id` | Yes | Original customer ID |
| `customer_name` | Yes | Name provided by customer |
| `email` | Yes | Contact email |
| `phone_number` | Yes | Contact phone |
| `gcash_number` | Yes | GCash number for refund |
| `document_name` | Yes | Copied from document at ticket creation time |
| `problem_type` | Yes | quality / missing-pages / no-print / other |
| `description` | Yes | Full issue description |
| `receipt_code` | Yes | Payment receipt code provided by customer |
| `receipt_screenshot` | Yes | File in `media/receipt_screenshots/` |
| `refund_amount` | Yes | Amount approved for refund |
| `refund_status` | Yes | none / pending / completed / rejected |
| `refund_reference` | Yes | GCash transaction reference entered by admin |
| `refund_completed_at` | Yes | Timestamp of refund completion |
| `resolved_by` | Yes | Admin name who resolved/voided/refunded |
| `admin_notes` | Yes | Accumulated admin notes (auto-appended on each action) |
| `document` (FK) | **No** | Set to NULL after document is picked up/deleted |
| Payment amount | **No** | Payment record is deleted with the document — but `refund_amount` on the ticket preserves the amount |

### Is Auditing Possible After Document Deletion?

**Yes.** The system is designed so that all audit-critical data is preserved on the ticket itself, independent of the document lifecycle:

- The **ticket number, customer info, GCash number, refund amount, refund reference, and all timestamps** are stored directly on the `support_tickets` record
- The **document name** is copied to the ticket at creation time (`document_name` field)
- The **receipt screenshot** is stored in a separate directory and is not affected by document deletion
- The **audit log** records every action with full details and admin attribution
- The **admin_notes** field accumulates a text log of all actions (e.g., "Refund approved by Admin. Refund completed by Admin. Ref: GC123456789")

The only data lost when a document is picked up is the original uploaded file, the payment record (but the amount is preserved on the ticket), and the document database record (but the name is preserved on the ticket). **No audit trail is broken.**

### Querying Audit Data

To review all refund activity, query the database:

```sql
-- All refund tickets with their audit trails
SELECT t.ticket_number, t.customer_name, t.gcash_number,
       t.refund_amount, t.refund_status, t.refund_reference,
       t.refund_completed_at, t.resolved_by, t.document_name
FROM support_tickets t
WHERE t.refund_status IN ('pending', 'completed')
ORDER BY t.created_at DESC;

-- Detailed audit log for a specific ticket
SELECT a.action, a.old_status, a.new_status,
       a.performed_by, a.details, a.timestamp
FROM ticket_audit_logs a
JOIN support_tickets t ON a.ticket_id = t.id
WHERE t.ticket_number = '#TKT-XXXXXX-XXXX'
ORDER BY a.timestamp ASC;

-- All refund completions with reference numbers
SELECT t.ticket_number, t.customer_name, t.gcash_number,
       t.refund_amount, t.refund_reference, t.refund_completed_at,
       a.performed_by, a.details
FROM ticket_audit_logs a
JOIN support_tickets t ON a.ticket_id = t.id
WHERE a.action = 'refund_completed'
ORDER BY a.timestamp DESC;
```
