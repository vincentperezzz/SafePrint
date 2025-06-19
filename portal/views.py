import os
import json
from django.shortcuts import render, redirect
from portal.models import AdminUser, Feedback
from .models import AdminUser, Printer
from django.conf import settings
from django.http import JsonResponse
from django.contrib.auth.hashers import make_password
from django.http import Http404
from django.views.decorators.csrf import csrf_exempt
from .forms import FeedbackForm
from django.http import JsonResponse
from django.utils.timezone import localtime




def dashboard(request):
    user_id = request.session.get('admin_user_id')
    if not user_id:
        raise Http404("User not found in session")
    user = None
    if user_id:
        user = AdminUser.objects.get(id=user_id)
    return render(request, 'dashboard.html', {'user': user})


def printing_queue(request):
    user_id = request.session.get('admin_user_id')
    if not user_id:
        raise Http404("User not found in session")
    return render(request, 'queue.html')


def print_completed(request):
    user_id = request.session.get('admin_user_id')
    if not user_id:
        raise Http404("User not found in session")
    return render(request, 'completed.html')


def printer_status(request):
    user_id = request.session.get('admin_user_id')
    if not user_id:
        raise Http404("User not found in session")
    printers = Printer.objects.all()
    paper_size_choices = Printer.PAPER_SIZE_CHOICES
    gsm_choices = Printer.GSM_CHOICES
    return render(request, 'status.html', {
        'printers': printers,
        'paper_size_choices': paper_size_choices,
        'gsm_choices': gsm_choices,
    })


def account_settings(request):
    user_id = request.session.get('admin_user_id')
    if not request.session.get('admin_user_id'):
        raise Http404("User not found in session") 
    user = AdminUser.objects.get(id=user_id)
    users = AdminUser.objects.exclude(role="Manager")
    feedback_comments = Feedback.objects.filter(category='Comment').order_by('-submitted_at')
    problem_reports = Feedback.objects.filter(category='Report a Problem').order_by('-submitted_at')
    return render(request, 'settings.html', {
        'user': user,
        'users': users,
        'feedback_comments': feedback_comments,
        'problem_reports': problem_reports,
    })


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
            return JsonResponse({'success': True, 'new_name': new_name})
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
            return JsonResponse({'success': True, 'new_username': new_username})
        return JsonResponse({'success': False, 'error': 'Usernames do not match.'})

def update_password(request):
    if request.method == 'POST':
        user_id = request.session.get('admin_user_id')
        current_password = request.POST.get('current_password')
        new_password = request.POST.get('new_password')
        confirm_password = request.POST.get('confirm_password')
        user = AdminUser.objects.get(id=user_id)
        if user.password == current_password and new_password == confirm_password:
            user.password = make_password(new_password) # For real apps, hash the password!
            user.save()
            return JsonResponse({'success': True})
        return JsonResponse({'success': False, 'error': 'Password incorrect or does not match.'})
    
@csrf_exempt
def update_user_password(request):
    if request.method == 'POST':
        user_id = request.POST.get('user_id')
        new_password = request.POST.get('new_user_password')
        confirm_password = request.POST.get('confirm_user_password')
        if new_password != confirm_password:
            return JsonResponse({'success': False, 'error': 'Passwords do not match.'})
        try:
            user = AdminUser.objects.get(id=user_id)
            user.password = make_password(new_password)  
            user.save()
            return JsonResponse({'success': True})
        except AdminUser.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'User not found.'})
    return JsonResponse({'success': False, 'error': 'Invalid request.'})


@csrf_exempt
def delete_user_ajax(request):
    user_id = request.session.get('admin_user_id')
    if not user_id:
        return JsonResponse({'success': False, 'error': 'Not authenticated'})
    try:
        current_user = AdminUser.objects.get(id=user_id)
    except AdminUser.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Not authenticated'})
    if current_user.role != 'Manager':
        return JsonResponse({'success': False, 'error': 'Not authorized'})
    if request.method == 'POST':
        data = json.loads(request.body)
        user_ids_to_delete = data.get('user_ids')  # Expecting a list of IDs
        if not user_ids_to_delete:
            return JsonResponse({'success': False, 'error': 'No user IDs provided'})
        if not isinstance(user_ids_to_delete, list):
            user_ids_to_delete = [user_ids_to_delete]
        deleted_ids = []
        errors = []
        for uid in user_ids_to_delete:
            try:
                user = AdminUser.objects.get(id=uid)
                if user.role == 'Manager':
                    errors.append({'id': uid, 'error': 'Cannot delete manager'})
                    continue
                user.delete()
                deleted_ids.append(uid)
            except AdminUser.DoesNotExist:
                errors.append({'id': uid, 'error': 'User does not exist'})
        return JsonResponse({'success': True, 'deleted_ids': deleted_ids, 'errors': errors})
    return JsonResponse({'success': False, 'error': 'Invalid request'})

@csrf_exempt
def add_user_ajax(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        name = data.get('name')
        username = data.get('username')
        password = data.get('password')
        confirm_password = data.get('confirm_password')
        role = 'admin'

        if not name or not username or not password or not confirm_password:
            print(name, username, password, confirm_password)
            return JsonResponse({'success': False, 'error': 'All fields are required.'})

        if password != confirm_password:
            return JsonResponse({'success': False, 'error': 'Passwords do not match.'})

        if AdminUser.objects.filter(username=username).exists():
            return JsonResponse({'success': False, 'error': 'Username already exists.'})

        new_user = AdminUser.objects.create(
            name=name,
            username=username,
            password=make_password(password),
            role=role
        )
        return JsonResponse({'success': True, 'name': name, 'username': username, 'user_id': new_user.id})

    return JsonResponse({'success': False, 'error': 'Invalid request'})



def feedback_view(request):
    if request.method == 'POST':
        form = FeedbackForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('thank')
    else:
        form = FeedbackForm()
    return render(request, 'index.html', {'form': form})

def thank_view(request):
    return render(request, 'thank.html')


def feedback_comments_api(request):
    feedback_comments = Feedback.objects.filter(category='Comment').order_by('-submitted_at')
    data = [
        {
            'name': f.name or "Anonymous",
            'message': f.message,
            'submitted_at': localtime(f.submitted_at).strftime("%Y-%m-%d %I:%M %p")
        }
        for f in feedback_comments
    ]
    return JsonResponse({'feedback_comments': data})

def problem_reports_api(request):
    problem_reports = Feedback.objects.filter(category='Report a Problem').order_by('-submitted_at')
    data = [
        {
            'name': p.name or "Anonymous",
            'message': p.message,
            'submitted_at': localtime(p.submitted_at).strftime("%Y-%m-%d %I:%M %p")
        }
        for p in problem_reports
    ]
    return JsonResponse({'problem_reports': data})
