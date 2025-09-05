import os
import json
import time
import threading
import subprocess
from django.db.models import Q
from .forms import FeedbackForm
from django.http import Http404
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from portal.models import RerouteHistory
from django.utils.timezone import localtime
from django.shortcuts import render, redirect
from portal.models import AdminUser, Feedback
from django.views.decorators.csrf import csrf_exempt
from .models import AdminUser, Printer, Document, Payment, NotificationSound
from django.http import JsonResponse, StreamingHttpResponse
from django.contrib.auth.hashers import make_password, check_password
from django.contrib.auth.decorators import login_required


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
    printer_errors_count = Printer.objects.exclude(printer_status__in=['Sleep', 'Ready', 'Printing']).count()
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
    # Use consistent casing for status values
    pending_documents = Document.objects.filter(doc_status='Pending').order_by('-time_submitted')

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
    # Fetch current user notification preferences for display
    user = AdminUser.objects.get(id=user_id)
    prefs_changed = False

    # Ensure there is a selected notification sound; default to 'chime' or first active
    if not getattr(user, 'notification_sound_id', None):
        try:
            default_sound = NotificationSound.objects.filter(is_active=True, slug='chime').first()
            if not default_sound:
                default_sound = NotificationSound.objects.filter(is_active=True).order_by('display_name').first()
            if default_sound:
                user.notification_sound = default_sound
                prefs_changed = True
        except Exception:
            pass

    # sound_enabled is a BooleanField with default=True; nothing to fix unless None sneaks in
    if getattr(user, 'sound_enabled', True) is None:
        user.sound_enabled = True
        prefs_changed = True

    if prefs_changed:
        # Persist any normalization so next render is consistent
        save_fields = []
        if hasattr(user, 'notification_sound_id'):
            save_fields.append('notification_sound')
        save_fields += ['sound_enabled']
        try:
            user.save(update_fields=list(set(save_fields)))
        except Exception:
            # If targeted save fails (e.g., during migrations), do a full save as a fallback
            user.save()
    users = AdminUser.objects.exclude(role="Manager")
    feedback_comments = Feedback.objects.filter(category='Comment').order_by('-submitted_at')
    problem_reports = Feedback.objects.filter(category='Report a Problem').order_by('-submitted_at')
    notification_sounds = NotificationSound.objects.filter(is_active=True).order_by('display_name')
    return render(request, 'settings.html', {
        'user': user,
        'users': users,
        'feedback_comments': feedback_comments,
        'problem_reports': problem_reports,
        'notification_sounds': notification_sounds,
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
        # Trigger folder cleanup after deleting all documents
        subprocess.Popen(['python3', '/home/safeprint/dev/SafePrint/scripts/clean_empty_upload_folders.py'])
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
        if not docs:
            return JsonResponse({'success': False, 'error': 'No pending documents found for this customer'})
        
        # Update doc_status and status_updated_at for all docs
        for doc in docs:
            doc.doc_status = 'Queued'
            doc.printer_assigned = None
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
        
        # Start printer assignment for all docs in background
        doc_printer_info = []
        def assign_printer_async(doc_id):
            try:
                doc = Document.objects.get(doc_id=doc_id)
                if doc.doc_status == 'Queued':
                    printer = assign_document_to_printer(doc)
                    if printer:
                        def print_document_async(doc):
                            # Always reload doc from DB before printing each page
                            page_list = doc.get_page_list()
                            for page_num in page_list:
                                try:
                                    fresh_doc = Document.objects.get(doc_id=doc.doc_id)
                                except Document.DoesNotExist:
                                    print(f"[CANCELLED] Document {doc.doc_id} was deleted before printing page {page_num}.")
                                    break
                                print_page(fresh_doc, page_num)
                        threading.Thread(target=print_document_async, args=(doc,)).start()
            except Document.DoesNotExist:
                print(f"[CANCELLED] Document {doc_id} was deleted or cancelled before printer assignment.")

        for doc in docs:
            # Get reroute history for the document
            history_entries = RerouteHistory.objects.filter(document_id=doc.doc_id).select_related('printer').order_by('timestamp')
            reroute_history = [entry.printer.printer_name for entry in history_entries if entry.printer]
            doc_info = {
                'doc_id': doc.doc_id,
                'reroute_history': reroute_history
            }
            threading.Thread(target=assign_printer_async, args=(doc.doc_id,)).start()
            doc_printer_info.append(doc_info)

        return JsonResponse({
            'success': True, 
            'updated_count': updated, 
            'admin_name': admin_name, 
            'approved_doc_ids': approved_doc_ids,
            'documents': doc_printer_info
        })
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
            # Trigger folder cleanup after deleting a document
            subprocess.Popen(['python3', '/home/safeprint/dev/SafePrint/scripts/clean_empty_upload_folders.py'])
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

        now = timezone.now()
        try:
            doc = Document.objects.get(doc_id=doc_id, doc_status='Pending')
            doc.doc_status = 'Queued'
            doc.printer_assigned = None
            doc.status_updated_at = now
            doc.save()
            updated = 1
        except Document.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Document not found'})

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

        # Get reroute history for the document
        reroute_history = []
        history_entries = RerouteHistory.objects.filter(document_id=doc_id).select_related('printer').order_by('timestamp')
        if history_entries.exists():
            reroute_history = [entry.printer.printer_name for entry in history_entries if entry.printer]

        # Start printer assignment in background (don't block UI)
        def assign_printer_async(doc_id):
            try:
                doc = Document.objects.get(doc_id=doc_id)
                if doc.doc_status == 'Queued':
                    printer = assign_document_to_printer(doc)
                    if printer:
                        def print_document_async(doc):
                            page_list = doc.get_page_list()
                            for page_num in page_list:
                                try:
                                    fresh_doc = Document.objects.get(doc_id=doc.doc_id)
                                except Document.DoesNotExist:
                                    print(f"[CANCELLED] Document {doc.doc_id} was deleted before printing page {page_num}.")
                                    break
                                print_page(fresh_doc, page_num)
                        threading.Thread(target=print_document_async, args=(doc,)).start()
            except Document.DoesNotExist:
                print(f"[CANCELLED] Document {doc_id} was deleted or cancelled before printer assignment.")

        threading.Thread(target=assign_printer_async, args=(doc_id,)).start()

        response_data = {
            'success': True, 
            'updated_count': updated, 
            'admin_name': admin_name,
            'doc_id': doc_id,
            'reroute_history': reroute_history
        }
        return JsonResponse(response_data)
    return JsonResponse({'success': False, 'error': 'Invalid request method'})


@csrf_exempt
def update_notification_prefs(request):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})
    user_id = request.session.get('admin_user_id')
    if not user_id:
        return JsonResponse({'success': False, 'error': 'Not authenticated'})
    try:
        user = AdminUser.objects.get(id=user_id)
    except AdminUser.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'User not found'})

    try:
        data = json.loads(request.body.decode('utf-8')) if request.body else {}
    except Exception:
        data = request.POST

    sound_slug = data.get('sound_slug') or None
    sound_id = data.get('sound_id') or None
    sound_enabled = data.get('sound_enabled')
    # volume removed

    # Update sound selection if provided
    if sound_id or sound_slug:
        sound = None
        if sound_id:
            try:
                sound = NotificationSound.objects.get(id=sound_id, is_active=True)
            except NotificationSound.DoesNotExist:
                return JsonResponse({'success': False, 'error': 'Sound not found'})
        elif sound_slug:
            try:
                sound = NotificationSound.objects.get(slug=sound_slug, is_active=True)
            except NotificationSound.DoesNotExist:
                return JsonResponse({'success': False, 'error': 'Sound not found'})
        user.notification_sound = sound

    # Update enabled flag
    if sound_enabled is not None:
        if isinstance(sound_enabled, bool):
            user.sound_enabled = sound_enabled
        else:
            user.sound_enabled = str(sound_enabled).lower() in ['1', 'true', 'yes', 'on']

    # Volume was removed from preferences

    user.save()
    return JsonResponse({'success': True})


