# Relevant Source Code for the End-to-End SafePrint Process

This document collects the relevant source code for the full SafePrint workflow, not only the GCash payment listener.

The lifecycle covered here is:

1. Student enters the site and starts an upload session.
2. PDF files are uploaded, validated, and virus-scanned.
3. Uploaded files are finalized into `Document` rows.
4. Document settings are updated and `Payment` rows are created from page analysis and pricing rules.
5. Payment is verified through the SafePrint GCash listener flow backed by Firebase.
6. Documents are queued and approved for dispatch.
7. A printer is assigned, pages are printed, and the document is marked finished.
8. Files and rows can be deleted manually or by cleanup commands, while audit history is preserved.

## 1. Entry Point and Upload Session

This is the public backend entry into the upload flow. It creates a persistent upload session key so each student's temporary uploaded files are grouped under a session-specific folder.

Source: `main/views.py`

```python
def index_view(request):
    pending_cid = request.session.get('pending_payment_cid')
    pending_doc_ids = request.session.get('pending_payment_doc_ids')
    if pending_cid and pending_doc_ids:
        from urllib.parse import urlencode
        params = urlencode({'customer_id': pending_cid}, doseq=False)
        doc_params = '&'.join(f'doc_ids={did}' for did in pending_doc_ids)
        return redirect(f'/payment/?{params}&{doc_params}')

    active_cid = request.session.get('customer_id')
    active_cid_redirect = None
    active_cid_doc_ids = []
    if active_cid:
        active_docs = Document.objects.filter(
            customer_id=active_cid
        ).exclude(doc_status__in=['Printed', 'Picked Up'])
        if not active_docs.exists():
            active_cid = None
        else:
            for doc in active_docs:
                try:
                    p = Payment.objects.get(doc=doc)
                    if p.payment_status == 'Unpaid':
                        active_cid_doc_ids.append(doc.doc_id)
                except Payment.DoesNotExist:
                    pass
            active_cid_redirect = 'payment' if active_cid_doc_ids else 'confirmation'

    if active_cid and active_cid_redirect == 'payment' and active_cid_doc_ids:
        doc_params = '&'.join(f'doc_ids={did}' for did in active_cid_doc_ids)
        active_cid_url = f'/payment/?customer_id={active_cid}&{doc_params}'
    elif active_cid:
        active_cid_url = f'/confirmation/{active_cid}/'
    else:
        active_cid_url = '/'

    return render(request, 'index.html', {
        'active_cid': active_cid,
        'active_cid_redirect': active_cid_redirect,
        'active_cid_url': active_cid_url,
    })


def upload_view(request):
    if not request.session.get('upload_session_key'):
        request.session['upload_session_key'] = str(uuid.uuid4())
    session_key = request.session['upload_session_key']
    return render(request, 'upload.html', {'session_key': session_key})
```

## 2. File Upload, Validation, and Virus Scanning

This code receives the uploaded PDF, enforces file type and size, stores it under `media/uploads/<session_key>/`, then runs a ClamAV scan before accepting it.

Source: `main/views.py`

```python
@csrf_exempt
def upload_file_view(request):
    if not request.session.get('upload_session_key'):
        request.session['upload_session_key'] = str(uuid.uuid4())
    session_key = request.session['upload_session_key']

    if request.method == 'POST' and request.FILES.get('file'):
        uploaded_file = request.FILES['file']

        if not uploaded_file.name.lower().endswith('.pdf'):
            return JsonResponse({
                'success': False,
                'error': 'Only PDF files are allowed.'
            })

        if uploaded_file.size > 500 * 1024 * 1024:
            return JsonResponse({
                'success': False,
                'error': 'File size too large. Maximum 500MB allowed.'
            })

        try:
            file_extension = os.path.splitext(uploaded_file.name)[1]
            unique_filename = f"{uuid.uuid4()}{file_extension}"
            file_path = default_storage.save(
                f'uploads/{session_key}/{unique_filename}',
                ContentFile(uploaded_file.read())
            )

            try:
                abs_file_path = default_storage.path(file_path)
                result = subprocess.run([
                    'clamdscan', '--no-summary', abs_file_path
                ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                if 'FOUND' in result.stdout or result.returncode == 1:
                    default_storage.delete(file_path)
                    return JsonResponse({
                        'success': False,
                        'paper_size_errors': [{
                            'file': uploaded_file.name,
                            'reason': 'File contains a virus and has been deleted.'
                        }],
                        'error': 'File contains a virus.'
                    })
            except Exception as scan_exc:
                default_storage.delete(file_path)
                return JsonResponse({
                    'success': False,
                    'error': f'Virus scan failed: {str(scan_exc)}'
                })

            return JsonResponse({
                'success': True,
                'file_path': file_path,
                'original_name': uploaded_file.name,
                'file_size': uploaded_file.size
            })

        except Exception as e:
            return JsonResponse({
                'success': False,
                'error': f'Upload failed: {str(e)}'
            })
```

