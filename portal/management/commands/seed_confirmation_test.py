"""
Seed test data for the confirmation page to display all possible badge states.
Usage: python manage.py seed_confirmation_test

Creates a test customer (CID: TEST-0001) with documents in every status:
- Pending (waiting for approval)
- Queued (waiting for printer)
- Printing (currently printing on a printer)
- Finished (completed, ready for pickup)
- Cancelled (cancelled with reason)
- Picked Up (already picked up)
- Rerouted + Printing (rerouted from one printer to another)
- Rerouted + Finished (rerouted, then completed)

Access the confirmation page at: /confirmation/?test_customer=TEST-0001
(Only works when DEBUG=True)
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from portal.models import Document, Printer, Payment, RerouteHistory
import random
import string


class Command(BaseCommand):
    help = 'Seed test data for confirmation page with all badge states'

    def handle(self, *args, **options):
        customer_id = 'TEST-0001'

        # Clean up previous test data
        old_docs = Document.objects.filter(customer_id=customer_id)
        for doc in old_docs:
            RerouteHistory.objects.filter(document=doc).delete()
            Payment.objects.filter(doc=doc).delete()
        old_docs.delete()
        self.stdout.write(self.style.WARNING(f'Cleaned up old test data for {customer_id}'))

        # Get or create test printers
        printer1, _ = Printer.objects.get_or_create(
            printer_name='Printer 1',
            defaults={
                'model_name': 'Brother_DCP_T510W',
                'printer_status': 'Ready',
                'ink_status': 'OK',
                'paper_assigned': 'A4',
                'paper_quality': '70',
                'last_checked': timezone.now(),
                'ip_address': '192.168.0.101',
            }
        )
        printer2, _ = Printer.objects.get_or_create(
            printer_name='Printer 2',
            defaults={
                'model_name': 'Brother_DCP_T820DW',
                'printer_status': 'Ready',
                'ink_status': 'OK',
                'paper_assigned': 'A4',
                'paper_quality': '70',
                'last_checked': timezone.now(),
                'ip_address': '192.168.0.102',
            }
        )
        printer3, _ = Printer.objects.get_or_create(
            printer_name='Printer 3',
            defaults={
                'model_name': 'Brother_DCP_T420W',
                'printer_status': 'Ready',
                'ink_status': 'OK',
                'paper_assigned': 'A4',
                'paper_quality': '70',
                'last_checked': timezone.now(),
                'ip_address': '192.168.0.103',
            }
        )

        now = timezone.now()
        base_time = now - timezone.timedelta(minutes=10)

        # ---- Document 1: Pending (waiting for admin approval) ----
        doc1 = Document.objects.create(
            doc_id='DOC-T001',
            customer_id=customer_id,
            filename='Thesis_Chapter1.pdf',
            num_copies=1,
            pages_num='1-5',
            orientation='Portrait',
            color_mode='Black and White',
            paper_size='A4',
            paper_quality='70',
            original_name='Thesis_Chapter1.pdf',
            stored_name='test_thesis_ch1.pdf',
            file_name='Thesis_Chapter1.pdf',
            file_type='pdf',
            file_size=245000,
            doc_status='Pending',
            time_submitted=base_time,
        )
        Payment.objects.create(doc=doc1, price=5.00, payment_status='Unpaid')

        # ---- Document 2: Queued (waiting for printer) ----
        doc2 = Document.objects.create(
            doc_id='DOC-T002',
            customer_id=customer_id,
            filename='Research_Paper.pdf',
            num_copies=1,
            pages_num='1-8',
            orientation='Portrait',
            color_mode='Color',
            paper_size='A4',
            paper_quality='70',
            original_name='Research_Paper.pdf',
            stored_name='test_research.pdf',
            file_name='Research_Paper.pdf',
            file_type='pdf',
            file_size=512000,
            doc_status='Queued',
            time_submitted=base_time + timezone.timedelta(seconds=30),
        )
        Payment.objects.create(doc=doc2, price=24.00, payment_status='Paid')

        # ---- Document 3: Printing (currently on Printer 3) ----
        doc3 = Document.objects.create(
            doc_id='DOC-T003',
            customer_id=customer_id,
            filename='Abstract_Final.pdf',
            num_copies=1,
            pages_num='1-3',
            orientation='Portrait',
            color_mode='Black and White',
            paper_size='A4',
            paper_quality='70',
            original_name='Abstract_Final.pdf',
            stored_name='test_abstract.pdf',
            file_name='Abstract_Final.pdf',
            file_type='pdf',
            file_size=128000,
            doc_status='Printing',
            printer_assigned=printer3,
            time_submitted=base_time + timezone.timedelta(minutes=1),
            pages_printed=[1],
        )
        RerouteHistory.objects.create(document=doc3, printer=printer3, status='Assigned', timestamp=now - timezone.timedelta(minutes=2))
        Payment.objects.create(doc=doc3, price=3.00, payment_status='Paid')

        # ---- Document 4: Finished (completed on Printer 2, ready for pickup) ----
        doc4 = Document.objects.create(
            doc_id='DOC-T004',
            customer_id=customer_id,
            filename='Project_Report.pdf',
            num_copies=1,
            pages_num='1-6',
            orientation='Portrait',
            color_mode='Color',
            paper_size='A4',
            paper_quality='70',
            original_name='Project_Report.pdf',
            stored_name='test_project.pdf',
            file_name='Project_Report.pdf',
            file_type='pdf',
            file_size=890000,
            doc_status='Finished',
            printer_assigned=printer2,
            printed_at=printer2,
            time_submitted=base_time + timezone.timedelta(minutes=2),
            pages_printed=[1, 2, 3, 4, 5, 6],
        )
        RerouteHistory.objects.create(document=doc4, printer=printer2, status='Assigned', timestamp=now - timezone.timedelta(minutes=5))
        Payment.objects.create(doc=doc4, price=18.00, payment_status='Paid')

        # ---- Document 5: Cancelled (no available printer) ----
        doc5 = Document.objects.create(
            doc_id='DOC-T005',
            customer_id=customer_id,
            filename='Permit_Application.pdf',
            num_copies=1,
            pages_num='1-2',
            orientation='Portrait',
            color_mode='Black and White',
            paper_size='Long',
            paper_quality='70',
            original_name='Permit_Application.pdf',
            stored_name='test_permit.pdf',
            file_name='Permit_Application.pdf',
            file_type='pdf',
            file_size=95000,
            doc_status='Cancelled',
            time_submitted=base_time + timezone.timedelta(minutes=3),
        )
        Payment.objects.create(doc=doc5, price=2.00, payment_status='Paid')

        # ---- Document 6: Picked Up (already collected) ----
        doc6 = Document.objects.create(
            doc_id='DOC-T006',
            customer_id=customer_id,
            filename='Certificate.pdf',
            num_copies=1,
            pages_num='1',
            orientation='Portrait',
            color_mode='Color',
            paper_size='A4',
            paper_quality='70',
            original_name='Certificate.pdf',
            stored_name='test_certificate.pdf',
            file_name='Certificate.pdf',
            file_type='pdf',
            file_size=64000,
            doc_status='Picked Up',
            printer_assigned=printer1,
            printed_at=printer1,
            time_submitted=base_time + timezone.timedelta(minutes=4),
            pages_printed=[1],
        )
        RerouteHistory.objects.create(document=doc6, printer=printer1, status='Assigned', timestamp=now - timezone.timedelta(minutes=8))
        Payment.objects.create(doc=doc6, price=3.00, payment_status='Paid')

        # ---- Document 7: Rerouted + Currently Printing ----
        # Started on Printer 1, paper jam, rerouted to Printer 2
        doc7 = Document.objects.create(
            doc_id='DOC-T007',
            customer_id=customer_id,
            filename='Lab_Report_v2.pdf',
            num_copies=1,
            pages_num='1-10',
            orientation='Portrait',
            color_mode='Black and White',
            paper_size='A4',
            paper_quality='70',
            original_name='Lab_Report_v2.pdf',
            stored_name='test_lab_report.pdf',
            file_name='Lab_Report_v2.pdf',
            file_type='pdf',
            file_size=340000,
            doc_status='Printing',
            printer_assigned=printer2,
            time_submitted=base_time + timezone.timedelta(minutes=5),
            pages_printed=[1, 2, 3],
        )
        # History: Assigned to Printer 1 → Error (Paper Jam) → Rerouted to Printer 2
        RerouteHistory.objects.create(
            document=doc7, printer=printer1, status='Assigned',
            timestamp=now - timezone.timedelta(minutes=6)
        )
        RerouteHistory.objects.create(
            document=doc7, printer=printer1, status='Error: Paper Jam',
            timestamp=now - timezone.timedelta(minutes=4)
        )
        RerouteHistory.objects.create(
            document=doc7, printer=printer2, status='Rerouted',
            timestamp=now - timezone.timedelta(minutes=3)
        )
        RerouteHistory.objects.create(
            document=doc7, printer=printer2, status='Assigned',
            timestamp=now - timezone.timedelta(minutes=3)
        )
        Payment.objects.create(doc=doc7, price=10.00, payment_status='Paid')

        # ---- Document 8: Rerouted twice + Finished ----
        # Printer 1 → Error → Printer 3 → Error → Printer 2 → Finished
        doc8 = Document.objects.create(
            doc_id='DOC-T008',
            customer_id=customer_id,
            filename='Dissertation_Abstract.pdf',
            num_copies=1,
            pages_num='1-15',
            orientation='Portrait',
            color_mode='Color',
            paper_size='A4',
            paper_quality='70',
            original_name='Dissertation_Abstract.pdf',
            stored_name='test_dissertation.pdf',
            file_name='Dissertation_Abstract.pdf',
            file_type='pdf',
            file_size=1200000,
            doc_status='Finished',
            printer_assigned=printer2,
            printed_at=printer2,
            time_submitted=base_time + timezone.timedelta(minutes=6),
            pages_printed=list(range(1, 16)),
        )
        RerouteHistory.objects.create(
            document=doc8, printer=printer1, status='Assigned',
            timestamp=now - timezone.timedelta(minutes=9)
        )
        RerouteHistory.objects.create(
            document=doc8, printer=printer1, status='Error: Ink Low',
            timestamp=now - timezone.timedelta(minutes=7)
        )
        RerouteHistory.objects.create(
            document=doc8, printer=printer3, status='Rerouted',
            timestamp=now - timezone.timedelta(minutes=6)
        )
        RerouteHistory.objects.create(
            document=doc8, printer=printer3, status='Assigned',
            timestamp=now - timezone.timedelta(minutes=6)
        )
        RerouteHistory.objects.create(
            document=doc8, printer=printer3, status='Error: Paper Jam',
            timestamp=now - timezone.timedelta(minutes=4)
        )
        RerouteHistory.objects.create(
            document=doc8, printer=printer2, status='Rerouted',
            timestamp=now - timezone.timedelta(minutes=3)
        )
        RerouteHistory.objects.create(
            document=doc8, printer=printer2, status='Assigned',
            timestamp=now - timezone.timedelta(minutes=3)
        )
        Payment.objects.create(doc=doc8, price=45.00, payment_status='Paid')

        total_price = sum([5, 24, 3, 18, 2, 3, 10, 45])
        self.stdout.write(self.style.SUCCESS(f'\n✅ Test data seeded successfully!'))
        self.stdout.write(self.style.SUCCESS(f'   Customer ID: {customer_id}'))
        self.stdout.write(self.style.SUCCESS(f'   Documents created: 8'))
        self.stdout.write(self.style.SUCCESS(f'   Total price: ₱{total_price:.2f}'))
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('   Badges you will see:'))
        self.stdout.write(f'   DOC-T001: 📋 Pending (Waiting for Approval)')
        self.stdout.write(f'   DOC-T002: ⏳ Queued (Waiting...)')
        self.stdout.write(f'   DOC-T003: 🖨️  Printing (Printer 3)')
        self.stdout.write(f'   DOC-T004: ✅ Finished (Printer 2) + Picked Up button')
        self.stdout.write(f'   DOC-T005: ❌ Cancelled (No available Printer)')
        self.stdout.write(f'   DOC-T006: 📦 Picked Up')
        self.stdout.write(f'   DOC-T007: 🔄 Rerouted (Printer 1 → Printer 2) + Printing')
        self.stdout.write(f'   DOC-T008: 🔄🔄 Double rerouted (P1 → P3 → P2) + Finished')
        self.stdout.write('')
        self.stdout.write(self.style.WARNING(f'   Access at: /confirmation/?test_customer=TEST-0001'))
        self.stdout.write(self.style.WARNING(f'   (DEBUG must be True)'))
