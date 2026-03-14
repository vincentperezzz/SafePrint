# Refund Audit & Ticket Verification System — Plan

## Current State: What Data Exists for Auditing

### 1. Ticket Data (`SupportTicket`)
- `problem_type`: quality, missing-pages, no-print, other
- `description`: free-text from customer
- `receipt_code`, `receipt_screenshot`: payment proof
- `created_at`: when ticket was filed
- `document` FK → links to the `Document` record (if it still exists)

### 2. Document Data (`Document`)
- `doc_status`: Pending → Queued → Printing → Finished → Picked Up
- `time_submitted`, `status_updated_at`
- `pages_printed` (JSON list): tracks which pages were actually printed
- `printer_assigned`: which printer was used
- **CRITICAL PROBLEM**: When a customer picks up a finished document, the file is **deleted from disk** and the **Document + Payment records are deleted from the database** (`picked_up_document` view). The `SupportTicket.document` FK becomes NULL via `SET_NULL`.

### 3. Reroute History (`RerouteHistory`)
- Logs every printer assignment, error, and reroute
- Records: document, printer, status (e.g., "Error: Paper Jam", "Assigned", "Rerouted", "Timeout"), timestamp
- **This is the closest thing to a printer error log**
- **CASCADE DELETE**: Tied to Document FK — if Document is deleted, all RerouteHistory entries for that document are also deleted

### 4. Ticket Audit Log (`TicketAuditLog`)
- Tracks admin actions: created, status_changed, verified, refund_approved, refund_completed, voided, etc.
- Has `performed_by`, `details`, timestamps

### 5. Printer SNMP Polling (`poll_printer_snmp`)
- Runs via cron/daemon, polls every 3 seconds
- Updates `printer_status` field (Ready, Printing, Sleep, Offline, or error strings like "Paper Jam")
- **Does NOT save historical logs** — only overwrites the current status in the `printers` table each poll

---

## Key Gaps (Problems for Auditing)

| Gap | Impact |
|-----|--------|
| **No printer error history table** | SNMP status is overwritten each poll. Cannot look back to see "Printer X had Paper Jam at 8:00 AM" |
| **Document deleted on pickup** | Once picked up, Document record is deleted. Cannot verify what was printed |
| **File deleted on pickup** | Physical file is gone. Cannot verify content |
| **Payment deleted on pickup** | Amount paid is gone. Cannot verify refund amount against original payment |
| **RerouteHistory cascade deleted** | Tied to Document FK with CASCADE — when Document is deleted, all printer error/reroute logs for that document are also deleted |

---

## Verification Logic by Problem Type

### 1. Printer Error Tickets (`no-print`, `missing-pages` due to jam/error)

**Approach**: Compare ticket timestamp against printer error logs within a ±15 minute window.

- **Current ability**: Can check `RerouteHistory` for matching errors, but only if the document hasn't been picked up yet (CASCADE delete destroys the records)
- **What's needed**: A `PrinterStatusLog` table that persists independently of documents. Each SNMP poll that detects a status change to non-operational should log an entry.

### 2. Quality Issues (`quality`, `missing-pages` with blank/crooked pages)

**Problem**: Printer logs won't show quality issues because the printer itself didn't error. The print job succeeded from the printer's perspective.

- **Only verification method**: Photo proof from the customer
- **Current state**: `receipt_screenshot` field exists but is for payment receipts, not print quality evidence
- **What's needed**: A separate `evidence_photo` field on `SupportTicket` for quality proof uploads

### 3. Completed/Picked-Up Documents

**Problem**: If the document is already "Picked Up" (completed), all Document + Payment + RerouteHistory records are deleted from the database. Auditing becomes impossible.

- **What's needed**: Preserve records after pickup. Either:
  - A) Keep Document + Payment records but only delete the physical file (simplest)
  - B) Create a `DocumentArchive` table that captures key metadata before deletion
  - C) Add a grace period before hard deletion (e.g., 90 days)

---

## Implementation Plan

### Phase 1: Stop Deleting Records on Pickup (HIGHEST PRIORITY)

**Goal**: Prevent permanent data loss that makes auditing impossible.

**Changes to `picked_up_document` view**:
- Keep Document record (already sets `doc_status = 'Picked Up'`)
- Keep Payment record
- Delete only the physical file from disk (already done)
- **Remove the lines** that delete Payment and Document DB records
- Add a periodic cleanup management command to purge records older than 90 days

**Impact**: Immediate — all future documents will retain audit trails.

**New management command**: `cleanup_old_documents`
```python
# Delete Document + Payment records older than 90 days with status 'Picked Up'
# This runs via cron (e.g., daily at midnight)
```

### Phase 2: Printer Error Log (enables printer error ticket verification)

**New model**: `PrinterStatusLog`
```python
class PrinterStatusLog(models.Model):
    printer = models.ForeignKey(Printer, on_delete=models.SET_NULL, null=True)
    printer_name = models.CharField(max_length=255)  # Denormalized for persistence
    status = models.CharField(max_length=100)         # e.g., "Paper Jam", "Offline", "Error"
    previous_status = models.CharField(max_length=100) # What it was before the error
    timestamp = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'printer_status_logs'
        ordering = ['-timestamp']
```

**Changes to `poll_printer_snmp.py`**:
- When `printer_status` changes from an operational state (Ready, Printing, Sleep) to a non-operational state (anything else), create a `PrinterStatusLog` entry
- When `printer_status` returns to an operational state, update the most recent unresolved log entry's `resolved_at`
- This captures: Paper Jam, Offline, Error, and any other non-standard status

**Data retention**: Keep logs for 6 months, then auto-purge via the same cleanup command.

### Phase 3: Evidence Photo for Quality Tickets

