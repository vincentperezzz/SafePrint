import uuid

from django.db import models
import os

def user_profile_image_path(instance, filename):
    ext = filename.split('.')[-1]
    # Use the username as the filename
    filename = f"{instance.username}.{ext}"
    return os.path.join('', filename)

class AdminUser(models.Model):
    name = models.CharField(max_length=255)  # Added name field
    username = models.CharField(max_length=255)
    password = models.CharField(max_length=255)
    role = models.CharField(max_length=50)
    email = models.EmailField(max_length=255, null=True, blank=True)
    profile_image = models.ImageField(upload_to='profile_images/', null=True, blank=True)
    notification_sound = models.ForeignKey('NotificationSound', null=True, blank=True, on_delete=models.SET_NULL)
    sound_enabled = models.BooleanField(default=True)

    def __str__(self):
        return self.username

    class Meta:
        db_table = 'admin_users'

    def save(self, *args, **kwargs):
        # On create, if no sound selected, default to 'chime' when available
        if not self.pk and not self.notification_sound_id:
            try:
                from django.apps import apps
                NotificationSound = apps.get_model('portal', 'NotificationSound')
                chime = NotificationSound.objects.filter(slug='chime', is_active=True).first()
                if chime:
                    self.notification_sound = chime
            except Exception:
                # If sounds not migrated yet or any error, skip defaulting
                pass
        super().save(*args, **kwargs)


class NotificationSound(models.Model):
    slug = models.SlugField(max_length=64, unique=True)
    display_name = models.CharField(max_length=100)
    file_path = models.CharField(max_length=255)  # example: /static/sounds/chime.mp3
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'notification_sounds'
        ordering = ['display_name']

    def __str__(self):
        return self.display_name


class SiteSetting(models.Model):
    customer_completion_sound = models.ForeignKey(
        NotificationSound, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='+'
    )
    customer_reroute_sound = models.ForeignKey(
        NotificationSound, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='+'
    )
    verification_time_window = models.IntegerField(
        default=10,
        help_text='Time window (minutes) around ticket creation for printer status verification'
    )
    auto_ticket_timeout_minutes = models.IntegerField(
        default=5,
        help_text='Minutes a document stays Queued with empty queue before auto-triggering ticket popup'
    )
    gcash_recipient_name = models.CharField(max_length=255, blank=True, default='')
    gcash_recipient_number = models.CharField(max_length=20, blank=True, default='')
    gcash_qr_image = models.ImageField(upload_to='payment_qr/', null=True, blank=True)
    payment_expiry_minutes = models.IntegerField(
        default=10,
        help_text='Minutes before a pending payment intent expires'
    )
    block_payment_when_printers_unavailable = models.BooleanField(
        default=True,
        help_text='When enabled, payment is blocked if no matching printer is currently available'
    )

    class Meta:
        db_table = 'site_settings'

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return 'Site Settings'


class Printer(models.Model):
    PAPER_SIZE_CHOICES = [
        ('', 'None'),
        ('Long', 'Long'),
        ('Letter', 'Letter'), 
        ('A4', 'A4'),
        ('Unsupported', 'Unsupported'),
    ]

    GSM_CHOICES = [
        ('', 'None'),
        ('70', '70 GSM'),
        ('80', '80 GSM'),
    ]

    ORIENTATION_CHOICES = [
        ('Portrait', 'Portrait'),
        ('Landscape', 'Landscape'),
    ]

    COLOR_MODE_CHOICES = [
        ('Black and White', 'Black and White'),
        ('Color', 'Color'),
    ]
    
    id = models.AutoField(primary_key=True)
    printer_name = models.CharField(max_length=255)
    model_name = models.CharField(max_length=255, null=True, blank=True)
    printer_status = models.CharField(max_length=50, default='Offline')
    ink_status = models.CharField(max_length=50, null=True, blank=True)
    paper_assigned = models.CharField(max_length=50, choices=PAPER_SIZE_CHOICES, blank=True, default='')
    paper_quality = models.CharField(max_length=50, choices=GSM_CHOICES, blank=True, default='')
    last_checked = models.DateTimeField()
    ip_address = models.CharField(max_length=255)
    node_name = models.CharField(max_length=255, null=True, blank=True)
    tray_capacity = models.IntegerField(null=True, blank=True)
    tray_current_count = models.IntegerField(null=True, blank=True)
    tray_level = models.CharField(max_length=20, default='Needs Refill')  # Full, Low, Needs Refill
    last_refill_time = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.printer_name
    
    class Meta:
        db_table = 'printers'

