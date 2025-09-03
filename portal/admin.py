from django.contrib import admin
from .models import AdminUser, Printer, Document, Payment, Feedback, RerouteHistory, NotificationSound

admin.site.register(AdminUser)
admin.site.register(Printer)
admin.site.register(Document)
admin.site.register(Payment)
admin.site.register(Feedback)
admin.site.register(RerouteHistory)
admin.site.register(NotificationSound)