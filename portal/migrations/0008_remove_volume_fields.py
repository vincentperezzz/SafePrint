from django.db import migrations

class Migration(migrations.Migration):
    dependencies = [
        ('portal', '0007_alter_notificationsound_id'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='adminuser',
            name='sound_volume',
        ),
        migrations.RemoveField(
            model_name='notificationsound',
            name='default_volume',
        ),
    ]
