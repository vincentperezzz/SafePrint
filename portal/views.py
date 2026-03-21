import os
import json
import time
import logging
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
from .models import AdminUser, Printer, Document, Payment, NotificationSound, SupportTicket, SiteSetting, TicketAuditLog
from django.http import JsonResponse, StreamingHttpResponse
from django.contrib.auth.hashers import make_password, check_password
from django.contrib.auth.decorators import login_required

logger = logging.getLogger(__name__)

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
    printer_errors_count = Printer.objects.exclude(printer_status__in=['Sleep', 'Ready', 'Printing']).count()
    
    # Ticket queries
    active_tickets = list(SupportTicket.objects.filter(
        status__in=['open', 'in-progress']
    ).select_related('document').order_by('-created_at'))
    
    resolved_tickets = list(SupportTicket.objects.filter(
        status__in=['resolved', 'closed', 'voided', 'refunded']
    ).select_related('document').order_by('-resolved_at', '-updated_at'))
    
    # Attach payment amount to each ticket via its document
    for ticket in active_tickets:
        ticket.payment_amount = None
        if ticket.document:
            payment = Payment.objects.filter(doc=ticket.document).first()
            if payment:
                ticket.payment_amount = payment.price
    
    for ticket in resolved_tickets:
        ticket.payment_amount = None
        if ticket.document:
            payment = Payment.objects.filter(doc=ticket.document).first()
            if payment:
                ticket.payment_amount = payment.price
    
    active_tickets_count = len(active_tickets)
    resolved_tickets_count = len(resolved_tickets)
    
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
        'printer_errors_count': printer_errors_count,
        'active_tickets': active_tickets,
        'resolved_tickets': resolved_tickets,
        'active_tickets_count': active_tickets_count,
        'resolved_tickets_count': resolved_tickets_count,
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


# ─────────────────────────────────────────────
# Minimum payment and credit constants
# ─────────────────────────────────────────────
XENDIT_MIN_AMOUNT = 5  # ₱5 minimum for Xendit transactions
VOUCHER_CREDIT_EXPIRY_DAYS = 120  # Credits expire after 120 days


def voucher_management(request):
    """Admin page for viewing and managing voucher credits."""
    user_id = request.session.get('admin_user_id')
    if not user_id:
        raise Http404("User not found in session")
    
    from portal.models import VoucherCredit
    vouchers = VoucherCredit.objects.all().order_by('-created_at')
    
    return render(request, 'vouchers.html', {
        'vouchers': vouchers,
    })


def voucher_list_api(request):
    """API to list all vouchers with filtering."""
    user_id = request.session.get('admin_user_id')
    if not user_id:
        return JsonResponse({'success': False, 'error': 'Unauthorized'}, status=403)
    
    from portal.models import VoucherCredit
    status_filter = request.GET.get('status', 'all')
    search = request.GET.get('search', '').strip()
    
    vouchers = VoucherCredit.objects.all()
    
    if status_filter == 'active':
        vouchers = vouchers.filter(is_active=True, expires_at__gt=timezone.now(), remaining_balance__gt=0)
    elif status_filter == 'expired':
        vouchers = vouchers.filter(expires_at__lte=timezone.now())
    elif status_filter == 'used':
        vouchers = vouchers.filter(remaining_balance__lte=0)
    elif status_filter == 'inactive':
        vouchers = vouchers.filter(is_active=False)
    
    if search:
        vouchers = vouchers.filter(Q(code__icontains=search) | Q(last_customer_id__icontains=search))
    
    vouchers = vouchers.order_by('-created_at')[:200]
    
    data = []
    for v in vouchers:
        data.append({
            'id': v.id,
            'code': v.code,
            'original_amount': float(v.original_amount),
            'remaining_balance': float(v.remaining_balance),
            'is_active': v.is_active,
            'is_expired': v.is_expired,
            'is_usable': v.is_usable,
            'last_customer_id': v.last_customer_id or '',
            'created_at': localtime(v.created_at).strftime('%b %d, %Y %I:%M %p'),
            'expires_at': localtime(v.expires_at).strftime('%b %d, %Y'),
            'last_used_at': localtime(v.last_used_at).strftime('%b %d, %Y %I:%M %p') if v.last_used_at else 'Never',
        })
    
    return JsonResponse({'success': True, 'vouchers': data})


def generate_voucher_api(request):
    """API to generate a new voucher code with a specified amount."""
    user_id = request.session.get('admin_user_id')
    if not user_id:
        return JsonResponse({'success': False, 'error': 'Unauthorized'}, status=403)
    
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'POST required'})
    
    import secrets
    import string
    from portal.models import VoucherCredit
    
    try:
        data = json.loads(request.body)
        amount = data.get('amount')
        
        if amount is None:
            return JsonResponse({'success': False, 'error': 'Amount is required'})
        
        amount = float(amount)
        if amount <= 0 or amount > 10000:
            return JsonResponse({'success': False, 'error': 'Amount must be between ₱0.01 and ₱10,000'})
        
        # Generate unique voucher code (8 chars, alphanumeric uppercase)
        for _ in range(10):
            code = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))
            if not VoucherCredit.objects.filter(code=code).exists():
                break
        else:
            return JsonResponse({'success': False, 'error': 'Failed to generate unique code'})
        
        from datetime import timedelta
        voucher = VoucherCredit.objects.create(
            code=code,
            original_amount=amount,
            remaining_balance=amount,
            is_active=True,
            expires_at=timezone.now() + timedelta(days=VOUCHER_CREDIT_EXPIRY_DAYS),
        )
        
        return JsonResponse({
            'success': True,
            'voucher': {
                'id': voucher.id,
                'code': voucher.code,
                'original_amount': float(voucher.original_amount),
                'remaining_balance': float(voucher.remaining_balance),
                'is_active': True,
                'is_expired': False,
                'is_usable': True,
                'last_customer_id': '',
                'created_at': localtime(voucher.created_at).strftime('%b %d, %Y %I:%M %p'),
                'expires_at': localtime(voucher.expires_at).strftime('%b %d, %Y'),
                'last_used_at': 'Never',
            }
        })
    except (ValueError, TypeError):
        return JsonResponse({'success': False, 'error': 'Invalid amount'})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


def toggle_voucher_api(request):
    """API to activate/deactivate a voucher."""
    user_id = request.session.get('admin_user_id')
    if not user_id:
        return JsonResponse({'success': False, 'error': 'Unauthorized'}, status=403)
    
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'POST required'})
    
    from portal.models import VoucherCredit
    
    try:
        data = json.loads(request.body)
        voucher_id = data.get('id')
        voucher = VoucherCredit.objects.get(id=voucher_id)
        voucher.is_active = not voucher.is_active
        voucher.save(update_fields=['is_active'])
        
        return JsonResponse({
            'success': True,
            'is_active': voucher.is_active,
        })
    except VoucherCredit.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Voucher not found'})


def delete_voucher_api(request):
    """API to delete a voucher."""
    user_id = request.session.get('admin_user_id')
    if not user_id:
        return JsonResponse({'success': False, 'error': 'Unauthorized'}, status=403)
    
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'POST required'})
    
    from portal.models import VoucherCredit
    
    try:
        data = json.loads(request.body)
        voucher_id = data.get('id')
        voucher = VoucherCredit.objects.get(id=voucher_id)
        voucher.delete()
        return JsonResponse({'success': True})
    except VoucherCredit.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Voucher not found'})


@csrf_exempt
def check_voucher_api(request):
    """
    AJAX endpoint to validate a voucher code and return its balance.
    Called from the payment page when a student enters a voucher code.
    
    POST /api/check-voucher/
    Body: {"code": "ABC123"}
    
    Returns:
        - success: True if valid voucher with balance
        - balance: remaining balance (float)
        - expires_at: expiry date string
    """
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'POST required'})
    
    try:
        data = json.loads(request.body)
        code = data.get('code', '').strip().upper()
        
        if not code:
            return JsonResponse({'success': False, 'error': 'Please enter a voucher code.'})
        
        from portal.models import VoucherCredit
        try:
            voucher = VoucherCredit.objects.get(code=code)
        except VoucherCredit.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Voucher code not found.'})
        
        if not voucher.is_active:
            return JsonResponse({'success': False, 'error': 'This voucher has been deactivated.'})
        
        if voucher.is_expired:
            return JsonResponse({'success': False, 'error': 'This voucher has expired.'})
        
        if voucher.remaining_balance <= 0:
            return JsonResponse({'success': False, 'error': 'This voucher has no remaining balance.'})
        
        return JsonResponse({
            'success': True,
            'balance': float(voucher.remaining_balance),
            'code': voucher.code,
            'expires_at': voucher.expires_at.strftime('%B %d, %Y'),
        })
    
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Invalid request format.'})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


@csrf_exempt
def get_active_tickets_api(request):
    """
    API endpoint that returns active and resolved tickets as JSON.
    Used by dashboard JavaScript for real-time updates without page reload.
    """
    try:
        # Fetch active tickets
        active_tickets = list(SupportTicket.objects.filter(
            status__in=['open', 'in-progress']
        ).select_related('document').order_by('-created_at'))
        
        # Fetch resolved tickets
        resolved_tickets = list(SupportTicket.objects.filter(
            status__in=['resolved', 'closed', 'voided', 'refunded']
        ).select_related('document').order_by('-resolved_at', '-updated_at'))
        
        # Attach payment amounts and format data
        active_tickets_data = []
        for ticket in active_tickets:
            payment_amount = None
            if ticket.document:
                payment = Payment.objects.filter(doc=ticket.document).first()
                if payment:
                    payment_amount = float(payment.price)
            
            active_tickets_data.append({
                'id': ticket.id,
                'ticket_number': ticket.ticket_number,
                'customer_id': ticket.customer_id,
                'customer_name': ticket.customer_name,
                'email': ticket.email,
                'phone_number': ticket.phone_number,
                'document_name': ticket.document_name,
                'problem_type': ticket.get_problem_type_display(),
                'description': ticket.description,
                'created_at': ticket.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                'payment_amount': payment_amount,
                'was_reprinted': ticket.was_reprinted,
                'doc_id': ticket.document.doc_id if ticket.document else '',
                'gcash_number': ticket.gcash_number,
                'receipt_code': ticket.receipt_code,
                'receipt_screenshot_url': ticket.receipt_screenshot.url if ticket.receipt_screenshot else '',
            })
        
        resolved_tickets_data = []
        for ticket in resolved_tickets:
            payment_amount = None
            if ticket.document:
                payment = Payment.objects.filter(doc=ticket.document).first()
                if payment:
                    payment_amount = float(payment.price)
            
            resolved_tickets_data.append({
                'id': ticket.id,
                'ticket_number': ticket.ticket_number,
                'customer_id': ticket.customer_id,
                'customer_name': ticket.customer_name,
                'email': ticket.email,
                'phone_number': ticket.phone_number,
                'document_name': ticket.document_name,
                'problem_type': ticket.get_problem_type_display(),
                'description': ticket.description,
                'created_at': ticket.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                'payment_amount': payment_amount,
                'was_reprinted': ticket.was_reprinted,
                'doc_id': ticket.document.doc_id if ticket.document else '',
                'status': ticket.get_status_display(),
                'resolved_by': ticket.resolved_by,
                'gcash_number': ticket.gcash_number,
                'refund_amount': float(ticket.refund_amount) if ticket.refund_amount else None,
                'refund_status': ticket.refund_status,
                'refund_reference': ticket.refund_reference,
                'refund_completed_at': ticket.refund_completed_at.strftime('%Y-%m-%d %H:%M:%S') if ticket.refund_completed_at else None,
                'receipt_code': ticket.receipt_code,
                'receipt_screenshot_url': ticket.receipt_screenshot.url if ticket.receipt_screenshot else '',
            })
        
        return JsonResponse({
            'success': True,
            'active_tickets': active_tickets_data,
            'resolved_tickets': resolved_tickets_data,
            'active_count': len(active_tickets_data),
            'resolved_count': len(resolved_tickets_data),
        })
    except Exception as e:
        logger.error(f"Error fetching active tickets: {str(e)}")
        return JsonResponse({'success': False, 'error': str(e)})


