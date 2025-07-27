import os
import json
from django.shortcuts import render, redirect
from portal.models import AdminUser, Feedback
from django.conf import settings
from django.http import JsonResponse, StreamingHttpResponse
from django.contrib.auth.hashers import make_password, check_password
from django.http import Http404
from django.views.decorators.csrf import csrf_exempt
from .forms import FeedbackForm
from django.utils.timezone import localtime
from .models import AdminUser, Printer, Document, Payment
from django.db.models import Q
from django.utils import timezone
import time
import subprocess


now = timezone.now()

def dashboard(request):
    user_id = request.session.get('admin_user_id')
    if not user_id:
        raise Http404("User not found in session")
    
    try:
        user = AdminUser.objects.get(id=user_id)
    except AdminUser.DoesNotExist:
        raise Http404("User not found")
    
    # Dashboard Stats
    completed_jobs_count = Document.objects.filter(doc_status='Finished').count()
    printer_errors_count = Printer.objects.filter(printer_status='Error').count()
    pending_customers_count = Document.objects.filter(doc_status='Pending').values('customer_id').distinct().count()
    
    # Get recent completed documents with payment info and printed_at timestamp
    completed_documents = Document.objects.filter(
        doc_status='Finished', 
    ).select_related('printed_at').prefetch_related('payment_set').order_by('-printed_at')[:5]
    
    # Handle customer ID search
    searched_documents = []
    total_price = 0.0
    customer_id_display = ''

    context = {
        'user': user,
        'completed_jobs_count': completed_jobs_count,
        'printer_errors_count': printer_errors_count,
        'pending_customers_count': pending_customers_count,
        'completed_documents': completed_documents,
        'searched_documents': searched_documents,
        'customer_id_display': customer_id_display,
        'total_price': round(total_price, 2),
    }
    return render(request, 'dashboard.html', context)

@csrf_exempt
def search_customer(request):
    if request.method == 'POST':
        import json
        data = json.loads(request.body)
        customer_id = data.get('customer_id', '').strip()
        
        if not customer_id:
            return JsonResponse({'success': False, 'error': 'Customer ID is required'})
        
        # Normalize input: accept both 'CID-9999' and '9999'
        if customer_id.upper().startswith('CID-'):
            normalized_id = customer_id[4:]
            cid_with_prefix = customer_id.upper()
        else:
            normalized_id = customer_id
            cid_with_prefix = f'CID-{customer_id}'

        try:
            documents = Document.objects.filter(
                doc_status='Pending'
            ).filter(
                Q(customer_id__iexact=normalized_id) | Q(customer_id__iexact=cid_with_prefix)
            ).order_by('-time_submitted')
            
            documents_data = []
            total_price = 0
            
            for doc in documents:
                try:
                    payment = Payment.objects.get(doc=doc)
                    price = float(payment.price)
                except Payment.DoesNotExist:
                    price = 0.0
                
                documents_data.append({
                    'doc_id': doc.doc_id,
                    'filename': doc.filename,
                    'price': price,
                    'time_submitted': doc.time_submitted.strftime('%Y-%m-%d %H:%M:%S')
                })
                total_price += price
            
            if documents_data:
                return JsonResponse({
                    'success': True,
                    'documents': documents_data,
                    'total_price': total_price,
                    'customer_id': cid_with_prefix 
                })
            else:
                return JsonResponse({'success': False, 'error': 'No documents found for the provided Customer ID.'})
            
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)})
    
    return JsonResponse({'success': False, 'error': 'Invalid request method'})

def printing_queue(request):
    user_id = request.session.get('admin_user_id')
    if not user_id:
        raise Http404("User not found in session")
    
    # Pending Documents
    pending_documents = Document.objects.filter(doc_status='pending').order_by('-time_submitted')

    # Queue Documents
    on_queue_documents = Document.objects.filter(doc_status__in=['Queued', 'Printing']).select_related('printed_at').order_by('-time_submitted')
    
    # Combine all documents to fetch all related payments
    all_documents = list(pending_documents) + list(on_queue_documents)
    payments = {p.doc.doc_id: p for p in Payment.objects.filter(doc__in=all_documents)}

    # Reroute histories for on-queue documents
    reroute_histories = {}
    for doc in on_queue_documents:
        reroute_histories[doc.doc_id] = list(doc.reroute_history.select_related('printer').all())

    return render(request, 'queue.html', {
        'pending_documents': pending_documents,
        'on_queue_documents': on_queue_documents,
        'payments': payments,
        'reroute_histories': reroute_histories,
    })


