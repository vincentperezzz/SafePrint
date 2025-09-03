from django.db import migrations, models


def seed_sounds(apps, schema_editor):
    NotificationSound = apps.get_model('portal', 'NotificationSound')
    # Known bundled sounds
    bundled = [
        ('chime', 'Chime', '/static/sounds/chime.mp3'),
        ('chananan', 'Chananan', '/static/sounds/chananan.mp3'),
        ('taposnapo', 'Tapos Na Po', '/static/sounds/taposnapo.mp3'),
        ('tugting', 'Tugting', '/static/sounds/tugting.mp3'),
        ('tuntang', 'Tuntang', '/static/sounds/tuntang.mp3'),
        ('tuwawang', 'Tuwawang', '/static/sounds/tuwawang.mp3'),
    ]
    for slug, name, path in bundled:
        NotificationSound.objects.update_or_create(
            slug=slug,
            defaults={
                'display_name': name,
                'file_path': path,
                'is_active': True,
                'default_volume': 100,
            }
        )


class Migration(migrations.Migration):

    dependencies = [
        ('portal', '0004_document_pages_printed'),
    ]

    operations = [
        migrations.CreateModel(
            name='NotificationSound',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('slug', models.SlugField(max_length=64, unique=True)),
                ('display_name', models.CharField(max_length=100)),
                ('file_path', models.CharField(max_length=255)),
                ('is_active', models.BooleanField(default=True)),
                ('default_volume', models.PositiveSmallIntegerField(default=100)),
            ],
            options={
                'db_table': 'notification_sounds',
                'ordering': ['display_name'],
            },
        ),
        migrations.AddField(
            model_name='adminuser',
            name='notification_sound',
            field=models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, to='portal.notificationsound'),
        ),
        migrations.AddField(
            model_name='adminuser',
            name='sound_enabled',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='adminuser',
            name='sound_volume',
            field=models.PositiveSmallIntegerField(default=100),
        ),
        migrations.RunPython(seed_sounds, migrations.RunPython.noop),
    ]
