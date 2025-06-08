from django.contrib import admin
from django.urls import path, include
from main import views

urlpatterns = [
    path('', views.index_view, name='home'), 
    path('admin/', admin.site.urls),
    path('index/', views.index_view, name='index'),
    path('upload/', views.upload_view, name='upload'),
    path('confirmation/', views.confirmation, name='confirmation'),
    path('login/', views.login_view, name='login'),
    path('dashboard/', views.dashboard, name='dashboard'),
    path('queue/', views.printing_queue, name='printing_queue'),
    path('completed/', views.print_completed, name='print_completed'),
    path('status/', views.printer_status, name='printer_status'),
    path('settings/', views.account_settings, name='account_settings'),
]