def payment(request):
    """
    Handle payment gateway for documents via KLCiS integration.
    
    Flow:
    1. GET: Display payment form with documents and total price
    2. POST (action=initiate): Generate voucher code, upload to KLCiS, return payment URL
    3. POST (action=verify): Verify voucher code entered by customer, approve documents
    """
    # Default context to prevent auto-close
    default_context = {
        'customer_id': '',
        'documents': [],
        'total_price': 0,
        'stars': range(1, 6),
        'debug': False,
        'error': None,
        'klcis_base_url': settings.KLCIS_BASE_URL,
    }
    
    if request.method == 'GET':
        customer_id = request.GET.get('customer_id', '')
        documents_ids = request.GET.getlist('doc_ids', [])
        debug = request.GET.get('debug', 'false').lower() == 'true'
        
        # Debug/Development mode with dummy data for UI testing
        if debug:
            dummy_documents = [
                {
                    'name': 'Abstract.pdf',
                    'doc_id': 'DOC-1001',
                    'price': 25.00,
                    'status': 'Pending'
                },
                {
                    'name': 'School Stuff.pdf',
                    'doc_id': 'DOC-1002',
                    'price': 20.00,
                    'status': 'Pending'
                }
            ]
            
            context = default_context.copy()
            context.update({
                'customer_id': 'CID-4405',
                'documents': dummy_documents,
                'total_price': 45.00,
                'debug': True
            })
            return render(request, 'payment.html', context)
        
        if not customer_id or not documents_ids:
            return redirect('home')
        
        try:
            # Normalize customer ID
            if customer_id.upper().startswith('CID-'):
                normalized_id = customer_id[4:]
            else:
                normalized_id = customer_id
            
            # Fetch documents with payment info
            documents = Document.objects.filter(
                doc_id__in=documents_ids,
                doc_status='Pending'
            ).order_by('-time_submitted')
            
            # No pending documents found — redirect home
            if not documents.exists():
                return redirect('home')

            documents_data = []
            total_price = 0.0
            doc_ids_list = []
            
            for doc in documents:
                try:
                    payment_obj = Payment.objects.get(doc=doc)
                    price = float(payment_obj.price)
                except Payment.DoesNotExist:
                    price = 0.0
                
                documents_data.append({
                    'name': doc.filename,
                    'doc_id': doc.doc_id,
                    'price': price,
                    'status': doc.doc_status
                })
                doc_ids_list.append(doc.doc_id)
                total_price += price
            
            # Generate star ratings (for feedback)
            stars = range(1, 6)  # 5 stars
            
            context = default_context.copy()
            context.update({
                'customer_id': customer_id,
                'documents': documents_data,
                'total_price': round(total_price, 2),
                'doc_ids_json': json.dumps(doc_ids_list),
                'stars': stars,
            })
            
            return render(request, 'payment.html', context)
            
        except Exception as e:
            context = default_context.copy()
            context['error'] = f'Error loading payment: {str(e)}'
            return render(request, 'payment.html', context)
    
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            action = data.get('action', '')
            customer_id = data.get('customer_id', '').strip()
            documents_ids = data.get('doc_ids', [])
            
            if not customer_id:
                return JsonResponse({
                    'success': False,
                    'error': 'Customer ID is required'
                })

            # ─────────────────────────────────────────────
            # ACTION: INITIATE — Calculate charges, apply credit, create payment
            # ─────────────────────────────────────────────
            if action == 'initiate':
                phone_number = data.get('phone_number', '').strip()
                voucher_credit_code = data.get('voucher_credit_code', '').strip().upper()

                if not documents_ids:
                    return JsonResponse({
                        'success': False,
                        'error': 'No documents specified'
                    })

                # ─── Check printer availability before proceeding ───
                pending_docs = Document.objects.filter(doc_id__in=documents_ids, doc_status='Pending')
                for doc in pending_docs:
                    matching_printers = Printer.objects.filter(
                        paper_assigned=doc.paper_size,
                        paper_quality=doc.paper_quality,
                        printer_status__in=['Ready', 'Printing', 'Sleep']
                    )
                    if not matching_printers.exists():
                        return JsonResponse({
                            'success': False,
                            'error': f'No available printer for {doc.paper_size} {doc.paper_quality} GSM. All matching printers are currently offline or unavailable. Please try again later.'
                        })

                # Calculate total price from Payment records
                total_price = 0.0
                for doc_id in documents_ids:
                    try:
                        payment_obj = Payment.objects.get(doc__doc_id=doc_id)
                        total_price += float(payment_obj.price)
                    except Payment.DoesNotExist:
                        pass
                
                if total_price <= 0:
                    return JsonResponse({
                        'success': False,
                        'error': 'Invalid payment amount'
                    })
                
                # ─── Apply voucher credit if provided ───
                credit_applied = 0.0
                credit_voucher = None
                
                if voucher_credit_code:
                    from portal.models import VoucherCredit
                    try:
                        credit_voucher = VoucherCredit.objects.get(code=voucher_credit_code)
                    except VoucherCredit.DoesNotExist:
                        return JsonResponse({
                            'success': False,
                            'error': 'Voucher code not found.'
                        })
                    
                    if not credit_voucher.is_usable:
                        return JsonResponse({
                            'success': False,
                            'error': 'This voucher is expired or has no remaining balance.'
                        })
                    
                    # Apply up to the voucher balance
                    credit_applied = min(
                        float(credit_voucher.remaining_balance),
                        total_price
                    )
                
                balance_due = total_price - credit_applied
                
                # ─── Case 1: Fully covered by credit (₱0 charge) ───
                if balance_due <= 0:
                    # Skip KLCiS entirely — approve documents directly
                    with transaction.atomic():
                        # Deduct credit from voucher
                        credit_voucher.remaining_balance = float(credit_voucher.remaining_balance) - credit_applied
                        if credit_voucher.remaining_balance <= 0:
                            credit_voucher.remaining_balance = 0
                            credit_voucher.is_active = False
                        credit_voucher.last_used_at = timezone.now()
                        credit_voucher.save()
                        
                        # Update all Payment records — mark as Paid
                        for doc_id in documents_ids:
                            try:
                                payment_obj = Payment.objects.get(doc__doc_id=doc_id)
                                payment_obj.payment_status = 'Paid'
                                payment_obj.payment_method = 'voucher_credit'
                                payment_obj.approved_at = timezone.now()
                                payment_obj.approved_by = f'Credit:{voucher_credit_code}'
                                payment_obj.save()
                                
                                # Queue document for printing
                                doc = payment_obj.doc
                                doc.doc_status = 'Queued'
                                doc.save()
                            except Payment.DoesNotExist:
                                pass
                    
                    remaining = float(credit_voucher.remaining_balance)
                    
                    # Store remaining credit info in session + DB for confirmation page coupon
                    if remaining > 0:
                        credit_voucher.last_customer_id = customer_id
                        credit_voucher.save()
                        request.session['credit_info'] = {
                            'code': voucher_credit_code,
                            'balance': remaining,
                            'expires_at': credit_voucher.expires_at.strftime('%B %d, %Y'),
                        }
                    
                    return JsonResponse({
                        'success': True,
                        'mode': 'credit_only',
                        'message': f'Paid using voucher credit! ₱{credit_applied:.2f} applied.',
                        'redirect_url': f'/confirmation/{customer_id}/',
                        'credit_remaining': remaining,
                        'credit_code': voucher_credit_code if remaining > 0 else None,
                    })
                
                # ─── Phone number is required from here (KLCiS payment needed) ───
                if not phone_number:
                    return JsonResponse({
                        'success': False,
                        'error': 'Phone number is required for payment.'
                    })
                
                # ─── Case 2: Balance < ₱5 minimum — bump to ₱5 ───
                charge_amount = balance_due
                excess_credit = 0.0
                
                if charge_amount < XENDIT_MIN_AMOUNT:
                    excess_credit = XENDIT_MIN_AMOUNT - charge_amount
                    charge_amount = XENDIT_MIN_AMOUNT
                
                # Generate a unique voucher code for KLCiS
                import random, string
                klcis_voucher_code = ''.join(random.choices(
                    string.ascii_lowercase + string.digits, k=8
                ))
                
                # Upload voucher to KLCiS dashboard
                from portal.services.klcis import create_and_upload_voucher, get_checkout_url, snapshot_existing_transactions
                result = create_and_upload_voucher(klcis_voucher_code, charge_amount)
                
                if not result['success']:
                    return JsonResponse({
                        'success': False,
                        'error': f'Payment setup failed: {result["message"]}'
                    })
                
                # Snapshot existing PAID transactions for dedup
                baseline_txn_ids = snapshot_existing_transactions(phone_number, charge_amount)
                request.session['baseline_txn_ids'] = baseline_txn_ids
                
                # Deduct credit from voucher NOW (optimistic — refund if cancelled)
                if credit_voucher and credit_applied > 0:
                    credit_voucher.remaining_balance = float(credit_voucher.remaining_balance) - credit_applied
                    if credit_voucher.remaining_balance <= 0:
                        credit_voucher.remaining_balance = 0
                        credit_voucher.is_active = False
                    credit_voucher.last_used_at = timezone.now()
                    credit_voucher.save()
                
                # Store metadata in all Payment records
                for doc_id in documents_ids:
                    try:
                        payment_obj = Payment.objects.get(doc__doc_id=doc_id)
                        payment_obj.voucher_code = klcis_voucher_code
                        payment_obj.payment_method = 'klcis'
                        payment_obj.phone_number = phone_number
                        payment_obj.save()
                    except Payment.DoesNotExist:
                        pass
                
                # Build direct checkout URL
                checkout_url = get_checkout_url(charge_amount, phone_number)
                
                # Store session metadata for redirect handling & credit tracking
                request.session['pending_payment_cid'] = customer_id
                request.session['pending_payment_doc_ids'] = documents_ids
                request.session['pending_excess_credit'] = excess_credit
                request.session['pending_credit_code'] = voucher_credit_code if voucher_credit_code else None
                request.session['pending_credit_applied'] = credit_applied
                request.session['pending_charge_amount'] = float(charge_amount)
                
                return JsonResponse({
                    'success': True,
                    'mode': 'payment',
                    'message': 'Payment link created',
                    'checkout_url': checkout_url,
                    'voucher_code': klcis_voucher_code,
                    'amount': int(round(charge_amount)),
                    'original_total': round(total_price, 2),
                    'credit_applied': round(credit_applied, 2),
                    'excess_credit': round(excess_credit, 2),
                })

            # ─────────────────────────────────────────────
            # ACTION: VERIFY — Poll KLCiS to check if payment is complete
            # ─────────────────────────────────────────────
            elif action == 'verify':
                # Find pending payments for this customer that have a voucher code
                payments = Payment.objects.filter(
                    doc__customer_id=customer_id,
                    payment_status='Unpaid',
                    voucher_code__isnull=False,
                ).exclude(voucher_code='')
                
                if not payments.exists():
                    # Check if payments are already Paid (user re-visiting page)
                    already_paid = Payment.objects.filter(
                        doc__customer_id=customer_id,
                        payment_status='Paid',
                    ).exists()
                    
                    if already_paid:
                        return JsonResponse({
                            'success': True,
                            'message': 'Payment already verified! Your documents are queued for printing.',
                            'redirect_url': f'/confirmation/{customer_id}/'
                        })
                    
                    return JsonResponse({
                        'success': False,
                        'error': 'No pending payment found for this customer.'
                    })
                
                # Get phone number and total amount for transaction verification
                first_payment = payments.first()
                phone_number = first_payment.phone_number
                voucher_code = first_payment.voucher_code
                total_amount = sum(float(p.price) for p in payments)
                
                # Use the actual charge amount sent to KLCiS (may differ from
                # total_amount due to Xendit minimum bump or credit deductions)
                charge_amount = request.session.get('pending_charge_amount')
                if charge_amount is None:
                    # Fallback: apply Xendit minimum bump (same logic as initiate)
                    credit_applied = request.session.get('pending_credit_applied', 0)
                    balance_due = total_amount - credit_applied
                    charge_amount = max(balance_due, XENDIT_MIN_AMOUNT)
                
                if not phone_number:
                    return JsonResponse({
                        'success': False,
                        'error': 'No phone number on record for this payment.'
                    })
                
                # Collect Transaction IDs already used by previous payments (dedup)
                # From active Payment records
                used_txn_ids = set(
                    Payment.objects.filter(
                        klcis_transaction_id__isnull=False,
                    ).exclude(
                        klcis_transaction_id=''
                    ).values_list('klcis_transaction_id', flat=True)
                )
                # From persistent used-transaction table (survives Payment deletion)
                from portal.models import UsedKLCiSTransaction
                used_txn_ids |= set(
                    UsedKLCiSTransaction.objects.values_list('transaction_id', flat=True)
                )
                
                # Merge baseline snapshot IDs (transactions that existed BEFORE
                # this payment was initiated — prevents matching old transactions)
                baseline_ids = set(request.session.get('baseline_txn_ids', []))
                exclude_ids = used_txn_ids | baseline_ids
                
                # Check the KLCiS Transaction Logs page for a PAID entry
                # matching this phone number + charge amount, excluding old + used txn IDs
                from portal.services.klcis import verify_transaction_payment
                result = verify_transaction_payment(phone_number, charge_amount, exclude_ids)
                
                if result['success']:
                    txn_id = result.get('transaction_id')
                    
                    # Persist the transaction ID so it survives Payment deletion
                    if txn_id:
                        from portal.models import UsedKLCiSTransaction
                        UsedKLCiSTransaction.objects.get_or_create(
                            transaction_id=txn_id,
                            defaults={
                                'phone_number': phone_number or '',
                                'amount': charge_amount,
                            }
                        )
                    
                    # Payment confirmed! Mark all documents as Queued
                    with transaction.atomic():
                        for i, payment_obj in enumerate(payments):
                            payment_obj.payment_status = 'Paid'
                            payment_obj.approved_at = timezone.now()
                            payment_obj.approved_by = 'KLCiS-Auto'
                            # Store txn_id on first payment only (unique constraint)
                            if i == 0 and txn_id:
                                payment_obj.klcis_transaction_id = txn_id
                            payment_obj.save()
                            
                            # Update document status to Queued (triggers WRR print)
                            doc = payment_obj.doc
                            doc.doc_status = 'Queued'
                            doc.save()
                    
                    # ── Voucher cleanup: Delete voucher from KLCiS ──
                    if voucher_code:
                        from portal.services.klcis import cleanup_voucher
                        cleanup_voucher(voucher_code)
                    
                    # ── Handle excess credit from ₱5 minimum ──
                    excess_credit = request.session.get('pending_excess_credit', 0)
                    pending_credit_code = request.session.get('pending_credit_code', None)
                    credit_info = None
                    
                    if excess_credit > 0:
                        from portal.models import VoucherCredit
                        from datetime import timedelta
                        import random, string as str_mod
                        
                        # Always use the KLCiS voucher code as the new credit code
                        # (uppercased to match VoucherCredit format).
                        # If student redeemed an old credit code, the old voucher
                        # was already depleted — the new KLCiS voucher code becomes
                        # the new credit code with the excess balance.
                        new_code = voucher_code.upper() if voucher_code else ''.join(
                            random.choices(str_mod.ascii_uppercase + str_mod.digits, k=8)
                        )
                        vc = VoucherCredit.objects.create(
                            code=new_code,
                            original_amount=excess_credit,
                            remaining_balance=excess_credit,
                            last_customer_id=customer_id,
                            expires_at=timezone.now() + timedelta(days=VOUCHER_CREDIT_EXPIRY_DAYS),
                        )
                        credit_info = {
                            'code': vc.code,
                            'balance': float(vc.remaining_balance),
                            'expires_at': vc.expires_at.strftime('%B %d, %Y'),
                        }
                    
                    # Store credit info in session for confirmation page display
                    if credit_info:
                        request.session['credit_info'] = credit_info
                    
                    # Clear pending payment session flags
                    request.session.pop('pending_payment_cid', None)
                    request.session.pop('pending_payment_doc_ids', None)
                    request.session.pop('baseline_txn_ids', None)
                    request.session.pop('pending_excess_credit', None)
                    request.session.pop('pending_credit_code', None)
                    request.session.pop('pending_credit_applied', None)
                    
                    return JsonResponse({
                        'success': True,
                        'message': 'Payment verified! Your documents are now queued for printing.',
                        'redirect_url': f'/confirmation/{customer_id}/',
                        'credit_info': credit_info,
                    })
                else:
                    return JsonResponse({
                        'success': False,
                        'error': 'Payment not yet confirmed. Please complete the payment and try again.',
                        'status': 'pending'
                    })

            elif action == 'cancel':
                # Cancel payment - delete unpaid payments and associated documents
                customer_id = data.get('customer_id')
                if not customer_id:
                    return JsonResponse({'success': False, 'error': 'Missing customer_id'})
                
                # Delete unpaid payments and their documents
                unpaid_payments = Payment.objects.filter(
                    doc__customer_id=customer_id,
                    payment_status='Unpaid'
                )
                
                # ── Voucher cleanup: Delete voucher from KLCiS on cancel ──
                # Don't leave orphaned vouchers sitting on the KLCiS dashboard
                voucher_codes_to_delete = set(
                    unpaid_payments.exclude(
                        voucher_code__isnull=True
                    ).exclude(
                        voucher_code=''
                    ).values_list('voucher_code', flat=True)
                )
                if voucher_codes_to_delete:
                    from portal.services.klcis import cleanup_voucher
                    for vc in voucher_codes_to_delete:
                        cleanup_voucher(vc)
                
                for payment_obj in unpaid_payments:
                    doc = payment_obj.doc
                    # Delete the uploaded file
                    if doc and doc.stored_name:
                        file_path = os.path.join(settings.MEDIA_ROOT, 'uploads', customer_id, doc.stored_name)
                        if os.path.exists(file_path):
                            os.remove(file_path)
                    # Delete payment and document
                    payment_obj.delete()
                    if doc:
                        doc.delete()
                
                # Clean up empty customer upload folder
                customer_folder = os.path.join(settings.MEDIA_ROOT, 'uploads', customer_id)
                if os.path.exists(customer_folder) and not os.listdir(customer_folder):
                    os.rmdir(customer_folder)
                
                # ── Refund optimistically deducted credit ──
                pending_credit_code = request.session.get('pending_credit_code')
                pending_credit_applied = request.session.get('pending_credit_applied', 0)
                if pending_credit_code and pending_credit_applied > 0:
                    from portal.models import VoucherCredit
                    try:
                        vc = VoucherCredit.objects.get(code=pending_credit_code)
                        vc.remaining_balance = float(vc.remaining_balance) + pending_credit_applied
                        vc.is_active = True
                        vc.save()
                        logger.info(
                            f'Refunded ₱{pending_credit_applied} credit to '
                            f'voucher {pending_credit_code} on cancel'
                        )
                    except VoucherCredit.DoesNotExist:
                        pass
                
                # Clear session flags
                request.session.pop('pending_payment_cid', None)
                request.session.pop('pending_payment_doc_ids', None)
                request.session.pop('pending_excess_credit', None)
                request.session.pop('pending_credit_code', None)
                request.session.pop('pending_credit_applied', None)
                
                return JsonResponse({'success': True, 'message': 'Payment cancelled successfully.'})

            else:
                return JsonResponse({
                    'success': False,
                    'error': 'Invalid action'
                })
            
        except json.JSONDecodeError:
            return JsonResponse({
                'success': False,
                'error': 'Invalid request format'
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'error': f'Payment processing error: {str(e)}'
            })
    
    return JsonResponse({'success': False, 'error': 'Invalid request method'})


