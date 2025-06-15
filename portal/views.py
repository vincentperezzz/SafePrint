from django.shortcuts import render


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
