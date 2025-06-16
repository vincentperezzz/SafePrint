from django.shortcuts import render
from portal.models import AdminUser

def dashboard(request):
    user_id = request.session.get('admin_user_id')
    user = None
    if user_id:
        user = AdminUser.objects.get(id=user_id)
    return render(request, 'dashboard.html', {'user': user})


def printing_queue(request):
    return render(request, 'queue.html')


def print_completed(request):
    return render(request, 'completed.html')


def printer_status(request):
    return render(request, 'status.html')


def account_settings(request):
    return render(request, 'settings.html')
