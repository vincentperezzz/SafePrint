from django.shortcuts import render, redirect
from django.urls import reverse
from portal.models import AdminUser
from django.contrib.auth.hashers import check_password


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