def printing_queue(request):
    user_id = request.session.get('admin_user_id')
    if not user_id:
        raise Http404("User not found in session")
    
    # Queue Documents — Pending, Queued, and Printing (Finished goes to Print Completed)
    on_queue_documents = Document.objects.filter(
        doc_status__in=['Pending', 'Queued', 'Printing']
    ).select_related('printer_assigned', 'printed_at').order_by('-time_submitted')
    
    # Fetch all related payments
    payments = {p.doc.doc_id: p for p in Payment.objects.filter(doc__in=on_queue_documents)}

    # Reroute histories for on-queue documents
    reroute_histories = {}
    for doc in on_queue_documents:
        reroute_histories[doc.doc_id] = list(doc.reroute_history.select_related('printer').all())

    return render(request, 'queue.html', {
        'on_queue_documents': on_queue_documents,
        'payments': payments,
        'reroute_histories': reroute_histories,
    })


def print_completed(request):
    user_id = request.session.get('admin_user_id')
    if not user_id:
        raise Http404("User not found in session")
    
    # Get completed documents that were actually printed (have a printed_at printer)
    # Documents with no printer assigned are NOT completed — they belong in the queue
    completed_documents = Document.objects.filter(
        doc_status='Finished',
        printed_at__isnull=False
    ).select_related('printed_at').order_by('printer_assigned__id', '-time_submitted')
    
    # Group documents by printer
    printers_with_completed = {}
    for doc in completed_documents:
        printer_id = doc.printed_at.id
        printer_name = str(doc.printed_at)
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
    
    # Set N/A as default ink status for printers with null ink status or Offline status
    for printer in printers:
        if printer.ink_status is None or printer.printer_status == "Offline":
            printer.ink_status = "N/A"
    
    paper_size_choices = Printer.PAPER_SIZE_CHOICES
    gsm_choices = Printer.GSM_CHOICES
    return render(request, 'status.html', {
        'printers': printers,
        'paper_size_choices': paper_size_choices,
        'gsm_choices': gsm_choices,
    })