## 3. Finalizing Uploads into `Document` Rows

After the raw files are uploaded, SafePrint finalizes them into live `Document` rows. This step generates the customer ID, validates password protection and supported paper size, and persists document metadata in the database.

Source: `main/views.py`

```python
@csrf_exempt
def finalize_uploads_view(request):
    if request.method == 'POST':
        if not request.session.get('upload_session_key'):
            request.session['upload_session_key'] = str(uuid.uuid4())
        session_key = request.session['upload_session_key']
        customer_id = 'CID-' + ''.join(random.choices(string.digits, k=4))
        request.session['customer_id'] = customer_id

        data = json.loads(request.body)
        files = data.get('files', [])
        original_names = data.get('original_names', {})
        docs_data = []
        file_errors = []
        allowed_paper_sizes = {'A4', 'Letter', 'Long'}

        for file_path in files:
            stored_name = os.path.basename(file_path)
            original_name = original_names.get(file_path, stored_name)

            if is_pdf_password_protected(file_path):
                file_errors.append({
                    'file': original_name,
                    'reason': 'Password protected or encrypted. Please remove protection.'
                })
                continue

            try:
                with default_storage.open(file_path, 'rb') as f:
                    reader = PyPDF2.PdfReader(f)
                    num_pages = len(reader.pages)
                    if num_pages > 0:
                        page = reader.pages[0]
                        width = float(page.mediabox.width)
                        height = float(page.mediabox.height)
                        orientation = 'Landscape' if width > height else 'Portrait'
                        paper_size = get_paper_size(width, height)
                        if paper_size not in allowed_paper_sizes:
                            file_errors.append({
                                'file': original_name,
                                'reason': 'Unsupported paper size. Only A4, Letter, or Long are allowed.'
                            })
                            continue
                    else:
                        file_errors.append({
                            'file': original_name,
                            'reason': 'Document contains no pages.'
                        })
                        continue
            except Exception as e:
                file_errors.append({
                    'file': original_name,
                    'reason': f'Error analyzing document: {str(e)}'
                })
                continue

            file_size = default_storage.size(file_path)

            while True:
                doc_id = 'DOC-' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
                if not Document.objects.filter(doc_id=doc_id).exists():
                    break

            doc = Document.objects.create(
                doc_id=doc_id,
                customer_id=customer_id,
                filename=original_name,
                num_copies=1,
                pages_num=str(num_pages),
                orientation=orientation,
                color_mode='Colored',
                paper_size=paper_size,
                paper_quality='70',
                original_name=original_name,
                stored_name=stored_name,
                file_name=original_name,
                file_type='pdf',
                file_size=file_size,
                doc_status='Pending',
                time_submitted=timezone.now(),
            )

            docs_data.append({
                'doc_id': doc_id,
                'filename': original_name,
                'num_pages': num_pages,
                'file_size': file_size,
                'orientation': orientation,
                'paper_size': paper_size,
                'stored_name': stored_name,
                'paper_quality': doc.paper_quality,
                'color_mode': doc.color_mode,
            })

        if file_errors:
            return JsonResponse({
                'success': False,
                'error': 'Some files have issues and cannot be processed.',
                'reason': file_errors
            })
        return JsonResponse({'success': True, 'documents': docs_data, 'customer_id': customer_id})
```

## 4. Updating Document Settings and Creating `Payment` Rows

Once the student edits copies, page range, grayscale, paper size, and paper quality, SafePrint recalculates the print cost. This is where PDF color analysis and pricing rules are applied, and where a `Payment` row is created or updated.

Source: `main/views.py`

