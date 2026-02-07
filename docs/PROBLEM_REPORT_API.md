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

**Request Body:**
```json
{
    "customer_id": "string",
    "document_id": "string",
    "document_name": "string",
    "documents": [{"doc_id": "string", "doc_name": "string"}] (optional - for multiple docs),
    "customer_name": "string",
    "email": "string",
    "phone_number": "string (optional)",
    "problem_type": "quality" | "missing-pages" | "no-print" | "other",
    "description": "string",
    "page_range": "all" | "specific",
    "specific_pages": "string",
    "reprinted": true | false
}
```

**Response (Success):**
```json
{
    "success": true,
    "ticket_number": "#TKT-12345"
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
- Create ticket record in DB
- Generate unique ticket number
- Send confirmation email to customer
- Return ticket number

---

## Database Models Required

### ProblemReport / Ticket Model
```python
class SupportTicket(models.Model):
    ticket_number = models.CharField(max_length=20, unique=True)
    customer_id = models.CharField(max_length=100)
    document_id = models.CharField(max_length=100)
    document_name = models.CharField(max_length=255)
    customer_name = models.CharField(max_length=255)
    email = models.EmailField()
    problem_type = models.CharField(max_length=50)  # quality, missing-pages, no-print, other
    description = models.TextField()
    page_range = models.CharField(max_length=20, blank=True)
    specific_pages = models.CharField(max_length=100, blank=True)
    was_reprinted = models.BooleanField(default=False)
    status = models.CharField(max_length=50, default='open')  # open, in-progress, resolved
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
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
