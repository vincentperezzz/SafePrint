from django.core.management.base import BaseCommand
from django.db import close_old_connections
from django.utils import timezone
from portal.models import Printer
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import timedelta
import time
import subprocess


def _send_alert_safe(func, *args, **kwargs):
    """Call an email alert function, catching any errors to avoid crashing the poller."""
    try:
        func(*args, **kwargs)
    except Exception:
        pass  # Email failure must never crash the polling loop


def _snmpget(ip_address, oid, *, timeout=2):
    try:
        return subprocess.check_output(
            ['snmpget', '-v2c', '-c', 'public', ip_address, oid],
            timeout=timeout,
        ).decode(errors='ignore').strip()
    except Exception:
        return None


def _snmpget_many(ip_address, oids, *, timeout=2):
    try:
        output = subprocess.check_output(
            ['snmpget', '-v2c', '-c', 'public', ip_address, *oids],
            timeout=timeout,
        ).decode(errors='ignore')
    except Exception:
        return []

    return [line.strip() for line in output.splitlines() if line.strip()]


def _extract_value(raw_value):
    import re

    if not raw_value:
        return None

    match = re.search(r'"(.*?)"', raw_value)
    return match.group(1).strip() if match else raw_value.strip()


def _extract_int(raw_value):
    import re

    if not raw_value:
        return None

    match = re.search(r'INTEGER: (-?\d+)', raw_value)
    return int(match.group(1)) if match else None


def _normalize_status(status_value, previous_status):
    status_value = (status_value or '').strip()
    if status_value == 'Please wait.':
        if previous_status in {'Ready', 'Sleep', 'Printing'}:
            return previous_status
        return 'Ready'
    return status_value


def _get_cups_queue_state_snapshot(printer, *, destinations=None):
    from portal.views import _get_cups_queue_state_for_polling

    return _get_cups_queue_state_for_polling(printer, destinations=destinations)


def _apply_cups_status_gate(printer, status_value, previous_status, *, destinations=None):
    from portal.views import CUPS_CONFIRMED_ENABLED_QUEUE_STATES, CUPS_DISABLED_PRINTER_STATUS, QueueResolutionError

    try:
        _, cups_state = _get_cups_queue_state_snapshot(printer, destinations=destinations)
    except QueueResolutionError:
        cups_state = 'unknown'

    if cups_state == 'stopped':
        return CUPS_DISABLED_PRINTER_STATUS

    if previous_status == CUPS_DISABLED_PRINTER_STATUS and cups_state not in CUPS_CONFIRMED_ENABLED_QUEUE_STATES:
        return CUPS_DISABLED_PRINTER_STATUS

    return status_value


