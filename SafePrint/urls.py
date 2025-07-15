from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('portal/', include('portal.urls')),  # your custom portal app
    path('django-admin/', admin.site.urls),          # Django's admin
    path('', include('main.urls')),           # main app
]

# Serve static files in development
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATICFILES_DIRS[0])

