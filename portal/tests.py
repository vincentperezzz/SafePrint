import json
import os
import tempfile
from decimal import Decimal
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from portal.models import Document, Payment, Printer, RerouteHistory, SupportTicket, TicketAuditLog, VoucherCredit
from portal.views import (
	_calculate_unprinted_refund_amount,
	_claim_next_queued_document_for_printer,
	_cancel_document_with_auto_voucher,
	_cancel_cups_job,
	CUPS_DISABLED_PRINTER_STATUS,
	_iter_document_print_jobs,
	_resolve_cups_queue_name,
	assign_document_to_printer,
	check_queued_documents,
	customer_documents_event_stream,
	print_page,
	QueueResolutionError,
	reroute_document_on_error,
	select_printer_for_document,
)


class PrintCompletionFallbackTests(TestCase):
	def test_multiple_copies_are_scheduled_copy_by_copy(self):
		document = Document.objects.create(
			doc_id='DOC-COPY-ORDER-1',
			customer_id='CID-COPY-ORDER',
			filename='copy-order.pdf',
			num_copies=2,
			pages_num='1-2',
			orientation='Portrait',
			color_mode='Color',
			paper_size='A4',
			paper_quality='70',
			original_name='copy-order.pdf',
			stored_name='copy-order.pdf',
			file_name='copy-order.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Printing',
			time_submitted=timezone.now(),
		)

		jobs = list(_iter_document_print_jobs(document))

		self.assertEqual(jobs, [
			(2, 1, 2),
			(1, 1, 2),
			(2, 2, 2),
			(1, 2, 2),
		])

	def test_partial_copy_progress_preserves_only_unprinted_sides(self):
		document = Document.objects.create(
			doc_id='DOC-COPY-PROGRESS-1',
			customer_id='CID-COPY-PROGRESS',
			filename='copy-progress.pdf',
			num_copies=4,
			pages_num='1-2',
			orientation='Portrait',
			color_mode='Color',
			paper_size='A4',
			paper_quality='70',
			original_name='copy-progress.pdf',
			stored_name='copy-progress.pdf',
			file_name='copy-progress.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Printing',
			time_submitted=timezone.now(),
		)

		document.mark_print_job_completed(2, 1)
		document.mark_print_job_completed(1, 1)
		document.mark_print_job_completed(2, 2)
		document.refresh_from_db()

		self.assertEqual(document.get_printed_sides_count(), 3)
		self.assertEqual(document.pages_printed, [])
		self.assertEqual(list(_iter_document_print_jobs(document)), [
			(1, 2, 4),
			(2, 3, 4),
			(1, 3, 4),
			(2, 4, 4),
			(1, 4, 4),
		])

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
					 patch('portal.views._get_cups_printer_state', return_value='idle'), \
					 patch('portal.views.subprocess.run', return_value=SimpleNamespace(stdout='request id is printer_queue-42 (1 file(s))\n', stderr='')), \
					 patch('portal.views._get_cups_job_state', side_effect=['pending', 'unknown', 'unknown', 'unknown']), \
					 patch('portal.views.time.sleep', return_value=None), \
					 patch('portal.views.Printer.refresh_from_db', autospec=True, side_effect=fake_printer_refresh):
					print_page(document, 1)

				document.refresh_from_db()
				self.assertEqual(document.pages_printed, [1])
				self.assertEqual(document.doc_status, 'Finished')
				self.assertEqual(document.printed_at_id, printer.id)
				self.assertTrue(
					RerouteHistory.objects.filter(document=document, status='Printed page 1', printer=printer).exists()
				)

	@override_settings(MEDIA_ROOT='/tmp/safeprint-test-media')
	def test_logs_copy_specific_confirmation_history_for_partial_multi_copy_progress(self):
		with tempfile.TemporaryDirectory(prefix='safeprint-media-') as media_root:
			with self.settings(MEDIA_ROOT=media_root):
				uploads_dir = os.path.join(media_root, 'uploads', 'CID-TEST')
				os.makedirs(uploads_dir, exist_ok=True)
				file_path = os.path.join(uploads_dir, 'copy-progress.pdf')
				with open(file_path, 'wb') as handle:
					handle.write(b'%PDF-1.4\n% test\n')

				printer = Printer.objects.create(
					printer_name='Printer Copy Progress',
					model_name='Brother',
					printer_status='Ready',
					paper_assigned='A4',
					tray_level='Full',
					last_checked=timezone.now(),
					ip_address='192.168.0.57',
				)

				document = Document.objects.create(
					doc_id='DOC-COPY-PROGRESS-PRINT-1',
					customer_id='CID-TEST',
					filename='copy-progress.pdf',
					num_copies=2,
					pages_num='1',
					orientation='Portrait',
					color_mode='Color',
					paper_size='A4',
					paper_quality='70',
					original_name='copy-progress.pdf',
					stored_name='copy-progress.pdf',
					file_name='copy-progress.pdf',
					file_type='pdf',
					file_size=16,
					doc_status='Printing',
					time_submitted=timezone.now() - timedelta(seconds=5),
					printer_assigned=printer,
				)

				with patch('portal.views._resolve_cups_queue_name', return_value='printer_queue'), \
					 patch('portal.views._get_cups_printer_state', return_value='idle'), \
					 patch('portal.views.subprocess.run', return_value=SimpleNamespace(stdout='request id is printer_queue-42 (1 file(s))\n', stderr='')), \
					 patch('portal.views._get_cups_job_state', side_effect=['pending', 'completed']), \
					 patch('portal.views.time.sleep', return_value=None):
					print_page(document, 1, copy_index=1, total_copies=2)

				document.refresh_from_db()
				self.assertTrue(document.is_print_job_completed(1, 1))
				self.assertFalse(document.is_print_job_completed(1, 2))
				self.assertEqual(document.pages_printed, [])
				self.assertTrue(
					RerouteHistory.objects.filter(
						document=document,
						printer=printer,
						status='Printed page 1 copy 1/2',
					).exists()
				)

	@override_settings(MEDIA_ROOT='/tmp/safeprint-test-media')
	def test_reroutes_pending_sleep_job_before_global_timeout(self):
		with tempfile.TemporaryDirectory(prefix='safeprint-media-') as media_root:
			with self.settings(MEDIA_ROOT=media_root):
				uploads_dir = os.path.join(media_root, 'uploads', 'CID-TEST')
				os.makedirs(uploads_dir, exist_ok=True)
				file_path = os.path.join(uploads_dir, 'sleep-stall.pdf')
				with open(file_path, 'wb') as handle:
					handle.write(b'%PDF-1.4\n% test\n')

				printer = Printer.objects.create(
					printer_name='Printer Sleep Stall',
					model_name='Brother',
					printer_status='Sleep',
					paper_assigned='A4',
					tray_level='Full',
					last_checked=timezone.now(),
					ip_address='192.168.0.56',
				)

				document = Document.objects.create(
					doc_id='DOC-SLEEP-STALL-1',
					customer_id='CID-TEST',
					filename='sleep-stall.pdf',
					num_copies=1,
					pages_num='1',
					orientation='Portrait',
					color_mode='Color',
					paper_size='A4',
					paper_quality='70',
					original_name='sleep-stall.pdf',
					stored_name='sleep-stall.pdf',
					file_name='sleep-stall.pdf',
					file_type='pdf',
					file_size=16,
					doc_status='Printing',
					time_submitted=timezone.now() - timedelta(seconds=5),
					printer_assigned=printer,
				)

				with patch('portal.views._resolve_cups_queue_name', return_value='printer_queue'), \
					 patch('portal.views._get_cups_printer_state', return_value='unknown'), \
					 patch('portal.views.subprocess.run', return_value=SimpleNamespace(stdout='request id is printer_queue-42 (1 file(s))\n', stderr='')), \
					 patch('portal.views._get_cups_job_state', side_effect=lambda job_id: 'pending') as cups_state_mock, \
					 patch('portal.views.time.sleep', return_value=None), \
					 patch('portal.views.reroute_document_on_error') as reroute_mock:
					print_page(document, 1)

				route_entry = RerouteHistory.objects.filter(document=document).latest('timestamp')
				self.assertTrue(route_entry.status.startswith('Stalled: printer=Sleep, cups=pending, queue=unknown'))
				reroute_mock.assert_called_once()
				self.assertLess(cups_state_mock.call_count, 30)

	@override_settings(MEDIA_ROOT='/tmp/safeprint-test-media')
	def test_unresolved_queue_mapping_reroutes_without_marking_printer_error(self):
		with tempfile.TemporaryDirectory(prefix='safeprint-media-') as media_root:
			with self.settings(MEDIA_ROOT=media_root):
				uploads_dir = os.path.join(media_root, 'uploads', 'CID-TEST')
				os.makedirs(uploads_dir, exist_ok=True)
				file_path = os.path.join(uploads_dir, 'queue-error.pdf')
				with open(file_path, 'wb') as handle:
					handle.write(b'%PDF-1.4\n% test\n')

				printer = Printer.objects.create(
					printer_name='Printer Queue Error',
					model_name='Brother DCP-T430W',
					node_name='BRW44F79F1A71F1',
					printer_status='Ready',
					last_checked=timezone.now(),
					ip_address='192.168.0.55',
				)

				document = Document.objects.create(
					doc_id='DOC-QUEUE-ERROR-1',
					customer_id='CID-TEST',
					filename='queue-error.pdf',
					num_copies=1,
					pages_num='1',
					orientation='Portrait',
					color_mode='Color',
					paper_size='A4',
					paper_quality='70',
					original_name='queue-error.pdf',
					stored_name='queue-error.pdf',
					file_name='queue-error.pdf',
					file_type='pdf',
					file_size=16,
					doc_status='Printing',
					time_submitted=timezone.now() - timedelta(seconds=5),
					printer_assigned=printer,
				)

				with patch('portal.views._get_cups_destinations', return_value=set()), \
					 patch('portal.views.reroute_document_on_error') as reroute_mock:
					print_page(document, 1)

				printer.refresh_from_db()
				latest_history = RerouteHistory.objects.filter(document=document).latest('timestamp')

				self.assertEqual(printer.printer_status, 'Ready')
				reroute_mock.assert_called_once()
				self.assertEqual(latest_history.status, 'Error: Queue map unresolved')


