from django.shortcuts import render, redirect
from django.urls import reverse
from portal.models import AdminUser
from django.contrib.auth.hashers import check_password
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
import os
import uuid
import time


def index_view(request):
    return render(request, 'index.html')


def upload_view(request):
    return render(request, 'upload.html')


def confirmation(request):
    stars = range(4) 
    return render(request, 'confirmation.html', {'stars': stars})


def login_view(request):
    error = None
    request.session.flush()
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        try:
            user = AdminUser.objects.get(username=username)
            if check_password(password, user.password):
                request.session['admin_user_id'] = user.id
                return redirect(reverse('dashboard'))  # GOTO the link
            else:
                error = "Invalid password."
        except AdminUser.DoesNotExist:
            error = "User does not exist."
    return render(request, 'login.html', {'error': error})


@csrf_exempt
def upload_file_view(request):
    if request.method == 'POST' and request.FILES.get('file'):
        uploaded_file = request.FILES['file']
        
        # Validate file type
        if not uploaded_file.name.lower().endswith('.pdf'):
            return JsonResponse({
                'success': False,
                'error': 'Only PDF files are allowed.'
            })
        
        # Validate file size (e.g., 10MB limit)
        if uploaded_file.size > 10 * 1024 * 1024:
            return JsonResponse({
                'success': False,
                'error': 'File size too large. Maximum 10MB allowed.'
            })
        
        try:
            # Generate unique filename
            file_extension = os.path.splitext(uploaded_file.name)[1]
            unique_filename = f"{uuid.uuid4()}{file_extension}"
            
            # Save file
            file_path = default_storage.save(f'uploads/{unique_filename}', ContentFile(uploaded_file.read()))
            
            # Simulate upload delay for progress demonstration
            time.sleep(0.5)
            
            return JsonResponse({
                'success': True,
                'file_path': file_path,
                'original_name': uploaded_file.name,
                'file_size': uploaded_file.size
            })
        
        except Exception as e:
            return JsonResponse({
                'success': False,
                'error': f'Upload failed: {str(e)}'
            })
    
    return JsonResponse({
        'success': False,
        'error': 'Invalid request'
    })


@csrf_exempt
def delete_file_view(request):
    if request.method == 'POST':
        try:
            import json
            data = json.loads(request.body)
            file_path = data.get('file_path')
            
            if not file_path:
                return JsonResponse({
                    'success': False,
                    'error': 'File path is required'
                })
            
            # Check if file exists and delete it
            if default_storage.exists(file_path):
                default_storage.delete(file_path)
                return JsonResponse({
                    'success': True,
                    'message': 'File deleted successfully'
                })
            else:
                return JsonResponse({
                    'success': False,
                    'error': 'File not found'
                })
                
        except json.JSONDecodeError:
            return JsonResponse({
                'success': False,
                'error': 'Invalid JSON data'
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'error': f'Delete failed: {str(e)}'
            })
    
    return JsonResponse({
        'success': False,
        'error': 'Invalid request method'
    })