@csrf_exempt
def update_printer_field(request):
    if request.method == "POST":
        printer_id = request.POST.get('printer_id')
        field = request.POST.get('field')
        value = request.POST.get('value')
        try:
            printer = Printer.objects.get(id=printer_id)
            # Handle tray_capacity as integer
            if field == 'tray_capacity':
                value = int(value) if value else None
                # When setting tray capacity, also initialize tray_current_count if not tracked yet
                if value is not None and printer.tray_current_count is None:
                    printer.tray_current_count = value
            setattr(printer, field, value)
            printer.save()
            return JsonResponse({'success': True})
        except Printer.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Printer not found'})
        except ValueError as e:
            return JsonResponse({'success': False, 'error': 'Invalid value'})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)})
    return JsonResponse({'success': False, 'error': 'Invalid request'})


def mark_printer_refilled(request):
    """Mark a printer as refilled - sets tray_level to Full, resets tray_current_count, and updates last_refill_time"""
    if request.method == "POST":
        printer_id = request.POST.get('printer_id')
        try:
            printer = Printer.objects.get(id=printer_id)
            printer.tray_level = 'Full'
            printer.tray_current_count = printer.tray_capacity
            printer.last_refill_time = timezone.now()
            printer.save()
            return JsonResponse({
                'success': True,
                'tray_level': printer.tray_level,
                'tray_current_count': printer.tray_current_count,
                'last_refill_time': printer.last_refill_time.isoformat()
            })
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
    site = SiteSetting.load()
    return render(request, 'settings.html', {
        'user': user,
        'users': users,
        'feedback_comments': feedback_comments,
        'problem_reports': problem_reports,
        'notification_sounds': notification_sounds,
        'site_settings': site,
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


def update_email(request):
    if request.method == 'POST':
        user_id = request.session.get('admin_user_id')
        if not user_id:
            return JsonResponse({'success': False, 'error': 'Not authenticated'})
        new_email = request.POST.get('new_email', '').strip()
        try:
            user = AdminUser.objects.get(id=user_id)
            user.email = new_email if new_email else None
            user.save()
            return JsonResponse({'success': True, 'new_email': new_email})
        except AdminUser.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'User not found.'})
    return JsonResponse({'success': False, 'error': 'Invalid request.'})
    

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
        email = data.get('email', '').strip()
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
            role=role,
            email=email if email else None,
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


@csrf_exempt
def feedback_submit_api(request):
    """
    AJAX API endpoint for submitting feedback without page redirect.
    Used by the confirmation page popup.
    """
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})
    
    try:
        # Handle both JSON and form data
        if request.content_type == 'application/json':
            data = json.loads(request.body)
        else:
            data = request.POST
        
        name = data.get('name', '').strip() or 'Anonymous'
        message = data.get('message', '').strip()
        category = data.get('category', 'Comment')
        
        if not message:
            return JsonResponse({'success': False, 'error': 'Message is required'})
        
        # Validate category
        if category not in ['Comment', 'Report a Problem']:
            category = 'Comment'
        
        # Create feedback entry
        Feedback.objects.create(
            name=name,
            message=message,
            category=category
        )
        
        return JsonResponse({
            'success': True,
            'message': 'Thank you for your feedback!'
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Invalid request data'})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


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
                            page_list.reverse()
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


def get_customer_sound_prefs(request):
    """Public API: returns the configured customer-side sounds."""
    site = SiteSetting.load()
    completion_slug = site.customer_completion_sound.slug if site.customer_completion_sound else 'chime'
    reroute_slug = site.customer_reroute_sound.slug if site.customer_reroute_sound else 'rerouted'
    return JsonResponse({
        'completion_sound': f'/static/sounds/{completion_slug}.mp3',
        'reroute_sound': f'/static/sounds/{reroute_slug}.mp3',
    })


def update_customer_sound_prefs(request):
    """Admin-only API: update the customer-side sound settings."""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})
    user_id = request.session.get('admin_user_id')
    if not user_id:
        return JsonResponse({'success': False, 'error': 'Not authenticated'})
    try:
        data = json.loads(request.body.decode('utf-8')) if request.body else {}
    except Exception:
        return JsonResponse({'success': False, 'error': 'Invalid JSON'})

    site = SiteSetting.load()
    completion_slug = data.get('completion_sound')
    reroute_slug = data.get('reroute_sound')

    if completion_slug:
        try:
            site.customer_completion_sound = NotificationSound.objects.get(slug=completion_slug, is_active=True)
        except NotificationSound.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Completion sound not found'})
    if reroute_slug:
        try:
            site.customer_reroute_sound = NotificationSound.objects.get(slug=reroute_slug, is_active=True)
        except NotificationSound.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Reroute sound not found'})

    site.save()
    return JsonResponse({'success': True})


def printer_status_stream(request):
    # SSE headers
    response = StreamingHttpResponse(printer_status_event_stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    return response


def printer_status_event_stream():
    from django.db import close_old_connections
    from portal.models import PrinterStatusLog
    last_data = None
    last_printer_states = {}  # {printer_id: (status, ink_status, tray_level)}
    try:
        while True:
            close_old_connections()
            printers = Printer.objects.all()
            data = []
            for printer in printers:
                # If ink status is None/NULL or printer is Offline, set ink status to "N/A"
                if printer.ink_status is None or printer.printer_status == "Offline":
                    ink_status = "N/A"
                else:
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

                # Log status change if different from last known state
                tray_level = getattr(printer, 'tray_level', '')
                current_state = (printer.printer_status, ink_status, tray_level)
                prev_state = last_printer_states.get(printer.id)
                if prev_state is not None and current_state != prev_state:
                    try:
                        PrinterStatusLog.objects.create(
                            printer=printer,
                            status=printer.printer_status,
                            ink_status=ink_status,
                            paper_level=tray_level,
                        )
                    except Exception:
                        pass
                last_printer_states[printer.id] = current_state

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
            else:
                yield ":\n\n"
            time.sleep(1)
    finally:
        close_old_connections()


def dashboard_status_stream(request):
    response = StreamingHttpResponse(dashboard_status_event_stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    return response


def dashboard_status_event_stream():
    from django.db import close_old_connections
    last_data = None
    try:
        while True:
            close_old_connections()
            # Gather dashboard stats
            completed_jobs_count = Document.objects.filter(doc_status='Finished').count()
            printer_errors_count = Printer.objects.exclude(printer_status__in=['Sleep', 'Ready', 'Printing']).count()
            pending_customers_count = Document.objects.filter(doc_status='Pending').values('customer_id').distinct().count()
            active_tickets_count = SupportTicket.objects.filter(status__in=['open', 'in-progress']).count()
            resolved_tickets_count = SupportTicket.objects.filter(status__in=['resolved', 'closed', 'voided', 'refunded']).count()
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
                'active_tickets_count': active_tickets_count,
                'resolved_tickets_count': resolved_tickets_count,
                'completed_documents': completed_docs_data,
            }
            json_data = json.dumps(data)
            if json_data != last_data:
                yield f"data: {json_data}\n\n"
                last_data = json_data
            else:
                yield ":\n\n"
            time.sleep(2)
    finally:
        close_old_connections()


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


@csrf_exempt
def delete_printer(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            printer_id = data.get('printer_id')
            
            if not printer_id:
                return JsonResponse({'success': False, 'error': 'Printer ID is required'})
                
            try:
                printer = Printer.objects.get(id=printer_id)
                # Check if printer has any documents assigned to it
                docs_count = Document.objects.filter(printer_assigned=printer).exclude(doc_status__in=['Finished', 'Denied']).count()
                
                if docs_count > 0:
                    return JsonResponse({
                        'success': False, 
                        'error': f'Cannot delete printer with {docs_count} active documents assigned to it. Please reassign or complete these documents first.'
                    })
                
                printer_name = printer.printer_name
                printer.delete()
                return JsonResponse({'success': True, 'message': f'Printer {printer_name} successfully deleted.'})
                
            except Printer.DoesNotExist:
                return JsonResponse({'success': False, 'error': 'Printer not found'})
                
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'error': 'Invalid JSON data'})
            
    return JsonResponse({'success': False, 'error': 'Invalid request method'})