def print_completed(request):
    user_id = request.session.get('admin_user_id')
    if not user_id:
        raise Http404("User not found in session")
    
    # Get all completed documents grouped by printer - filter by doc_status='finished'
    completed_documents = Document.objects.filter(doc_status='Finished').select_related('printed_at').order_by('printer_assigned__id', '-time_submitted')
    
    # Group documents by printer
    printers_with_completed = {}
    for doc in completed_documents:
        printer_id = doc.printed_at.id if doc.printed_at else 'unassigned'
        printer_name = str(doc.printed_at) if doc.printed_at else 'Unassigned'
        if printer_id not in printers_with_completed:
            printers_with_completed[printer_id] = {
                'printer': doc.printed_at,
                'printer_name': printer_name,
                'documents': []
            }
        printers_with_completed[printer_id]['documents'].append(doc)
    
    # Get all printers to show even those without completed jobs
    all_printers = Printer.objects.all()
    for printer in all_printers:
        if printer.id not in printers_with_completed:
            printers_with_completed[printer.id] = {
                'printer': printer,
                'printer_name': str(printer),
                'documents': []
            }

    # Sort printers by printer_name (or use printer.id for ID order)
    sorted_printers = sorted(
        printers_with_completed.values(),
        key=lambda x: x['printer_name'].lower() if x['printer_name'] else ''
    )

    context = {
        'printers_with_completed': sorted_printers,
    }
    return render(request, 'completed.html', context)


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


def update_printer_field(request):
    if request.method == "POST":
        printer_id = request.POST.get('printer_id')
        field = request.POST.get('field')
        value = request.POST.get('value')
        try:
            printer = Printer.objects.get(id=printer_id)
            setattr(printer, field, value)
            printer.save()
            return JsonResponse({'success': True})
        except Printer.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Printer not found'})
    return JsonResponse({'success': False, 'error': 'Invalid request'})


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
        # Use check_password to verify the current password
        if check_password(current_password, user.password) and new_password == confirm_password:
            user.password = make_password(new_password)
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

@csrf_exempt
def feedback_view(request):
    if request.method == 'POST':
        form = FeedbackForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('thankyou')
    else:
        form = FeedbackForm()
    return render(request, 'index.html', {'form': form})

def thankyou_view(request):
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


