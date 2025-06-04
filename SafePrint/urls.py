from django.contrib import admin
from django.urls import path
from main.views import base_view 

urlpatterns = [
    path('', base_view, name='home'), 
    path('admin/', admin.site.urls),
    path('base/', base_view, name='base'),
]