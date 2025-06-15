from django.contrib import admin
from .models import AdminUser, Printer, Document, Payment

admin.site.register(AdminUser)
admin.site.register(Printer)
admin.site.register(Document)
admin.site.register(Payment)