@csrf_exempt
def deny_all_documents(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        customer_id = data.get('customer_id', '').strip()
        if not customer_id:
            return JsonResponse({'success': False, 'error': 'Customer ID is required'})

        if not customer_id.upper().startswith('CID-'):
            customer_id = f'CID-{customer_id}'
        qs = Document.objects.filter(customer_id__iexact=customer_id, doc_status='Pending')
        uploads_dir = os.path.join(settings.MEDIA_ROOT, 'uploads')
        for doc in qs:
            if doc.stored_name:
                for root, dirs, files in os.walk(uploads_dir):
                    if doc.stored_name in files:
                        file_path = os.path.join(root, doc.stored_name)
                        if os.path.isfile(file_path):
                            os.remove(file_path)
                            break
        deleted, _ = qs.delete()
        return JsonResponse({'success': True, 'deleted_count': deleted})

    return JsonResponse({'success': False, 'error': 'Invalid request method'})

@csrf_exempt
def approve_all_documents(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        customer_id = data.get('customer_id', '').strip()
        if not customer_id:
            return JsonResponse({'success': False, 'error': 'Customer ID is required'})

        # Always use CID- prefix for matching
        if not customer_id.upper().startswith('CID-'):
            customer_id = f'CID-{customer_id}'
        qs = Document.objects.filter(customer_id__iexact=customer_id, doc_status='Pending')
        approved_doc_ids = list(qs.values_list('doc_id', flat=True))
        docs = list(qs)  # <-- EVALUATE the queryset BEFORE update!
        # Update doc_status and status_updated_at for all docs
        for doc in docs:
            doc.doc_status = 'Queued'
            doc.status_updated_at = now
            doc.save()
        updated = len(docs)

        # Get admin name from session
        admin_name = None
        admin_user_id = request.session.get('admin_user_id')
        admin_user = None
        if admin_user_id:
            try:
                admin_user = AdminUser.objects.get(id=admin_user_id)
                admin_name = admin_user.name
            except AdminUser.DoesNotExist:
                pass

        # Update Payment records for all docs
        if admin_user:
            for doc in docs:
                try:
                    payment = Payment.objects.get(doc_id=doc.doc_id)
                    payment.approved_by = admin_user.name
                    payment.approved_at = now
                    payment.payment_status = 'Paid'
                    payment.save()
                except Payment.DoesNotExist:
                    pass

        return JsonResponse({'success': True, 'updated_count': updated, 'admin_name': admin_name, 'approved_doc_ids': approved_doc_ids})

    return JsonResponse({'success': False, 'error': 'Invalid request method'})

@csrf_exempt
def deny_document(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        doc_id = data.get('doc_id')
        if not doc_id:
            return JsonResponse({'success': False, 'error': 'Document ID is required'})
        try:
            doc = Document.objects.get(doc_id=doc_id)
            # Try to delete the file from disk using stored_name
            if doc.stored_name:
                uploads_dir = os.path.join(settings.MEDIA_ROOT, 'uploads')
                for root, dirs, files in os.walk(uploads_dir):
                    if doc.stored_name in files:
                        file_path = os.path.join(root, doc.stored_name)
                        if os.path.isfile(file_path):
                            os.remove(file_path)
                            break
            doc.delete()
            # Trigger folder cleanup after deleting all documents (Windows-compatible)
            script_path = os.path.abspath(
                os.path.join(os.path.dirname(__file__), '..', 'scripts', 'clean_empty_upload_folders.py')
            )
            import sys
            subprocess.Popen([sys.executable, script_path])
            return JsonResponse({'success': True, 'deleted_count': 1})
        except Document.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Document not found'})
    return JsonResponse({'success': False, 'error': 'Invalid request method'})

@csrf_exempt
def approve_document(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        doc_id = data.get('doc_id')
        if not doc_id:
            return JsonResponse({'success': False, 'error': 'Document ID is required'})

        from django.utils import timezone
        now = timezone.now()
        try:
            doc = Document.objects.get(doc_id=doc_id, doc_status='Pending')
            doc.doc_status = 'Queued'
            doc.status_updated_at = now
            doc.save()
            updated = 1
        except Document.DoesNotExist:
            updated = 0

        # Get admin name from session
        admin_name = None
        admin_user_id = request.session.get('admin_user_id')
        if admin_user_id:
            try:
                admin_user = AdminUser.objects.get(id=admin_user_id)
                admin_name = admin_user.name  # Always set this!
                try:
                    payment = Payment.objects.get(doc_id=doc_id)
                    payment.approved_by = admin_user.name
                    payment.approved_at = now
                    payment.payment_status = 'Paid'
                    payment.save()
                except Payment.DoesNotExist:
                    pass  # Still set admin_name for the response
            except AdminUser.DoesNotExist:
                pass  # If admin user not found, admin_name will be None

        return JsonResponse({'success': True, 'updated_count': updated, 'admin_name': admin_name})
    return JsonResponse({'success': False, 'error': 'Invalid request method'})

def printer_status_stream(request):
    # SSE headers
    response = StreamingHttpResponse(printer_status_event_stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    return response

def printer_status_event_stream():
    last_data = None
    while True:
        # Query all printers' idle and ink status
        printers = Printer.objects.all()
        data = []
        for printer in printers:
            data.append({
                'id': printer.id,
                'printer_name': printer.printer_name,
                'printer_status': printer.printer_status,
                'ink_cyan': getattr(printer, 'ink_cyan', None),
                'ink_magenta': getattr(printer, 'ink_magenta', None),
                'ink_yellow': getattr(printer, 'ink_yellow', None),
                'ink_black': getattr(printer, 'ink_black', None),
            })
        import json
        json_data = json.dumps(data)
        if json_data != last_data:
            yield f"data: {json_data}\n\n"
            last_data = json_data
        time.sleep(2)  # Poll every 2 seconds (adjust as needed)

def dashboard_status_stream(request):
    response = StreamingHttpResponse(dashboard_status_event_stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    return response

def dashboard_status_event_stream():
    last_data = None
    while True:
        # Gather dashboard stats
        completed_jobs_count = Document.objects.filter(doc_status='Finished').count()
        printer_errors_count = Printer.objects.filter(printer_status='Error').count()
        pending_customers_count = Document.objects.filter(doc_status='Pending').values('customer_id').distinct().count()
        # Get recent completed documents (limit 5, order by -printed_at)
        completed_documents = list(
            Document.objects.filter(doc_status='Finished')
            .select_related('printer_assigned')
            .order_by('-printed_at')[:5]
        )
        completed_docs_data = []
        for doc in completed_documents:
            completed_docs_data.append({
                'doc_id': doc.doc_id,
                'filename': doc.filename,
                'printer_name': doc.printer_assigned.printer_name if doc.printer_assigned else 'No Printer',
            })
        data = {
            'completed_jobs_count': completed_jobs_count,
            'printer_errors_count': printer_errors_count,
            'pending_customers_count': pending_customers_count,
            'completed_documents': completed_docs_data,
        }
        import json
        json_data = json.dumps(data)
        if json_data != last_data:
            yield f"data: {json_data}\n\n"
            last_data = json_data
        time.sleep(2)

@csrf_exempt
def add_printer(request):
    if request.method == "POST":
        printer_name = request.POST.get('printer_name')
        ip_address = request.POST.get('ip_address')
        if printer_name and ip_address:
            from django.utils import timezone
            now = timezone.now()
            printer = Printer(printer_name=printer_name, ip_address=ip_address, last_checked=now)
            printer.save()
            return JsonResponse({'success': True, 'printer_id': printer.id})
        return JsonResponse({'success': False, 'error': 'Missing fields'})
    return JsonResponse({'success': False, 'error': 'Invalid request'})

@csrf_exempt
def edit_printer(request):
    if request.method == "POST":
        printer_id = request.POST.get('printer_id')
        printer_name = request.POST.get('printer_name')
        ip_address = request.POST.get('ip_address')
        try:
            printer = Printer.objects.get(id=printer_id)
            if printer_name:
                printer.printer_name = printer_name
            if ip_address:
                printer.ip_address = ip_address
            printer.save()
            return JsonResponse({'success': True})
        except Printer.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Printer not found'})
    return JsonResponse({'success': False, 'error': 'Invalid request'})