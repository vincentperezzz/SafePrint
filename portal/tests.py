import os
import tempfile
from decimal import Decimal
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from portal.models import Document, Payment, Printer, RerouteHistory, VoucherCredit
from portal.views import (
	_claim_next_queued_document_for_printer,
	assign_document_to_printer,
	check_queued_documents,
	print_page,
	reroute_document_on_error,
	select_printer_for_document,
)


class PrintCompletionFallbackTests(TestCase):
	@override_settings(MEDIA_ROOT='/tmp/safeprint-test-media')
	def test_marks_rerouted_page_complete_when_cups_job_disappears_but_printer_stays_printing(self):
		with tempfile.TemporaryDirectory(prefix='safeprint-media-') as media_root:
			with self.settings(MEDIA_ROOT=media_root):
				uploads_dir = os.path.join(media_root, 'uploads', 'CID-TEST')
				os.makedirs(uploads_dir, exist_ok=True)
				file_path = os.path.join(uploads_dir, 'rerouted.pdf')
				with open(file_path, 'wb') as handle:
					handle.write(b'%PDF-1.4\n% test\n')

				printer = Printer.objects.create(
					printer_name='Printer 2',
					model_name='Brother',
					printer_status='Ready',
					last_checked=timezone.now(),
					ip_address='192.168.0.50',
				)

				document = Document.objects.create(
					doc_id='DOC-REROUTE-1',
					customer_id='CID-TEST',
					filename='rerouted.pdf',
					num_copies=1,
					pages_num='1',
					orientation='Portrait',
					color_mode='Color',
					paper_size='A4',
					paper_quality='70',
					original_name='rerouted.pdf',
					stored_name='rerouted.pdf',
					file_name='rerouted.pdf',
					file_type='pdf',
					file_size=16,
					doc_status='Printing',
					time_submitted=timezone.now() - timedelta(seconds=5),
					printer_assigned=printer,
				)

				printer_statuses = iter(['Printing', 'Printing', 'Printing', 'Printing'])

				def fake_printer_refresh(instance, *args, **kwargs):
					try:
						instance.printer_status = next(printer_statuses)
					except StopIteration:
						pass

				with patch('portal.views._resolve_cups_queue_name', return_value='printer_queue'), \
					 patch('portal.views.subprocess.run', return_value=SimpleNamespace(stdout='request id is printer_queue-42 (1 file(s))\n', stderr='')), \
					 patch('portal.views._get_cups_job_state', side_effect=['pending', 'unknown', 'unknown', 'unknown']), \
					 patch('portal.views.time.sleep', return_value=None), \
					 patch('portal.views.Printer.refresh_from_db', autospec=True, side_effect=fake_printer_refresh):
					print_page(document, 1)

				document.refresh_from_db()
				self.assertEqual(document.pages_printed, [1])
				self.assertEqual(document.doc_status, 'Finished')
				self.assertEqual(document.printed_at_id, printer.id)


class NoPrinterAutoVoucherTests(TestCase):
	def test_initial_assignment_with_no_viable_printer_creates_auto_voucher(self):
		document = Document.objects.create(
			doc_id='DOC-NO-PRINTER-1',
			customer_id='CID-NO-PRINTER',
			filename='queued.pdf',
			num_copies=1,
			pages_num='1-2',
			orientation='Portrait',
			color_mode='Color',
			paper_size='A4',
			paper_quality='70',
			original_name='queued.pdf',
			stored_name='queued.pdf',
			file_name='queued.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Queued',
			time_submitted=timezone.now() - timedelta(seconds=5),
		)

		Payment.objects.create(
			doc=document,
			price=Decimal('12.00'),
			payment_status='Paid',
		)

		Printer.objects.create(
			printer_name='Offline Printer',
			model_name='Brother',
			printer_status='Offline',
			paper_assigned='A4',
			tray_level='Full',
			last_checked=timezone.now(),
			ip_address='192.168.0.60',
		)

		result = assign_document_to_printer(document)

		document.refresh_from_db()
		voucher = VoucherCredit.objects.get(last_customer_id=document.customer_id)
		latest_history = RerouteHistory.objects.filter(document=document).latest('timestamp')

		self.assertIsNone(result)
		self.assertEqual(document.doc_status, 'Cancelled')
		self.assertIsNone(document.printer_assigned)
		self.assertEqual(voucher.remaining_balance, Decimal('12.00'))
		self.assertIn('Auto voucher', latest_history.status)

	def test_queue_monitor_cancels_terminal_queued_document_with_no_viable_printer(self):
		document = Document.objects.create(
			doc_id='DOC-NO-PRINTER-QUEUE-1',
			customer_id='CID-NO-PRINTER-QUEUE',
			filename='queued-monitor.pdf',
			num_copies=1,
			pages_num='1-2',
			orientation='Portrait',
			color_mode='Color',
			paper_size='A4',
			paper_quality='70',
			original_name='queued-monitor.pdf',
			stored_name='queued-monitor.pdf',
			file_name='queued-monitor.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Queued',
			queue_priority=Document.QueuePriority.NORMAL,
			queued_at=timezone.now() - timedelta(seconds=5),
			time_submitted=timezone.now() - timedelta(seconds=5),
		)

		Payment.objects.create(
			doc=document,
			price=Decimal('15.00'),
			payment_status='Paid',
		)

		Printer.objects.create(
			printer_name='Offline Queue Printer',
			model_name='Brother',
			printer_status='Offline',
			paper_assigned='A4',
			tray_level='Full',
			last_checked=timezone.now(),
			ip_address='192.168.0.61',
		)

		with patch('portal.views._schedule_queue_check', return_value=None):
			check_queued_documents()

		document.refresh_from_db()
		voucher = VoucherCredit.objects.get(last_customer_id=document.customer_id)
		latest_history = RerouteHistory.objects.filter(document=document).latest('timestamp')

		self.assertEqual(document.doc_status, 'Cancelled')
		self.assertIsNone(document.printer_assigned)
		self.assertEqual(voucher.remaining_balance, Decimal('15.00'))
		self.assertIn('Auto voucher', latest_history.status)


