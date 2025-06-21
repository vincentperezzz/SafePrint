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

    def __str__(self):
        return self.username

    class Meta:
        db_table = 'admin_users'

class Printer(models.Model):
    PAPER_SIZE_CHOICES = [
        ('Long', 'Long'),
        ('Short', 'Short'),
        ('A4', 'A4'),
    ]

    GSM_CHOICES = [
        ('70', '70 GSM'),
        ('80', '80 GSM'),
    ]
    
    id = models.CharField(max_length=50, primary_key=True)
    printer_name = models.CharField(max_length=255)
    model_name = models.CharField(max_length=255, null=True, blank=True)
    printer_status = models.CharField(max_length=50)
    paper_assigned = models.CharField(max_length=50, choices=PAPER_SIZE_CHOICES)
    paper_quality = models.CharField(max_length=50, choices=GSM_CHOICES)
    last_checked = models.DateTimeField()
    printer_serialNumber = models.CharField(max_length=255)

    def __str__(self):
        return self.printer_name
    
    class Meta:
        db_table = 'printers'

class Document(models.Model):
    # add category choices for doc_status
    DOC_STATUS_CHOICES = [
        ('Pending', 'Pending'),
        ('Queued', 'Queued'),
        ('Printing', 'Printing'),
        ('Finished', 'Finished'),
    ]

    doc_id = models.CharField(max_length=255, primary_key=True)
    customer_id = models.CharField(max_length=255)
    filename = models.CharField(max_length=255)
    num_copies = models.IntegerField()
    pages_num = models.IntegerField()
    orientation = models.CharField(max_length=50)
    color_mode = models.CharField(max_length=50)
    paper_size = models.CharField(max_length=50)
    paper_quality = models.CharField(max_length=50)
    original_name = models.CharField(max_length=255)
    stored_name = models.CharField(max_length=255)
    file_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=50)
    file_size = models.IntegerField()
    doc_status = models.CharField(max_length=50, choices=DOC_STATUS_CHOICES, default='Pending')
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
    approved_by = models.CharField(max_length=255, null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.doc} - {self.price} ({self.payment_status})"
    
    class Meta:
        db_table = 'payments'

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