# Refund Audit & Ticket Verification System

## Privacy-First Approach

SafePrint promises customers that **no files are stored** and **data is not retained** beyond the printing session. This commitment is honored in the normal flow:

- **Normal flow**: Customer uploads → prints → picks up → file deleted from disk → Document + Payment records deleted from database.
- **Ticket flow**: When a customer files a support ticket, minimal metadata is retained *only* for the duration needed to resolve the issue + a 30-day retention window.

### Data Retention Policy

| Scenario | What happens | Retention |
|----------|-------------|-----------|
| Normal print (no ticket) | File deleted on pickup, DB records deleted | **Immediate** — no data kept |
| Ticket filed → voided | PII purged after 30 days (or immediately by admin) | **30 days** from void date |
| Ticket filed → refund completed | PII purged after 30 days (or immediately by admin) | **30 days** from refund completion |
| Ticket filed → refund pending | Data kept until refund is completed, then 30-day clock starts | Until completion + **30 days** |

### What Gets Purged vs Kept

**Purged after retention expires:**
- `email` — cleared
- `customer_name` — replaced with `[Purged]`
- `phone_number` — cleared
- `gcash_number` — cleared
- `receipt_screenshot` — file deleted from disk, field cleared
- `receipt_code` — cleared
- `description` — replaced with `[Data purged]`

**Kept permanently (dashboard record):**
- `ticket_number`, `status`, `problem_type` (category only)
- `customer_id` (system identifier, not PII)
- `resolved_by`, `resolved_at`, `created_at`
- `payment_amount`, `refund_amount`, `refund_status`, `refund_reference`
- `document_name` (filename string only)
- All `TicketAuditLog` entries (admin action history)

### Implementation (Completed)

1. **Model fields added**: `data_retention_expires` (DateTimeField) and `data_purged` (BooleanField) on `SupportTicket`.
2. **`purge_pii()` method**: On the `SupportTicket` model — deletes receipt file, clears PII fields, sets `data_purged = True`.
3. **Automatic retention timer**: `void_ticket()` and `complete_refund()` set `data_retention_expires` to `now + 30 days`.
4. **Manual purge API**: `POST /portal/api/purge-ticket-data/` — admin can immediately purge PII from any resolved/voided ticket (blocked if refund is pending).
5. **Delete button on dashboard**: Each resolved ticket row has a "Delete Data" button for immediate manual purge.
6. **Auto-purge cron**: Management command `purge_expired_ticket_data` runs daily to purge tickets past their 30-day retention window.
7. **Audit trail**: Every purge (manual or automatic) creates a `TicketAuditLog` entry with action `data_purged`.

### Cron Setup

Add to crontab to run the auto-purge daily:
```
0 2 * * * cd /home/safeprint/dev/SafePrint && /home/safeprint/dev/SafePrint/venv/bin/python manage.py purge_expired_ticket_data
```

---

## Current Audit Capabilities

### What Data Exists for Auditing

| Source | Data | Lifetime |
|--------|------|----------|
| `SupportTicket` | Problem type, receipt proof, customer info | Until purged (30 days post-resolution) |
| `TicketAuditLog` | All admin actions: created, verified, voided, refunded, purged | **Permanent** |
| `RerouteHistory` | Printer assignment, errors, reroutes per document | Tied to Document (CASCADE) |
| `Payment` | Amount paid | Deleted on document pickup |
| `Document` | Print status, pages, printer assigned | Deleted on pickup |

### Key Gaps

| Gap | Impact | Mitigation |
|-----|--------|------------|
| No printer error history table | SNMP status is overwritten each poll | Future: `PrinterStatusLog` table |
| Document deleted on pickup | Cannot verify what was printed after pickup | Ticket captures `document_name` and `payment_amount` before deletion |
| RerouteHistory cascade deleted | Printer error evidence lost when document deleted | Audit log preserves verification decisions |

---

## Verification Logic by Problem Type

### Printer Error Tickets (`no-print`, `missing-pages`)
- Check `RerouteHistory` for matching errors (if document still exists)
- Check for 30-minute timeout cancellation entries
- Cross-reference ticket timestamp with any available printer error data

### Quality Issues (`quality`)
- Photo proof from customer (receipt_screenshot field)
- Manual admin review required — printer logs won't show quality issues

### Other (`other`)
- Manual admin review required

---

## Admin UI Features (Completed)

### Activity Log Table
- Replaced "Download Logs" button with structured audit log table in ticket modal
- Filter tabs: All | Status Changes | Refunds | Admin Actions
- Columns: Action, Details, By, Date

### Resolved Tickets Section
- Collapsible toggle (hidden by default) — admin clicks chevron to show
- "Delete Data" button per row for immediate PII purge
- "Purged" label shown after data has been cleared

### Pagination
- Dashboard active tickets: 10 per page
- Dashboard resolved tickets: 10 per page
- Voucher management table: 10 per page

---

## Future Enhancements (Not Yet Implemented)

### Phase A: Printer Error Log
- New `PrinterStatusLog` model to persist SNMP poll status changes
- When printer status changes to non-operational → create log entry
- When printer recovers → mark entry as resolved
- Enables automatic cross-referencing: "Was there a printer error within ±15 min of this ticket?"

### Phase B: Evidence Photo
- Separate `evidence_photo` field on `SupportTicket` for quality issue proof
- Customer uploads photo of print defect during ticket creation
- Admin sees evidence alongside receipt in modal

### Phase C: Auto-Verification
- `auto_verify_ticket()` function that cross-references ticket data against printer logs
- Returns verdict: `likely_legit`, `suspicious`, `needs_review`, `cannot_verify`
- Verification badge on each ticket row (green/yellow/red/gray)

### Phase D: Dashboard Filters
- Filter tickets by verification status
- Filter by problem type
- Date range filters