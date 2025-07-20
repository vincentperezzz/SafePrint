from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from portal.models import Document
import os

class Command(BaseCommand):
    help = 'Delete documents not updated in 1 hour and remove their files.'

    def handle(self, *args, **kwargs):
        cutoff = timezone.now() - timedelta(hours=1)
        stale_docs = Document.objects.filter(status_updated_at__lt=cutoff)
        # Get absolute path to the project root
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../'))
        uploads_dir = os.path.join(project_root, 'media', 'uploads')
        for doc in stale_docs:
            # Recursively search for the file by name under media/uploads (absolute path)
            found_file = None
            for root, dirs, files in os.walk(uploads_dir):
                if doc.stored_name in files:
                    found_file = os.path.join(root, doc.stored_name)
                    break
            print(f"DEBUG: Searching for {doc.stored_name} under {uploads_dir}. Found: {found_file}")
            if found_file and os.path.isfile(found_file):
                os.remove(found_file)
                self.stdout.write(self.style.SUCCESS(f"Deleted file: {found_file}"))
            else:
                self.stdout.write(self.style.WARNING(f"File not found: {doc.stored_name}"))
            doc_id = getattr(doc, 'doc_id', None) or getattr(doc, 'id', None)
            doc.delete()
            self.stdout.write(self.style.SUCCESS(f"Deleted document: {doc_id}"))

            # Call clean_empty_upload_folders.py after each document deletion
            try:
                import subprocess
                script_path = os.path.join(project_root, 'scripts', 'clean_empty_upload_folders.py')
                subprocess.run(['python3', script_path], check=True)
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"Failed to clean empty upload folders: {e}"))