class Document(models.Model):
    # Import choices from Printer model to ensure consistency
    PAPER_SIZE_CHOICES = Printer.PAPER_SIZE_CHOICES
    GSM_CHOICES = Printer.GSM_CHOICES
    ORIENTATION_CHOICES = Printer.ORIENTATION_CHOICES
    COLOR_MODE_CHOICES = Printer.COLOR_MODE_CHOICES

    # Document status choices
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
    file_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=50)
    file_size = models.IntegerField()
    doc_status = models.CharField(max_length=50, choices=DOC_STATUS_CHOICES, default='Pending')
    status_updated_at = models.DateTimeField(auto_now=True)  # Track last status change
    time_submitted = models.DateTimeField()
    printer_assigned = models.ForeignKey(
        Printer,
        related_name='assigned_documents',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        db_column='printer_assigned_id'
    )
    printed_at = models.ForeignKey(
        Printer,
        related_name='printed_documents',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        db_column='printed_at'
    )
    # Track which pages have been printed (list of ints)
    pages_printed = models.JSONField(default=list, blank=True)

    def get_total_pages(self):
        """
        Calculate total number of pages from page range string
        Examples: "1-5" = 5 pages, "1,3,5-7" = 5 pages, "1,2,3" = 3 pages
        """
        if not self.pages_num:
            return 0
        
        total_pages = 0
        page_parts = self.pages_num.split(',')
        
        for part in page_parts:
            part = part.strip()
            if '-' in part:
                # Handle range like "1-5"
                start, end = map(int, part.split('-'))
                total_pages += (end - start + 1)
            else:
                # Handle single page like "3"
                total_pages += 1
        
        return total_pages

    def mark_page_printed(self, page_num):
        """
        Mark a page as printed (add to pages_printed if not already present)
        """
        if page_num not in self.pages_printed:
            self.pages_printed.append(page_num)
            self.save(update_fields=['pages_printed'])

    def get_remaining_pages(self):
        """
        Return a sorted list of pages that still need to be printed
        """
        all_pages = set(self.get_page_list())
        printed = set(self.pages_printed)
        return sorted(list(all_pages - printed))

    def get_page_list(self):
        """
        Convert page range string to list of page numbers
        Examples: "1-5" = [1,2,3,4,5], "1,3,5-7" = [1,3,5,6,7]
        """
        if not self.pages_num:
            return []
        
        pages = []
        page_parts = self.pages_num.split(',')
        
        for part in page_parts:
            part = part.strip()
            if '-' in part:
                # Handle range like "1-5"
                start, end = map(int, part.split('-'))
                pages.extend(range(start, end + 1))
            else:
                # Handle single page like "3"
                pages.append(int(part))
        
        return sorted(list(set(pages)))  # Remove duplicates and sort

    def save(self, *args, **kwargs):
        old_status = None
        if self.pk and Document.objects.filter(pk=self.pk).exists():
            orig = Document.objects.get(pk=self.pk)
            old_status = orig.doc_status
            if orig.doc_status != self.doc_status:
                from django.utils import timezone
                self.status_updated_at = timezone.now()
        super().save(*args, **kwargs)

        # Log lifecycle event on status change
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
                    printer_name = self.printer_assigned.name
                elif self.printed_at:
                    printer_name = self.printed_at.name
                DocumentLifecycleLog.objects.create(
                    doc_id=self.doc_id,
                    customer_id=self.customer_id,
                    doc_name=self.original_name or self.filename or '',
                    event=event,
                    printer_name=printer_name,
                    details=f'{old_status or "New"} → {new_status}',
                )

    def delete(self, *args, **kwargs):
        # Log deletion before removing the record
        DocumentLifecycleLog.objects.create(
            doc_id=self.doc_id,
            customer_id=self.customer_id,
            doc_name=self.original_name or self.filename or '',
            event='deleted',
            printer_name=(self.printer_assigned.name if self.printer_assigned else
                          self.printed_at.name if self.printed_at else ''),
            details=f'Document deleted (was {self.doc_status})',
        )
        super().delete(*args, **kwargs)

    def __str__(self):
        return f"{self.doc_id} - {self.filename}"
    
    class Meta:
        db_table = 'documents'

