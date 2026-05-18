from .settings import *


DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

ENABLE_QUEUE_MONITOR = False
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
TESTING = True