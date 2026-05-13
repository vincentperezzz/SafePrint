from django.core.management.base import BaseCommand
from django.utils import timezone
from portal.models import Printer
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


class Command(BaseCommand):
    help = 'Poll SNMP for printer status, model, and node name every 3 seconds until successful, then save to database.'

    STATUS_RETRY_LIMIT = 3
    RETRY_DELAY_SECONDS = 1
    OFFLINE_GRACE_PERIOD = timedelta(seconds=15)

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

        # Always get fresh data from the database to respect deletions
        printers = Printer.objects.all()
        self.stdout.write(self.style.NOTICE(f"Found {len(printers)} printers in database"))
        
        for printer in printers:
            # Re-check if printer still exists before polling
            try:
                # Refresh printer object to make sure it still exists
                printer = Printer.objects.get(id=printer.id)
                ip_address = printer.ip_address
                self.stdout.write(self.style.NOTICE(f"Polling printer at IP: {ip_address}"))
            except Printer.DoesNotExist:
                self.stdout.write(self.style.WARNING(f"Printer ID {printer.id} no longer exists in database. Skipping."))
                continue

            # Capture previous state for transition-based alerts
            prev_status = printer.printer_status
            prev_ink = printer.ink_status
            prev_tray = printer.tray_level

            status_failures = 0
            while True:
                base_details = _snmpget_many(ip_address, [status_oid, model_oid, node_oid])
                status = base_details[0] if len(base_details) > 0 else None
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
                        break

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
                    break

                status_failures = 0
                model = base_details[1] if len(base_details) > 1 else None
                node = base_details[2] if len(base_details) > 2 else None
                status_val = _normalize_status(_extract_value(status), prev_status)
                model_val = _extract_value(model) or printer.model_name or ''
                node_val = _extract_value(node) or printer.node_name or ''

                try:
                    current_printer = Printer.objects.get(id=printer.id)
                    current_printer.printer_status = status_val
                    current_printer.model_name = model_val
                    current_printer.node_name = node_val
                    current_printer.last_checked = timezone.now()
                    current_printer.save(update_fields=['printer_status', 'model_name', 'node_name', 'last_checked'])
                    printer = current_printer
                except Printer.DoesNotExist:
                    self.stdout.write(self.style.WARNING(f"Printer ID {printer.id} no longer exists in database. Skipping update."))
                    break

                # Poll ink levels and low thresholds
                ink_levels = []
                ink_lows = []
                ink_ok = True
                ink_low_indices = []
                ink_level_values = _snmpget_many(ip_address, ink_level_oids)
                ink_low_values = _snmpget_many(ip_address, ink_low_oids)
                for idx in range(4):
                    try:
                        ink_level_raw = ink_level_values[idx] if idx < len(ink_level_values) else None
                        ink_low_raw = ink_low_values[idx] if idx < len(ink_low_values) else None
                        ink_level = _extract_int(ink_level_raw)
                        ink_low = _extract_int(ink_low_raw)
                        ink_levels.append(ink_level)
                        ink_lows.append(ink_low)
                        # Color mapping: 0=black, 1=yellow, 2=cyan, 3=magenta
                        color_names = ['b', 'y', 'c', 'm']
                        if ink_level is not None and ink_low is not None and ink_level <= ink_low:
                            ink_ok = False
                            ink_low_indices.append(color_names[idx])
                    except Exception:
                        # If polling fails, treat as not low
                        ink_levels.append(None)
                        ink_lows.append(None)

                if status:
                    self.stdout.write(self.style.SUCCESS(f"Status: {status_val}"))
                    self.stdout.write(self.style.SUCCESS(f"Model: {model_val}"))
                    self.stdout.write(self.style.SUCCESS(f"Node: {node_val}"))
                    # Ink status: 'OK' if all OK, else concatenated color codes of low ink (e.g., 'bc')
                    ink_status = 'OK' if ink_ok else ''.join(ink_low_indices)
                    # Check if printer still exists in database before updating
                    try:
                        current_printer = Printer.objects.get(id=printer.id)
                        current_printer.ink_status = ink_status
                        current_printer.last_checked = timezone.now()
                        current_printer.save(update_fields=['ink_status', 'last_checked'])
                        self.stdout.write(self.style.SUCCESS(f"Printer info updated in database for {ip_address}. Ink status: {ink_status}"))
                        # Log status change to PrinterStatusLog
                        if status_val != prev_status or ink_status != prev_ink or current_printer.tray_level != prev_tray:
                            try:
                                from portal.models import PrinterStatusLog
                                PrinterStatusLog.objects.create(
                                    printer=current_printer,
                                    status=status_val,
                                    ink_status=ink_status,
                                    paper_level=current_printer.tray_level or '',
                                )
                            except Exception:
                                pass
                        # Alert on ink transitioning from OK to low
                        if ink_status != 'OK' and prev_ink == 'OK':
                            from portal.services.email_notify import alert_ink_low
                            _send_alert_safe(alert_ink_low, current_printer.printer_name, ink_status)
                        # Alert on paper tray transitioning to needs refill/low
                        if current_printer.tray_level in ('Needs Refill', 'Low') and prev_tray not in ('Needs Refill', 'Low'):
                            from portal.services.email_notify import alert_paper_refill
                            _send_alert_safe(alert_paper_refill, current_printer.printer_name, current_printer.tray_level)
                    except Printer.DoesNotExist:
                        self.stdout.write(self.style.WARNING(f"Printer ID {printer.id} no longer exists in database. Skipping update."))
                    break
                else:
                    self.stdout.write(self.style.WARNING(f"SNMP poll failed for {ip_address}, retrying in 3 seconds..."))
                    time.sleep(3)

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