class RerouteHistory(models.Model):
    document = models.ForeignKey(Document, on_delete=models.SET_NULL, null=True, blank=True, related_name='reroute_history')
    printer = models.ForeignKey(Printer, to_field='id', on_delete=models.SET_NULL, null=True)
    doc_id_snapshot = models.CharField(max_length=255, blank=True, default='', db_index=True)
    customer_id_snapshot = models.CharField(max_length=255, blank=True, default='')
    doc_name_snapshot = models.CharField(max_length=255, blank=True, default='')
    printer_name_snapshot = models.CharField(max_length=100, blank=True, default='')
    status = models.CharField(max_length=50)
    timestamp = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if self.document:
            self.doc_id_snapshot = self.doc_id_snapshot or self.document.doc_id
            self.customer_id_snapshot = self.customer_id_snapshot or self.document.customer_id
            self.doc_name_snapshot = self.doc_name_snapshot or self.document.original_name or self.document.filename or ''
        if self.printer:
            self.printer_name_snapshot = self.printer_name_snapshot or self.printer.name
        super().save(*args, **kwargs)

    class Meta:
        db_table = 'reroute_history'
        ordering = ['timestamp']
        verbose_name = "Reroute history"
        verbose_name_plural = "Reroute history"

    def __str__(self):
        doc_id = self.document.doc_id if self.document else self.doc_id_snapshot or 'Unknown'
        printer = self.printer or self.printer_name_snapshot or 'Unknown'
        return f"{doc_id} - {printer} ({self.status} at {self.timestamp})"

class Payment(models.Model):
    doc = models.ForeignKey(Document, to_field='doc_id', on_delete=models.SET_NULL, null=True, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    payment_status = models.CharField(max_length=50)
    voucher_code = models.CharField(max_length=50, null=True, blank=True, unique=True)
    payment_method = models.CharField(max_length=50, null=True, blank=True)  # 'klcis', 'gcash', etc.
    phone_number = models.CharField(max_length=20, null=True, blank=True)  # Student phone for GCash verification
    klcis_transaction_id = models.CharField(max_length=64, null=True, blank=True, unique=True)  # KLCiS Transaction ID for dedup
    approved_by = models.CharField(max_length=255, null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    customer_id_snapshot = models.CharField(max_length=255, blank=True, default='', db_index=True)
    doc_id_snapshot = models.CharField(max_length=255, blank=True, default='', db_index=True)
    document_name_snapshot = models.CharField(max_length=255, blank=True, default='')
    num_copies_snapshot = models.IntegerField(null=True, blank=True)
    pages_num_snapshot = models.CharField(max_length=255, blank=True, default='')
    total_pages_snapshot = models.IntegerField(null=True, blank=True)
    orientation_snapshot = models.CharField(max_length=50, blank=True, default='')
    color_mode_snapshot = models.CharField(max_length=50, blank=True, default='')
    paper_size_snapshot = models.CharField(max_length=50, blank=True, default='')
    paper_quality_snapshot = models.CharField(max_length=50, blank=True, default='')

    def capture_document_snapshot(self):
        updated_fields = set()

        if not self.doc:
            return updated_fields

        if not self.customer_id_snapshot:
            self.customer_id_snapshot = self.doc.customer_id
            updated_fields.add('customer_id_snapshot')
        if not self.doc_id_snapshot:
            self.doc_id_snapshot = self.doc.doc_id
            updated_fields.add('doc_id_snapshot')
        if not self.document_name_snapshot:
            self.document_name_snapshot = self.doc.original_name or self.doc.filename or ''
            updated_fields.add('document_name_snapshot')
        if self.num_copies_snapshot is None:
            self.num_copies_snapshot = self.doc.num_copies
            updated_fields.add('num_copies_snapshot')
        if not self.pages_num_snapshot:
            self.pages_num_snapshot = self.doc.pages_num or ''
            updated_fields.add('pages_num_snapshot')
        if self.total_pages_snapshot is None:
            self.total_pages_snapshot = self.doc.get_total_pages()
            updated_fields.add('total_pages_snapshot')
        if not self.orientation_snapshot:
            self.orientation_snapshot = self.doc.orientation or ''
            updated_fields.add('orientation_snapshot')
        if not self.color_mode_snapshot:
            self.color_mode_snapshot = self.doc.color_mode or ''
            updated_fields.add('color_mode_snapshot')
        if not self.paper_size_snapshot:
            self.paper_size_snapshot = self.doc.paper_size or ''
            updated_fields.add('paper_size_snapshot')
        if not self.paper_quality_snapshot:
            self.paper_quality_snapshot = self.doc.paper_quality or ''
            updated_fields.add('paper_quality_snapshot')

        return updated_fields

    @property
    def audit_customer_id(self):
        return self.doc.customer_id if self.doc else self.customer_id_snapshot

    @property
    def audit_doc_id(self):
        return self.doc.doc_id if self.doc else self.doc_id_snapshot

    @property
    def audit_document_name(self):
        if self.doc:
            return self.doc.original_name or self.doc.filename
        return self.document_name_snapshot

    def save(self, *args, **kwargs):
        snapshot_fields = self.capture_document_snapshot()
        update_fields = kwargs.get('update_fields')
        if update_fields is not None and snapshot_fields:
            kwargs['update_fields'] = set(update_fields) | snapshot_fields
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.doc} - {self.price} ({self.payment_status})"
    
    class Meta:
        db_table = 'payments'


class PaymentIntent(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_MATCHED = 'matched'
    STATUS_CANCELLED = 'cancelled'
    STATUS_EXPIRED = 'expired'
    STATUS_FAILED = 'failed'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_MATCHED, 'Matched'),
        (STATUS_CANCELLED, 'Cancelled'),
        (STATUS_EXPIRED, 'Expired'),
        (STATUS_FAILED, 'Failed'),
    ]

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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'payment_intents'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.customer_id} - {self.expected_amount} ({self.status})'

    @property
    def is_expired(self):
        from django.utils import timezone
        return timezone.now() > self.expires_at


