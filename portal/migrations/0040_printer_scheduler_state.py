from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portal', '0039_sitesetting_size_based_pricing'),
    ]

    operations = [
        migrations.AddField(
            model_name='printer',
            name='active_job_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='printer',
            name='last_assigned_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='printer',
            name='scheduling_weight',
            field=models.PositiveIntegerField(default=1),
        ),
    ]