from django.core.management.base import BaseCommand
from django.utils import timezone
from portal.models import SupportTicket, TicketAuditLog


class Command(BaseCommand):
    help = 'Purge PII from resolved/voided tickets whose 30-day retention period has expired.'

    def handle(self, *args, **options):
        now = timezone.now()
        expired = SupportTicket.objects.filter(
            data_purged=False,
            data_retention_expires__isnull=False,
            data_retention_expires__lte=now,
            status__in=['resolved', 'closed', 'voided', 'refunded'],
        ).exclude(refund_status='pending')

        count = 0
        for ticket in expired:
            ticket.purge_pii()
            TicketAuditLog.objects.create(
                ticket=ticket,
                action='data_purged',
                old_status=ticket.status,
                new_status=ticket.status,
                performed_by='system',
                details='PII auto-purged after 30-day retention period.',
            )
            count += 1

        self.stdout.write(self.style.SUCCESS(f'Purged PII from {count} ticket(s).'))