@transaction.atomic
def assign_document_to_printer(document):
    import time as _time
    TIMEOUT_SECONDS = 1800  # 30 minutes
    start_time = _time.monotonic()
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

        # Check for 30-minute timeout
        elapsed = _time.monotonic() - start_time
        if elapsed >= TIMEOUT_SECONDS:
            print(f"[TIMEOUT] Document {doc.doc_id} waited {elapsed:.0f}s with no printer available. Auto-cancelling.")
            doc.doc_status = 'Cancelled'
            doc.save()
            # Log timeout in reroute history so cancel_reason propagates via SSE
            RerouteHistory.objects.create(
                document=doc,
                printer=None,
                status='Error: No printer available for 30 minutes'
            )
            print(f"[TIMEOUT] Document {doc.doc_id} cancelled. Customer will be prompted to file a ticket.")
            return None

        printers = Printer.objects.all()
        
        # Check if this is a rerouted document (has reroute history)
        is_rerouted = RerouteHistory.objects.filter(document=doc).exists()
        
        # Skip printers in error state or with non-operational status
        available = [
            p for p in printers
            if p.printer_status in ['Ready', 'Sleep']  # Only use printers in operational status
            and getattr(p, 'paper_assigned', None) == getattr(document, 'paper_size', None)
            and getattr(p, 'paper_quality', None) == getattr(document, 'paper_quality', None)
            # Skip the previous failed printer if rerouting due to error
            and (not hasattr(document, 'previous_failed_printer') or p.id != document.previous_failed_printer)
        ]
        if available:
            # Sort by idle time (longer idle time first)
            # For rerouted documents, prioritize by idle time (WRR nonpreemptive approach)
            # The printer with the longest idle time gets selected
            available.sort(key=lambda p: p.last_checked or timezone.now())
            
            # For debugging
            if len(available) > 1:
                print(f"[WRR] Available printers for document {doc.doc_id}:")
                for p in available:
                    last_check = p.last_checked or timezone.now()
                    idle_time = (timezone.now() - last_check).total_seconds()
                    print(f"  - {p.printer_name}: Status={p.printer_status}, Idle time={idle_time:.1f}s")
            
            # Select the printer with longest idle time
            printer = available[0]
            
            # Log WRR selection
            if is_rerouted:
                print(f"[WRR] Selected printer {printer.printer_name} for rerouted document {doc.doc_id} based on longest idle time")
            else:
                print(f"[WRR] Selected printer {printer.printer_name} for document {doc.doc_id} based on longest idle time")
                
            doc.printer_assigned = printer
            doc.doc_status = 'Printing'
            doc.save()
            # Log assignment in reroute history
            RerouteHistory.objects.create(document=doc, printer=printer, status='Assigned')
            print(f"[ASSIGNED] Document {doc.doc_id} assigned to {printer.printer_name}.")
            return printer
        else:
            print(f"No available printer for {doc.paper_size} ({getattr(doc, 'paper_quality', None)}). Document {doc.doc_id} paused. Retrying in 5 seconds...")
            _time.sleep(5)


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
    # Monitor printer status from database more aggressively for error detection
    retries = 0
    max_retries = 5  # Try 5 times before giving up on this printer
    
    # First, check if the document has been rerouted and we have a new printer
    # Fetch latest document info to ensure we're using the most recent printer assignment
    document.refresh_from_db()
    if document.printer_assigned and document.printer_assigned.id != printer.id:
        print(f"[REROUTED] Document {document.doc_id} was rerouted from {printer.printer_name} to {document.printer_assigned.printer_name}. Skipping wait for original printer.")
        # Use the new printer for printing
        printer = document.printer_assigned
    
    # Only wait for Ready/Sleep if this is the current assigned printer
    if document.printer_assigned and document.printer_assigned.id == printer.id:
        while printer.printer_status not in ['Ready', 'Sleep']:
            print(f"[WAIT] Printer {printer.printer_name} is {printer.printer_status}. Waiting for Ready/Sleep...")
            time.sleep(2)
            printer.refresh_from_db()
            
            # Check again if document has been rerouted to a different printer
            document.refresh_from_db()
            if not document.printer_assigned or document.printer_assigned.id != printer.id:
                print(f"[REROUTED] Document {document.doc_id} was rerouted during wait. Skipping original printer.")
                return  # Exit this function, let the rerouting process handle printing
            
            # Increment retry counter
            retries += 1
            
            # If printer is stuck in error state or other non-operational state for too long
            if retries >= max_retries:
                print(f"[ERROR] Printer {printer.printer_name} is not becoming Ready or Sleep (status: {printer.printer_status}). Rerouting document.")
                
                # Log the failed printer in reroute history
                RerouteHistory.objects.create(
                    document=document, 
                    printer=printer,
                    status=f"Error: {printer.printer_status}"
                )
            
            # Implement preemptive approach - immediately reroute the document
            print(f"[PREEMPTIVE] Initiating preemptive rerouting for document {document.doc_id} from printer {printer.printer_name}")
            reroute_document_on_error(document)
            return
    # Send print job
    print(f"[PRINT] Sending page {page_num} of document {document.doc_id} to printer {printer.printer_name} ({printer.printer_status})")
    
    if getattr(printer, 'model_name', None):
        model_name = printer.model_name
        # Convert spaces and dashes to underscores, preserving the Brother prefix
        model_name = model_name.replace('-', '_').replace(' ', '_')
    else:
        model_name = printer.printer_name.replace(' ', '_')
        
    print(f"[PRINT] Using CUPS queue name: {model_name}")
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
        '-o', f'{"print-color-mode=monochrome" if color_mode=="Black and White" else "print-color-mode=color"}',
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
    wait_cycles = 0
    max_wait_cycles = 30  # Maximum time to wait for printer to start printing (30 seconds)
    error_cycles = 0
    max_error_cycles = 3  # Maximum consecutive error cycles before rerouting (3 seconds)
    
    while True:
        printer.refresh_from_db()
        # Check if document still exists and is not canceled/deleted
        try:
            doc_check = Document.objects.get(doc_id=document.doc_id)
            # Check if document has been rerouted to a different printer
            if doc_check.printer_assigned and doc_check.printer_assigned.id != printer.id:
                print(f"[REROUTED] Document {document.doc_id} was rerouted from {printer.printer_name} to {doc_check.printer_assigned.printer_name} during waiting phase. Stopping original print job.")
                return
        except Document.DoesNotExist:
            print(f"[CANCELLED] Document {document.doc_id} was deleted during printing. Aborting print job for page {page_num}.")
            return
        if doc_check.doc_status not in ['Queued', 'Printing']:
            print(f"[CANCELLED] Document {document.doc_id} status is {doc_check.doc_status}. Aborting print job for page {page_num}.")
            return
            
        # If the printer starts printing, proceed
        if printer.printer_status == 'Printing':
            print(f"[SUCCESS] Printed page {page_num} of document {document.doc_id} on printer {printer.printer_name}")
            break
            
        # Detect if printer is in error state or has issues (like no paper)
        if printer.printer_status not in ['Ready', 'Sleep', 'Printing']:
            wait_cycles += 1
            error_cycles += 1
            print(f"[WARNING] Printer {printer.printer_name} is in '{printer.printer_status}' state. Error cycle {error_cycles}/{max_error_cycles}, Wait cycle {wait_cycles}/{max_wait_cycles}")
            
            # If the printer remains in error state for several consecutive cycles, reroute the document
            if error_cycles >= max_error_cycles:
                print(f"[ERROR] Printer {printer.printer_name} failed to start printing and is in '{printer.printer_status}' state for {error_cycles} consecutive cycles. Rerouting document.")
                # Log the error in reroute history
                RerouteHistory.objects.create(
                    document=document,
                    printer=printer,
                    status=f"Failed to start: {printer.printer_status}",
                    timestamp=timezone.now()
                )
                # Reroute the document
                reroute_document_on_error(document)
                return
        else:
            # Reset error cycles if printer returns to a normal state
            error_cycles = 0
            wait_cycles += 1
            
        # If we've waited too long regardless of status, consider rerouting
        if wait_cycles >= max_wait_cycles:
            print(f"[TIMEOUT] Printer {printer.printer_name} has been waiting to start printing for too long ({max_wait_cycles} seconds). Rerouting document.")
            RerouteHistory.objects.create(
                document=document,
                printer=printer,
                status=f"Timeout waiting to start printing: {printer.printer_status}",
                timestamp=timezone.now()
            )
            reroute_document_on_error(document)
            return
        else:
            # Reset wait cycles if printer is in a normal state
            wait_cycles = 0
            
        print(f"[WAIT] Waiting for printer {printer.printer_name} to start printing page {page_num}... (cycle {wait_cycles})")
        time.sleep(1)
    # Wait for printer status to become 'Ready' after printing
    wait_cycles = 0
    max_wait_cycles = 60  # Maximum time to wait for printer to finish (60 seconds)
    error_cycles = 0
    max_error_cycles = 5  # Maximum consecutive error cycles before rerouting (5 seconds)
    
    while True:
        printer.refresh_from_db()
        
        # Also check if the document still exists and hasn't been canceled
        try:
            doc_check = Document.objects.get(doc_id=document.doc_id)
            # Check if document has been rerouted to a different printer
            if doc_check.printer_assigned and doc_check.printer_assigned.id != printer.id:
                print(f"[REROUTED] Document {document.doc_id} was rerouted from {printer.printer_name} to {doc_check.printer_assigned.printer_name} during printing. Stopping monitoring of original printer.")
                return
                
            if doc_check.doc_status not in ['Queued', 'Printing']:
                print(f"[CANCELLED] Document {document.doc_id} status changed to {doc_check.doc_status} while waiting. Aborting.")
                return
        except Document.DoesNotExist:
            print(f"[CANCELLED] Document {document.doc_id} was deleted while waiting for printer to finish. Aborting.")
            return
            
        # If printer returned to Ready state, printing is successful
        if printer.printer_status == 'Ready':
            print(f"[READY] Printer {printer.printer_name} is ready after printing page {page_num}.")
            break
            
        # If printer is in Sleep state (some printers go to sleep after printing)
        if printer.printer_status == 'Sleep':
            print(f"[SLEEP] Printer {printer.printer_name} went to sleep after printing page {page_num}.")
            break
        
        # If printer is in error state or stuck in a non-operational state
        if printer.printer_status not in ['Printing', 'Sleep', 'Ready']:
            error_cycles += 1
            wait_cycles += 1
            
            print(f"[WARNING] Printer {printer.printer_name} is in error state '{printer.printer_status}' (error cycle {error_cycles}/{max_error_cycles}, wait cycle {wait_cycles}/{max_wait_cycles})")
            
            # After several consecutive error states, initiate rerouting
            if error_cycles >= max_error_cycles:
                print(f"[ERROR] Printer {printer.printer_name} is stuck in error state '{printer.printer_status}' for {error_cycles} consecutive cycles. Initiating reroute.")
                # Log the error printer in reroute history
                RerouteHistory.objects.create(
                    document=document, 
                    printer=printer,
                    status=f"Error: {printer.printer_status}",
                    timestamp=timezone.now()
                )
                # Reroute remaining pages (preemptive approach)
                reroute_document_on_error(document)
                return
        else:
            # Reset error cycles if printer returns to a normal state
            error_cycles = 0
            wait_cycles += 1
            
            # If the printer is still printing, log status periodically
            if printer.printer_status == 'Printing' and wait_cycles % 10 == 0:
                print(f"[PRINTING] Printer {printer.printer_name} is still printing page {page_num}... (wait cycle {wait_cycles}/{max_wait_cycles})")
        
        # If we've waited too long regardless of status, consider rerouting
        if wait_cycles >= max_wait_cycles:
            print(f"[TIMEOUT] Printer {printer.printer_name} has been printing for too long ({max_wait_cycles} seconds). Initiating reroute.")
            # Log the timeout in reroute history
            RerouteHistory.objects.create(
                document=document, 
                printer=printer,
                status=f"Timeout: Stuck in {printer.printer_status}",
                timestamp=timezone.now()
            )
            # Reroute remaining pages
            reroute_document_on_error(document)
            return
            
        print(f"[WAIT] Waiting for printer {printer.printer_name} to finish printing page {page_num}... (cycle {wait_cycles})")
        time.sleep(1)
    # Mark page as printed in DB only after successful print and status transitions
    document.mark_page_printed(page_num)
    print(f"[MARKED] Page {page_num} of document {document.doc_id} marked as printed.")

    # Subtract 1 sheet from the printer's tray and update tray level
    printer.refresh_from_db()
    if printer.tray_current_count is not None:
        printer.tray_current_count = max(0, printer.tray_current_count - 1)
        if printer.tray_capacity and printer.tray_capacity > 0:
            pct = printer.tray_current_count / printer.tray_capacity
            if pct <= 0:
                printer.tray_level = 'Needs Refill'
            elif pct <= 0.2:
                printer.tray_level = 'Low'
            else:
                printer.tray_level = 'Full'
        elif printer.tray_current_count <= 0:
            printer.tray_level = 'Needs Refill'
        printer.save(update_fields=['tray_current_count', 'tray_level'])
        print(f"[PAPER] Printer {printer.printer_name}: {printer.tray_current_count} sheets remaining ({printer.tray_level})")

    # If all pages printed, set status to Finished and update printed_at to last printer
    if len(document.get_remaining_pages()) == 0:
        document.doc_status = 'Finished'
        document.status_updated_at = timezone.now()
        # Set printed_at to the last printer used
        document.printed_at = document.printer_assigned
        document.save()
        print(f"[COMPLETE] Document {document.doc_id} printing complete. Printed at: {document.printed_at}")