class Command(BaseCommand):
    help = 'Poll SNMP printer state with a fast status path and slower detail refreshes.'

    MAX_WORKERS = 8
    STATUS_TIMEOUT_SECONDS = 0.75
    DETAIL_TIMEOUT_SECONDS = 1.5
    STATUS_RETRY_LIMIT = 2
    RETRY_DELAY_SECONDS = 0.25
    OFFLINE_GRACE_PERIOD = timedelta(seconds=10)

    def _should_refresh_static_details(self, printer):
        return not (printer.model_name and printer.node_name)

    def _should_refresh_ink_status(self, printer, *, previous_status, current_status):
        if current_status == 'Offline':
            return False
        if not (printer.ink_status or '').strip() or printer.ink_status == 'N/A':
            return True
        if previous_status != current_status:
            return True
        return False

    def _poll_printer(self, printer_id, *, status_oid, model_oid, node_oid, ink_level_oids, ink_low_oids):
        close_old_connections()
        try:
            try:
                printer = Printer.objects.get(id=printer_id)
                ip_address = printer.ip_address
                self.stdout.write(self.style.NOTICE(f"Polling printer at IP: {ip_address}"))
            except Printer.DoesNotExist:
                self.stdout.write(self.style.WARNING(f"Printer ID {printer_id} no longer exists in database. Skipping."))
                return

            prev_status = printer.printer_status
            prev_ink = printer.ink_status
            prev_tray = printer.tray_level
            cups_destinations = None

            try:
                from portal.views import _get_cups_destinations

                cups_destinations = _get_cups_destinations()
            except Exception:
                cups_destinations = None

            status_failures = 0
            while True:
                status = _snmpget(ip_address, status_oid, timeout=self.STATUS_TIMEOUT_SECONDS)
                if not status:
                    status_failures += 1
                    now = timezone.now()
                    recent_success_cutoff = now - self.OFFLINE_GRACE_PERIOD

                    if status_failures < self.STATUS_RETRY_LIMIT:
                        self.stdout.write(
                            self.style.WARNING(
                                f"SNMP status poll failed for {ip_address} "
                                f"({status_failures}/{self.STATUS_RETRY_LIMIT}). Retrying in {self.RETRY_DELAY_SECONDS} second..."
                            )
                        )
                        time.sleep(self.RETRY_DELAY_SECONDS)
                        continue

                    if printer.last_checked and printer.last_checked >= recent_success_cutoff:
                        self.stdout.write(
                            self.style.WARNING(
                                f"Transient SNMP status failure for {ip_address}; keeping previous status "
                                f"'{prev_status}' because the last successful poll was recent."
                            )
                        )
                        return

                    try:
                        current_printer = Printer.objects.get(id=printer.id)
                        current_printer.printer_status = 'Offline'
                        current_printer.last_checked = now
                        current_printer.save(update_fields=['printer_status', 'last_checked'])
                        self.stdout.write(self.style.WARNING(f"Printer at {ip_address} is Offline."))
                        if prev_status != 'Offline':
                            try:
                                from portal.models import PrinterStatusLog
                                PrinterStatusLog.objects.create(
                                    printer=current_printer,
                                    status='Offline',
                                    ink_status=current_printer.ink_status or '',
                                    paper_level=current_printer.tray_level or '',
                                )
                            except Exception:
                                pass
                            from portal.services.email_notify import alert_printer_offline
                            _send_alert_safe(alert_printer_offline, current_printer.printer_name, ip_address)
                        if current_printer.tray_level in ('Needs Refill', 'Low') and prev_tray not in ('Needs Refill', 'Low'):
                            from portal.services.email_notify import alert_paper_refill
                            _send_alert_safe(alert_paper_refill, current_printer.printer_name, current_printer.tray_level)
                    except Printer.DoesNotExist:
                        self.stdout.write(self.style.WARNING(f"Printer ID {printer.id} no longer exists in database. Skipping update."))
                    return

                status_failures = 0
                status_val = _normalize_status(_extract_value(status), prev_status)
                model_val = printer.model_name or ''
                node_val = printer.node_name or ''

                if self._should_refresh_static_details(printer):
                    static_details = _snmpget_many(
                        ip_address,
                        [model_oid, node_oid],
                        timeout=self.DETAIL_TIMEOUT_SECONDS,
                    )
                    model = static_details[0] if len(static_details) > 0 else None
                    node = static_details[1] if len(static_details) > 1 else None
                    model_val = _extract_value(model) or model_val
                    node_val = _extract_value(node) or node_val

                effective_status = _apply_cups_status_gate(
                    printer,
                    status_val,
                    prev_status,
                    destinations=cups_destinations,
                )

                try:
                    current_printer = Printer.objects.get(id=printer.id)
                    current_printer.printer_status = effective_status
                    current_printer.model_name = model_val
                    current_printer.node_name = node_val
                    current_printer.last_checked = timezone.now()
                    current_printer.save(update_fields=['printer_status', 'model_name', 'node_name', 'last_checked'])
                    printer = current_printer
                except Printer.DoesNotExist:
                    self.stdout.write(self.style.WARNING(f"Printer ID {printer.id} no longer exists in database. Skipping update."))
                    return

                self.stdout.write(self.style.SUCCESS(f"Status: {effective_status}"))
                self.stdout.write(self.style.SUCCESS(f"Model: {model_val}"))
                self.stdout.write(self.style.SUCCESS(f"Node: {node_val}"))
                ink_status = current_printer.ink_status or prev_ink or ''

                if self._should_refresh_ink_status(current_printer, previous_status=prev_status, current_status=status_val):
                    ink_levels = []
                    ink_lows = []
                    ink_ok = True
                    ink_low_indices = []
                    ink_level_values = _snmpget_many(
                        ip_address,
                        ink_level_oids,
                        timeout=self.DETAIL_TIMEOUT_SECONDS,
                    )
                    ink_low_values = _snmpget_many(
                        ip_address,
                        ink_low_oids,
                        timeout=self.DETAIL_TIMEOUT_SECONDS,
                    )
                    for idx in range(4):
                        try:
                            ink_level_raw = ink_level_values[idx] if idx < len(ink_level_values) else None
                            ink_low_raw = ink_low_values[idx] if idx < len(ink_low_values) else None
                            ink_level = _extract_int(ink_level_raw)
                            ink_low = _extract_int(ink_low_raw)
                            ink_levels.append(ink_level)
                            ink_lows.append(ink_low)
                            color_names = ['b', 'y', 'c', 'm']
                            if ink_level is not None and ink_low is not None and ink_level <= ink_low:
                                ink_ok = False
                                ink_low_indices.append(color_names[idx])
                        except Exception:
                            ink_levels.append(None)
                            ink_lows.append(None)

                    ink_status = 'OK' if ink_ok else ''.join(ink_low_indices)
                    if ink_status != current_printer.ink_status:
                        current_printer.ink_status = ink_status
                        current_printer.save(update_fields=['ink_status'])

                try:
                    current_printer = Printer.objects.get(id=printer.id)
                    self.stdout.write(self.style.SUCCESS(f"Printer info updated in database for {ip_address}. Ink status: {ink_status}"))
                    if effective_status != prev_status or ink_status != prev_ink or current_printer.tray_level != prev_tray:
                        try:
                            from portal.models import PrinterStatusLog
                            PrinterStatusLog.objects.create(
                                printer=current_printer,
                                status=effective_status,
                                ink_status=ink_status,
                                paper_level=current_printer.tray_level or '',
                            )
                        except Exception:
                            pass
                    if ink_status != 'OK' and prev_ink == 'OK':
                        from portal.services.email_notify import alert_ink_low
                        _send_alert_safe(alert_ink_low, current_printer.printer_name, ink_status)
                    if current_printer.tray_level in ('Needs Refill', 'Low') and prev_tray not in ('Needs Refill', 'Low'):
                        from portal.services.email_notify import alert_paper_refill
                        _send_alert_safe(alert_paper_refill, current_printer.printer_name, current_printer.tray_level)
                except Printer.DoesNotExist:
                    self.stdout.write(self.style.WARNING(f"Printer ID {printer.id} no longer exists in database. Skipping update."))
                return
        finally:
            close_old_connections()

    def handle(self, *args, **kwargs):
        status_oid = 'iso.3.6.1.2.1.43.18.1.1.8.1.1'
        model_oid = 'iso.3.6.1.2.1.25.3.2.1.3.1'
        node_oid = 'iso.3.6.1.2.1.1.5.0'
        # OIDs for ink levels and low thresholds
        ink_level_oids = [
            'iso.3.6.1.2.1.43.11.1.1.7.1.1', # Black
            'iso.3.6.1.2.1.43.11.1.1.7.1.2', # Yellow
            'iso.3.6.1.2.1.43.11.1.1.7.1.3', # Cyan
            'iso.3.6.1.2.1.43.11.1.1.7.1.4', # Magenta
        ]
        ink_low_oids = [
            'iso.3.6.1.2.1.43.11.1.1.8.1.1', # Black
            'iso.3.6.1.2.1.43.11.1.1.8.1.2', # Yellow
            'iso.3.6.1.2.1.43.11.1.1.8.1.3', # Cyan
            'iso.3.6.1.2.1.43.11.1.1.8.1.4', # Magenta
        ]

        printer_ids = list(Printer.objects.values_list('id', flat=True))
        self.stdout.write(self.style.NOTICE(f"Found {len(printer_ids)} printers in database"))

        if printer_ids:
            max_workers = min(self.MAX_WORKERS, len(printer_ids))
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = [
                    executor.submit(
                        self._poll_printer,
                        printer_id,
                        status_oid=status_oid,
                        model_oid=model_oid,
                        node_oid=node_oid,
                        ink_level_oids=ink_level_oids,
                        ink_low_oids=ink_low_oids,
                    )
                    for printer_id in printer_ids
                ]
                for future in as_completed(futures):
                    try:
                        future.result()
                    except Exception as exc:
                        self.stdout.write(self.style.ERROR(f"Printer polling worker failed: {exc}"))

        # Check for documents stuck in 'Printing' status for >10 minutes
        try:
            from portal.models import Document
            from datetime import timedelta
            stuck_threshold = timezone.now() - timedelta(minutes=10)
            stuck_docs = Document.objects.filter(
                doc_status='Printing',
                status_updated_at__lt=stuck_threshold
            )
            for doc in stuck_docs:
                printer_name = doc.printer_assigned.printer_name if doc.printer_assigned else 'Unknown'
                minutes_stuck = int((timezone.now() - doc.status_updated_at).total_seconds() / 60)
                from portal.services.email_notify import alert_document_stuck
                _send_alert_safe(alert_document_stuck, doc.doc_id, doc.customer_id, printer_name, minutes_stuck)
        except Exception:
            pass  # Don't crash the poller if stuck doc check fails
