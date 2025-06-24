from django.urls import path, include
from . import views

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
    path('', include('portal.urls')),
]