def reroute_document_on_error(document):
    """
    Implements the Weighted Round Robin (WRR) approach for rerouting:
    - Preemptive: Document with error is immediately stopped and rerouted (already handled by caller)
    - Nonpreemptive: Rerouted document gets priority in the queue but doesn't interrupt current printing
    """
    remaining_pages = document.get_remaining_pages()
    
    # Store current printer ID as previous failed printer to avoid choosing it again
    current_printer_name = "Unknown"
    if document.printer_assigned:
        # We'll use a temporary attribute to track the failed printer
        # This won't be persisted to database but will be used during this rerouting process
        document.previous_failed_printer = document.printer_assigned.id
        current_printer_name = document.printer_assigned.printer_name
        print(f"[REROUTE] Marked printer {current_printer_name} as failed for document {document.doc_id}")
        
        # Record the error printer in reroute history (if not already done by caller)
        # We can't use get_or_create here because timestamp makes entries unique
        # and we might have multiple error entries for the same printer/document
        error_status = f"Error: {document.printer_assigned.printer_status}"
        
        # Create a new reroute history entry with current timestamp
        RerouteHistory.objects.create(
            document=document,
            printer=document.printer_assigned,
            status=error_status,
            timestamp=timezone.now()
        )
    
    # Try to find a new printer - the WRR nonpreemptive approach is implemented in assign_document_to_printer
    # where we select printers with longest idle time and set the document to highest priority
    next_printer = assign_document_to_printer(document)
    if next_printer:
        # Continue printing remaining pages
        print(f"[REROUTE] Successfully rerouted document {document.doc_id} from {current_printer_name} to {next_printer.printer_name}")
        
        # Log successful reroute
        RerouteHistory.objects.create(
            document=document, 
            printer=next_printer,
            status='Rerouted'
        )
        
        # Continue printing remaining pages on new printer
        for page_num in remaining_pages:
            print_page(document, page_num)
    else:
        # No available printer, notify admin
        print(f"[REROUTE] Failed to find alternative printer for document {document.doc_id}")
        Feedback.objects.create(
            category='Report a Problem',
            name='[SYSTEM GENERATED]',
            message=f"Reroute failed: No available printer for {document.paper_size}. Document {document.doc_id} paused."
        )
        # If we can't find a suitable printer, reset the document status to Queued
        # so it can be retried later when a printer becomes available
        document.doc_status = 'Queued'
        document.save()
        
        # Notify about reroute failure
        print(f"[QUEUED] Document {document.doc_id} placed back in queue for later processing when printers become available.")
        
        # Start a background check for available printers in a few seconds
        # This gives printers time to recover or become available
        threading.Timer(1.0, check_queued_documents).start()
        print(f"[QUEUE-MONITOR] Scheduled queue check in 1 seconds to find printer for document {document.doc_id}")


# Queue monitoring system for checking queued documents
def check_queued_documents():
    """
    Check for documents in 'Queued' status and attempt to assign them to available printers.
    This function is called periodically and also when a document is placed back in queue after a failed print.
    """
    print("[QUEUE-MONITOR] Running scheduled check for queued documents...")
    
    # Get all documents in 'Queued' status
    queued_docs = Document.objects.filter(doc_status='Queued')
    queued_count = queued_docs.count()
    
    if queued_count == 0:
        print("[QUEUE-MONITOR] No queued documents found.")
        return
        
    print(f"[QUEUE-MONITOR] Found {queued_count} queued documents. Attempting to assign printers...")
    
    # Get all available printers
    available_printers = Printer.objects.filter(printer_status__in=['Ready', 'Sleep'])
    available_count = available_printers.count()
    
    if available_count == 0:
        print("[QUEUE-MONITOR] No available printers found. Will retry later.")
        # Schedule another check in 1 seconds
        threading.Timer(1.0, check_queued_documents).start()
        return
        
    print(f"[QUEUE-MONITOR] Found {available_count} available printers.")
    
    # Process each queued document
    for doc in queued_docs:
        print(f"[QUEUE-MONITOR] Processing queued document {doc.doc_id}")
        
        # Create a function to handle this document in a thread
        def process_document(document):
            try:
                # Assign printer and start printing
                printer = assign_document_to_printer(document)
                if printer:
                    print(f"[QUEUE-MONITOR] Successfully assigned document {document.doc_id} to printer {printer.printer_name}")
                    # Print all document pages
                    remaining_pages = document.get_remaining_pages()
                    for page_num in remaining_pages:
                        print_page(document, page_num)
                else:
                    print(f"[QUEUE-MONITOR] Failed to assign document {document.doc_id} to a printer")
            except Exception as e:
                print(f"[QUEUE-MONITOR] Error processing document {document.doc_id}: {e}")
                
        # Start processing this document in a background thread
        threading.Thread(target=process_document, args=(doc,)).start()
    
    # Schedule another check in 60 seconds to catch any new queued documents
    # or documents that failed to get a printer this time
    threading.Timer(60.0, check_queued_documents).start()
    print("[QUEUE-MONITOR] Scheduled next queue check in 60 seconds")


# Start the queue monitor when the module is loaded
def start_queue_monitor():
    """Initialize the queue monitoring system with a delay to let the system start up."""
    print("[QUEUE-MONITOR] Initializing queue monitoring system...")
    threading.Timer(1.0, check_queued_documents).start()
    print("[QUEUE-MONITOR] Queue monitor scheduled to start in 1 seconds")

# Start the queue monitor
threading.Timer(1.0, start_queue_monitor).start()


# ============================================================
# CUSTOMER DOCUMENT STATUS SSE ENDPOINT
# ============================================================


def customer_documents_stream(request, customer_id):
    """SSE endpoint that streams real-time document status for a customer."""
    response = StreamingHttpResponse(
        customer_documents_event_stream(customer_id),
        content_type='text/event-stream'
    )
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    return response


def customer_documents_event_stream(customer_id):
    """Generator that yields SSE events for customer document status changes."""
    last_data = None
    while True:
        documents = Document.objects.filter(
            customer_id=customer_id
        ).select_related('printer_assigned', 'printed_at').order_by('time_submitted')

        docs_data = []
        all_finished_or_picked_up = True

        for doc in documents:
            # Build reroute history for this document
            history_entries = RerouteHistory.objects.filter(
                document=doc
            ).select_related('printer').order_by('timestamp')

            reroute_history = []
            for entry in history_entries:
                reroute_history.append({
                    'printer_name': entry.printer.printer_name if entry.printer else 'Unknown',
                    'printer_id': entry.printer.id if entry.printer else None,
                    'status': entry.status,
                    'timestamp': entry.timestamp.isoformat() if entry.timestamp else None,
                })

            # Determine badge info
            printer_name = None
            if doc.printer_assigned:
                printer_name = doc.printer_assigned.printer_name

            printed_at_name = None
            if doc.printed_at:
                printed_at_name = doc.printed_at.printer_name

            # Calculate pages printed vs total
            pages_printed = doc.pages_printed if doc.pages_printed else []
            total_pages = doc.get_total_pages()

            # Determine status type for badge styling
            status_type = 'info'  # default
            if doc.doc_status == 'Pending':
                status_type = 'warning'
            elif doc.doc_status == 'Queued':
                status_type = 'info'
            elif doc.doc_status == 'Printing':
                status_type = 'info'
            elif doc.doc_status == 'Finished':
                status_type = 'success'
            elif doc.doc_status == 'Cancelled':
                status_type = 'danger'
            elif doc.doc_status == 'Picked Up':
                status_type = 'success'

            if doc.doc_status not in ('Finished', 'Picked Up'):
                all_finished_or_picked_up = False

            # Build status badge text
            if doc.doc_status == 'Pending':
                status_badge = 'Waiting for Approval...'
            elif doc.doc_status == 'Queued':
                status_badge = 'Waiting...'
            elif doc.doc_status == 'Printing':
                status_badge = f'Printing... ({printer_name})' if printer_name else 'Printing...'
            elif doc.doc_status == 'Finished':
                status_badge = f'Completed ({printed_at_name})' if printed_at_name else 'Completed'
            elif doc.doc_status == 'Cancelled':
                status_badge = 'Cancelled'
            elif doc.doc_status == 'Picked Up':
                status_badge = 'Picked Up'
            else:
                status_badge = doc.doc_status

            # Get cancel reason from reroute history if cancelled
            cancel_reason = ''
            if doc.doc_status == 'Cancelled':
                last_error = history_entries.filter(status__startswith='Error').last()
                if last_error:
                    cancel_reason = last_error.status
                else:
                    cancel_reason = 'No available Printer'

            # Check for support tickets on this document
            ticket = SupportTicket.objects.filter(document=doc).order_by('-created_at').first()
            has_ticket = ticket is not None
            ticket_number = ticket.ticket_number if ticket else None

            doc_data = {
                'doc_id': doc.doc_id,
                'filename': doc.filename,
                'doc_status': doc.doc_status,
                'status_type': status_type,
                'status_badge': status_badge,
                'cancel_reason': cancel_reason,
                'printer_name': printer_name,
                'printed_at': printed_at_name,
                'pages_printed': pages_printed,
                'total_pages': total_pages,
                'reroute_history': reroute_history,
                'time_submitted': doc.time_submitted.isoformat() if doc.time_submitted else None,
                'status_updated_at': doc.status_updated_at.isoformat() if doc.status_updated_at else None,
                'has_ticket': has_ticket,
                'ticket_number': ticket_number,
                # Extra info for problem report form
                'num_copies': doc.num_copies,
                'orientation': doc.orientation,
                'color_mode': doc.color_mode,
                'paper_size': doc.paper_size,
                'paper_quality': doc.paper_quality,
                'pages_num': doc.pages_num,
            }
            docs_data.append(doc_data)

        # Count OTHER customers' documents that are Queued or Printing
        other_queue_count = Document.objects.exclude(
            customer_id=customer_id
        ).filter(
            doc_status__in=['Queued', 'Printing']
        ).count()

        # Get auto-ticket timeout setting
        auto_ticket_timeout = SiteSetting.load().auto_ticket_timeout_minutes

        data = {
            'documents': docs_data,
            'all_done': all_finished_or_picked_up and len(docs_data) > 0,
            'other_queue_count': other_queue_count,
            'auto_ticket_timeout': auto_ticket_timeout,
        }

        json_data = json.dumps(data)
        if json_data != last_data:
            yield f"data: {json_data}\n\n"
            last_data = json_data

        time.sleep(1)


