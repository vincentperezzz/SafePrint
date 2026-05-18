from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portal', '0038_printer_is_temporarily_disabled'),
    ]

    operations = [
        migrations.AddField(
            model_name='sitesetting',
            name='letter_bw_price',
            field=models.DecimalField(decimal_places=2, default=1, help_text='Black-and-white price for Short paper', max_digits=10),
        ),
        migrations.AddField(
            model_name='sitesetting',
            name='letter_partial_price',
            field=models.DecimalField(decimal_places=2, default=3, help_text='Partial color price for Short paper', max_digits=10),
        ),
        migrations.AddField(
            model_name='sitesetting',
            name='letter_full_price',
            field=models.DecimalField(decimal_places=2, default=8, help_text='Full color price for Short paper', max_digits=10),
        ),
        migrations.AddField(
            model_name='sitesetting',
            name='a4_bw_price',
            field=models.DecimalField(decimal_places=2, default=1, help_text='Black-and-white price for A4 paper', max_digits=10),
        ),
        migrations.AddField(
            model_name='sitesetting',
            name='a4_partial_price',
            field=models.DecimalField(decimal_places=2, default=3, help_text='Partial color price for A4 paper', max_digits=10),
        ),
        migrations.AddField(
            model_name='sitesetting',
            name='a4_full_price',
            field=models.DecimalField(decimal_places=2, default=8, help_text='Full color price for A4 paper', max_digits=10),
        ),
        migrations.AddField(
            model_name='sitesetting',
            name='long_bw_price',
            field=models.DecimalField(decimal_places=2, default=2, help_text='Black-and-white price for Long paper', max_digits=10),
        ),
        migrations.AddField(
            model_name='sitesetting',
            name='long_partial_price',
            field=models.DecimalField(decimal_places=2, default=4, help_text='Partial color price for Long paper', max_digits=10),
        ),
        migrations.AddField(
            model_name='sitesetting',
            name='long_full_price',
            field=models.DecimalField(decimal_places=2, default=10, help_text='Full color price for Long paper', max_digits=10),
        ),
    ]