```python
@csrf_exempt
def update_document_settings(request):
    if request.method == 'POST':
        if not request.session.get('upload_session_key'):
            request.session['upload_session_key'] = str(uuid.uuid4())
        session_key = request.session['upload_session_key']
        data = json.loads(request.body)
        updates = data.get('updates', [])

        for upd in updates:
            doc_id = upd.get('doc_id')
            if not doc_id:
                continue

            doc = Document.objects.get(doc_id=doc_id)
            if 'quantity' in upd:
                doc.num_copies = upd['quantity']
            if 'pages' in upd:
                doc.pages_num = upd['pages']
            if 'orientation' in upd:
                doc.orientation = upd['orientation'].capitalize()
            if 'grayscale' in upd:
                doc.color_mode = 'Black and White' if upd['grayscale'] == 'Black and white' else 'Color'
            if 'paper_size' in upd:
                doc.paper_size = upd['paper_size']
            if 'paper_quality' in upd:
                doc.paper_quality = upd['paper_quality']
            doc.save()

            file_rel_path = f'uploads/{session_key}/{doc.stored_name}'
            abs_path = default_storage.path(file_rel_path)
            page_range_str = upd.get('pages', None)
            site_settings = SiteSetting.load()
            full_color_threshold_percent = site_settings.color_full_threshold_percent

            if page_range_str and isinstance(page_range_str, str):
                with default_storage.open(file_rel_path, 'rb') as f:
                    total_pages = len(PyPDF2.PdfReader(f).pages)
                page_indices = parse_page_ranges(page_range_str, total_pages)
                color_results = analyze_pdf_colors(
                    abs_path,
                    page_indices=page_indices,
                    full_color_threshold_percent=full_color_threshold_percent,
                )
            else:
                color_results = analyze_pdf_colors(
                    abs_path,
                    full_color_threshold_percent=full_color_threshold_percent,
                )

            total_cost, costs_per_page = calculate_page_costs(
                color_results,
                paper_size=doc.paper_size,
                color_mode=doc.color_mode,
                num_copies=doc.num_copies,
                letter_bw_price=site_settings.letter_bw_price,
                letter_partial_price=site_settings.letter_partial_price,
                letter_full_price=site_settings.letter_full_price,
                a4_bw_price=site_settings.a4_bw_price,
                a4_partial_price=site_settings.a4_partial_price,
                a4_full_price=site_settings.a4_full_price,
                long_bw_price=site_settings.long_bw_price,
                long_partial_price=site_settings.long_partial_price,
                long_full_price=site_settings.long_full_price,
            )

            new_price = total_cost
            try:
                payment = Payment.objects.get(doc=doc)
                payment.price = new_price
                payment.pricing_threshold_snapshot = full_color_threshold_percent
                payment.save()
            except Payment.DoesNotExist:
                Payment.objects.create(
                    doc=doc,
                    price=new_price,
                    payment_status='Unpaid',
                    pricing_threshold_snapshot=full_color_threshold_percent,
                )
```

## 5. Core `Document` Model and Lifecycle Logging

The `Document` model is the central record for SafePrint. It stores file metadata, document status, queue priority, printer assignment, and page-level print progress. It also automatically writes a permanent lifecycle log whenever the document changes status or is deleted.

Source: `portal/models.py`

```python
class Document(models.Model):
    DOC_STATUS_CHOICES = [
        ('Pending', 'Pending'),
        ('Queued', 'Queued'),
        ('Printing', 'Printing'),
        ('Finished', 'Finished'),
        ('Cancelled', 'Cancelled'),
        ('Picked Up', 'Picked Up'),
    ]

    doc_id = models.CharField(max_length=255, primary_key=True)
    customer_id = models.CharField(max_length=255)
    filename = models.CharField(max_length=255)
    num_copies = models.IntegerField()
    pages_num = models.CharField(max_length=255)
    orientation = models.CharField(max_length=50, choices=ORIENTATION_CHOICES)
    color_mode = models.CharField(max_length=50, choices=COLOR_MODE_CHOICES)
    paper_size = models.CharField(max_length=50, choices=PAPER_SIZE_CHOICES)
    paper_quality = models.CharField(max_length=50, choices=GSM_CHOICES)
    original_name = models.CharField(max_length=255)
    stored_name = models.CharField(max_length=255)
    doc_status = models.CharField(max_length=50, choices=DOC_STATUS_CHOICES, default='Pending')
    queue_priority = models.PositiveSmallIntegerField(default=QueuePriority.NORMAL, db_index=True)
    queued_at = models.DateTimeField(null=True, blank=True, db_index=True)
    status_updated_at = models.DateTimeField(auto_now=True)
    time_submitted = models.DateTimeField()
    printer_assigned = models.ForeignKey(Printer, related_name='assigned_documents', null=True, blank=True, on_delete=models.SET_NULL)
    printed_at = models.ForeignKey(Printer, related_name='printed_documents', null=True, blank=True, on_delete=models.SET_NULL)
    pages_printed = models.JSONField(default=list, blank=True)
    page_copy_counts = models.JSONField(default=dict, blank=True)

    def save(self, *args, **kwargs):
        self._sync_print_progress_fields()
        old_status = None
        if self.pk and Document.objects.filter(pk=self.pk).exists():
            orig = Document.objects.get(pk=self.pk)
            old_status = orig.doc_status
            if orig.doc_status != self.doc_status:
                self.status_updated_at = timezone.now()
        super().save(*args, **kwargs)

        new_status = self.doc_status
        if old_status != new_status:
            event_map = {
                'Pending': 'pending',
                'Queued': 'queued',
                'Printing': 'printing',
                'Finished': 'finished',
                'Cancelled': 'cancelled',
                'Picked Up': 'picked_up',
                'Denied': 'denied',
            }
            event = event_map.get(new_status)
            if event:
                printer_name = ''
                if self.printer_assigned:
                    printer_name = self.printer_assigned.printer_name
                elif self.printed_at:
                    printer_name = self.printed_at.printer_name
                DocumentLifecycleLog.objects.create(
                    doc_id=self.doc_id,
                    customer_id=self.customer_id,
                    doc_name=self.original_name or self.filename or '',
                    event=event,
                    printer_name=printer_name,
                    details=f'{old_status or "New"} → {new_status}',
                )

    def delete(self, *args, **kwargs):
        DocumentLifecycleLog.objects.create(
            doc_id=self.doc_id,
            customer_id=self.customer_id,
            doc_name=self.original_name or self.filename or '',
            event='deleted',
            printer_name=(self.printer_assigned.printer_name if self.printer_assigned else self.printed_at.printer_name if self.printed_at else ''),
            details=f'Document deleted (was {self.doc_status})',
        )
        super().delete(*args, **kwargs)


class DocumentLifecycleLog(models.Model):
    EVENT_CHOICES = [
        ('uploaded', 'Uploaded'),
        ('pending', 'Pending'),
        ('queued', 'Queued'),
        ('printing', 'Printing'),
        ('finished', 'Finished'),
        ('cancelled', 'Cancelled'),
        ('picked_up', 'Picked Up'),
        ('deleted', 'Deleted'),
        ('denied', 'Denied'),
        ('reprinted', 'Reprinted'),
    ]

    doc_id = models.CharField(max_length=255, db_index=True)
    customer_id = models.CharField(max_length=255, db_index=True)
    doc_name = models.CharField(max_length=255, blank=True, default='')
    event = models.CharField(max_length=20, choices=EVENT_CHOICES)
    printer_name = models.CharField(max_length=100, blank=True, default='')
    details = models.TextField(blank=True, default='')
    timestamp = models.DateTimeField(auto_now_add=True)
```

