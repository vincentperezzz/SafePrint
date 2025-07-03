from django.urls import path
from . import views

urlpatterns = [
    # Add your admin-specific URL patterns here
    path('portal/dashboard/', views.dashboard, name='dashboard'),
    path('portal/queue/', views.printing_queue, name='printing_queue'),
    path('portal/completed/', views.print_completed, name='print_completed'),
    path('portal/status/', views.printer_status, name='printer_status'),
    path('portal/settings/', views.account_settings, name='account_settings'),
    path('feedback/', views.feedback_view, name='feedback'),
    path('thankyou/', views.thankyou_view, name='thankyou'),
    path('api/change-image-ajax/', views.change_image_ajax, name='change_image_ajax'),
    path('api/update-name/', views.update_name, name='update_name'),
    path('api/update-username/', views.update_username, name='update_username'),
    path('api/update-password/', views.update_password, name='update_password'),
    path('api/update-user-password/', views.update_user_password, name='update_user_password'),
    path('api/delete_user_ajax/', views.delete_user_ajax, name='delete_user_ajax'),
    path('api/add_user_ajax/', views.add_user_ajax, name='add_user_ajax'),
    path('api/feedback-comments/', views.feedback_comments_api, name='feedback_comments_api'),
    path('api/problem-reports/', views.problem_reports_api, name='problem_reports_api'),
    path('api/update_printer_field/', views.update_printer_field, name='update_printer_field'),
    path('api/search_customer/', views.search_customer, name='search_customer'),
    path('api/deny-all-documents/', views.deny_all_documents, name='deny_all_documents'),
    path('api/approve-all-documents/', views.approve_all_documents, name='approve_all_documents'),
    path('api/deny-document/', views.deny_document, name='deny_document'),
    path('api/approve-document/', views.approve_document, name='approve_document'),
    path('sse/printer-status/', views.printer_status_stream, name='printer_status_stream'),
    path('sse/dashboard-status/', views.dashboard_status_stream, name='dashboard_status_stream'),
]