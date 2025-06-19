from django.urls import path
from . import views

urlpatterns = [
    # Add your admin-specific URL patterns here
    path('portal/dashboard/', views.dashboard, name='dashboard'),
    path('portal/queue/', views.printing_queue, name='printing_queue'),
    path('portal/completed/', views.print_completed, name='print_completed'),
    path('portal/status/', views.printer_status, name='printer_status'),
    path('portal/settings/', views.account_settings, name='account_settings'),
    path('change-image-ajax/', views.change_image_ajax, name='change_image_ajax'),
    path('update-name/', views.update_name, name='update_name'),
    path('update-username/', views.update_username, name='update_username'),
    path('update-password/', views.update_password, name='update_password'),
    path('update-user-password/', views.update_user_password, name='update_user_password'),
    path('delete_user_ajax/', views.delete_user_ajax, name='delete_user_ajax'),
    path('add_user_ajax/', views.add_user_ajax, name='add_user_ajax'),
    path('feedback/', views.feedback_view, name='feedback'),
    path('thankyou/', views.thankyou_view, name='thankyou'),
    path('api/feedback-comments/', views.feedback_comments_api, name='feedback_comments_api'),
    path('api/problem-reports/', views.problem_reports_api, name='problem_reports_api'),
]