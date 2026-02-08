from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.shortcuts import render

urlpatterns = [
    path('portal/', include('portal.urls')),  # your custom portal app
    path('django-admin/', admin.site.urls),          # Django's admin
    path('', include('main.urls')),           # main app
]

# Always try to serve static/media files through Django
# This is a fallback for production and works for development
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
urlpatterns += static(settings.STATIC_URL, document_root=settings.STATICFILES_DIRS[0])


# Custom error handlers
def custom_404(request, exception=None):
    return render(request, '404.html', status=404)

handler404 = custom_404