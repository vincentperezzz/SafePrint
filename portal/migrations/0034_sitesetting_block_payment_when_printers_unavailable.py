from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portal', '0033_payment_intent_and_gcash_settings'),
    ]

    operations = [
        migrations.AddField(
            model_name='sitesetting',
            name='block_payment_when_printers_unavailable',
            field=models.BooleanField(default=True, help_text='When enabled, payment is blocked if no matching printer is currently available'),
        ),
    ]