from django.db import migrations, models


def backfill_queue_metadata(apps, schema_editor):
    Document = apps.get_model('portal', 'Document')

    for document in Document.objects.filter(doc_status='Queued', queued_at__isnull=True).iterator():
        Document.objects.filter(pk=document.pk).update(
            queue_priority=1,
            queued_at=document.status_updated_at or document.time_submitted,
        )


class Migration(migrations.Migration):

    dependencies = [
        ('portal', '0040_printer_scheduler_state'),
    ]

    operations = [
        migrations.AddField(
            model_name='document',
            name='queue_priority',
            field=models.PositiveSmallIntegerField(db_index=True, default=1),
        ),
        migrations.AddField(
            model_name='document',
            name='queued_at',
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.RunPython(backfill_queue_metadata, migrations.RunPython.noop),
    ]