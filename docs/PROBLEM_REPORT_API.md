# Problem Report API Endpoints

This document describes the API endpoints required for the Print Error Report feature.

## Required Endpoints

### 1. Check Print Logs
**Endpoint:** `POST /api/check-print-logs/`

**Purpose:** Check if a document is in the print logs to determine if a reprint is possible.

**Request Body:**
```json
{
    "doc_id": "string",
    "reason": "no-print" | "missing-pages-jam"
}
```

**Response:**
```json
{
    "can_reprint": true | false,
    "reason": "string (optional - explanation if can_reprint is false)"
}
```

**Logic:**
- For `no-print`: Check if document is NOT in completed print logs → can_reprint = true
- For `missing-pages-jam`: Check if paper jam was detected in logs → can_reprint = true
- If document IS in completed logs or no jam detected → can_reprint = false

---

### 2. Trigger Reprint
**Endpoint:** `POST /api/trigger-reprint/`

**Purpose:** Trigger a reprint of a document (only allowed once per document).

**Request Body:**
```json
{
    "doc_id": "string",
    "doc_ids": ["string"] (optional - for multiple documents with same issue),
    "reason": "low-quality" | "missing-pages-jam" | "no-print",
    "page_range": "all" | "specific",
    "specific_pages": "string (e.g., '1-5, 7')",
    "description": "string"
}
```

**Response (Success):**
```json
{
    "success": true,
    "message": "[Doc Name] page [x] printed at [Printer 1]",
    "details": "Printed to Printer 1"
}
```

**Response (Error):**
```json
{
    "success": false,
    "error": "Document has already been reprinted"
}
```

**Logic:**
- Check if document has already been reprinted (flag in DB)
- If not reprinted yet, send to printer queue
- Mark document as reprinted in DB
- Return printer name and status

---

### 3. Submit Ticket
**Endpoint:** `POST /api/submit-ticket/`

**Purpose:** Create a support ticket for unresolved printing issues.

**Content-Type:** `multipart/form-data` (required for file uploads)

**Request Fields (FormData):**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `customer_id` | string | Yes | Customer ID |
| `document_id` | string | Yes | Primary document ID |
| `document_name` | string | Yes | Document filename |
| `documents` | JSON string | No | Array of `{doc_id, doc_name}` for batch tickets |
| `customer_name` | string | Yes | |
| `email` | string | Yes | Valid email |
| `phone_number` | string | No | PH mobile format (09XXXXXXXXX) |
| `problem_type` | string | Yes | `quality` / `missing-pages` / `no-print` / `other` |
| `description` | string | Yes | Issue description |
| `page_range` | string | No | `all` or `specific` |
| `specific_pages` | string | No | e.g., "1-5, 7" |
| `reprinted` | string | No | `true` / `false` |
| `receipt_code` | string | Yes | Code from payment receipt |
| `receipt_screenshot` | file | Yes | Image of payment receipt |
| `proof_photos` | file(s) | Yes | One or more photos of the issue (multiple files) |
| `gcash_number` | string | No | Customer GCash number |

**Response (Success):**
```json
{
    "success": true,
    "ticket_number": "#TKT-260315-4821"
}
```

**Response (Duplicate Detected):**
```json
{
    "success": false,
    "error": "You already have an active ticket (#TKT-260315-1234) for this document. Please wait for it to be resolved."
}
```

**Response (Error):**
```json
{
    "success": false,
    "error": "Error message"
}
```

**Logic:**
1. Validate required fields (customer_id, document_id, receipt_code, receipt_screenshot, proof_photos)
2. **Duplicate detection:** Check if an active ticket (`open`/`in-progress`) exists for the same `document_id` + `customer_id`. If found, return error with existing ticket number.
3. Create SupportTicket record with generated ticket number (`#TKT-YYMMDD-XXXX`)
4. For batch tickets (multiple docs): store all doc IDs in `related_doc_ids` (JSON), set `document_name` to "N documents: doc1, doc2..."
5. Save receipt screenshot to `receipt_screenshots/` media directory
6. Create `TicketProofImage` record for each uploaded proof photo
7. Create audit log entry
8. Send email notification to admins
9. Return ticket number

---

## Database Models Required

### ProblemReport / Ticket Model
```python
class SupportTicket(models.Model):
    ticket_number = models.CharField(max_length=20, unique=True)
    customer_id = models.CharField(max_length=100)
    document = models.ForeignKey(Document, on_delete=SET_NULL, null=True, blank=True)
    document_name = models.CharField(max_length=255)
    customer_name = models.CharField(max_length=255)
    email = models.EmailField()
    phone_number = models.CharField(max_length=20, blank=True)
    problem_type = models.CharField(max_length=50)  # quality, missing-pages, no-print, other
    description = models.TextField()
    page_range = models.CharField(max_length=20, blank=True)
    specific_pages = models.CharField(max_length=100, blank=True)
    was_reprinted = models.BooleanField(default=False)
    receipt_code = models.CharField(max_length=100, blank=True)
    receipt_screenshot = models.ImageField(upload_to='receipt_screenshots/', blank=True, null=True)
    gcash_number = models.CharField(max_length=20, blank=True)
    related_doc_ids = models.TextField(blank=True)  # JSON array of doc IDs for batch tickets
    status = models.CharField(max_length=50, default='open')
    # ... refund fields, timestamps, etc.

class TicketProofImage(models.Model):
    ticket = models.ForeignKey(SupportTicket, on_delete=CASCADE, related_name='proof_images')
    image = models.ImageField(upload_to='receipt_screenshots/proofs/')
    uploaded_at = models.DateTimeField(auto_now_add=True)
```

### Document Reprint Flag
Add to existing Document model:
```python
has_been_reprinted = models.BooleanField(default=False)
reprint_count = models.IntegerField(default=0)
```

---

## Frontend Flow Summary

1. **Document Selection** → User selects documents with issues
2. **Same Issue Check** (if multiple docs) → "Do these documents share the same issue?"
   - Yes → Single report for all
   - No → Loop through each individually
3. **Problem Type Selection** → Low Quality, Missing Pages, No Print, Other
4. **Problem-Specific Flow:**
   - **Low Quality**: Select pages → Describe → Reprint → Result
   - **Missing Pages**: Paper jam? → If yes: Check logs → Reprint if applicable
   - **No Print**: Immediately check logs → Reprint if not in completed logs
   - **Other**: Describe → Submit Ticket directly
5. **After Reprint** → "All Goods" (resolved) or "Still an error" (submit ticket)
6. **Submit Ticket** → Fill customer info → Confirmation with ticket number