# ============================================================
# PICKED UP DOCUMENT API
# ============================================================


@csrf_exempt
def picked_up_document(request):
    """
    Mark a single document as 'Picked Up' and delete the associated file.
    This triggers automatic file deletion similar to Finish Transaction.
    """
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})

    try:
        data = json.loads(request.body)
        doc_id = data.get('doc_id')

        if not doc_id:
            return JsonResponse({'success': False, 'error': 'doc_id is required'})

        doc = Document.objects.get(doc_id=doc_id)

        if doc.doc_status != 'Finished':
            return JsonResponse({
                'success': False,
                'error': f'Document is not finished (current status: {doc.doc_status})'
            })

        # Mark as Picked Up
        doc.doc_status = 'Picked Up'
        doc.status_updated_at = timezone.now()
        doc.save()

        # Delete the file from storage — direct path lookup (fast)
        if doc.stored_name:
            customer_dir = os.path.join(
                settings.MEDIA_ROOT, 'uploads', doc.customer_id
            )
            file_path = os.path.join(customer_dir, doc.stored_name)
            if os.path.isfile(file_path):
                os.remove(file_path)
                print(f"[PICKED UP] Deleted file {file_path} for document {doc_id}")

        # Delete associated Payment records then the Document record
        cid = doc.customer_id
        Payment.objects.filter(doc=doc).delete()
        doc.delete()

        # If no documents remain for this CID, clear voucher association
        remaining_docs = Document.objects.filter(customer_id=cid).exists()
        if not remaining_docs:
            from portal.models import VoucherCredit
            VoucherCredit.objects.filter(last_customer_id=cid).update(last_customer_id=None)

        # Trigger folder cleanup
        subprocess.Popen(['python3', '/home/safeprint/dev/SafePrint/scripts/clean_empty_upload_folders.py'])

        return JsonResponse({'success': True, 'doc_id': doc_id})

    except Document.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Document not found'})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


@csrf_exempt
def finish_transaction(request):
    """
    Mark all documents for a customer as 'Picked Up' and delete their files.
    This is the 'Picked Up All Printed Documents' action.
    
    If force=True (user confirmed disclaimer), ALL documents are processed
    regardless of status — including Queued, Printing, and Cancelled docs.
    Otherwise, only 'Finished' documents are processed.
    """
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})

    try:
        data = json.loads(request.body)
        customer_id = data.get('customer_id')
        force = data.get('force', False)

        if not customer_id:
            return JsonResponse({'success': False, 'error': 'customer_id is required'})

        if force:
            # Force mode: process ALL non-picked-up documents (user confirmed disclaimer)
            docs_to_process = Document.objects.filter(
                customer_id=customer_id
            ).exclude(doc_status='Picked Up')
        else:
            # Normal mode: only process finished documents
            docs_to_process = Document.objects.filter(
                customer_id=customer_id,
                doc_status='Finished'
            )

        if not docs_to_process.exists():
            return JsonResponse({'success': False, 'error': 'No documents found to process'})

        picked_up_count = 0
        uploads_dir = os.path.join(settings.MEDIA_ROOT, 'uploads')

        for doc in docs_to_process:
            # Delete the file from storage — direct path lookup (fast)
            if doc.stored_name:
                customer_dir = os.path.join(uploads_dir, customer_id)
                file_path = os.path.join(customer_dir, doc.stored_name)
                if os.path.isfile(file_path):
                    os.remove(file_path)
                    print(f"[FINISH TXN] Deleted file {file_path} for document {doc.doc_id}")

            # Delete associated Payment records
            Payment.objects.filter(doc=doc).delete()

            # Delete the Document record itself
            doc.delete()

            picked_up_count += 1

        # Clear voucher credit association with this customer
        from portal.models import VoucherCredit
        VoucherCredit.objects.filter(last_customer_id=customer_id).update(last_customer_id=None)

        # Trigger folder cleanup
        subprocess.Popen(['python3', '/home/safeprint/dev/SafePrint/scripts/clean_empty_upload_folders.py'])

        return JsonResponse({
            'success': True,
            'picked_up_count': picked_up_count
        })

    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


@csrf_exempt
def void_ticket(request):
    """
    Void an active support ticket. Sets status to 'voided'.
    Writes an audit log entry.
    """
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})

    try:
        data = json.loads(request.body)
        ticket_id = data.get('ticket_id')

        if not ticket_id:
            return JsonResponse({'success': False, 'error': 'ticket_id is required'})

        ticket = SupportTicket.objects.get(id=ticket_id)

        if ticket.status in ['resolved', 'closed', 'voided', 'refunded']:
            return JsonResponse({'success': False, 'error': 'Ticket is already resolved/closed'})

        admin_user_id = request.session.get('admin_user_id')
        admin_name = ''
        if admin_user_id:
            try:
                admin = AdminUser.objects.get(id=admin_user_id)
                admin_name = admin.name
            except AdminUser.DoesNotExist:
                pass

        from django.utils import timezone
        old_status = ticket.status
        ticket.status = 'voided'
        ticket.resolved_by = admin_name
        ticket.resolved_at = timezone.now()
        ticket.data_retention_expires = timezone.now() + timezone.timedelta(days=30)
        ticket.admin_notes = (ticket.admin_notes + '\nVoided by ' + admin_name).strip()
        ticket.save()

        # Audit log
        TicketAuditLog.objects.create(
            ticket=ticket,
            action='voided',
            old_status=old_status,
            new_status='voided',
            performed_by=admin_name,
            details=f"Ticket voided by {admin_name}."
        )

        payment_amount = None
        if ticket.document:
            payment = Payment.objects.filter(doc=ticket.document).first()
            if payment:
                payment_amount = float(payment.price)

        return JsonResponse({
            'success': True,
            'ticket_id': ticket.id,
            'ticket_number': ticket.ticket_number,
            'status': 'Voided',
            'customer_name': ticket.customer_name,
            'customer_id': ticket.customer_id,
            'email': ticket.email,
            'phone': ticket.phone_number,
            'doc_id': ticket.document.doc_id if ticket.document else '',
            'doc_name': ticket.document_name,
            'description': ticket.description,
            'problem_type': ticket.get_problem_type_display(),
            'was_reprinted': ticket.was_reprinted,
            'resolved_by': admin_name,
            'payment_amount': payment_amount,
        })

    except SupportTicket.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Ticket not found'})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


@csrf_exempt
def refund_ticket(request):
    """
    Approve a refund for an active support ticket. Sets status to 'refunded'
    and refund_status to 'pending'. Writes an audit log entry.
    """
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})

    try:
        data = json.loads(request.body)
        ticket_id = data.get('ticket_id')

        if not ticket_id:
            return JsonResponse({'success': False, 'error': 'ticket_id is required'})

        ticket = SupportTicket.objects.get(id=ticket_id)

        if ticket.status in ['resolved', 'closed', 'voided', 'refunded']:
            return JsonResponse({'success': False, 'error': 'Ticket is already resolved/closed'})

        admin_user_id = request.session.get('admin_user_id')
        admin_name = ''
        if admin_user_id:
            try:
                admin = AdminUser.objects.get(id=admin_user_id)
                admin_name = admin.name
            except AdminUser.DoesNotExist:
                pass

        from django.utils import timezone

        # Look up payment amount
        payment_amount = None
        if ticket.document:
            payment = Payment.objects.filter(doc=ticket.document).first()
            if payment:
                payment_amount = float(payment.price)

        # Set refund amount (from request or from payment)
        refund_amount = data.get('refund_amount')
        if refund_amount is not None:
            try:
                refund_amount = float(refund_amount)
            except (ValueError, TypeError):
                refund_amount = payment_amount
        else:
            refund_amount = payment_amount

        old_status = ticket.status
        ticket.status = 'refunded'
        ticket.resolved_by = admin_name
        ticket.resolved_at = timezone.now()
        ticket.refund_amount = refund_amount
        ticket.refund_status = 'pending'
        ticket.admin_notes = (ticket.admin_notes + '\nRefund approved by ' + admin_name).strip()
        ticket.save()

        # Audit log
        amount_str = f"₱{refund_amount:.2f}" if refund_amount else "N/A"
        gcash_str = f" GCash: {ticket.gcash_number}" if ticket.gcash_number else ""
        TicketAuditLog.objects.create(
            ticket=ticket,
            action='refund_approved',
            old_status=old_status,
            new_status='refunded',
            performed_by=admin_name,
            details=f"Refund of {amount_str} approved.{gcash_str}"
        )

        return JsonResponse({
            'success': True,
            'ticket_id': ticket.id,
            'ticket_number': ticket.ticket_number,
            'status': 'Refunded',
            'customer_name': ticket.customer_name,
            'customer_id': ticket.customer_id,
            'email': ticket.email,
            'phone': ticket.phone_number,
            'gcash_number': ticket.gcash_number,
            'doc_id': ticket.document.doc_id if ticket.document else '',
            'doc_name': ticket.document_name,
            'description': ticket.description,
            'problem_type': ticket.get_problem_type_display(),
            'was_reprinted': ticket.was_reprinted,
            'resolved_by': admin_name,
            'payment_amount': payment_amount,
            'refund_amount': refund_amount,
            'refund_status': 'pending',
        })

    except SupportTicket.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Ticket not found'})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


