from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portal', '0041_document_queue_priority'),
    ]

    operations = [
        migrations.AddField(
            model_name='document',
            name='page_copy_counts',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
