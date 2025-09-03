from django.db import migrations


def set_default_chime(apps, schema_editor):
    AdminUser = apps.get_model('portal', 'AdminUser')
    NotificationSound = apps.get_model('portal', 'NotificationSound')
    chime = NotificationSound.objects.filter(slug='chime', is_active=True).first()
    if not chime:
        return
    AdminUser.objects.filter(notification_sound__isnull=True).update(notification_sound=chime)


class Migration(migrations.Migration):

    dependencies = [
        ('portal', '0005_notificationsound_and_adminuser_sound_prefs'),
    ]

    operations = [
        migrations.RunPython(set_default_chime, migrations.RunPython.noop),
    ]