class UsedKLCiSTransaction(models.Model):
    """
    Persistent record of KLCiS Transaction IDs that have been matched
    to payments. Survives payment/document deletion (pickup) so old
    transactions are never re-matched to new payments.
    """
    transaction_id = models.CharField(max_length=64, unique=True)
    phone_number = models.CharField(max_length=20, blank=True, default='')
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    used_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.transaction_id} (₱{self.amount})"

    class Meta:
        db_table = 'used_klcis_transactions'
        verbose_name = 'Used KLCiS Transaction'
        verbose_name_plural = 'Used KLCiS Transactions'


class VoucherCredit(models.Model):
    """
    Stores redeemable credit vouchers for students.
    
    Created when:
    - A print job costs less than the ₱5 Xendit minimum and the student is 
      charged ₱5, with the excess saved as credit.
    - A voucher is applied to a job and the ₱5 minimum kicks in on the 
      remaining balance, creating new excess credit on the same code.
    
    Transferable: anyone with the code can use it (no phone/account lock).
    One voucher per transaction (no stacking).
    Expires after 120 days.
    """
    code = models.CharField(max_length=20, unique=True, db_index=True)
    original_amount = models.DecimalField(max_digits=10, decimal_places=2,
                                          help_text='Initial credit when created')
    remaining_balance = models.DecimalField(max_digits=10, decimal_places=2,
                                            help_text='Current available balance')
    is_active = models.BooleanField(default=True,
                                    help_text='False when fully used or expired')
    last_customer_id = models.CharField(max_length=255, null=True, blank=True, db_index=True,
                                        help_text='CID of the last transaction that created/updated this credit')
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(help_text='120 days from creation')
    last_used_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        status = 'Active' if self.is_active else 'Inactive'
        return f"{self.code} — ₱{self.remaining_balance} ({status})"

    @property
    def is_expired(self):
        from django.utils import timezone
        return timezone.now() > self.expires_at

    @property
    def is_usable(self):
        """Check if voucher can be used (active, not expired, has balance)."""
        return (
            self.is_active
            and not self.is_expired
            and self.remaining_balance > 0
        )

    class Meta:
        db_table = 'voucher_credits'
        verbose_name = 'Voucher Credit'
        verbose_name_plural = 'Voucher Credits'
        ordering = ['-created_at']


class Feedback(models.Model):
    CATEGORY_CHOICES = [
        ('Comment', 'Comment'),
        ('Report a Problem', 'Report a Problem'),
    ]
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    name = models.CharField(max_length=100, blank=True, default="Anonymous")
    message = models.TextField()
    submitted_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.name:
            self.name = "Anonymous"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.category} by {self.name}"
    
    class Meta:
        db_table = 'feedback'


