from django.urls import path, include
from . import views
from .views import finalize_uploads_view

urlpatterns = [
    path('', views.index_view, name='home'), 
    path('index/', views.index_view, name='index'),
    path('upload/', views.upload_view, name='upload'),
    path('confirmation/', views.confirmation, name='confirmation'),
    path('login/', views.login_view, name='login'),
    path('api/upload-file/', views.upload_file_view, name='upload_file'),
    path('api/delete-file/', views.delete_file_view, name='delete_file'),
    path('api/list-uploads/', views.list_uploaded_files_view, name='list_uploads'),
    path('api/delete-all-uploads/', views.delete_all_uploads_view, name='delete_all_uploads'),
    path('api/delete-all-documents/', views.delete_all_documents, name='delete_all_documents'),
    path('api/delete-document/', views.delete_document, name='delete_document'),
    path('api/finalize-uploads/', finalize_uploads_view, name='finalize_uploads'),
    path('api/update-document-settings/', views.update_document_settings, name='update_document_settings'),
    path('', include('portal.urls')),
]