## 6. Payment Layer: Local Payment Intents, Firebase, and GCash Capture

SafePrint now uses a local `PaymentIntent` plus a Firebase-backed listener flow for GCash validation.

### 6.1 Django Firebase Configuration

Source: `SafePrint/settings.py`

```python
FIREBASE_SERVICE_ACCOUNT_PATH = config(
    'FIREBASE_SERVICE_ACCOUNT_PATH',
    default=str(next((path for path in _firebase_service_account_candidates if path.exists()), _firebase_service_account_candidates[0]))
)
FIREBASE_GCASH_COLLECTION = config('FIREBASE_GCASH_COLLECTION', default='gcash_notifications')
```

### 6.2 Local Payment Attempt Model

Source: `portal/models.py`

```python
class PaymentIntent(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_MATCHED = 'matched'
    STATUS_CANCELLED = 'cancelled'
    STATUS_EXPIRED = 'expired'
    STATUS_FAILED = 'failed'

    intent_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    customer_id = models.CharField(max_length=255, db_index=True)
    doc_ids = models.JSONField(default=list, blank=True)
    payer_number = models.CharField(max_length=20, db_index=True)
    expected_amount = models.DecimalField(max_digits=10, decimal_places=2)
    voucher_credit_code = models.CharField(max_length=20, blank=True, default='')
    credit_applied = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    recipient_name = models.CharField(max_length=255, blank=True, default='')
    recipient_number = models.CharField(max_length=20, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    verification_source = models.CharField(max_length=50, blank=True, default='')
    matched_notification_id = models.CharField(max_length=255, blank=True, default='', db_index=True)
    matched_raw_text = models.TextField(blank=True, default='')
    matched_at = models.DateTimeField(null=True, blank=True)
    evidence_redacted_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(db_index=True)
```

### 6.3 Payment Endpoint and Queue Handoff

Source: `portal/views.py`

```python
def _queue_document_for_dispatch(document, *, priority, queued_at=None, clear_printer=True):
    queued_at = queued_at or timezone.now()
    document.doc_status = 'Queued'
    document.queue_priority = priority
    document.queued_at = queued_at
    document.status_updated_at = queued_at

    update_fields = ['doc_status', 'queue_priority', 'queued_at', 'status_updated_at']
    if clear_printer and document.printer_assigned_id is not None:
        document.printer_assigned = None
        update_fields.append('printer_assigned')

    document.save(update_fields=update_fields)
    return document


def _mark_customer_documents_paid(payments, *, approved_by, payment_method):
    approved_at = timezone.now()
    queued_any = False
    for payment_obj in payments:
        payment_obj.payment_status = 'Paid'
        payment_obj.payment_method = payment_method
        payment_obj.approved_at = approved_at
        payment_obj.approved_by = approved_by
        payment_obj.save(update_fields=['payment_status', 'payment_method', 'approved_at', 'approved_by'])

        document = payment_obj.doc
        _queue_document_for_dispatch(
            document,
            priority=Document.QueuePriority.NORMAL,
            queued_at=approved_at,
        )
        queued_any = True

    if queued_any:
        _schedule_queue_check(1.0)
```