def receipt_upload_path(instance, filename):
    """Name the receipt screenshot after the ticket number."""
    import os
    ext = os.path.splitext(filename)[1]
    if instance.ticket_number:
        clean_ticket = instance.ticket_number.replace('#', '')
        return f"receipt_screenshots/{clean_ticket}{ext}"
    return f"receipt_screenshots/{filename}"


class SupportTicket(models.Model):
    """
    Support ticket for print error reports and customer issues.
    """
    PROBLEM_TYPE_CHOICES = [
        ('quality', 'Low Quality / Damage'),
        ('missing-pages', 'Some Pages Missing / Blank'),
        ('no-print', 'Whole Document Did Not Print'),
        ('other', 'Other'),
    ]
    
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('in-progress', 'In Progress'),
        ('resolved', 'Resolved'),
        ('closed', 'Closed'),
        ('voided', 'Voided'),
        ('refunded', 'Refunded'),
    ]
    
    ticket_number = models.CharField(max_length=20, unique=True, db_index=True)
    customer_id = models.CharField(max_length=255)
    document = models.ForeignKey(
        Document,
        to_field='doc_id',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='support_tickets'
    )
    document_id_snapshot = models.CharField(max_length=255, blank=True, default='', db_index=True)
    document_name = models.CharField(max_length=255)
    
    # Customer contact info
    customer_name = models.CharField(max_length=255)
    email = models.EmailField()
    phone_number = models.CharField(max_length=20, blank=True, default="")
    
    # Issue details
    problem_type = models.CharField(max_length=50, choices=PROBLEM_TYPE_CHOICES)
    description = models.TextField()
    page_range = models.CharField(max_length=20, blank=True, default="all")
    specific_pages = models.CharField(max_length=100, blank=True, default="")
    
    # Reprint tracking
    was_reprinted = models.BooleanField(default=False)
    
    # Payment receipt proof
    receipt_code = models.CharField(max_length=100, blank=True, default="")
    receipt_screenshot = models.ImageField(upload_to=receipt_upload_path, null=True, blank=True)
    
    # Refund info
    gcash_number = models.CharField(max_length=20, blank=True, default="")
    refund_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    REFUND_STATUS_CHOICES = [
        ('none', 'None'),
        ('pending', 'Pending'),
        ('completed', 'Completed'),
        ('rejected', 'Rejected'),
    ]
    refund_status = models.CharField(max_length=20, choices=REFUND_STATUS_CHOICES, default='none')
    refund_completed_at = models.DateTimeField(null=True, blank=True)
    refund_reference = models.CharField(max_length=100, blank=True, default="")
    payment_amount_snapshot = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    payment_method_snapshot = models.CharField(max_length=50, blank=True, default='')
    payment_verified_by_snapshot = models.CharField(max_length=255, blank=True, default='')
    payment_approved_at_snapshot = models.DateTimeField(null=True, blank=True)
    
    # Status tracking
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='open')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.CharField(max_length=255, blank=True, default="")
    
    # Notes for admin
    admin_notes = models.TextField(blank=True, default="")
    
    # Privacy: 30-day data retention after resolution
    data_retention_expires = models.DateTimeField(null=True, blank=True)
    data_purged = models.BooleanField(default=False)

    # Batch ticket: JSON list of all doc IDs when multiple docs share the same issue
    related_doc_ids = models.TextField(blank=True, default="")
    
    def save(self, *args, **kwargs):
        if not self.ticket_number:
            # Generate ticket number
            import random
            import string
            from django.utils import timezone
            date_prefix = timezone.now().strftime('%y%m%d')
            random_suffix = ''.join(random.choices(string.digits, k=4))
            self.ticket_number = f"#TKT-{date_prefix}-{random_suffix}"

        if self.document:
            self.document_id_snapshot = self.document_id_snapshot or self.document.doc_id
            self.document_name = self.document_name or self.document.original_name or self.document.filename

        if not self.document_id_snapshot and self.document_id:
            self.document_id_snapshot = self.document_id

        payment = None
        if self.document and (
            self.payment_amount_snapshot is None
            or not self.payment_method_snapshot
            or not self.payment_verified_by_snapshot
            or self.payment_approved_at_snapshot is None
        ):
            payment = Payment.objects.filter(doc=self.document).order_by('-approved_at', '-id').first()

        if payment is None and self.document_id_snapshot and (
            self.payment_amount_snapshot is None
            or not self.payment_method_snapshot
            or not self.payment_verified_by_snapshot
            or self.payment_approved_at_snapshot is None
        ):
            payment = Payment.objects.filter(
                models.Q(doc_id_snapshot=self.document_id_snapshot) |
                models.Q(doc__doc_id=self.document_id_snapshot)
            ).order_by('-approved_at', '-id').first()

        if payment:
            if self.payment_amount_snapshot is None:
                self.payment_amount_snapshot = payment.price
            if not self.payment_method_snapshot:
                self.payment_method_snapshot = payment.payment_method or ''
            if not self.payment_verified_by_snapshot:
                self.payment_verified_by_snapshot = payment.approved_by or ''
            if self.payment_approved_at_snapshot is None:
                self.payment_approved_at_snapshot = payment.approved_at
        
        # Delete old screenshot if being replaced
        if self.pk:
            try:
                old = SupportTicket.objects.get(pk=self.pk)
                if old.receipt_screenshot and old.receipt_screenshot != self.receipt_screenshot:
                    import os
                    if os.path.isfile(old.receipt_screenshot.path):
                        os.remove(old.receipt_screenshot.path)
            except SupportTicket.DoesNotExist:
                pass
        
        super().save(*args, **kwargs)
    
    def delete(self, *args, **kwargs):
        # Delete the receipt screenshot file from disk
        if self.receipt_screenshot:
            import os
            try:
                if os.path.isfile(self.receipt_screenshot.path):
                    os.remove(self.receipt_screenshot.path)
            except Exception:
                pass
        super().delete(*args, **kwargs)
    
    def purge_pii(self):
        """Remove PII fields but keep the dashboard-visible record."""
        import os
        # Delete receipt file from disk
        if self.receipt_screenshot:
            try:
                if os.path.isfile(self.receipt_screenshot.path):
                    os.remove(self.receipt_screenshot.path)
            except Exception:
                pass
            self.receipt_screenshot = None
        # Delete proof images from disk
        for proof in self.proof_images.all():
            proof.delete()
        # Clear PII fields
        self.phone_number = ''
        self.gcash_number = ''
        self.receipt_code = ''
        self.description = '[Data purged]'
        self.email = ''
        self.customer_name = '[Purged]'
        self.data_purged = True
        self.save()
    
    def __str__(self):
        return f"{self.ticket_number} - {self.customer_name}"
    
    class Meta:
        db_table = 'support_tickets'
        ordering = ['-created_at']


