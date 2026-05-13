from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('portal', '0037_sitesetting_bw_price_70_sitesetting_bw_price_80_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='printer',
            name='is_temporarily_disabled',
            field=models.BooleanField(default=False),
        ),
    ]