### 6.4 Firestore Matching and One-Time Claiming

Source: `portal/services/firebase_payment.py`

```python
def list_matching_notifications(*, payer_number, expected_amount, earliest_at, latest_at, limit=None):
    normalized_number = normalize_phone_number(payer_number)
    if not normalized_number:
        return []

    _, project_id = _get_firestore_session()
    url = f'{_firestore_base_url(project_id)}:runQuery'
    response = _firestore_request(
        'POST',
        url,
        json={
            'structuredQuery': {
                'from': [{'collectionId': settings.FIREBASE_GCASH_COLLECTION}],
                'where': {
                    'fieldFilter': {
                        'field': {'fieldPath': 'number'},
                        'op': 'EQUAL',
                        'value': {'stringValue': normalized_number},
                    }
                },
            }
        },
    )
    response.raise_for_status()
    rows = response.json()

    matches = []
    for row in rows:
        document = row.get('document')
        if not document:
            continue
        parsed_document = _parse_firestore_document(document)
        payload = parsed_document['payload']
        captured_at = _coerce_timestamp(payload.get('capturedAt'))
        if captured_at is None:
            continue
        if captured_at < earliest_at or captured_at > latest_at:
            continue
        if payload.get('claimed_by_cid'):
            continue
        amount_value = parse_amount(payload.get('amount'))
        if amount_value != expected_amount:
            continue
        matches.append({
            'doc_id': parsed_document['doc_id'],
            'reference': parsed_document['reference'],
            'captured_at': captured_at,
            'payload': payload,
        })

    matches.sort(key=lambda item: item['captured_at'])
    return matches[:limit] if limit and limit > 0 else matches


def claim_notification(*, notification_ref, customer_id, intent_id):
    parsed_document = get_notification(notification_ref=notification_ref)
    if parsed_document is None:
        return None
    payload = parsed_document['payload']

    existing_claimed_by_cid = str(payload.get('claimed_by_cid') or '').strip()
    existing_claimed_by_intent_id = str(payload.get('claimed_by_intent_id') or '').strip()
    existing_claimed_at = payload.get('claimed_at')
    expected_intent_id = str(intent_id)

    if (
        existing_claimed_by_cid == customer_id
        and existing_claimed_by_intent_id == expected_intent_id
        and existing_claimed_at
    ):
        return payload

    if existing_claimed_by_cid and existing_claimed_by_cid != customer_id:
        return None
    if existing_claimed_by_intent_id and existing_claimed_by_intent_id != expected_intent_id:
        return None

    query_string = urlencode([
        ('currentDocument.updateTime', parsed_document['update_time']),
        ('updateMask.fieldPaths', 'claimed_by_cid'),
        ('updateMask.fieldPaths', 'claimed_by_intent_id'),
        ('updateMask.fieldPaths', 'claimed_at'),
    ])
    patch_response = _firestore_request(
        'PATCH',
        f'https://firestore.googleapis.com/v1/{notification_ref}?{query_string}',
        json={
            'fields': {
                'claimed_by_cid': _python_to_firestore_value(customer_id),
                'claimed_by_intent_id': _python_to_firestore_value(str(intent_id)),
                'claimed_at': _python_to_firestore_value(timezone.now()),
            }
        },
    )
    if patch_response.status_code in (409, 412):
        return None
    patch_response.raise_for_status()
    return payload
```

### 6.5 External Android Notification Listener App

This external mobile app captures GCash payment receipts from Android notifications and uploads them to the Firestore collection that the SafePrint server queries.

Source: external repository, `safeprint-notif-capture/android/app/src/main/kotlin/com/safeprint/app/NotificationCaptureService.kt`

```kotlin
override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (!isCaptureEnabled(this)) {
        return
    }

    val packageName = sbn.packageName ?: return
    val extras = sbn.notification.extras
    val title = extras?.getCharSequence("android.title")?.toString().orEmpty()
    val text = extras?.getCharSequence("android.text")?.toString().orEmpty()
    val bigText = extras?.getCharSequence("android.bigText")?.toString().orEmpty()
    val subText = extras?.getCharSequence("android.subText")?.toString().orEmpty()
    val tickerText = sbn.notification.tickerText?.toString().orEmpty()

    val mergedText = listOf(title, bigText, text, subText, tickerText)
        .map { it.trim() }
        .filter { it.isNotBlank() }
        .distinctBy { it.lowercase() }
        .joinToString(" | ")
        .trim()

    val rawText = mergedText
    if (rawText.isBlank()) {
        return
    }
    if (!isValidPaymentReceiptNotification(packageName, title, rawText)) {
        return
    }

    val parseResult = parseGcashText(rawText)
    parseResult.entries.forEachIndexed { index, parsed ->
        val payload = mapOf(
            "documentId" to buildDocumentId(packageName, sbn.postTime, index, rawText),
            "packageName" to packageName,
            "title" to title,
            "rawText" to rawText,
            "amount" to parsed.amount,
            "number" to parsed.number,
            "isParsed" to true,
            "isGcashSource" to true,
            "timestampEpochMs" to sbn.postTime + index,
            "parseCategory" to parseResult.category,
            "parseHint" to parseResult.hint
        )
        persistAndPublish(payload)
    }
}
```