@csrf_exempt
def get_notification_prefs(request):
    """API endpoint to get user's notification sound preferences"""
    user_id = request.session.get('admin_user_id')
    if not user_id:
        return JsonResponse({'success': False, 'error': 'Not authenticated'})
    
    try:
        admin_user = AdminUser.objects.get(id=user_id)
        sound_enabled = admin_user.sound_enabled
        sound_slug = admin_user.notification_sound.slug if admin_user.notification_sound else 'chime'
        
        return JsonResponse({
            'success': True,
            'sound_enabled': sound_enabled,
            'sound_slug': sound_slug,
            'sound_path': f'/static/sounds/{sound_slug}.mp3'
        })
    except AdminUser.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'User not found'})

def printer_status_stream(request):
    # SSE headers
    response = StreamingHttpResponse(printer_status_event_stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    return response


def printer_status_event_stream():
    last_data = None
    while True:
        printers = Printer.objects.all()
        data = []
        for printer in printers:
            ink_status = printer.ink_status
            
            # If no ink_status is set in the database, calculate it based on individual ink levels
            if not ink_status or ink_status == "OK":
                low_ink_colors = []
                
                # Check each ink color
                if hasattr(printer, 'ink_cyan') and printer.ink_cyan == 'LOW':
                    low_ink_colors.append('cyan')
                if hasattr(printer, 'ink_magenta') and printer.ink_magenta == 'LOW':
                    low_ink_colors.append('magenta')
                if hasattr(printer, 'ink_yellow') and printer.ink_yellow == 'LOW':
                    low_ink_colors.append('yellow')
                if hasattr(printer, 'ink_black') and printer.ink_black == 'LOW':
                    low_ink_colors.append('black')
                    
                if low_ink_colors:
                    ink_status = ','.join(low_ink_colors)
                else:
                    ink_status = "OK"
                
            data.append({
                'id': printer.id,
                'printer_name': printer.printer_name,
                'model_name': getattr(printer, 'model_name', ''),
                'ip_address': printer.ip_address,
                'node_name': getattr(printer, 'node_name', ''),
                'printer_status': printer.printer_status,
                'ink_status': ink_status,
                'paper_assigned': getattr(printer, 'paper_assigned', ''),
                'paper_quality': getattr(printer, 'paper_quality', ''),
            })
        json_data = json.dumps({'printers': data})
        if json_data != last_data:
            yield f"data: {json_data}\n\n"
            last_data = json_data
        time.sleep(1)  # Poll every 1 second for more responsive updates


def dashboard_status_stream(request):
    response = StreamingHttpResponse(dashboard_status_event_stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    return response


def dashboard_status_event_stream():
    last_data = None
    while True:
        # Gather dashboard stats
        completed_jobs_count = Document.objects.filter(doc_status='Finished').count()
        printer_errors_count = Printer.objects.exclude(printer_status__in=['Sleep', 'Ready', 'Printing']).count()
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


@transaction.atomic
def assign_document_to_printer(document):
    import time
    while True:
        # Check if document still exists and is queued
        try:
            doc = Document.objects.get(doc_id=document.doc_id)
        except Document.DoesNotExist:
            print(f"[CANCELLED] Document {document.doc_id} was deleted or cancelled before printer assignment.")
            return None
        if doc.doc_status != 'Queued':
            print(f"[CANCELLED] Document {document.doc_id} is no longer queued (status: {doc.doc_status}). Aborting printer assignment.")
            return None
        printers = Printer.objects.all()
        available = [
            p for p in printers
            if p.printer_status in ['Ready', 'Sleep']
            and getattr(p, 'paper_assigned', None) == getattr(document, 'paper_size', None)
            and getattr(p, 'paper_quality', None) == getattr(document, 'paper_quality', None)
        ]
        if available:
            available.sort(key=lambda p: p.last_checked or timezone.now())
            printer = available[0]
            doc.printer_assigned = printer
            doc.doc_status = 'Printing'
            doc.save()
            # Log assignment in reroute history
            RerouteHistory.objects.create(document=doc, printer=printer, status='Assigned')
            print(f"[ASSIGNED] Document {doc.doc_id} assigned to {printer.printer_name}.")
            return printer
        else:
            print(f"No available printer for {doc.paper_size} ({getattr(doc, 'paper_quality', None)}). Document {doc.doc_id} paused. Retrying in 5 seconds...")
            time.sleep(5)


def print_page(document, page_num):
    # Extract print preferences from document
    copies = getattr(document, 'copies', 1)
    orientation = getattr(document, 'orientation', 'portrait')
    color_mode = getattr(document, 'color_mode', 'color')
    paper_size = getattr(document, 'paper_size', 'A4')
    paper_quality = getattr(document, 'paper_quality', 'Standard')
    stored_name = getattr(document, 'stored_name', None)
    session_key = getattr(document, 'session_key', None)
    # Find the file path
    if not stored_name:
        print(f"[ERROR] Document {document.doc_id} has no stored file name. Cannot print page {page_num}.")
        return
    uploads_dir = os.path.join(settings.MEDIA_ROOT, 'uploads')
    # If session_key is present, use it, else search for file
    if session_key:
        file_path = os.path.join(uploads_dir, session_key, stored_name)
    else:
        # Search for file in uploads_dir
        file_path = None
        for root, dirs, files in os.walk(uploads_dir):
            if stored_name in files:
                file_path = os.path.join(root, stored_name)
                break
    if not file_path or not os.path.isfile(file_path):
        print(f"[ERROR] File for document {document.doc_id} page {page_num} not found at {file_path}. Cannot print.")
        return
    printer = document.printer_assigned
    if not printer:
        print(f"[ERROR] No printer assigned for document {document.doc_id}. Cannot print page {page_num}.")
        return
    # Wait until printer is Ready or Sleep
    while printer.printer_status not in ['Ready', 'Sleep']:
        print(f"[WAIT] Printer {printer.printer_name} is {printer.printer_status}. Waiting for Ready/Sleep...")
        time.sleep(2)
        printer.refresh_from_db()
    # Send print job
    print(f"[PRINT] Sending page {page_num} of document {document.doc_id} to printer {printer.printer_name} ({printer.printer_status})")
    model_name = getattr(printer, 'model_name', printer.printer_name)
    if model_name.lower().startswith('brother '):
        model_name = model_name[8:]
    model_name = model_name.replace('-', '').replace(' ', '')
    # Map paper_size to printer-compatible media
    if paper_size == 'Long':
        media_size = 'Folio'  
    else:
        media_size = paper_size
    lp_cmd = [
        'lp',
        '-d', model_name,
        '-n', str(copies),
        '-o', f'page-ranges={page_num}',
        '-o', f'orientation-requested={"4" if orientation=="Landscape" else "3"}',
        '-o', f'{"BRMonoColor=Mono" if color_mode=="Black and White" else "ColorModel=Color"}',
        '-o', f'media={media_size}',  # Updated to use mapped media_size
        file_path
    ]
    try:
        subprocess.run(lp_cmd, check=True)
    except Exception as e:
        print(f"[ERROR] Failed to print page {page_num} of document {document.doc_id} on printer {printer.printer_name}: {e}")
        printer.printer_status = 'Error'
        printer.save()
        print(f"[REROUTE] Rerouting remaining pages of document {document.doc_id}")
        reroute_document_on_error(document)
        return
    # Wait for printer status to become 'Printing', abort if document is canceled/deleted
    while True:
        printer.refresh_from_db()
        # Check if document still exists and is not canceled/deleted
        try:
            doc_check = Document.objects.get(doc_id=document.doc_id)
        except Document.DoesNotExist:
            print(f"[CANCELLED] Document {document.doc_id} was deleted during printing. Aborting print job for page {page_num}.")
            return
        if doc_check.doc_status not in ['Queued', 'Printing']:
            print(f"[CANCELLED] Document {document.doc_id} status is {doc_check.doc_status}. Aborting print job for page {page_num}.")
            return
        if printer.printer_status == 'Printing':
            print(f"[SUCCESS] Printed page {page_num} of document {document.doc_id} on printer {printer.printer_name}")
            break
        print(f"[WAIT] Waiting for printer {printer.printer_name} to start printing page {page_num}...")
        time.sleep(1)
    # Wait for printer status to become 'Ready' after printing
    while True:
        printer.refresh_from_db()
        if printer.printer_status == 'Ready':
            print(f"[READY] Printer {printer.printer_name} is ready after printing page {page_num}.")
            break
        print(f"[WAIT] Waiting for printer {printer.printer_name} to finish printing page {page_num}...")
        time.sleep(1)
    # Mark page as printed in DB only after successful print and status transitions
    document.mark_page_printed(page_num)
    print(f"[MARKED] Page {page_num} of document {document.doc_id} marked as printed.")
    # If all pages printed, set status to Finished and update printed_at to last printer
    if len(document.get_remaining_pages()) == 0:
        document.doc_status = 'Finished'
        document.status_updated_at = timezone.now()
        # Set printed_at to the last printer used
        document.printed_at = document.printer_assigned
        document.save()
        print(f"[COMPLETE] Document {document.doc_id} printing complete. Printed at: {document.printed_at}")


def reroute_document_on_error(document):
    remaining_pages = document.get_remaining_pages()
    next_printer = assign_document_to_printer(document)
    if next_printer:
        # Continue printing remaining pages
        for page_num in remaining_pages:
            print_page(document, page_num)
        # Log reroute
        RerouteHistory.objects.create(document=document, printer=next_printer, status='Rerouted')
    else:
        # No available printer, notify admin
        Feedback.objects.create(
            category='Report a Problem',
            name='[SYSTEM GENERATED]',
            message=f"Reroute failed: No available printer for {document.paper_size}. Document {document.doc_id} paused."
        )