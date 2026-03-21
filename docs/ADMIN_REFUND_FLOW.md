# SafePrint Problem Report & Ticket Resolution System — Admin Guide

> Complete reference for the customer problem report flow and admin ticket resolution process.

---

## Table of Contents
1. [Customer Side — Report a Problem Flow](#1-customer-side--report-a-problem-flow)
2. [Admin Side — Ticket Dashboard](#2-admin-side--ticket-dashboard)
3. [Ticket Lifecycle & Statuses](#3-ticket-lifecycle--statuses)
4. [Data Retention & Privacy](#4-data-retention--privacy)
5. [Resolution Scenarios & Recommended Actions](#5-resolution-scenarios--recommended-actions)
6. [Suggested Scenarios Not Yet in the System](#6-suggested-scenarios-not-yet-in-the-system)

---

## 1. Customer Side — Report a Problem Flow

The customer accesses the problem report form from the **confirmation page** (after payment). The form is a multi-step wizard overlay.

### Entry Points

| # | Trigger | Description |
|---|---------|-------------|
| 1 | **Manual** | Customer clicks "Report a Problem" button on the confirmation page |
| 2 | **Auto (30-min timeout)** | Document auto-cancelled after 30 minutes with no available printer — overlay opens automatically |
| 3 | **Auto (queue stuck)** | Document stays "Queued" for longer than the configured timeout (default 5 min) with no other customers in queue — overlay opens automatically |

### Step 1: Document Selection

- Customer sees all their documents (Pending, Queued, Printing, Finished, Cancelled)
- Can select one or multiple documents
- If only **1 document** → auto-selected, skips directly to Step 2
- If **multiple selected** → asked: *"Do all documents share the same issue?"*
  - **Yes** → single report flow covering all docs
  - **No** → individual report flow (loops through each doc one by one)

### Step 2: Problem Type Selection

| # | Option | Code |
|---|--------|------|
| 1 | Low Quality / Damage | `quality` |
| 2 | Some Pages Missing / Blank | `missing-pages` |
| 3 | Whole Document Did Not Print | `no-print` |
| 4 | Other | `other` |

### Step 3: Problem-Type-Specific Flow

#### A. Low Quality / Damage (`quality`)

1. Customer selects page range: **"All pages"** or **"Specific pages"** (with text input)
2. Customer describes the issue (required textarea)
3. System triggers automatic **reprint** (if not already reprinted for this document)
4. Shows reprint status: *"[Filename] (pages) sent to [Printer]"*
5. Customer can click:
   - **"All Good"** → issue resolved, closes
   - **"Still Not Resolved"** → proceeds to ticket form

#### B. Some Pages Missing / Blank (`missing-pages`)

1. Customer asked: *"Was there a paper jam?"* (Yes / No)
2. **Yes (paper jam)**:
   - System calls `check-print-logs` API
   - If can reprint → auto-reprint
   - If already reprinted → goes to ticket form
3. **No (no jam)**:
   - Goes directly to ticket form
   - Description auto-set to: *"Pages missing - no paper jam observed"*

#### C. Whole Document Did Not Print (`no-print`)

1. System calls `check-print-logs` API to verify server records
2. **If document status is NOT "Finished"** (system confirms it didn't print):
   - Can reprint → auto-reprint
3. **If document status IS "Finished"** (system says it printed):
   - Cannot reprint
   - Goes to ticket form with message: *"Our records show this document was printed successfully. Please submit a ticket so we can investigate."*

#### D. Other (`other`)

1. Customer describes issue in textarea
2. Goes directly to ticket form

### Step 4: Reprint Result (if applicable)

- Reprint is only allowed **once per document** (enforced by `DocumentReprintLog` table)
- Shows success message: *"[Filename] ([page range]) sent to [Printer]"*
- Two options:
  - **"All Good"** → closes overlay, issue resolved
  - **"Still Not Resolved"** → proceeds to ticket form

### Step 5: Ticket Form (3 sub-steps)

#### Sub-step 1 — Contact Info
| Field | Required | Validation |
|-------|----------|------------|
| Customer Name | Yes | Non-empty |
| Email | Yes | Valid email format |
| Phone Number | Yes | PH mobile format (09XXXXXXXXX) |

#### Sub-step 2 — Payment Proof & Evidence
| Field | Required | Notes |
|-------|----------|-------|
| Receipt Code | Yes | From payment receipt |
| Receipt Screenshot | Yes | File upload (image) — screenshot of the payment receipt |
| Proof Photos | Yes | Multiple file upload (images) — photo(s) of the actual issue (e.g., damaged print, blank pages, printer error screen) |

#### Sub-step 3 — Description
- Description textarea (required)
- **Skipped** if description was already captured from the problem type step (e.g., "Other" or "Low Quality")

### Step 6: Duplicate Detection

Before creating the ticket, the system checks if the customer already has an active ticket (status: `open` or `in-progress`) for the same primary document. If a duplicate is found:
- The submission is **blocked**
- Customer sees: *"You already have an active ticket ([ticket number]) for this document. Please wait for it to be resolved."*
- No new ticket is created

### Step 7: Ticket Submitted

- Displays ticket number (format: `#TKT-YYMMDD-XXXX`, e.g. `#TKT-260315-4821`)
- Message: *"Expect an update from the SafePrint team in both email and kiosk in about 5-10 business days."*
- Email alert is sent to admins automatically
- Audit log entry created: *"Ticket submitted by [Name]. Problem: [Type]."*

---

## 2. Admin Side — Ticket Dashboard

### Dashboard Layout

Tickets appear on the admin dashboard in two sections:

| Section | Ticket Statuses | Columns |
|---------|-----------------|---------|
| **Active Tickets** | open, in-progress | Ticket Number, Payment Amount, Issue Type, Date Submitted, Customer ID, Actions |
| **Resolved Tickets** | resolved, closed, voided, refunded | Ticket Number, Payment Amount, Customer Name, Email, Verified By, Status, View Details |

### Admin Actions on Active Tickets

#### 1. Void (Red Button)
- Confirms with popup: *"Are you sure you want to void this ticket?"*
- Sets ticket status to **`voided`**
- Sets `data_retention_expires` to 30 days from now (triggers auto-purge later)
- Creates audit log: *"Ticket voided by [Admin]."*
- Ticket moves to **Resolved Tickets** section

**When to use:** Ticket is invalid, duplicate, spam, customer withdrew their complaint, or investigation shows no issue occurred.

#### 2. Verify (Green Button — Opens Detail Modal)
Opens a full ticket detail modal with comprehensive information:

**Ticket Information:**
- Customer ID, Document ID
- Customer Name, Document Name
- Email, Phone Number
- Problem Type (Low Quality / Missing Pages / No Print / Other)
- Was Reprinted (Yes/No)
- GCash Number, Payment Amount

**Receipt Proof:**
- Receipt Code
- Receipt Screenshot (clickable thumbnail → full-size overlay)

**Proof Photos:**
- All proof photos uploaded by the customer displayed as clickable thumbnails
- Clicking any photo opens it in the full-size image overlay
- Shows "No proof photos uploaded" if none were submitted (legacy tickets before this feature)

**Related Documents (Batch Ticket):**
- Shown only for batch tickets (multiple documents reported under one ticket)
- Displays comma-separated list of all related document IDs
- Allows admin to verify all affected documents in one view

**Activity Log (3 tabs):**
| Tab | Content | Purpose |
|-----|---------|---------|
| **Ticket Log** | Audit trail entries (created, status changes, refund actions, voided, data purged) | Track all admin actions on this ticket |
| **Printer Status** | Printer status logs within ±N minutes of ticket creation | Verify what printers were doing when the issue occurred |
| **Document History** | Full document lifecycle (uploaded → pending → queued → printing → finished) + reroute events | Trace the document's complete journey through the system |

> The Printer Status time window is configurable via `SiteSetting.verification_time_window` (default: 10 minutes). An adjustable dropdown in the modal lets the admin expand to 5/10/15/30/60 minutes.

**Refund Section** (shown only if `refund_status = 'pending'`):
- Refund Amount
- GCash Number
- Reference Number input + **"Complete Refund"** button

#### 3. Refund (Blue Button)
- Confirms with popup: *"Are you sure you want to refund this ticket?"* (shows GCash number if available)
- Sets ticket status to **`refunded`**, `refund_status` to **`pending`**
- Records `refund_amount` (defaults to the full payment amount)
- Creates audit log: *"Refund of ₱X.XX approved. GCash: XXX"*
- **Admin must now manually send the GCash refund** to the customer

**Completing the Refund:**
1. Admin sends money via GCash to the customer's GCash number
2. Opens the ticket modal (click "View Details" in Resolved Tickets)
3. Enters the GCash Reference Number in the input field
4. Clicks **"Complete Refund"**
5. System records:
   - `refund_status` → `completed`
   - `refund_reference` → the reference number
   - `refund_completed_at` → current timestamp
   - `data_retention_expires` → 30 days from now
   - Audit log: *"Refund of ₱X.XX completed. Reference: XXX."*

---

## 3. Ticket Lifecycle & Statuses

```
                    ┌──────────┐
                    │   open   │ (newly created)
                    └────┬─────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
        ┌──────────┐ ┌────────┐ ┌──────────┐
        │  voided  │ │verify  │ │ refunded │
        └──────────┘ │(modal) │ │(pending) │
                     └────────┘ └────┬─────┘
                                     │
                                     ▼
                               ┌──────────┐
                               │ refunded │
                               │(completed)│
                               └──────────┘
```

| Status | Meaning | Available Actions |
|--------|---------|-------------------|
| `open` | Newly created, awaiting admin review | Void, Verify (view details), Refund |
| `in-progress` | Admin is investigating | Void, Verify, Refund |
| `voided` | Dismissed as invalid | View Details only |
| `refunded` (pending) | Refund approved, awaiting GCash transfer | Complete Refund (enter reference) |
| `refunded` (completed) | Refund sent and confirmed with reference | View Details only |
| `resolved` | Issue resolved without refund | View Details only |
| `closed` | Ticket closed | View Details only |

### Refund Status Sub-States

| Refund Status | Meaning |
|---------------|---------|
| `none` | No refund requested or applicable |
| `pending` | Refund approved by admin, awaiting manual GCash transfer |
| `completed` | GCash refund sent, reference number recorded |
| `rejected` | Refund request denied (not currently used in UI) |

---

## 4. Data Retention & Privacy

### Automatic Purge (30-Day Retention)

- After a ticket is resolved/voided/refunded (completed), a **30-day retention countdown** starts (`data_retention_expires`)
- Daily at **12:00 PM**, the `purge_expired_ticket_data` management command runs via cron
- It finds tickets where:
  - `data_purged = False`
  - `data_retention_expires <= now`
  - Status is in `[resolved, closed, voided, refunded]`
  - `refund_status` is NOT `pending` (won't purge while refund is outstanding)
- Calls `purge_pii()` which:
  - Deletes receipt screenshot file from disk
  - Deletes all proof photo files from disk (via `TicketProofImage` records)
  - Clears: `phone_number`, `gcash_number`, `receipt_code`, `description`, `email`, `customer_name`
  - Replaces with `[Purged]` / `[Data purged]`
  - Sets `data_purged = True`

### Manual Purge

Admin can also manually purge a ticket's PII data:
- Only available for tickets in resolved/voided/refunded state
- Cannot purge while refund is pending
- Creates audit log: *"PII data manually purged by admin."*

### What Remains After Purge

| Kept | Purged |
|------|--------|
| Ticket number | Customer name → `[Purged]` |
| Customer ID | Email → cleared |
| Document ID | Phone number → cleared |
| Problem type | GCash number → cleared |
| Status | Receipt code → cleared |
| Resolution timestamps | Description → `[Data purged]` |
| Audit log entries | Receipt screenshot → deleted from disk |
| Refund reference | Proof photos → all deleted from disk |
| Related doc IDs | |

---

## 5. Resolution Scenarios & Recommended Actions

### Scenario 1: Low Quality Print → Reprinted → Still Not Happy

**What happened:** Customer reported low quality, system auto-reprinted, customer clicked "Still Not Resolved" and submitted a ticket.

**Admin sees in ticket:**
- `was_reprinted: Yes`
- `problem_type: Low Quality / Damage`
- Customer's description of the quality issue

**Verification steps:**
1. Open **Printer Status** tab — was the printer in error/jam state during that time window?
2. Open **Document History** tab — was the document rerouted multiple times? Any printer errors?
3. View **receipt screenshot** to confirm payment is legitimate

**Recommended action:**
- If printer was genuinely malfunctioning (error states visible in logs) → **Refund**
- If logs show normal print completion and no errors → **Void** (add admin note explaining decision)

---

### Scenario 2: Missing Pages — Paper Jam Confirmed

**What happened:** Customer reported missing pages, confirmed there was a paper jam, system attempted reprint.

**Admin sees in ticket:**
- `was_reprinted: Yes`
- `problem_type: Some Pages Missing / Blank`
- Description likely references jam

**Verification steps:**
1. Check **Printer Status** tab — look for "Paper Jam", "Error", or status changes near the ticket creation time
2. Verify the document was assigned to a printer that had issues

**Recommended action:**
- If jam confirmed in logs and reprint didn't fix it → **Refund**
- If no evidence of jam in printer logs → **Void**

---

### Scenario 3: Missing Pages — No Paper Jam

**What happened:** Customer says pages are missing but no jam observed. Went directly to ticket (no reprint attempted).

**Admin sees in ticket:**
- `was_reprinted: No`
- `problem_type: Some Pages Missing / Blank`
- `description: "Pages missing - no paper jam observed"`

**Verification steps:**
1. Check **Document History** — total pages vs what the system processed
2. Check **Printer Status** — was the printer operational?
3. Review receipt proof

**Recommended action:**
- If document logs show complete print in system → **Void** (likely customer error or misunderstanding)
- If logs show incomplete processing or printer errors → **Refund**

---

### Scenario 4: Document Did Not Print — System Shows "Finished"

**What happened:** Customer says nothing printed. System records show the document finished successfully. No reprint was allowed because system says it printed.

**Admin sees in ticket:**
- `was_reprinted: No`
- `problem_type: Whole Document Did Not Print`
- System auto-note: *"Our records show this document was printed successfully."*

**Verification steps:**
1. Check **Document History** — does it show the full lifecycle: Queued → Printing → Finished?
2. Check **Printer Status** — was the assigned printer online and operational?
3. Check for any reroute events (document bounced between printers?)
4. View receipt proof carefully

**Recommended action:**
- This is the **most suspicious scenario** — the system says it printed but the customer says it didn't
- Possible explanations:
  - **(a) Customer is lying** — trying to get a free print
  - **(b) Printer "ate" the paper** — printed but output tray malfunctioned
  - **(c) Another customer took the printout** — mistaken identity
- If receipt is valid AND printer had known issues during that period → **Refund**
- If logs show clean successful print with no issues → **Void** (add detailed admin notes)
- If uncertain → lean toward **Refund** for customer goodwill, but flag for monitoring

---

### Scenario 5: Document Did Not Print — System Shows NOT Finished

**What happened:** Document genuinely never printed (stuck in Queued or was Printing but didn't complete). System allowed reprint.

**Admin sees in ticket:**
- `was_reprinted: Yes`
- `problem_type: Whole Document Did Not Print`

**Verification steps:**
1. Check **Printer Status** — were all printers offline?
2. Check **Document History** — did it get stuck in Queued? Was there a timeout/cancellation?

**Recommended action:**
- If reprint was successful and customer is satisfied → no further action needed (unless they submitted ticket saying reprint also failed)
- If reprint also failed → **Refund** — repeated system failure

---

### Scenario 6: Auto-Triggered Ticket (30-Minute Timeout)

**What happened:** Document was in queue for 30 minutes with no available printer. System auto-cancelled the document and prompted the customer to file a ticket.

**Admin sees in ticket:**
- Document status: `Cancelled`
- Cancel reason in reroute history: *"Error: No printer available for 30 minutes"*
- Customer may have selected any problem type

**Verification steps:**
1. Check **Printer Status** — all printers were offline/Error for 30+ minutes
2. Confirm the cancellation was system-triggered (not manual)

**Recommended action:**
- **Refund** — customer paid but nothing could print due to system/printer failure
- This is nearly always a valid refund case

---

### Scenario 7: Auto-Triggered Ticket (Queue Stuck — 5 min)

**What happened:** Customer's document was Queued for more than 5 minutes (configurable via `auto_ticket_timeout_minutes` in Site Settings) with no other customers in queue. The system auto-opened the problem report popup.

**Admin sees in ticket:**
- Problem type could be any of the 4 types (customer chose what to report)
- Ticket was likely filed shortly after the auto-popup appeared

**Verification steps:**
1. Check **Printer Status** — were printers in error state? Was paper out? Were they all offline?
2. Check **Document History** — did the document eventually get processed?

**Recommended action:**
- If the issue was a temporary printer hiccup that resolved itself → **Void** (especially if doc eventually printed)
- If printers were genuinely down and the document never printed → **Refund**
- If customer refiled after reprint succeeded → **Void**

---

### Scenario 8: Other Issue

**What happened:** Customer selected "Other" and described a unique problem not covered by the standard categories.

**Admin sees in ticket:**
- `problem_type: Other`
- Custom description written by customer

**Recommended action:**
- Review the description carefully
- Cross-reference with Printer Status and Document History logs
- Decide case-by-case: **Refund** if evidence supports a system failure, **Void** if unsubstantiated

---

## 6. Suggested Scenarios Not Yet in the System

These are potential improvements identified during system analysis:

### ~~6.1 Duplicate Ticket Detection~~ ✅ IMPLEMENTED

Duplicate detection is now active. When a customer submits a ticket, the system checks if they already have an active ticket (`open` or `in-progress`) for the same `document_id`. If found, submission is blocked with a message showing the existing ticket number.

### ~~6.2 Batch Ticket for Multi-Document Issues~~ ✅ IMPLEMENTED

Batch tickets are now supported. When a customer selects multiple documents with the same issue:
- A single ticket is created with the primary document set as the FK
- All related document IDs are stored in `related_doc_ids` (JSON array)
- `document_name` displays: *"N documents: doc1, doc2..."*
- Admin modal shows the "Related Documents (Batch Ticket)" section with all doc IDs

### ~~6.3 Mandatory Proof Photos~~ ✅ IMPLEMENTED

Proof photos are now mandatory for all ticket submissions:
- Stored via `TicketProofImage` model (FK to SupportTicket, ImageField)
- Multiple photos can be uploaded per ticket
- Displayed as clickable thumbnails in the admin ticket modal
- Auto-deleted during PII purge

---

### 6.4 Partial Refund

**Current limitation:** Refund is always the full payment amount.

**Scenario:** Customer printed a 10-page document. Only 2 pages had quality issues. A full refund overpays; a partial refund based on affected pages would be fairer.

**Suggestion:** The `refund_amount` field already exists in the database. Add an input field in the Refund confirmation where the admin can adjust the amount (defaulting to full payment). This would allow proportional refunds.

---

### 6.5 Voucher Credit as Alternative to GCash Refund

**Current limitation:** Refunds require manual GCash transfer, which is slow and error-prone.

**Scenario:** Instead of sending GCash, the admin could issue a `VoucherCredit` code for the refund amount — it's instant, avoids manual GCash transfer, and keeps the customer within the SafePrint ecosystem.

**Suggestion:** Add a "Refund as Voucher Credit" option alongside "Refund via GCash". The system already has `VoucherCredit` infrastructure (create code → customer applies on next payment). This could even be automated without admin intervention.

---

### 6.6 Escalation Path

**Current limitation:** No priority system or escalation workflow.

**Scenario:** A customer files a ticket for a large payment (e.g., ₱500+ for bulk printing). The regular admin may not have authority to approve large refunds.

**Suggestion:** Add a ticket priority field (Low/Medium/High) and an "Escalate" action that flags the ticket for senior admin review. Could also add a refund amount threshold that requires manager approval.

---

### 6.7 Customer Follow-up / Communication

**Current limitation:** No way for admin to send a response back to the customer through the system. The customer's only message is *"Expect an update in 5-10 business days."*

**Scenario:** Admin reviews the ticket, needs more information from the customer, or wants to explain why the ticket was voided.

**Suggestion:** Add email notifications for ticket status changes:
- Ticket voided → email explaining why
- Refund approved → email with expected timeline
- Refund completed → email with GCash reference
- Status update → email with admin notes

---

### 6.8 Ticket Reopening

**Current limitation:** Once a ticket is voided or resolved, it cannot be reopened. Customer must file a brand new ticket.

**Scenario:** Admin voids a ticket after initial review. Later, new evidence surfaces (e.g., other customers report the same printer issue). Admin wants to reopen and refund.

**Suggestion:** Add a "Reopen" button on resolved/voided tickets that sets the status back to `open` and creates an audit log entry. This preserves the original ticket history instead of creating a disconnected new ticket.

---

## Configuration Reference

| Setting | Location | Default | Description |
|---------|----------|---------|-------------|
| `verification_time_window` | SiteSetting (Django Admin) | 10 min | Time window for Printer Status tab in verification modal |
| `auto_ticket_timeout_minutes` | SiteSetting (Django Admin) | 5 min | How long a doc must be Queued with empty queue before auto-triggering problem report |
| Data retention | Hardcoded | 30 days | Days after resolution before automatic PII purge |
| Purge schedule | Crontab | 12:00 PM daily | When `purge_expired_ticket_data` runs |
| Reprint limit | Code | 1 per document | Maximum reprints before requiring a ticket |