def proof_image_upload_path(instance, filename):
    """Upload proof images to a subfolder per ticket."""
    import os
    ext = os.path.splitext(filename)[1]
    ticket_num = ''
    if instance.ticket and instance.ticket.ticket_number:
        ticket_num = instance.ticket.ticket_number.replace('#', '')
    return f"receipt_screenshots/{ticket_num}/proof_{instance.pk or 'new'}{ext}"


class TicketProofImage(models.Model):
    """Photos uploaded by the customer as proof of the printing issue."""
    ticket = models.ForeignKey(
        SupportTicket,
        on_delete=models.CASCADE,
        related_name='proof_images'
    )
    image = models.ImageField(upload_to='receipt_screenshots/proofs/')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'ticket_proof_images'
        ordering = ['uploaded_at']

    def delete(self, *args, **kwargs):
        import os
        if self.image:
            try:
                if os.path.isfile(self.image.path):
                    os.remove(self.image.path)
            except Exception:
                pass
        super().delete(*args, **kwargs)

    def __str__(self):
        return f"Proof image for {self.ticket.ticket_number}"


class TicketAuditLog(models.Model):
    """
    Audit trail for all actions taken on support tickets.
    """
    ACTION_CHOICES = [
        ('created', 'Ticket Created'),
        ('status_changed', 'Status Changed'),
        ('refund_approved', 'Refund Approved'),
        ('refund_completed', 'Refund Completed'),
        ('refund_rejected', 'Refund Rejected'),
        ('voided', 'Ticket Voided'),
        ('note_added', 'Note Added'),
        ('verified', 'Ticket Verified'),
        ('data_purged', 'Data Purged'),
    ]

    ticket = models.ForeignKey(
        SupportTicket,
        on_delete=models.CASCADE,
        related_name='audit_logs'
    )
    action = models.CharField(max_length=30, choices=ACTION_CHOICES)
    old_status = models.CharField(max_length=50, blank=True, default="")
    new_status = models.CharField(max_length=50, blank=True, default="")
    performed_by = models.CharField(max_length=255, blank=True, default="")
    details = models.TextField(blank=True, default="")
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.ticket.ticket_number} — {self.get_action_display()} at {self.timestamp}"

    class Meta:
        db_table = 'ticket_audit_logs'
        ordering = ['-timestamp']


