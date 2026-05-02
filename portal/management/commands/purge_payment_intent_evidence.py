from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from portal.models import PaymentIntent


class Command(BaseCommand):
    help = 'Redact payer numbers and raw matched listener payloads from finalized payment intents after the retention window.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=30,
            help='Retention window in days before finalized payment intent evidence is redacted.',
        )

    def handle(self, *args, **options):
        days = max(int(options['days']), 1)
        now = timezone.now()
        cutoff = now - timedelta(days=days)

        redactable_statuses = [
            PaymentIntent.STATUS_MATCHED,
            PaymentIntent.STATUS_CANCELLED,
            PaymentIntent.STATUS_EXPIRED,
            PaymentIntent.STATUS_FAILED,
        ]

        queryset = PaymentIntent.objects.filter(
            status__in=redactable_statuses,
            updated_at__lte=cutoff,
            evidence_redacted_at__isnull=True,
        ).filter(
            Q(payer_number__gt='') | Q(matched_raw_text__gt='')
        )

        updated = queryset.update(
            payer_number='',
            matched_raw_text='',
            evidence_redacted_at=now,
        )

        self.stdout.write(
            self.style.SUCCESS(
                f'Redacted sensitive evidence from {updated} finalized payment intent(s).'
            )
        )