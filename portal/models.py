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

class Printer(models.Model):
    PAPER_SIZE_CHOICES = [
        ('Long', 'Long'),
        ('Letter', 'Letter'), 
        ('A4', 'A4'),
        ('Unsupported', 'Unsupported'),
    ]

    GSM_CHOICES = [
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
    printer_status = models.CharField(max_length=50)
    ink_status = models.CharField(max_length=50, null=True, blank=True)
    paper_assigned = models.CharField(max_length=50, choices=PAPER_SIZE_CHOICES)
    paper_quality = models.CharField(max_length=50, choices=GSM_CHOICES)
    last_checked = models.DateTimeField()
    ip_address = models.CharField(max_length=255)
    node_name = models.CharField(max_length=255, null=True, blank=True)

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
        if self.pk and Document.objects.filter(pk=self.pk).exists():
            orig = Document.objects.get(pk=self.pk)
            if orig.doc_status != self.doc_status:
                from django.utils import timezone
                self.status_updated_at = timezone.now()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.doc_id} - {self.filename}"
    
    class Meta:
        db_table = 'documents'

class RerouteHistory(models.Model):
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='reroute_history')
    printer = models.ForeignKey(Printer, to_field='id', on_delete=models.SET_NULL, null=True)
    status = models.CharField(max_length=50)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'reroute_history'
        ordering = ['timestamp']
        verbose_name = "Reroute history"
        verbose_name_plural = "Reroute history"

    def __str__(self):
        return f"{self.document.doc_id} - {self.printer} ({self.status} at {self.timestamp})"

class Payment(models.Model):
    doc = models.ForeignKey(Document, to_field='doc_id', on_delete=models.CASCADE)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    payment_status = models.CharField(max_length=50)
    voucher_code = models.CharField(max_length=50, null=True, blank=True, unique=True)
    payment_method = models.CharField(max_length=50, null=True, blank=True)  # 'klcis', 'gcash', etc.
    phone_number = models.CharField(max_length=20, null=True, blank=True)  # Student phone for GCash verification
    klcis_transaction_id = models.CharField(max_length=64, null=True, blank=True, unique=True)  # KLCiS Transaction ID for dedup
    approved_by = models.CharField(max_length=255, null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.doc} - {self.price} ({self.payment_status})"
    
    class Meta:
        db_table = 'payments'


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
    
    # Status tracking
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='open')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.CharField(max_length=255, blank=True, default="")
    
    # Notes for admin
    admin_notes = models.TextField(blank=True, default="")
    
    def save(self, *args, **kwargs):
        if not self.ticket_number:
            # Generate ticket number
            import random
            import string
            from django.utils import timezone
            date_prefix = timezone.now().strftime('%y%m%d')
            random_suffix = ''.join(random.choices(string.digits, k=4))
            self.ticket_number = f"#TKT-{date_prefix}-{random_suffix}"
        
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
    
    def __str__(self):
        return f"{self.ticket_number} - {self.customer_name}"
    
    class Meta:
        db_table = 'support_tickets'
        ordering = ['-created_at']


class DocumentReprintLog(models.Model):
    """
    Track reprint attempts for documents (limit to one per document).
    """
    document = models.ForeignKey(
        Document,
        to_field='doc_id',
        on_delete=models.CASCADE,
        related_name='reprint_logs'
    )
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
    
    def __str__(self):
        return f"Reprint of {self.document.doc_id} - {self.reason}"
    
    class Meta:
        db_table = 'document_reprint_logs'
        ordering = ['-reprinted_at']