## 7. Admin Approval and Queue Monitoring

Once a payment is valid, documents move from `Pending` to `Queued`. These approval endpoints are the server-side control points that move documents into the dispatch queue.

Source: `portal/views.py`

```python
def approve_all_documents(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        customer_id = data.get('customer_id', '').strip()
        if not customer_id.upper().startswith('CID-'):
            customer_id = f'CID-{customer_id}'
        qs = Document.objects.filter(customer_id__iexact=customer_id, doc_status='Pending')
        docs = list(qs)
        if not docs:
            return JsonResponse({'success': False, 'error': 'No pending documents found for this customer'})

        now = timezone.now()
        for doc in docs:
            _queue_document_for_dispatch(
                doc,
                priority=Document.QueuePriority.NORMAL,
                queued_at=now,
            )

        if admin_user:
            for doc in docs:
                try:
                    payment = Payment.objects.get(doc_id=doc.doc_id)
                    payment.approved_by = admin_user.name
                    payment.approved_at = now
                    payment.payment_status = 'Paid'
                    payment.save()
                except Payment.DoesNotExist:
                    pass

        _schedule_queue_check(1.0)
```

## 8. Printer Assignment, Printing, Completion, and Rerouting

This is the core server-side print execution path.

### 8.1 Assigning a Queued Document to a Printer

Source: `portal/views.py`

```python
def assign_document_to_printer(document, *, wait_for_availability=True):
    import time as _time
    TIMEOUT_SECONDS = 1800
    start_time = _time.monotonic()
    while True:
        cancel_reason = None
        wait_message = None

        with transaction.atomic():
            try:
                doc = Document.objects.select_for_update().get(doc_id=document.doc_id)
            except Document.DoesNotExist:
                return None
            if doc.doc_status != 'Queued':
                return None

            elapsed = _time.monotonic() - start_time
            if elapsed >= TIMEOUT_SECONDS:
                cancel_reason = (
                    f'No eligible printer became available within {elapsed:.0f} seconds '
                    f'for {doc.paper_size} paper.'
                )
            else:
                available = _available_printers_for_document(
                    doc,
                    allowed_statuses=['Ready', 'Sleep'],
                    exclude_printer_ids=_failed_printer_ids_for_document(doc),
                    lock_rows=True,
                    sync_scheduler_state=True,
                )
                if available:
                    printer = available[0]
                    assigned_at = timezone.now()
                    doc.printer_assigned = printer
                    doc.doc_status = 'Printing'
                    doc.save(update_fields=['printer_assigned', 'doc_status', 'status_updated_at'])
                    _sync_printer_scheduler_state(printer, assigned_at=assigned_at)
                    RerouteHistory.objects.create(document=doc, printer=printer, status='Assigned')
                    return printer

                terminal_reason = _terminal_no_printer_reason(doc, exclude_printer_ids=_failed_printer_ids_for_document(doc))
                if terminal_reason:
                    cancel_reason = terminal_reason
                elif not wait_for_availability:
                    return None
                else:
                    wait_message = (
                        f"No available printer for {doc.paper_size}. "
                        f"Document {doc.doc_id} paused and will retry in 5 seconds."
                    )

        if cancel_reason:
            _cancel_document_with_auto_voucher(document, reason=cancel_reason)
            return None
        _time.sleep(5)
```

### 8.2 Sending a Page to CUPS and Monitoring Completion

Source: `portal/views.py`

```python
def print_page(document, page_num, *, copy_index=1, total_copies=1):
    print(
        f"[PRINT] Sending page {page_num} copy {copy_index}/{total_copies} of document "
        f"{document.doc_id} to printer {printer.printer_name} ({printer.printer_status})"
    )

    lp_cmd = [
        'lp',
        '-d', queue_name,
        '-n', '1',
        '-o', f'page-ranges={page_num}',
        '-o', f'orientation-requested={"4" if orientation=="Landscape" else "3"}',
        '-o', f'{"print-color-mode=monochrome" if color_mode=="Black and White" else "print-color-mode=color"}',
        '-o', f'media={media_size}',
        file_path
    ]
    try:
        lp_result = subprocess.run(lp_cmd, check=True, capture_output=True, text=True)
        lp_output = (lp_result.stdout or '') + (lp_result.stderr or '')
        job_id = _parse_cups_job_id(lp_output)
    except Exception as e:
        printer.printer_status = 'Error'
        printer.save()
        reroute_document_on_error(document, failed_printer=printer)
        return

    while True:
        printer.refresh_from_db()
        cups_job_state = _get_cups_job_state(job_id)

        try:
            doc_check = Document.objects.get(doc_id=document.doc_id)
            if _finish_document_if_complete(doc_check, printer=printer):
                return
            if doc_check.doc_status not in ['Queued', 'Printing']:
                return
        except Document.DoesNotExist:
            return

        if cups_job_state == 'completed':
            break

        time.sleep(1)

    side_recorded = document.mark_print_job_completed(page_num, copy_index)
    if side_recorded:
        RerouteHistory.objects.create(
            document=document,
            printer=printer,
            status=_build_print_confirmation_status(page_num, copy_index, total_copies)
        )

    _finish_document_if_complete(document, printer=printer)
```

