from django.urls import path
from . import views

urlpatterns = [
    # Add your admin-specific URL patterns here
    path('dashboard/', views.dashboard, name='dashboard'),
    path('queue/', views.printing_queue, name='printing_queue'),
    path('completed/', views.print_completed, name='print_completed'),
    path('status/', views.printer_status, name='printer_status'),
    path('settings/', views.account_settings, name='account_settings'),
]