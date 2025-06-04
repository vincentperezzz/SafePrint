from django.contrib import admin
from django.urls import path
from main.views import index_view 

urlpatterns = [
    path('', index_view, name='home'), 
    path('admin/', admin.site.urls),
    path('index/', index_view, name='index'),
]