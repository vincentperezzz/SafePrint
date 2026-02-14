import os, sys, django
sys.path.insert(0, '/home/safeprint/dev/SafePrint')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafePrint.settings')
django.setup()

from portal.models import SupportTicket
print("=== All Tickets ===")
for t in SupportTicket.objects.all():
    print(f"ID={t.id} | {t.ticket_number} | status={t.status} | customer={t.customer_name}")
print(f"\nTotal: {SupportTicket.objects.count()}")
