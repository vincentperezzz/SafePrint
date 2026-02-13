from django.contrib import admin
from .models import AdminUser, Printer, Document, Payment, Feedback, RerouteHistory, NotificationSound, SupportTicket
import os

admin.site.register(AdminUser)
admin.site.register(Printer)
admin.site.register(Document)
admin.site.register(Feedback)
admin.site.register(RerouteHistory)
admin.site.register(NotificationSound)


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('doc', 'price', 'payment_status', 'payment_method', 'phone_number', 'voucher_code', 'klcis_transaction_id', 'approved_by', 'approved_at')
    list_filter = ('payment_status', 'payment_method')
    search_fields = ('doc__doc_id', 'doc__customer_id', 'phone_number', 'voucher_code', 'klcis_transaction_id')
    readonly_fields = ('klcis_transaction_id', 'approved_at')


@admin.register(SupportTicket)
class SupportTicketAdmin(admin.ModelAdmin):
    list_display = ('ticket_number', 'customer_name', 'problem_type', 'status', 'created_at')
    list_filter = ('status', 'problem_type')
    search_fields = ('ticket_number', 'customer_name', 'customer_id', 'email')
    readonly_fields = ('ticket_number', 'created_at', 'updated_at')

    def delete_queryset(self, request, queryset):
        """Delete receipt files when bulk-deleting from admin."""
        for ticket in queryset:
            if ticket.receipt_screenshot:
                try:
                    if os.path.isfile(ticket.receipt_screenshot.path):
                        os.remove(ticket.receipt_screenshot.path)
                except Exception:
                    pass
        queryset.delete()