### 8.3 Finalizing a Completed Print Job

Source: `portal/views.py`

```python
def _finish_document_if_complete(document, *, printer=None):
    document.refresh_from_db()
    if document.doc_status in ['Finished', 'Picked Up', 'Cancelled']:
        return False

    if document.get_remaining_print_jobs():
        return False

    completion_printer = printer or document.printed_at or document.printer_assigned
    update_fields = ['doc_status', 'status_updated_at']

    document.doc_status = 'Finished'
    document.status_updated_at = timezone.now()
    if completion_printer and document.printed_at_id != completion_printer.id:
        document.printed_at = completion_printer
        update_fields.append('printed_at')

    document.save(update_fields=update_fields)
    print(f"[COMPLETE] Document {document.doc_id} printing complete. Printed at: {document.printed_at}")
    return True
```

### 8.4 Rerouting on Printer Error

Source: `portal/views.py`

```python
def reroute_document_on_error(document, failed_printer=None, failed_job_id=None, failure_status=None):
    document.refresh_from_db()
    if document.doc_status in ('Finished', 'Picked Up', 'Cancelled'):
        if failed_job_id:
            _cancel_cups_job(failed_job_id)
        return

    remaining_pages = document.get_remaining_pages()
    if not remaining_pages:
        if failed_job_id:
            _cancel_cups_job(failed_job_id)
        _finish_document_if_complete(document, printer=failed_printer or document.printer_assigned)
        return

    _queue_document_for_dispatch(
        document,
        priority=Document.QueuePriority.REROUTE,
        queued_at=timezone.now(),
    )

    replacement_candidates = _available_printers_for_document(
        document,
        allowed_statuses=['Ready', 'Printing', 'Sleep'],
        exclude_printer_ids=_failed_printer_ids_for_document(document),
        sync_scheduler_state=True,
        require_idle=False,
    )
    if not replacement_candidates:
        _schedule_queue_check(1.0)
        return

    next_printer = assign_document_to_printer(document, wait_for_availability=False)
    if next_printer:
        for page_num, copy_index, total_copies in _iter_document_print_jobs(document):
            document.refresh_from_db()
            if document.doc_status in ('Finished', 'Picked Up', 'Cancelled'):
                break
            if document.is_print_job_completed(page_num, copy_index):
                continue
            print_page(document, page_num, copy_index=copy_index, total_copies=total_copies)
```

## 9. Confirmation and Customer Status View

Once a customer's documents have been uploaded and paid, the confirmation page becomes the main student-facing status endpoint. It loads all documents for the customer and shows their current status and printer assignment.

Source: `main/views.py`

```python
def confirmation(request, customer_id):
    session_customer_id = request.session.get('customer_id')
    if not session_customer_id or session_customer_id != customer_id:
        return render(request, '404.html', status=404)

    documents = Document.objects.filter(
        customer_id=customer_id
    ).select_related('printer_assigned', 'printed_at').order_by('time_submitted')

    if not documents.exists():
        return redirect('home')

    payments = Payment.objects.filter(doc__customer_id=customer_id)
    total_price = sum(p.price for p in payments)

    docs_list = []
    for doc in documents:
        docs_list.append({
            'doc_id': doc.doc_id,
            'filename': doc.filename,
            'doc_status': doc.doc_status,
            'printer_name': doc.printer_assigned.printer_name if doc.printer_assigned else None,
        })

    context = {
        'customer_id': customer_id,
        'documents': docs_list,
        'total_price': total_price,
        'stars': range(4),
        'credit_info': credit_info,
    }
    return render(request, 'confirmation.html', context)
```

## 10. Manual Deletion and Cleanup Paths

SafePrint has multiple cleanup layers: direct file deletion for temporary uploads, document deletion, automatic stale-document cleanup, and orphan-folder cleanup.

### 10.1 Deleting Temporary Uploads

Source: `main/views.py`