class DocumentReprintLog(models.Model):
    """
    Track reprint attempts for documents (limit to one per document).
    """
    document = models.ForeignKey(
        Document,
        to_field='doc_id',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reprint_logs'
    )
    doc_id_snapshot = models.CharField(max_length=255, blank=True, default='', db_index=True)
    customer_id_snapshot = models.CharField(max_length=255, blank=True, default='')
    doc_name_snapshot = models.CharField(max_length=255, blank=True, default='')
    reason = models.CharField(max_length=50)  # low-quality, missing-pages-jam, no-print
    page_range = models.CharField(max_length=20, blank=True, default="all")
    specific_pages = models.CharField(max_length=100, blank=True, default="")
    description = models.TextField(blank=True, default="")
    reprinted_at = models.DateTimeField(auto_now_add=True)
    printer_used = models.ForeignKey(
        Printer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    success = models.BooleanField(default=True)

    def save(self, *args, **kwargs):
        if self.document:
            self.doc_id_snapshot = self.doc_id_snapshot or self.document.doc_id
            self.customer_id_snapshot = self.customer_id_snapshot or self.document.customer_id
            self.doc_name_snapshot = self.doc_name_snapshot or self.document.original_name or self.document.filename or ''
        super().save(*args, **kwargs)
    
    def __str__(self):
        doc_id = self.document.doc_id if self.document else self.doc_id_snapshot or 'Unknown'
        return f"Reprint of {doc_id} - {self.reason}"
    
    class Meta:
        db_table = 'document_reprint_logs'
        ordering = ['-reprinted_at']


class PrinterStatusLog(models.Model):
    """Track historical printer status changes for audit/verification."""
    printer = models.ForeignKey(
        Printer,
        on_delete=models.CASCADE,
        related_name='status_logs'
    )
    status = models.CharField(max_length=50)
    ink_status = models.CharField(max_length=50, blank=True, default='')
    paper_level = models.CharField(max_length=20, blank=True, default='')
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.printer.printer_name} — {self.status} at {self.timestamp}"

    class Meta:
        db_table = 'printer_status_logs'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['-timestamp']),
            models.Index(fields=['printer', '-timestamp']),
        ]


class VoucherCreditAuditLog(models.Model):
    ACTION_CHOICES = [
        ('created', 'Created'),
        ('reserved', 'Reserved'),
        ('redeemed', 'Redeemed'),
        ('restored', 'Restored'),
        ('reactivated', 'Reactivated'),
        ('deactivated', 'Deactivated'),
        ('expired', 'Expired'),
        ('deleted', 'Deleted'),
    ]

    voucher = models.ForeignKey(
        'VoucherCredit',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs'
    )
    voucher_code_snapshot = models.CharField(max_length=20, db_index=True)
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    balance_after = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    customer_id = models.CharField(max_length=255, blank=True, default='')
    performed_by = models.CharField(max_length=255, blank=True, default='')
    reference = models.CharField(max_length=255, blank=True, default='')
    details = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if self.voucher and not self.voucher_code_snapshot:
            self.voucher_code_snapshot = self.voucher.code
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.voucher_code_snapshot} - {self.action} ({self.amount})"

    class Meta:
        db_table = 'voucher_credit_audit_logs'
        ordering = ['-created_at']


class DocumentLifecycleLog(models.Model):
    """
    Permanent record of document state changes for verification.
    Survives document deletion — used by admins to verify refund claims.
    """
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

    def __str__(self):
        return f"{self.doc_id} — {self.event} at {self.timestamp}"

    class Meta:
        db_table = 'document_lifecycle_logs'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['doc_id', '-timestamp']),
            models.Index(fields=['customer_id', '-timestamp']),
        ]