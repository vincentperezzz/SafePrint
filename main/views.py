from django.shortcuts import render

def index_view(request):
    return render(request, 'index.html')

def upload_view(request):
    return render(request, 'upload.html')