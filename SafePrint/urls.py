from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('portal/', include('portal.urls')),  # your custom portal app
    path('admin/', admin.site.urls),          # Django's admin
    path('', include('main.urls')),           # main app
]