class SchedulerSelectionTests(TestCase):
	def test_prefers_least_recently_assigned_not_last_checked(self):
		document = Document.objects.create(
			doc_id='DOC-SCHED-1',
			customer_id='CID-SCHED',
			filename='sched.pdf',
			num_copies=1,
			pages_num='1',
			orientation='Portrait',
			color_mode='Color',
			paper_size='A4',
			paper_quality='70',
			original_name='sched.pdf',
			stored_name='sched.pdf',
			file_name='sched.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Queued',
			time_submitted=timezone.now() - timedelta(seconds=5),
		)

		older_assignment = Printer.objects.create(
			printer_name='Older Assignment',
			model_name='Brother',
			printer_status='Ready',
			paper_assigned='A4',
			tray_level='Full',
			last_checked=timezone.now() - timedelta(days=1),
			last_assigned_at=timezone.now() - timedelta(hours=1),
			ip_address='192.168.0.71',
		)

		recently_assigned = Printer.objects.create(
			printer_name='Recently Assigned',
			model_name='Brother',
			printer_status='Ready',
			paper_assigned='A4',
			tray_level='Full',
			last_checked=timezone.now() - timedelta(hours=6),
			last_assigned_at=timezone.now() - timedelta(minutes=5),
			ip_address='192.168.0.72',
		)

		selected = select_printer_for_document(document, allowed_statuses=['Ready', 'Sleep'])

		self.assertEqual(selected.id, older_assignment.id)
		self.assertNotEqual(selected.id, recently_assigned.id)

	def test_assignment_updates_scheduler_state_and_excludes_failed_printer(self):
		document = Document.objects.create(
			doc_id='DOC-SCHED-2',
			customer_id='CID-SCHED-2',
			filename='assign.pdf',
			num_copies=1,
			pages_num='1',
			orientation='Portrait',
			color_mode='Color',
			paper_size='A4',
			paper_quality='70',
			original_name='assign.pdf',
			stored_name='assign.pdf',
			file_name='assign.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Queued',
			time_submitted=timezone.now() - timedelta(seconds=5),
		)

		failed_printer = Printer.objects.create(
			printer_name='Failed Candidate',
			model_name='Brother',
			printer_status='Ready',
			paper_assigned='A4',
			tray_level='Full',
			last_checked=timezone.now(),
			ip_address='192.168.0.73',
		)

		healthy_printer = Printer.objects.create(
			printer_name='Healthy Candidate',
			model_name='Brother',
			printer_status='Ready',
			paper_assigned='A4',
			tray_level='Full',
			last_checked=timezone.now(),
			ip_address='192.168.0.74',
		)

		document.previous_failed_printer = failed_printer.id
		assigned_printer = assign_document_to_printer(document, wait_for_availability=False)

		document.refresh_from_db()
		failed_printer.refresh_from_db()
		healthy_printer.refresh_from_db()

		self.assertEqual(assigned_printer.id, healthy_printer.id)
		self.assertEqual(document.printer_assigned_id, healthy_printer.id)
		self.assertEqual(document.doc_status, 'Printing')
		self.assertEqual(healthy_printer.active_job_count, 1)
		self.assertIsNotNone(healthy_printer.last_assigned_at)
		self.assertEqual(failed_printer.active_job_count, 0)

	def test_claim_next_queued_document_prioritizes_reroute_before_normal_fifo(self):
		printer = Printer.objects.create(
			printer_name='Dispatch Target',
			model_name='Brother',
			printer_status='Ready',
			paper_assigned='A4',
			tray_level='Full',
			last_checked=timezone.now(),
			ip_address='192.168.0.75',
		)

		normal_doc = Document.objects.create(
			doc_id='DOC-QUEUE-NORMAL-1',
			customer_id='CID-QUEUE-NORMAL',
			filename='normal.pdf',
			num_copies=1,
			pages_num='1',
			orientation='Portrait',
			color_mode='Color',
			paper_size='A4',
			paper_quality='70',
			original_name='normal.pdf',
			stored_name='normal.pdf',
			file_name='normal.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Queued',
			queue_priority=Document.QueuePriority.NORMAL,
			queued_at=timezone.now() - timedelta(minutes=3),
			time_submitted=timezone.now() - timedelta(minutes=3),
		)

		rerouted_doc = Document.objects.create(
			doc_id='DOC-QUEUE-REROUTE-1',
			customer_id='CID-QUEUE-REROUTE',
			filename='rerouted.pdf',
			num_copies=1,
			pages_num='1',
			orientation='Portrait',
			color_mode='Color',
			paper_size='A4',
			paper_quality='70',
			original_name='rerouted.pdf',
			stored_name='rerouted.pdf',
			file_name='rerouted.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Queued',
			queue_priority=Document.QueuePriority.REROUTE,
			queued_at=timezone.now() - timedelta(minutes=1),
			time_submitted=timezone.now() - timedelta(minutes=5),
		)

		claimed_doc = _claim_next_queued_document_for_printer(printer)

		normal_doc.refresh_from_db()
		rerouted_doc.refresh_from_db()
		printer.refresh_from_db()

		self.assertEqual(claimed_doc.doc_id, rerouted_doc.doc_id)
		self.assertEqual(rerouted_doc.printer_assigned_id, printer.id)
		self.assertEqual(rerouted_doc.doc_status, 'Printing')
		self.assertIsNone(normal_doc.printer_assigned_id)
		self.assertEqual(normal_doc.doc_status, 'Queued')
		self.assertEqual(printer.active_job_count, 1)

	def test_reroute_stays_queued_when_only_busy_healthy_printer_remains(self):
		failed_printer = Printer.objects.create(
			printer_name='Failed Printer',
			model_name='Brother',
			printer_status='Ready',
			paper_assigned='A4',
			tray_level='Full',
			last_checked=timezone.now(),
			ip_address='192.168.0.76',
		)

		busy_healthy_printer = Printer.objects.create(
			printer_name='Busy Healthy Printer',
			model_name='Brother',
			printer_status='Ready',
			paper_assigned='A4',
			tray_level='Full',
			last_checked=timezone.now(),
			ip_address='192.168.0.77',
		)

		busy_doc = Document.objects.create(
			doc_id='DOC-BUSY-PRINTER-1',
			customer_id='CID-BUSY',
			filename='busy.pdf',
			num_copies=1,
			pages_num='1',
			orientation='Portrait',
			color_mode='Color',
			paper_size='A4',
			paper_quality='70',
			original_name='busy.pdf',
			stored_name='busy.pdf',
			file_name='busy.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Printing',
			time_submitted=timezone.now() - timedelta(minutes=2),
			printer_assigned=busy_healthy_printer,
		)

		document = Document.objects.create(
			doc_id='DOC-REROUTE-WAIT-1',
			customer_id='CID-REROUTE-WAIT',
			filename='reroute-wait.pdf',
			num_copies=1,
			pages_num='1',
			orientation='Portrait',
			color_mode='Color',
			paper_size='A4',
			paper_quality='70',
			original_name='reroute-wait.pdf',
			stored_name='reroute-wait.pdf',
			file_name='reroute-wait.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Printing',
			time_submitted=timezone.now() - timedelta(minutes=1),
			printer_assigned=failed_printer,
		)

		with patch('portal.views._cancel_cups_job', return_value=None), \
			 patch('portal.views._schedule_queue_check', return_value=None):
			reroute_document_on_error(document, failed_printer=failed_printer, failed_job_id='job-123')

		busy_doc.refresh_from_db()
		document.refresh_from_db()

		self.assertEqual(busy_doc.doc_status, 'Printing')
		self.assertEqual(document.doc_status, 'Queued')
		self.assertIsNone(document.printer_assigned_id)
		self.assertEqual(document.queue_priority, Document.QueuePriority.REROUTE)
		self.assertIsNotNone(document.queued_at)
