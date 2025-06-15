from django.urls import path
from . import views

urlpatterns = [
    path('', views.index_view, name='home'), 
    path('index/', views.index_view, name='index'),
    path('upload/', views.upload_view, name='upload'),
    path('confirmation/', views.confirmation, name='confirmation'),
    path('login/', views.login_view, name='login'),
]