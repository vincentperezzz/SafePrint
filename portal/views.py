from django.shortcuts import render
from portal.models import AdminUser
import os
from django.conf import settings
from django.http import JsonResponse


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
    user_id = request.session.get('admin_user_id')
    user = None
    if user_id:
        user = AdminUser.objects.get(id=user_id)
    return render(request, 'settings.html', {'user': user})


def change_image_ajax(request):
    if request.method == 'POST' and request.FILES.get('profile_image'):
        user_id = request.session.get('admin_user_id')
        user = AdminUser.objects.get(id=user_id)
        # Delete old image if exists
        if user.profile_image and os.path.isfile(user.profile_image.path):
            os.remove(user.profile_image.path)
        # Save new image
        user.profile_image = request.FILES['profile_image']
        user.save()
        return JsonResponse({'success': True, 'image_url': user.profile_image.url})
    return JsonResponse({'success': False, 'error': 'Invalid request'})
