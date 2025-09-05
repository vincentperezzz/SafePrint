from django.core.management.base import BaseCommand
from django.utils import timezone
from portal.models import Printer
import time
import subprocess

class Command(BaseCommand):
    help = 'Poll SNMP for printer status, model, and node name every 3 seconds until successful, then save to database.'

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
            offline = False
            while True:
                try:
                    status = subprocess.check_output([
                        'snmpget', '-v2c', '-c', 'public', ip_address, status_oid
                    ], timeout=2).decode(errors='ignore').strip()
                except Exception:
                    status = None
                    offline = True
                try:
                    model = subprocess.check_output([
                        'snmpget', '-v2c', '-c', 'public', ip_address, model_oid
                    ], timeout=2).decode(errors='ignore').strip()
                except Exception:
                    model = None
                    offline = True
                try:
                    node = subprocess.check_output([
                        'snmpget', '-v2c', '-c', 'public', ip_address, node_oid
                    ], timeout=2).decode(errors='ignore').strip()
                except Exception:
                    node = None
                    offline = True

                # Poll ink levels and low thresholds
                ink_levels = []
                ink_lows = []
                ink_ok = True
                ink_low_indices = []
                for idx in range(4):
                    try:
                        ink_level_raw = subprocess.check_output([
                            'snmpget', '-v2c', '-c', 'public', ip_address, ink_level_oids[idx]
                        ], timeout=2).decode(errors='ignore').strip()
                        ink_low_raw = subprocess.check_output([
                            'snmpget', '-v2c', '-c', 'public', ip_address, ink_low_oids[idx]
                        ], timeout=2).decode(errors='ignore').strip()
                        import re
                        def extract_int(s):
                            match = re.search(r'INTEGER: (-?\d+)', s)
                            return int(match.group(1)) if match else None
                        ink_level = extract_int(ink_level_raw)
                        ink_low = extract_int(ink_low_raw)
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

                if offline:
                    # Check if printer still exists in database before updating
                    try:
                        current_printer = Printer.objects.get(id=printer.id)
                        current_printer.printer_status = 'Offline'
                        current_printer.last_checked = timezone.now()
                        current_printer.save()
                        self.stdout.write(self.style.WARNING(f"Printer at {ip_address} is Offline."))
                    except Printer.DoesNotExist:
                        self.stdout.write(self.style.WARNING(f"Printer ID {printer.id} no longer exists in database. Skipping update."))
                    break
                elif status and model and node:
                    import re
                    def extract_value(s):
                        match = re.search(r'"(.*?)"', s)
                        return match.group(1) if match else s

                    status_val = extract_value(status)
                    model_val = extract_value(model)
                    node_val = extract_value(node)

                    self.stdout.write(self.style.SUCCESS(f"Status: {status_val}"))
                    self.stdout.write(self.style.SUCCESS(f"Model: {model_val}"))
                    self.stdout.write(self.style.SUCCESS(f"Node: {node_val}"))
                    # Ink status: 'OK' if all OK, else concatenated color codes of low ink (e.g., 'bc')
                    ink_status = 'OK' if ink_ok else ''.join(ink_low_indices)
                    # Check if printer still exists in database before updating
                    try:
                        current_printer = Printer.objects.get(id=printer.id)
                        current_printer.printer_status = status_val
                        current_printer.model_name = model_val
                        current_printer.node_name = node_val
                        current_printer.ink_status = ink_status
                        current_printer.last_checked = timezone.now()
                        current_printer.save()
                        self.stdout.write(self.style.SUCCESS(f"Printer info updated in database for {ip_address}. Ink status: {ink_status}"))
                    except Printer.DoesNotExist:
                        self.stdout.write(self.style.WARNING(f"Printer ID {printer.id} no longer exists in database. Skipping update."))
                    break
                else:
                    self.stdout.write(self.style.WARNING(f"SNMP poll failed for {ip_address}, retrying in 3 seconds..."))
                    time.sleep(3)
