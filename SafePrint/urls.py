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
]