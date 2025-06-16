from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('portal/', include('portal.urls')),  # your custom portal app
    path('admin/', admin.site.urls),          # Django's admin
    path('', include('main.urls')),           # main app
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)