class QueueResolutionTests(TestCase):
	def test_resolver_uses_specific_queue_for_each_node(self):
		printer_one = Printer.objects.create(
			printer_name='Printer 2',
			model_name='Brother DCP-T430W',
			node_name='BRW44F79F1A6F27',
			printer_status='Ready',
			paper_assigned='Letter',
			last_checked=timezone.now(),
			ip_address='192.168.0.102',
		)

		printer_two = Printer.objects.create(
			printer_name='Printer 3',
			model_name='Brother DCP-T430W',
			node_name='BRWF44EB475AC2A',
			printer_status='Ready',
			paper_assigned='Letter',
			last_checked=timezone.now(),
			ip_address='192.168.0.103',
		)

		with patch(
			'portal.views._get_cups_destinations',
			return_value={
				'Brother_DCP_T430W_44f79f1a6f27',
				'Brother_DCP_T430W_f44eb475ac2a',
			},
		):
			self.assertEqual(
				_resolve_cups_queue_name(printer_one),
				'Brother_DCP_T430W_44f79f1a6f27',
			)
			self.assertEqual(
				_resolve_cups_queue_name(printer_two),
				'Brother_DCP_T430W_f44eb475ac2a',
			)

	def test_resolver_rejects_shared_base_queue_when_node_specific_missing(self):
		printer = Printer.objects.create(
			printer_name='Printer 4',
			model_name='Brother DCP-T430W',
			node_name='BRW44F79F1A71F1',
			printer_status='Ready',
			paper_assigned='A4',
			last_checked=timezone.now(),
			ip_address='192.168.0.104',
		)

		with patch('portal.views._get_cups_destinations', return_value={'Brother_DCP_T430W'}):
			with self.assertRaises(QueueResolutionError):
				_resolve_cups_queue_name(printer)

	def test_assignment_skips_printer_with_unresolved_queue(self):
		document = Document.objects.create(
			doc_id='DOC-QUEUE-RESOLUTION-1',
			customer_id='CID-QUEUE-RESOLUTION',
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

		Printer.objects.create(
			printer_name='Unresolved A4',
			model_name='Brother DCP-T430W',
			node_name='BRW44F79F1A71F1',
			printer_status='Ready',
			paper_assigned='A4',
			tray_level='Full',
			last_checked=timezone.now(),
			ip_address='192.168.0.104',
		)

		healthy_printer = Printer.objects.create(
			printer_name='Healthy A4',
			model_name='Brother DCP-T430W',
			node_name='BRWF44EB475AC2A',
			printer_status='Ready',
			paper_assigned='A4',
			tray_level='Full',
			last_checked=timezone.now(),
			ip_address='192.168.0.105',
		)

		with patch('portal.views._get_cups_destinations', return_value={'Brother_DCP_T430W_f44eb475ac2a'}), \
			 patch('portal.views._get_cups_printer_state', return_value='idle'):
			assigned = assign_document_to_printer(document, wait_for_availability=False)

		document.refresh_from_db()
		self.assertEqual(assigned.id, healthy_printer.id)
		self.assertEqual(document.printer_assigned_id, healthy_printer.id)

	def test_assignment_skips_printer_with_stopped_cups_queue(self):
		document = Document.objects.create(
			doc_id='DOC-QUEUE-STOPPED-1',
			customer_id='CID-QUEUE-STOPPED',
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

		stopped_printer = Printer.objects.create(
			printer_name='Stopped Queue Printer',
			model_name='Brother DCP-T430W',
			node_name='BRW44F79F1A71F1',
			printer_status='Ready',
			paper_assigned='A4',
			tray_level='Full',
			last_checked=timezone.now(),
			ip_address='192.168.0.106',
		)

		healthy_printer = Printer.objects.create(
			printer_name='Healthy Queue Printer',
			model_name='Brother DCP-T430W',
			node_name='BRWF44EB475AC2A',
			printer_status='Ready',
			paper_assigned='A4',
			tray_level='Full',
			last_checked=timezone.now(),
			ip_address='192.168.0.107',
		)

		with patch(
			'portal.views._get_cups_destinations',
			return_value={
				'Brother_DCP_T430W_44f79f1a71f1',
				'Brother_DCP_T430W_f44eb475ac2a',
			},
		), patch(
			'portal.views._get_cups_printer_state',
			side_effect=lambda queue_name: 'stopped' if queue_name == 'Brother_DCP_T430W_44f79f1a71f1' else 'idle',
		):
			assigned = assign_document_to_printer(document, wait_for_availability=False)

		document.refresh_from_db()
		self.assertEqual(assigned.id, healthy_printer.id)
		self.assertEqual(document.printer_assigned_id, healthy_printer.id)
		self.assertNotEqual(document.printer_assigned_id, stopped_printer.id)


class CupsStatusGateTests(TestCase):
	def test_keeps_cups_disabled_status_until_cups_confirms_recovery(self):
		from portal.management.commands.poll_printer_snmp import _apply_cups_status_gate

		printer = Printer.objects.create(
			printer_name='Poller Printer',
			model_name='Brother DCP-T430W',
			node_name='BRW44F79F1A71F1',
			printer_status='Ready',
			paper_assigned='A4',
			tray_level='Full',
			last_checked=timezone.now(),
			ip_address='192.168.0.108',
		)

		with patch(
			'portal.management.commands.poll_printer_snmp._get_cups_queue_state_snapshot',
			return_value=('Brother_DCP_T430W_44f79f1a71f1', 'stopped'),
		):
			self.assertEqual(
				_apply_cups_status_gate(printer, 'Ready', 'Ready'),
				CUPS_DISABLED_PRINTER_STATUS,
			)

		with patch(
			'portal.management.commands.poll_printer_snmp._get_cups_queue_state_snapshot',
			return_value=('Brother_DCP_T430W_44f79f1a71f1', 'unknown'),
		):
			self.assertEqual(
				_apply_cups_status_gate(printer, 'Ready', CUPS_DISABLED_PRINTER_STATUS),
				CUPS_DISABLED_PRINTER_STATUS,
			)

		with patch(
			'portal.management.commands.poll_printer_snmp._get_cups_queue_state_snapshot',
			return_value=('Brother_DCP_T430W_44f79f1a71f1', 'idle'),
		):
			self.assertEqual(
				_apply_cups_status_gate(printer, 'Ready', CUPS_DISABLED_PRINTER_STATUS),
				'Ready',
			)


class CustomerDocumentsStreamTests(TestCase):
	def test_stream_reports_current_rerouted_printer(self):
		old_printer = Printer.objects.create(
			printer_name='Printer 2',
			model_name='Brother DCP-T430W',
			printer_status='Ready',
			paper_assigned='Letter',
			last_checked=timezone.now(),
			ip_address='192.168.0.102',
		)

		new_printer = Printer.objects.create(
			printer_name='Printer 3',
			model_name='Brother DCP-T430W',
			printer_status='Ready',
			paper_assigned='Letter',
			last_checked=timezone.now(),
			ip_address='192.168.0.103',
		)

		document = Document.objects.create(
			doc_id='DOC-SSE-REROUTE-1',
			customer_id='CID-SSE-REROUTE',
			filename='reroute.pdf',
			num_copies=1,
			pages_num='1-2',
			orientation='Portrait',
			color_mode='Color',
			paper_size='Letter',
			paper_quality='70',
			original_name='reroute.pdf',
			stored_name='reroute.pdf',
			file_name='reroute.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Printing',
			time_submitted=timezone.now() - timedelta(seconds=5),
			printer_assigned=new_printer,
		)

		RerouteHistory.objects.create(document=document, printer=old_printer, status='Assigned')
		RerouteHistory.objects.create(document=document, printer=old_printer, status='Error: Ready')
		RerouteHistory.objects.create(document=document, printer=new_printer, status='Assigned')
		RerouteHistory.objects.create(document=document, printer=new_printer, status='Rerouted')

		generator = customer_documents_event_stream(document.customer_id)
		payload = next(generator)
		generator.close()

		data = json.loads(payload.replace('data: ', '', 1).strip())
		doc_payload = data['documents'][0]

		self.assertEqual(doc_payload['printer_name'], new_printer.printer_name)
		self.assertEqual(doc_payload['reroute_history'][-1]['printer_name'], new_printer.printer_name)
		self.assertEqual(doc_payload['reroute_history'][-1]['status'], 'Rerouted')

	def test_stream_reports_side_level_progress_for_multi_copy_jobs(self):
		printer = Printer.objects.create(
			printer_name='Printer Progress',
			model_name='Brother DCP-T430W',
			printer_status='Printing',
			paper_assigned='A4',
			last_checked=timezone.now(),
			ip_address='192.168.0.140',
		)

		document = Document.objects.create(
			doc_id='DOC-SSE-PROGRESS-1',
			customer_id='CID-SSE-PROGRESS',
			filename='progress.pdf',
			num_copies=4,
			pages_num='1-2',
			orientation='Portrait',
			color_mode='Color',
			paper_size='A4',
			paper_quality='70',
			original_name='progress.pdf',
			stored_name='progress.pdf',
			file_name='progress.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Printing',
			time_submitted=timezone.now() - timedelta(seconds=5),
			printer_assigned=printer,
		)

		document.mark_print_job_completed(2, 1)
		document.mark_print_job_completed(1, 1)
		document.mark_print_job_completed(2, 2)

		generator = customer_documents_event_stream(document.customer_id)
		payload = next(generator)
		generator.close()

		data = json.loads(payload.replace('data: ', '', 1).strip())
		doc_payload = data['documents'][0]

		self.assertEqual(doc_payload['printed_sides'], 3)
		self.assertEqual(doc_payload['total_sides'], 8)
		self.assertEqual(doc_payload['remaining_sides'], 5)
		self.assertEqual(doc_payload['pages_printed'], [])

	def test_stream_reports_auto_voucher_amount_for_cancelled_document(self):
		document = Document.objects.create(
			doc_id='DOC-SSE-VOUCHER-AMOUNT-1',
			customer_id='CID-SSE-VOUCHER-AMOUNT',
			filename='voucher.pdf',
			num_copies=1,
			pages_num='1-2',
			orientation='Portrait',
			color_mode='Color',
			paper_size='Letter',
			paper_quality='70',
			original_name='voucher.pdf',
			stored_name='voucher.pdf',
			file_name='voucher.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Cancelled',
			time_submitted=timezone.now() - timedelta(seconds=5),
		)

		RerouteHistory.objects.create(
			document=document,
			printer=None,
			status='Error: Letter Auto voucher ABC12345 ₱1.00',
			timestamp=timezone.now(),
		)

		generator = customer_documents_event_stream(document.customer_id)
		payload = next(generator)
		generator.close()

		data = json.loads(payload.replace('data: ', '', 1).strip())
		doc_payload = data['documents'][0]

		self.assertEqual(doc_payload['auto_voucher_code'], 'ABC12345')
		self.assertEqual(doc_payload['auto_voucher_amount'], '1.00')


class MultiCopyRerouteAndRefundTests(TestCase):
	def test_reroute_only_resubmits_unprinted_sides_for_multi_copy_job(self):
		failed_printer = Printer.objects.create(
			printer_name='Failed Printer',
			model_name='Brother',
			printer_status='Error',
			paper_assigned='A4',
			tray_level='Full',
			last_checked=timezone.now(),
			ip_address='192.168.0.150',
		)

		replacement_printer = Printer.objects.create(
			printer_name='Replacement Printer',
			model_name='Brother',
			printer_status='Ready',
			paper_assigned='A4',
			tray_level='Full',
			last_checked=timezone.now(),
			ip_address='192.168.0.151',
		)

		document = Document.objects.create(
			doc_id='DOC-REROUTE-MULTI-1',
			customer_id='CID-REROUTE-MULTI',
			filename='reroute-multi.pdf',
			num_copies=4,
			pages_num='1-2',
			orientation='Portrait',
			color_mode='Color',
			paper_size='A4',
			paper_quality='70',
			original_name='reroute-multi.pdf',
			stored_name='reroute-multi.pdf',
			file_name='reroute-multi.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Printing',
			time_submitted=timezone.now() - timedelta(seconds=5),
			printer_assigned=failed_printer,
		)

		document.mark_print_job_completed(2, 1)
		document.mark_print_job_completed(1, 1)
		document.mark_print_job_completed(2, 2)

		recorded_jobs = []

		with patch('portal.views._cancel_cups_job', return_value=True), \
			 patch('portal.views._schedule_queue_check', return_value=None), \
			 patch('portal.views._available_printers_for_document', return_value=[replacement_printer]), \
			 patch('portal.views.assign_document_to_printer', return_value=replacement_printer), \
			 patch('portal.views._finish_document_if_complete', return_value=False), \
			 patch('portal.views.print_page', side_effect=lambda doc, page_num, *, copy_index=1, total_copies=1: recorded_jobs.append((page_num, copy_index, total_copies))):
			reroute_document_on_error(document, failed_printer=failed_printer, failed_job_id='job-123')

		self.assertEqual(recorded_jobs, [
			(1, 2, 4),
			(2, 3, 4),
			(1, 3, 4),
			(2, 4, 4),
			(1, 4, 4),
		])

	def test_unprinted_refund_amount_uses_remaining_sides_for_multi_copy_jobs(self):
		document = Document.objects.create(
			doc_id='DOC-REFUND-MULTI-1',
			customer_id='CID-REFUND-MULTI',
			filename='refund-multi.pdf',
			num_copies=4,
			pages_num='1-2',
			orientation='Portrait',
			color_mode='Color',
			paper_size='A4',
			paper_quality='70',
			original_name='refund-multi.pdf',
			stored_name='refund-multi.pdf',
			file_name='refund-multi.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Printing',
			time_submitted=timezone.now() - timedelta(seconds=5),
		)

		Payment.objects.create(
			doc=document,
			price=Decimal('8.00'),
			payment_status='Paid',
		)

		for page_num, copy_index in [
			(2, 1),
			(1, 1),
			(2, 2),
			(1, 2),
			(2, 3),
			(1, 3),
			(2, 4),
		]:
			document.mark_print_job_completed(page_num, copy_index)

		self.assertEqual(document.get_printed_sides_count(), 7)
		self.assertEqual(len(document.get_remaining_print_jobs()), 1)
		self.assertEqual(_calculate_unprinted_refund_amount(document), Decimal('1.00'))

	def test_reroute_cancels_last_remaining_page_when_other_printer_tray_is_not_detected(self):
		failed_printer = Printer.objects.create(
			printer_name='Failed Letter Printer',
			model_name='Brother',
			printer_status='No Paper Fed [Tray 1]',
			paper_assigned='Letter',
			tray_level='Full',
			last_checked=timezone.now(),
			ip_address='192.168.0.160',
		)

		other_faulted_printer = Printer.objects.create(
			printer_name='Tray Missing Printer',
			model_name='Brother',
			printer_status='Paper Tray 1 not detected',
			paper_assigned='Letter',
			tray_level='Full',
			last_checked=timezone.now(),
			ip_address='192.168.0.161',
		)

		document = Document.objects.create(
			doc_id='DOC-LAST-PAGE-AUTO-VOUCHER-1',
			customer_id='CID-LAST-PAGE-AUTO-VOUCHER',
			filename='last-page.pdf',
			num_copies=1,
			pages_num='1-2',
			orientation='Portrait',
			color_mode='Color',
			paper_size='Letter',
			paper_quality='70',
			original_name='last-page.pdf',
			stored_name='last-page.pdf',
			file_name='last-page.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Printing',
			time_submitted=timezone.now() - timedelta(minutes=1),
			printer_assigned=failed_printer,
		)

		Payment.objects.create(
			doc=document,
			price=Decimal('8.00'),
			payment_status='Paid',
		)

		document.mark_print_job_completed(2, 1)

		with patch('portal.views._cancel_cups_job', return_value=None), \
			 patch('portal.views._schedule_queue_check', return_value=None):
			reroute_document_on_error(document, failed_printer=failed_printer, failed_job_id='job-last-page')

		document.refresh_from_db()
		latest_history = RerouteHistory.objects.filter(document=document).latest('timestamp')
		voucher = VoucherCredit.objects.get(last_customer_id=document.customer_id)

		self.assertEqual(document.doc_status, 'Cancelled')
		self.assertIsNone(document.printer_assigned_id)
		self.assertEqual(voucher.remaining_balance, Decimal('4.00'))
		self.assertIn('₱4.00', latest_history.status)
		self.assertIn('Auto voucher', latest_history.status)


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
		self.assertLessEqual(len(latest_history.status), 50)

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
		self.assertLessEqual(len(latest_history.status), 50)

	def test_auto_voucher_creation_is_idempotent_for_same_document(self):
		document = Document.objects.create(
			doc_id='DOC-AUTO-VOUCHER-IDEMPOTENT',
			customer_id='CID-AUTO-VOUCHER-IDEMPOTENT',
			filename='idempotent.pdf',
			num_copies=1,
			pages_num='1',
			orientation='Portrait',
			color_mode='Color',
			paper_size='A4',
			paper_quality='70',
			original_name='idempotent.pdf',
			stored_name='idempotent.pdf',
			file_name='idempotent.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Queued',
			time_submitted=timezone.now() - timedelta(seconds=5),
		)

		Payment.objects.create(
			doc=document,
			price=Decimal('3.00'),
			payment_status='Paid',
		)

		_cancel_document_with_auto_voucher(document, reason='No eligible printer remains after failures.')
		document.refresh_from_db()
		first_voucher = VoucherCredit.objects.get(last_customer_id=document.customer_id)

		_cancel_document_with_auto_voucher(document, reason='No eligible printer remains after failures.')

		vouchers = list(VoucherCredit.objects.filter(last_customer_id=document.customer_id).order_by('created_at'))
		self.assertEqual(len(vouchers), 1)
		self.assertEqual(vouchers[0].code, first_voucher.code)

	def test_acknowledge_cancelled_voucher_creates_single_auto_ticket_for_cancelled_transaction(self):
		first_doc = Document.objects.create(
			doc_id='DOC-CANCELLED-TICKET-1',
			customer_id='CID-CANCELLED-TICKET',
			filename='first.pdf',
			num_copies=1,
			pages_num='1',
			orientation='Portrait',
			color_mode='Color',
			paper_size='A4',
			paper_quality='70',
			original_name='first.pdf',
			stored_name='first.pdf',
			file_name='first.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Cancelled',
			time_submitted=timezone.now() - timedelta(minutes=2),
		)

		second_doc = Document.objects.create(
			doc_id='DOC-CANCELLED-TICKET-2',
			customer_id='CID-CANCELLED-TICKET',
			filename='second.pdf',
			num_copies=1,
			pages_num='1-2',
			orientation='Portrait',
			color_mode='Color',
			paper_size='A4',
			paper_quality='70',
			original_name='second.pdf',
			stored_name='second.pdf',
			file_name='second.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Cancelled',
			time_submitted=timezone.now() - timedelta(minutes=1),
		)

		Payment.objects.create(
			doc=first_doc,
			price=Decimal('12.00'),
			payment_status='Paid',
			phone_number='09171234567',
		)

		RerouteHistory.objects.create(
			document=first_doc,
			printer=None,
			status='Error: A4 no printer. Auto voucher VOUCHER1',
			timestamp=timezone.now() - timedelta(minutes=2),
		)
		RerouteHistory.objects.create(
			document=second_doc,
			printer=None,
			status='Error: A4 no printer. Auto voucher VOUCHER2',
			timestamp=timezone.now() - timedelta(minutes=1),
		)

		payload = {
			'customer_id': 'CID-CANCELLED-TICKET',
			'doc_ids': [first_doc.doc_id, second_doc.doc_id],
		}

		with patch('portal.services.email_notify.alert_new_ticket', return_value=None):
			first_response = self.client.post(
				'/api/acknowledge-cancelled-voucher/',
				data=json.dumps(payload),
				content_type='application/json',
			)
			second_response = self.client.post(
				'/api/acknowledge-cancelled-voucher/',
				data=json.dumps(payload),
				content_type='application/json',
			)

		self.assertEqual(first_response.status_code, 200)
		self.assertEqual(second_response.status_code, 200)

		first_data = first_response.json()
		second_data = second_response.json()

		self.assertTrue(first_data['success'])
		self.assertTrue(first_data['created'])
		self.assertTrue(second_data['success'])
		self.assertFalse(second_data['created'])
		self.assertEqual(first_data['deleted_count'], 2)
		self.assertEqual(second_data['deleted_count'], 0)

		ticket = SupportTicket.objects.get(customer_id='CID-CANCELLED-TICKET')
		payment = Payment.objects.get(customer_id_snapshot='CID-CANCELLED-TICKET')
		ticket.refresh_from_db()
		payment.refresh_from_db()

		self.assertEqual(Document.objects.filter(customer_id='CID-CANCELLED-TICKET').count(), 0)
		self.assertEqual(SupportTicket.objects.count(), 1)
		self.assertEqual(ticket.problem_type, 'no-print')
		self.assertEqual(ticket.status, 'open')
		self.assertIsNone(ticket.document)
		self.assertEqual(ticket.document_id_snapshot, first_doc.doc_id)
		self.assertEqual(ticket.phone_number, '09171234567')
		self.assertEqual(ticket.related_doc_ids, json.dumps([first_doc.doc_id, second_doc.doc_id]))
		self.assertIn('VOUCHER1', ticket.description)
		self.assertIn('VOUCHER2', ticket.description)
		self.assertIn(first_doc.doc_id, ticket.description)
		self.assertIn(second_doc.doc_id, ticket.description)
		self.assertIsNone(payment.doc)
		self.assertEqual(payment.doc_id_snapshot, first_doc.doc_id)
		self.assertEqual(payment.customer_id_snapshot, 'CID-CANCELLED-TICKET')
		self.assertEqual(TicketAuditLog.objects.filter(ticket=ticket, action='created').count(), 1)


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

	def test_reroute_stays_queued_when_only_printing_healthy_printer_remains(self):
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
			printer_status='Printing',
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

	def test_reroute_cancels_with_auto_voucher_when_no_healthy_printer_remains(self):
		failed_printer = Printer.objects.create(
			printer_name='Failed Printer',
			model_name='Brother',
			printer_status='Error',
			paper_assigned='A4',
			tray_level='Full',
			last_checked=timezone.now(),
			ip_address='192.168.0.78',
		)

		other_faulted_printer = Printer.objects.create(
			printer_name='Other Faulted Printer',
			model_name='Brother',
			printer_status='Offline',
			paper_assigned='A4',
			tray_level='Full',
			last_checked=timezone.now(),
			ip_address='192.168.0.79',
		)

		document = Document.objects.create(
			doc_id='DOC-REROUTE-CANCEL-1',
			customer_id='CID-REROUTE-CANCEL',
			filename='reroute-cancel.pdf',
			num_copies=1,
			pages_num='1',
			orientation='Portrait',
			color_mode='Color',
			paper_size='A4',
			paper_quality='70',
			original_name='reroute-cancel.pdf',
			stored_name='reroute-cancel.pdf',
			file_name='reroute-cancel.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Printing',
			time_submitted=timezone.now() - timedelta(minutes=1),
			printer_assigned=failed_printer,
		)

		Payment.objects.create(
			doc=document,
			price=Decimal('10.00'),
			payment_status='Paid',
		)

		with patch('portal.views._cancel_cups_job', return_value=None), \
			 patch('portal.views._schedule_queue_check', return_value=None):
			reroute_document_on_error(document, failed_printer=failed_printer, failed_job_id='job-456')

		document.refresh_from_db()
		latest_history = RerouteHistory.objects.filter(document=document).latest('timestamp')

		self.assertEqual(document.doc_status, 'Cancelled')
		self.assertIsNone(document.printer_assigned_id)
		self.assertIn('Auto voucher', latest_history.status)

	def test_queue_monitor_rechecks_quickly_when_queued_doc_still_waits(self):
		printer = Printer.objects.create(
			printer_name='Healthy But Excluded',
			model_name='Brother',
			printer_status='Ready',
			paper_assigned='A4',
			tray_level='Full',
			last_checked=timezone.now(),
			ip_address='192.168.0.80',
		)

		document = Document.objects.create(
			doc_id='DOC-QUEUE-RETRY-1',
			customer_id='CID-QUEUE-RETRY',
			filename='queue-retry.pdf',
			num_copies=1,
			pages_num='1',
			orientation='Portrait',
			color_mode='Color',
			paper_size='A4',
			paper_quality='70',
			original_name='queue-retry.pdf',
			stored_name='queue-retry.pdf',
			file_name='queue-retry.pdf',
			file_type='pdf',
			file_size=16,
			doc_status='Queued',
			queue_priority=Document.QueuePriority.REROUTE,
			queued_at=timezone.now() - timedelta(minutes=1),
			time_submitted=timezone.now() - timedelta(minutes=2),
		)

		RerouteHistory.objects.create(
			document=document,
			printer=printer,
			status='Error: Paper jam',
			timestamp=timezone.now() - timedelta(seconds=30),
		)

		with patch('portal.views._schedule_queue_check', return_value=None) as schedule_mock:
			check_queued_documents()

		document.refresh_from_db()
		self.assertEqual(document.doc_status, 'Queued')
		schedule_mock.assert_called_with(5.0)


class CupsCancellationTests(TestCase):
	def test_cancel_cups_job_escalates_to_cancel_x_when_job_remains_pending(self):
		results = [
			SimpleNamespace(returncode=0, stdout='', stderr=''),
			SimpleNamespace(returncode=0, stdout='', stderr=''),
		]

		with patch('portal.views.subprocess.run', side_effect=results) as run_mock, \
			 patch('portal.views._get_cups_job_state', side_effect=['pending', 'unknown']):
			cancelled = _cancel_cups_job('printer-42')

		self.assertTrue(cancelled)
		self.assertEqual(
			[call.args[0] for call in run_mock.call_args_list],
			[['cancel', 'printer-42'], ['cancel', '-x', 'printer-42']],
		)
