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
        for doc in stale_docs:
            # Try to delete the file if it exists
            file_path = os.path.join('media', 'uploads', doc.stored_name)
            if os.path.isfile(file_path):
                os.remove(file_path)
                self.stdout.write(self.style.SUCCESS(f"Deleted file: {file_path}"))
            else:
                self.stdout.write(self.style.WARNING(f"File not found: {file_path}"))
            doc.delete()
            self.stdout.write(self.style.SUCCESS(f"Deleted document: {doc.doc_id}"))
