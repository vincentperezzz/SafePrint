import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portal', '0032_add_ticket_proof_images_and_related_docs'),
    ]

    operations = [
        migrations.AddField(
            model_name='sitesetting',
            name='gcash_qr_image',
            field=models.ImageField(blank=True, null=True, upload_to='payment_qr/'),
        ),
        migrations.AddField(
            model_name='sitesetting',
            name='gcash_recipient_name',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='sitesetting',
            name='gcash_recipient_number',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='sitesetting',
            name='payment_expiry_minutes',
            field=models.IntegerField(default=10, help_text='Minutes before a pending payment intent expires'),
        ),
        migrations.CreateModel(
            name='PaymentIntent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('intent_id', models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ('customer_id', models.CharField(db_index=True, max_length=255)),
                ('doc_ids', models.JSONField(blank=True, default=list)),
                ('payer_number', models.CharField(db_index=True, max_length=20)),
                ('expected_amount', models.DecimalField(decimal_places=2, max_digits=10)),
                ('voucher_credit_code', models.CharField(blank=True, default='', max_length=20)),
                ('credit_applied', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('recipient_name', models.CharField(blank=True, default='', max_length=255)),
                ('recipient_number', models.CharField(blank=True, default='', max_length=20)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('matched', 'Matched'), ('cancelled', 'Cancelled'), ('expired', 'Expired'), ('failed', 'Failed')], db_index=True, default='pending', max_length=20)),
                ('verification_source', models.CharField(blank=True, default='', max_length=50)),
                ('matched_notification_id', models.CharField(blank=True, db_index=True, default='', max_length=255)),
                ('matched_raw_text', models.TextField(blank=True, default='')),
                ('matched_at', models.DateTimeField(blank=True, null=True)),
                ('expires_at', models.DateTimeField(db_index=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'payment_intents',
                'ordering': ['-created_at'],
            },
        ),
    ]