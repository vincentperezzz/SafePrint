from django.contrib import admin
from .models import AdminUser, Printer, Document, Payment, Feedback, RerouteHistory, NotificationSound, SupportTicket, UsedKLCiSTransaction, VoucherCredit, SiteSetting, TicketAuditLog, DocumentReprintLog, PrinterStatusLog, DocumentLifecycleLog
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


@admin.register(UsedKLCiSTransaction)
class UsedKLCiSTransactionAdmin(admin.ModelAdmin):
    list_display = ('transaction_id', 'phone_number', 'amount', 'used_at')
    search_fields = ('transaction_id', 'phone_number')
    readonly_fields = ('transaction_id', 'phone_number', 'amount', 'used_at')


@admin.register(VoucherCredit)
class VoucherCreditAdmin(admin.ModelAdmin):
    list_display = ('code', 'original_amount', 'remaining_balance', 'is_active', 'last_customer_id', 'expires_at', 'last_used_at')
    list_filter = ('is_active',)
    search_fields = ('code', 'last_customer_id')
    readonly_fields = ('created_at',)


@admin.register(SiteSetting)
class SiteSettingAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'customer_completion_sound', 'customer_reroute_sound', 'verification_time_window')


@admin.register(TicketAuditLog)
class TicketAuditLogAdmin(admin.ModelAdmin):
    list_display = ('ticket', 'action', 'performed_by', 'timestamp')
    list_filter = ('action',)
    search_fields = ('ticket__ticket_number', 'performed_by', 'details')
    readonly_fields = ('ticket', 'action', 'old_status', 'new_status', 'performed_by', 'details', 'timestamp')


@admin.register(DocumentReprintLog)
class DocumentReprintLogAdmin(admin.ModelAdmin):
    list_display = ('document', 'reason', 'printer_used', 'success', 'reprinted_at')
    list_filter = ('reason', 'success')
    search_fields = ('document__doc_id', 'description')
    readonly_fields = ('reprinted_at',)


@admin.register(PrinterStatusLog)
class PrinterStatusLogAdmin(admin.ModelAdmin):
    list_display = ('printer', 'status', 'ink_status', 'paper_level', 'timestamp')
    list_filter = ('status', 'printer')
    search_fields = ('printer__name', 'status')
    readonly_fields = ('printer', 'status', 'ink_status', 'paper_level', 'timestamp')


@admin.register(DocumentLifecycleLog)
class DocumentLifecycleLogAdmin(admin.ModelAdmin):
    list_display = ('doc_id', 'customer_id', 'doc_name', 'event', 'printer_name', 'timestamp')
    list_filter = ('event',)
    search_fields = ('doc_id', 'customer_id', 'doc_name')
    readonly_fields = ('doc_id', 'customer_id', 'doc_name', 'event', 'printer_name', 'details', 'timestamp')