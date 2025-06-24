from django.urls import path, include
from . import views
from .views import finalize_uploads_view

urlpatterns = [
    path('', views.index_view, name='home'), 
    path('index/', views.index_view, name='index'),
    path('upload/', views.upload_view, name='upload'),
    path('upload-file/', views.upload_file_view, name='upload_file'),
    path('delete-file/', views.delete_file_view, name='delete_file'),
    path('confirmation/', views.confirmation, name='confirmation'),
    path('login/', views.login_view, name='login'),
    path('list-uploads/', views.list_uploaded_files_view, name='list_uploads'),
    path('delete-all-uploads/', views.delete_all_uploads_view, name='delete_all_uploads'),
    path('delete-all-documents/', views.delete_all_documents, name='delete_all_documents'),
    path('delete-document/', views.delete_document, name='delete_document'),
    path('finalize-uploads/', finalize_uploads_view, name='finalize_uploads'),
    path('update-document-settings/', views.update_document_settings, name='update_document_settings'),
    path('', include('portal.urls')),
]