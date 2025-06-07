from django.shortcuts import render

def index_view(request):
    return render(request, 'index.html')

def upload_view(request):
    return render(request, 'upload.html')

def confirmation(request):
    stars = range(4) 
    return render(request, 'confirmation.html', {'stars': stars})

def login_view(request):
    return render(request, 'login.html')