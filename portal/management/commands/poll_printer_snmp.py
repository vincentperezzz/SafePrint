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

        printers = Printer.objects.all()
        for printer in printers:
            ip_address = printer.ip_address
            self.stdout.write(self.style.NOTICE(f"Polling printer at IP: {ip_address}"))
            while True:
                try:
                    status = subprocess.check_output([
                        'snmpget', '-v2c', '-c', 'public', ip_address, status_oid
                    ], timeout=2).decode(errors='ignore').strip()
                except Exception:
                    status = None
                try:
                    model = subprocess.check_output([
                        'snmpget', '-v2c', '-c', 'public', ip_address, model_oid
                    ], timeout=2).decode(errors='ignore').strip()
                except Exception:
                    model = None
                try:
                    node = subprocess.check_output([
                        'snmpget', '-v2c', '-c', 'public', ip_address, node_oid
                    ], timeout=2).decode(errors='ignore').strip()
                except Exception:
                    node = None

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

                if status and model and node:
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
                    printer.printer_status = status_val
                    printer.model_name = model_val
                    printer.node_name = node_val
                    printer.ink_status = ink_status
                    printer.last_checked = timezone.now()
                    printer.save()
                    self.stdout.write(self.style.SUCCESS(f"Printer info updated in database for {ip_address}. Ink status: {ink_status}"))
                    break
                else:
                    self.stdout.write(self.style.WARNING(f"SNMP poll failed for {ip_address}, retrying in 3 seconds..."))
                    time.sleep(3)
