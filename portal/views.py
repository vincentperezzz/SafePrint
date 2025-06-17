from django.shortcuts import render
from portal.models import AdminUser
import os
from django.conf import settings
from django.http import JsonResponse
from django.contrib.auth.hashers import make_password, check_password


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

def update_name(request):
    if request.method == 'POST':
        user_id = request.session.get('admin_user_id')
        new_name = request.POST.get('new_name')
        confirm_name = request.POST.get('confirm_name')
        if new_name and new_name == confirm_name:
            user = AdminUser.objects.get(id=user_id)
            user.name = new_name
            user.save()
            return JsonResponse({'success': True})
        return JsonResponse({'success': False, 'error': 'Names do not match.'})

def update_username(request):
    if request.method == 'POST':
        user_id = request.session.get('admin_user_id')
        new_username = request.POST.get('new_username')
        confirm_username = request.POST.get('confirm_username')
        if new_username and new_username == confirm_username:
            user = AdminUser.objects.get(id=user_id)
            user.username = new_username
            user.save()
            return JsonResponse({'success': True})
        return JsonResponse({'success': False, 'error': 'Usernames do not match.'})

def update_password(request):
    if request.method == 'POST':
        user_id = request.session.get('admin_user_id')
        current_password = request.POST.get('current_password')
        new_password = request.POST.get('new_password')
        confirm_password = request.POST.get('confirm_password')
        user = AdminUser.objects.get(id=user_id)
        if user.password == current_password and new_password == confirm_password:
            user.password = new_password  # For real apps, hash the password!
            user.save()
            return JsonResponse({'success': True})
        return JsonResponse({'success': False, 'error': 'Password incorrect or does not match.'})