**New field on `SupportTicket`**:
```python
evidence_photo = models.ImageField(upload_to='evidence_photos/', null=True, blank=True)
```

**Customer-side changes**:
- Add optional photo upload field to the ticket creation form (Step 2 of the wizard)
- Label: "Upload a photo of the issue (optional but recommended for quality issues)"
- Accept image files only (jpg, png, heic)

**Admin-side changes**:
- Show evidence photo in the ticket detail modal alongside the receipt screenshot
- Add labels to distinguish: "Payment Receipt" vs "Issue Evidence"

### Phase 4: Auto-Verification Logic

**New function**: `auto_verify_ticket(ticket)`

```python
def auto_verify_ticket(ticket):
    """
    Cross-references ticket data against system logs.
    Returns: {
        'verdict': 'likely_legit' | 'suspicious' | 'needs_review' | 'cannot_verify',
        'reason': str,
        'evidence': list of matching log entries
    }
    """

    if ticket.problem_type in ('no-print', 'missing-pages'):
        # --- Printer Error Check ---
        window = timedelta(minutes=15)
        start = ticket.created_at - window
        end = ticket.created_at + window

        # Check PrinterStatusLog
        matching_errors = PrinterStatusLog.objects.filter(
            timestamp__gte=start,
            timestamp__lte=end,
        ).exclude(status__in=['Ready', 'Printing', 'Sleep'])

        # Check RerouteHistory for the linked document
        reroutes = []
        if ticket.document:
            reroutes = RerouteHistory.objects.filter(
                document=ticket.document,
                status__startswith='Error'
            )

        # Check for 30-min timeout cancellation
        timeout_entries = []
        if ticket.document:
            timeout_entries = RerouteHistory.objects.filter(
                document=ticket.document,
                status__icontains='No printer available'
            )

        if matching_errors.exists() or reroutes:
            return {
                'verdict': 'likely_legit',
                'reason': 'Printer error confirmed in system logs',
                'evidence': list(matching_errors) + list(reroutes)
            }
        elif timeout_entries:
            return {
                'verdict': 'likely_legit',
                'reason': '30-minute timeout cancellation confirmed',
                'evidence': list(timeout_entries)
            }
        else:
            return {
                'verdict': 'suspicious',
                'reason': 'No matching printer errors found within ±15 min window',
                'evidence': []
            }

    elif ticket.problem_type == 'quality':
        if hasattr(ticket, 'evidence_photo') and ticket.evidence_photo:
            return {
                'verdict': 'needs_review',
                'reason': 'Photo proof provided — manual review required',
                'evidence': []
            }
        else:
            return {
                'verdict': 'cannot_verify',
                'reason': 'No photo proof uploaded — ask customer to provide evidence',
                'evidence': []
            }

    elif ticket.problem_type == 'other':
        return {
            'verdict': 'needs_review',
            'reason': 'Custom issue type — manual review required',
            'evidence': []
        }
```

**When to run**: Automatically when a ticket is created, and on-demand when admin clicks "Verify" on a ticket.

**Store result**: Add `verification_verdict` and `verification_reason` fields on `SupportTicket` so the result persists and can be displayed.

### Phase 5: Admin Dashboard Integration

**Ticket list view**:
- Show verification badge next to each ticket:
  - 🟢 `Likely Legit` — green badge
  - 🟡 `Needs Review` — yellow badge
  - 🔴 `Suspicious` — red badge
  - ⚪ `Cannot Verify` — gray badge

**Ticket detail modal** — new tabs:
- **Printer Logs tab**: Shows `PrinterStatusLog` entries near the ticket timestamp
- **Document History tab**: Shows `RerouteHistory` entries for the linked document
- **Evidence tab**: Shows evidence photo + receipt screenshot side by side

**Filters**:
- Add verification status filter to ticket list (All / Likely Legit / Suspicious / Needs Review / Cannot Verify)

---

## Priority Order

| Phase | Priority | Effort | Impact |
|-------|----------|--------|--------|
| Phase 1: Stop deleting records | **CRITICAL** | Low | Prevents permanent data loss — must do first |
| Phase 2: Printer error log | High | Medium | Core infrastructure for auto-verification |
| Phase 3: Evidence photos | Medium | Low | Enables quality issue verification |
| Phase 4: Auto-verification | Medium | Medium | The intelligence layer |
| Phase 5: Admin UI | Lower | Medium | Makes verification accessible to admin |

---

## Data Flow Summary

```
Customer submits ticket
        │
        ▼
System runs auto_verify_ticket()
        │
        ├── Printer error ticket?
        │       │
        │       ├── Check PrinterStatusLog (±15 min window)
        │       ├── Check RerouteHistory for document
        │       ├── Check for timeout cancellation
        │       │
        │       └── Result: likely_legit / suspicious
        │
        ├── Quality issue ticket?
        │       │
        │       ├── Has evidence photo? → needs_review
        │       └── No photo? → cannot_verify
        │
        └── Other? → needs_review
        
Admin sees verdict badge on ticket
        │
        ├── likely_legit → Safe to approve refund
        ├── needs_review → Check evidence, decide manually
        ├── suspicious → Investigate further before refund
        └── cannot_verify → Request more info from customer
```

---

## Database Diagram (New Tables)

```
PrinterStatusLog
├── id (PK)
├── printer_id (FK → Printer, SET_NULL)
├── printer_name (denormalized)
├── status (e.g., "Paper Jam")
├── previous_status (e.g., "Ready")
├── timestamp
└── resolved_at (nullable)

SupportTicket (modified)
├── ... existing fields ...
├── evidence_photo (NEW - ImageField)
├── verification_verdict (NEW - CharField)
└── verification_reason (NEW - TextField)
```
