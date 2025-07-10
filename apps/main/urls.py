from django.urls import path
from . import views

urlpatterns = [
    path('analyze-upload/', views.upload_pdf_view, name='analyze_upload'),
]