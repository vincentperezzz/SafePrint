from pathlib import Path
from decouple import Config, RepositoryEnv
import os

BASE_DIR = Path(__file__).resolve().parent.parent

env_path = BASE_DIR / 'venv' / '.env'
config = Config(RepositoryEnv(env_path))


SECRET_KEY = config('DJANGO_SECRET_KEY', default='default-secret-key')

# Set to False in production
# DEBUG = config('DEBUG', default=False, cast=bool)
DEBUG = True

ALLOWED_HOSTS = ['localhost', '127.0.0.1', '192.168.0.100', 'safeprint', 'safeprint.duckdns.org']

# CSRF settings for HTTPS
CSRF_TRUSTED_ORIGINS = []

# HTTPS Security Settings
# Only apply these settings in production to allow development server to work properly
if not DEBUG:
    SECURE_SSL_REDIRECT = True  # Redirects all non-HTTPS requests to HTTPS
    SESSION_COOKIE_SECURE = True  # Ensures cookies are only sent over HTTPS
    CSRF_COOKIE_SECURE = True  # Ensures CSRF cookies are only sent over HTTPS
    SECURE_HSTS_SECONDS = 31536000  # 1 year, instructs browsers to only use HTTPS
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True  # Applies HSTS to all subdomains
    SECURE_HSTS_PRELOAD = True  # For inclusion in browser HSTS preload list
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')  # For proxy servers

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'main',  # Your main app
    'portal',  # Your portal app
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'SafePrint.middleware.Custom404Middleware',
]

ROOT_URLCONF = 'SafePrint.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'SafePrint.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': config('DB_NAME'),
        'USER': config('DB_USER'),
        'PASSWORD': config('DB_PASSWORD'),
        'HOST': config('DB_HOST', default='localhost'),
        'PORT': config('DB_PORT', default='3306'),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'Asia/Manila'

USE_I18N = True

USE_L10N = True

USE_TZ = True

# Static files configuration
STATIC_URL = '/static/'
STATICFILES_DIRS = [
    BASE_DIR / "static",
]
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

# Make sure collectstatic has been run
# Run: python manage.py collectstatic

# Media files configuration
MEDIA_URL = '/media/'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# Email Notification (Gmail SMTP)
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')
EMAIL_FROM_NAME = config('EMAIL_FROM_NAME', default='SafePrint Alerts')
DEFAULT_FROM_EMAIL = f"{EMAIL_FROM_NAME} <{EMAIL_HOST_USER}>"

# KLCiS Payment Integration
KLCIS_BASE_URL = config('KLCIS_BASE_URL', default='https://s2.klinternetservices.com')
KLCIS_USERNAME = config('KLCIS_USERNAME', default='')
KLCIS_PASSWORD = config('KLCIS_PASSWORD', default='')