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

def dashboard(request):
    return render(request, 'dashboard.html')

def printing_queue(request):
    return render(request, 'queue.html')

def print_completed(request):
    return render(request, 'completed.html')

def printer_status(request):
    return render(request, 'status.html')

def account_settings(request):
    return render(request, 'settings.html')