from django.shortcuts import render, redirect
from django.urls import reverse
from portal.models import AdminUser


def index_view(request):
    return render(request, 'index.html')


def upload_view(request):
    return render(request, 'upload.html')


def confirmation(request):
    stars = range(4) 
    return render(request, 'confirmation.html', {'stars': stars})


def login_view(request):
    error = None
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        print(username, password)  # Debugging line to check input values
        try:
            user = AdminUser.objects.get(username=username)
            if user.password == password:
                request.session['admin_user_id'] = user.id
                return redirect(reverse('dashboard'))  # 'dashboard' should be the name of your portal dashboard URL
            else:
                error = "Invalid password."
        except AdminUser.DoesNotExist:
            error = "User does not exist."
    return render(request, 'login.html', {'error': error})