@csrf_exempt
def complete_refund(request):
    """
    Mark a pending refund as completed. Admin provides GCash reference number
    after manually sending the refund. Writes an audit log entry.
    """
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})

    try:
        data = json.loads(request.body)
        ticket_id = data.get('ticket_id')
        refund_reference = data.get('refund_reference', '').strip()

        if not ticket_id:
            return JsonResponse({'success': False, 'error': 'ticket_id is required'})
        if not refund_reference:
            return JsonResponse({'success': False, 'error': 'refund_reference is required'})

        ticket = SupportTicket.objects.get(id=ticket_id)

        if ticket.refund_status != 'pending':
            return JsonResponse({'success': False, 'error': 'Ticket does not have a pending refund'})

        admin_user_id = request.session.get('admin_user_id')
        admin_name = ''
        if admin_user_id:
            try:
                admin = AdminUser.objects.get(id=admin_user_id)
                admin_name = admin.name
            except AdminUser.DoesNotExist:
                pass

        from django.utils import timezone
        ticket.refund_status = 'completed'
        ticket.refund_completed_at = timezone.now()
        ticket.refund_reference = refund_reference
        ticket.data_retention_expires = timezone.now() + timezone.timedelta(days=30)
        ticket.admin_notes = (ticket.admin_notes + f'\nRefund completed by {admin_name}. Ref: {refund_reference}').strip()
        ticket.save()

        # Audit log
        amount_str = f"₱{ticket.refund_amount:.2f}" if ticket.refund_amount else "N/A"
        TicketAuditLog.objects.create(
            ticket=ticket,
            action='refund_completed',
            old_status='refunded',
            new_status='refunded',
            performed_by=admin_name,
            details=f"Refund of {amount_str} completed. Reference: {refund_reference}."
        )

        return JsonResponse({
            'success': True,
            'ticket_id': ticket.id,
            'ticket_number': ticket.ticket_number,
            'refund_status': 'completed',
            'refund_reference': refund_reference,
            'refund_completed_at': ticket.refund_completed_at.strftime('%Y-%m-%d %H:%M:%S'),
        })

    except SupportTicket.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Ticket not found'})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


@csrf_exempt
def purge_ticket_data(request):
    """
    Immediately purge PII from a resolved/voided ticket.
    The dashboard record remains but sensitive data is cleared.
    """
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})

    try:
        data = json.loads(request.body)
        ticket_id = data.get('ticket_id')

        if not ticket_id:
            return JsonResponse({'success': False, 'error': 'ticket_id is required'})

        ticket = SupportTicket.objects.get(id=ticket_id)

        if ticket.status not in ['resolved', 'closed', 'voided', 'refunded']:
            return JsonResponse({'success': False, 'error': 'Can only purge data from resolved/voided tickets'})

        if ticket.refund_status == 'pending':
            return JsonResponse({'success': False, 'error': 'Cannot purge data while refund is pending'})

        if ticket.data_purged:
            return JsonResponse({'success': False, 'error': 'Data already purged'})

        admin_user_id = request.session.get('admin_user_id')
        admin_name = ''
        if admin_user_id:
            try:
                admin = AdminUser.objects.get(id=admin_user_id)
                admin_name = admin.name
            except AdminUser.DoesNotExist:
                pass

        ticket.purge_pii()

        TicketAuditLog.objects.create(
            ticket=ticket,
            action='data_purged',
            old_status=ticket.status,
            new_status=ticket.status,
            performed_by=admin_name,
            details='PII data manually purged by admin.'
        )

        return JsonResponse({
            'success': True,
            'ticket_id': ticket.id,
            'ticket_number': ticket.ticket_number,
        })

    except SupportTicket.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Ticket not found'})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


@csrf_exempt
def get_ticket_audit_log(request):
    """
    Return the audit log for a specific ticket.
    """
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})

    try:
        data = json.loads(request.body)
        ticket_id = data.get('ticket_id')

        if not ticket_id:
            return JsonResponse({'success': False, 'error': 'ticket_id is required'})

        logs = TicketAuditLog.objects.filter(ticket_id=ticket_id).order_by('-timestamp')
        logs_data = []
        for log in logs:
            logs_data.append({
                'action': log.get_action_display(),
                'old_status': log.old_status,
                'new_status': log.new_status,
                'performed_by': log.performed_by,
                'details': log.details,
                'timestamp': log.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            })

        return JsonResponse({
            'success': True,
            'audit_logs': logs_data,
        })

    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


@login_required
def get_printer_status_history(request):
    """
    Return printer status history with optional filters.
    Supports: printer_id, date_from, date_to, status_filter, page, page_size.
    """
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})

    try:
        data = json.loads(request.body)
        printer_id = data.get('printer_id')
        date_from = data.get('date_from')
        date_to = data.get('date_to')
        status_filter = data.get('status_filter')  # e.g. 'Paper Jam', 'Error', etc.
        page = int(data.get('page', 1))
        page_size = int(data.get('page_size', 15))

        from .models import PrinterStatusLog

        qs = PrinterStatusLog.objects.select_related('printer').order_by('-timestamp')

        if printer_id:
            qs = qs.filter(printer_id=printer_id)
        if date_from:
            qs = qs.filter(timestamp__gte=date_from)
        if date_to:
            qs = qs.filter(timestamp__lte=date_to)
        if status_filter:
            qs = qs.filter(status__icontains=status_filter)

        total = qs.count()
        start = (page - 1) * page_size
        end = start + page_size
        logs = qs[start:end]

        logs_data = []
        for log in logs:
            logs_data.append({
                'id': log.id,
                'printer_name': log.printer.name if log.printer else 'Unknown',
                'printer_id': log.printer_id,
                'status': log.status,
                'ink_status': log.ink_status,
                'paper_level': log.paper_level,
                'timestamp': log.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            })

        # Get all printers for dropdown
        printers_list = [{'id': p.id, 'name': p.name} for p in Printer.objects.all().order_by('name')]

        return JsonResponse({
            'success': True,
            'logs': logs_data,
            'printers': printers_list,
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': (total + page_size - 1) // page_size if total > 0 else 1,
        })

    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


@login_required
def get_ticket_verification_data(request):
    """
    Return printer status and document lifecycle data around a ticket's creation time.
    Used by Activity Log modal to help admin verify refund claims.
    Accepts: ticket_id, time_window (optional override, in minutes)
    """
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})

    try:
        data = json.loads(request.body)
        ticket_id = data.get('ticket_id')

        if not ticket_id:
            return JsonResponse({'success': False, 'error': 'ticket_id is required'})

        ticket = SupportTicket.objects.get(id=ticket_id)

        # Get time window setting
        time_window = data.get('time_window')
        if time_window is None:
            time_window = SiteSetting.load().verification_time_window
        time_window = int(time_window)

        from datetime import timedelta
        from .models import PrinterStatusLog, DocumentLifecycleLog

        window_start = ticket.created_at - timedelta(minutes=time_window)
        window_end = ticket.created_at + timedelta(minutes=time_window)

        # Get printer status logs in the time window
        printer_logs = PrinterStatusLog.objects.select_related('printer').filter(
            timestamp__gte=window_start,
            timestamp__lte=window_end,
        ).order_by('-timestamp')

        printer_data = []
        for log in printer_logs:
            printer_data.append({
                'printer_name': log.printer.name if log.printer else 'Unknown',
                'status': log.status,
                'ink_status': log.ink_status,
                'paper_level': log.paper_level,
                'timestamp': log.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            })

        # Get document lifecycle logs for this document
        doc_logs = DocumentLifecycleLog.objects.filter(
            doc_id=ticket.document_id
        ).order_by('-timestamp') if ticket.document_id else []

        doc_data = []
        for log in doc_logs:
            doc_data.append({
                'doc_id': log.doc_id,
                'customer_id': log.customer_id,
                'doc_name': log.doc_name,
                'event': log.get_event_display(),
                'printer_name': log.printer_name,
                'details': log.details,
                'timestamp': log.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            })

        # Get reroute history for this document
        if ticket.document_id:
            from .models import RerouteHistory
            reroutes = RerouteHistory.objects.select_related('printer').filter(
                document_id=ticket.document_id
            ).order_by('-timestamp')
            for rr in reroutes:
                doc_data.append({
                    'doc_id': ticket.document_id,
                    'customer_id': ticket.customer_id,
                    'doc_name': ticket.document_name or '',
                    'event': 'Rerouted',
                    'printer_name': rr.printer.name if rr.printer else '—',
                    'details': f'Rerouted ({rr.status})',
                    'timestamp': rr.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
                })
            # Sort all doc events by timestamp descending
            doc_data.sort(key=lambda x: x['timestamp'], reverse=True)

        return JsonResponse({
            'success': True,
            'ticket_created_at': ticket.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            'time_window': time_window,
            'printer_logs': printer_data,
            'document_logs': doc_data,
        })

    except SupportTicket.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Ticket not found'})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


@csrf_exempt
def check_printer_availability(request):
    """
    Check if at least one operational printer is available for the given documents.
    Used by payment page to block payment when no matching printers are active.
    """
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})

    try:
        data = json.loads(request.body)
        doc_ids = data.get('doc_ids', [])

        if not doc_ids:
            return JsonResponse({'available': True, 'all_offline': False, 'unavailable_docs': []})

        docs = Document.objects.filter(doc_id__in=doc_ids, doc_status='Pending')

        if not docs.exists():
            return JsonResponse({'available': True, 'all_offline': False, 'unavailable_docs': []})

        # Check each document's paper requirements against available printers
        unavailable_docs = []
        for doc in docs:
            matching_printers = Printer.objects.filter(
                paper_assigned=doc.paper_size,
                paper_quality=doc.paper_quality,
                printer_status__in=['Ready', 'Printing', 'Sleep']
            )
            if not matching_printers.exists():
                unavailable_docs.append({
                    'doc_id': doc.doc_id,
                    'filename': doc.filename,
                    'paper_size': doc.paper_size,
                    'paper_quality': f'{doc.paper_quality} GSM' if doc.paper_quality else '',
                })

        all_printers_status = list(Printer.objects.values_list('printer_status', flat=True))
        all_offline = all(s in ('Offline', 'Error', '') for s in all_printers_status) if all_printers_status else True

        return JsonResponse({
            'available': len(unavailable_docs) == 0,
            'all_offline': all_offline,
            'unavailable_docs': unavailable_docs,
        })

    except Exception as e:
        return JsonResponse({'available': False, 'all_offline': True, 'unavailable_docs': [], 'error': str(e)})