```python
@csrf_exempt
def delete_file_view(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        file_path = data.get('file_path')
        if default_storage.exists(file_path):
            default_storage.delete(file_path)
            subprocess.Popen(['python3', '/home/safeprint/dev/SafePrint/scripts/clean_empty_upload_folders.py'])
            return JsonResponse({
                'success': True,
                'message': 'File deleted successfully'
            })
```

### 10.2 Deleting Documents and Their Stored Files

Source: `main/views.py`

```python
@csrf_exempt
def delete_document(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        doc_id = data.get('doc_id')
        session_key = data.get('session_key')
        doc = Document.objects.get(doc_id=doc_id)
        if hasattr(doc, 'stored_name') and doc.stored_name:
            file_path = f'uploads/{session_key}/{doc.stored_name}'
            if default_storage.exists(file_path):
                default_storage.delete(file_path)
                subprocess.Popen(['python3', '/home/safeprint/dev/SafePrint/scripts/clean_empty_upload_folders.py'])
        doc.delete()
        return JsonResponse({'success': True})
```

### 10.3 Preserve Paid Sales, Delete Unpaid Payments

This helper is important because deletion does not always mean the payment record should disappear. Paid sales are preserved as audit history; unpaid rows are removed.

Source: `portal/views.py`

```python
def _preserve_or_delete_document_payment(doc):
    payments = list(
        Payment.objects.filter(
            Q(doc=doc) | Q(doc_id_snapshot=doc.doc_id)
        )
    )

    for payment in payments:
        payment.capture_document_snapshot()
        if str(payment.payment_status or '').lower() == 'paid':
            payment.doc = None
            payment.save()
            continue
        payment.delete()
```

### 10.4 Automatic Cleanup of Stale Documents

Source: `portal/management/commands/delete_stale_docs.py`

```python
class Command(BaseCommand):
    help = 'Delete documents not updated in 1 hour and remove their files.'

    def handle(self, *args, **kwargs):
        cutoff = timezone.now() - timedelta(hours=1)
        stale_docs = Document.objects.filter(status_updated_at__lt=cutoff)
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../'))
        uploads_dir = os.path.join(project_root, 'media', 'uploads')
        for doc in stale_docs:
            found_file = None
            for root, dirs, files in os.walk(uploads_dir):
                if doc.stored_name in files:
                    found_file = os.path.join(root, doc.stored_name)
                    break
            if found_file and os.path.isfile(found_file):
                os.remove(found_file)
            doc.delete()

            script_path = os.path.join(project_root, 'scripts', 'clean_empty_upload_folders.py')
            subprocess.run(['python3', script_path], check=True)
```

### 10.5 Deleting Orphan Files and Empty Upload Folders

Source: `scripts/clean_empty_upload_folders.py`

```python
def get_valid_stored_names():
    from portal.models import Document
    names = set(
        n for n in Document.objects.values_list('stored_name', flat=True)
        if n
    )
    return names


def delete_orphan_files(valid_names):
    deleted = 0
    for entry in os.listdir(UPLOADS_DIR):
        dir_path = os.path.join(UPLOADS_DIR, entry)
        if not os.path.isdir(dir_path):
            continue
        for fname in os.listdir(dir_path):
            file_path = os.path.join(dir_path, fname)
            if not os.path.isfile(file_path):
                continue
            mtime = os.path.getmtime(file_path)
            if (time.time() - mtime) < GRACE_SECONDS:
                continue
            if fname not in valid_names:
                os.remove(file_path)
                deleted += 1
    return deleted


def delete_empty_upload_folders():
    removed = 0
    for d in os.listdir(UPLOADS_DIR):
        dir_path = os.path.join(UPLOADS_DIR, d)
        if os.path.isdir(dir_path) and not os.listdir(dir_path):
            os.rmdir(dir_path)
            removed += 1
    return removed
```

## 11. Concise Lifecycle Summary

The end-to-end server-side lifecycle reflected by the code is:

1. `upload_view` creates a session folder context.
2. `upload_file_view` stores PDFs and rejects bad or infected files.
3. `finalize_uploads_view` turns uploaded files into `Document` rows.
4. `update_document_settings` calculates pricing and creates `Payment` rows.
5. `payment` plus `PaymentIntent` and Firebase matching verifies the payment.
6. `_mark_customer_documents_paid` and approval endpoints queue documents.
7. `assign_document_to_printer` chooses an eligible printer.
8. `print_page` submits CUPS jobs and tracks each printed page.
9. `_finish_document_if_complete` marks the document as `Finished`.
10. `Document.save` and `Document.delete` record lifecycle history in `DocumentLifecycleLog`.
11. `delete_document`, `delete_stale_docs`, and `clean_empty_upload_folders.py` remove files and stale records while preserving audit history when appropriate.

This file is the broad manuscript version. The narrower payment-specific reference remains in `docs/GCASH_RELEVANT_SOURCE_CODE.md`.
