import os
import json
import re
import sys
import time
import logging
import threading
import subprocess
from collections import deque
from datetime import datetime, time as datetime_time, timedelta
from decimal import Decimal
from django.db.models import Count, Q, Sum
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
from .models import AdminUser, Printer, Document, Payment, PaymentIntent, NotificationSound, SupportTicket, SiteSetting, TicketAuditLog, VoucherCredit, VoucherCreditAuditLog
from django.http import JsonResponse, StreamingHttpResponse
from django.contrib.auth.hashers import make_password, check_password
from django.contrib.auth.decorators import login_required
from portal.services.firebase_payment import FirebasePaymentError, claim_notification, list_matching_notifications, normalize_phone_number

logger = logging.getLogger(__name__)

now = timezone.now()
QUEUE_MONITOR_INTERVAL_SECONDS = 60.0
QUEUE_MONITOR_RETRY_SECONDS = 5.0


def _trigger_upload_folder_cleanup():
    if getattr(settings, 'TESTING', False):
        return
    subprocess.Popen([sys.executable, '/home/safeprint/dev/SafePrint/scripts/clean_empty_upload_folders.py'])


def _schedule_queue_check(delay_seconds=1.0):
    timer = threading.Timer(delay_seconds, check_queued_documents)
    timer.daemon = True
    timer.start()


def _format_dashboard_customer_id(customer_id):
    value = str(customer_id or '').strip()
    if not value:
        return '—'
    return value if value.startswith('#') else f'#{value}'


def _normalize_doc_id_value(doc_id):
    return str(doc_id or '').strip().strip('#')


def _get_ticket_primary_doc_id(ticket):
    if ticket.document:
        return _normalize_doc_id_value(ticket.document.doc_id)
    return _normalize_doc_id_value(ticket.document_id_snapshot)


def _get_ticket_payment_record(ticket):
    payment_filters = Q()
    primary_doc_id = _get_ticket_primary_doc_id(ticket)

    if ticket.document:
        payment_filters |= Q(doc=ticket.document)
    if primary_doc_id:
        payment_filters |= Q(doc_id_snapshot=primary_doc_id) | Q(doc__doc_id=primary_doc_id)

    if not payment_filters:
        return None

    payment_qs = Payment.objects.filter(payment_filters)
    normalized_customer_id = str(ticket.customer_id or '').strip()
    if normalized_customer_id:
        payment_qs = payment_qs.filter(
            Q(customer_id_snapshot=normalized_customer_id) |
            Q(doc__customer_id=normalized_customer_id)
        )

    return payment_qs.order_by('-approved_at', '-id').first()


def _get_ticket_payment_amount(ticket):
    if ticket.payment_amount_snapshot is not None:
        return ticket.payment_amount_snapshot

    payment = _get_ticket_payment_record(ticket)
    return payment.price if payment else None


def _preserve_or_delete_document_payment(doc):
    payments = list(
        Payment.objects.filter(
            Q(doc=doc) | Q(doc_id_snapshot=doc.doc_id)
        )
    )

    for payment in payments:
        payment.capture_document_snapshot()
        if str(payment.payment_status or '').lower() == 'paid':
            payment.doc = None
            payment.save()
            continue
        payment.delete()


def _log_voucher_audit(voucher, *, action, amount, customer_id='', performed_by='', reference='', details=''):
    VoucherCreditAuditLog.objects.create(
        voucher=voucher,
        voucher_code_snapshot=voucher.code if voucher else reference,
        action=action,
        amount=Decimal(amount),
        balance_after=voucher.remaining_balance if voucher else None,
        customer_id=customer_id,
        performed_by=performed_by,
        reference=reference,
        details=details,
    )


def _extract_voucher_code_from_reason(reason):
    match = re.search(r'Auto voucher\s+(\S+)', str(reason or ''), re.IGNORECASE)
    if not match:
        return None
    return match.group(1).rstrip('.,;:')


def _create_or_get_cancelled_voucher_ticket(customer_id, documents):
    normalized_customer_id = str(customer_id or '').strip()
    ordered_documents = sorted(
        list(documents),
        key=lambda doc: (
            doc.time_submitted or timezone.now(),
            doc.doc_id,
        ),
    )

    if not normalized_customer_id or not ordered_documents:
        raise ValueError('customer_id and documents are required')

    related_doc_ids = [doc.doc_id for doc in ordered_documents]
    related_doc_ids_json = json.dumps(related_doc_ids) if len(related_doc_ids) > 1 else ''
    primary_document = ordered_documents[0]

    existing_ticket_qs = SupportTicket.objects.filter(
        customer_id=normalized_customer_id,
        status__in=['open', 'in-progress'],
    )
    if related_doc_ids_json:
        existing_ticket = existing_ticket_qs.filter(related_doc_ids=related_doc_ids_json).order_by('-created_at').first()
    else:
        existing_ticket = existing_ticket_qs.filter(
            Q(document=primary_document) |
            Q(document_id_snapshot=primary_document.doc_id)
        ).order_by('-created_at').first()

    if existing_ticket:
        return existing_ticket, False

    voucher_codes = []
    document_lines = []
    for document in ordered_documents:
        last_error = RerouteHistory.objects.filter(
            document=document,
            status__startswith='Error'
        ).order_by('timestamp').last()
        cancel_reason = last_error.status if last_error else 'No available Printer'
        voucher_code = _extract_voucher_code_from_reason(cancel_reason)
        if voucher_code and voucher_code not in voucher_codes:
            voucher_codes.append(voucher_code)
        document_lines.append(f'- {document.doc_id} ({document.filename}): {cancel_reason}')

    phone_number = ''
    payment = Payment.objects.filter(
        Q(doc__customer_id=normalized_customer_id) |
        Q(customer_id_snapshot=normalized_customer_id)
    ).exclude(
        phone_number__isnull=True
    ).exclude(
        phone_number=''
    ).order_by('-approved_at', '-id').first()
    if payment:
        phone_number = str(payment.phone_number or '').strip()

    ticket_description_parts = [
        'Auto-generated after customer confirmed they captured the voucher for reprint once the printer issue is fixed.',
    ]
    if voucher_codes:
        ticket_description_parts.append(f"Voucher codes: {', '.join(voucher_codes)}")
    ticket_description_parts.append('Affected cancelled documents:')
    ticket_description_parts.extend(document_lines)
    ticket_description = '\n'.join(ticket_description_parts)

    document_name = primary_document.original_name or primary_document.filename
    if len(ordered_documents) > 1:
        document_name = f'{len(ordered_documents)} auto-cancelled documents'

    ticket = SupportTicket.objects.create(
        customer_id=normalized_customer_id,
        document=primary_document,
        document_id_snapshot=primary_document.doc_id,
        document_name=document_name,
        customer_name=f'Customer {normalized_customer_id}',
        email='auto-ticket@safeprint.local',
        phone_number=phone_number,
        problem_type='no-print',
        description=ticket_description,
        related_doc_ids=related_doc_ids_json,
        admin_notes='Auto-generated after customer acknowledged voucher capture from the all-cancelled confirmation page.',
    )

    TicketAuditLog.objects.create(
        ticket=ticket,
        action='created',
        new_status='open',
        performed_by='SYSTEM',
        details='Auto-ticket created after voucher acknowledgement from the confirmation page.'
    )

    try:
        from portal.services.email_notify import alert_new_ticket
        alert_new_ticket(ticket.ticket_number, ticket.customer_name, ticket.problem_type, ticket.description)
    except Exception:
        pass

    return ticket, True


def _delete_customer_documents(customer_id, documents, *, log_prefix):
    uploads_dir = os.path.join(settings.MEDIA_ROOT, 'uploads')
    deleted_count = 0

    for document in documents:
        if document.stored_name:
            customer_dir = os.path.join(uploads_dir, customer_id)
            file_path = os.path.join(customer_dir, document.stored_name)
            if os.path.isfile(file_path):
                os.remove(file_path)
                print(f"[{log_prefix}] Deleted file {file_path} for document {document.doc_id}")

        _preserve_or_delete_document_payment(document)
        document.delete()
        deleted_count += 1

    VoucherCredit.objects.filter(last_customer_id=customer_id).update(last_customer_id=None)
    _trigger_upload_folder_cleanup()

    return deleted_count


def _get_dashboard_document_display(ticket):
    raw_related_doc_ids = str(ticket.related_doc_ids or '').strip()
    related_doc_ids = []

    if raw_related_doc_ids:
        try:
            parsed_doc_ids = json.loads(raw_related_doc_ids)
            if isinstance(parsed_doc_ids, list):
                related_doc_ids = [str(doc_id).strip() for doc_id in parsed_doc_ids if str(doc_id).strip()]
            elif parsed_doc_ids:
                related_doc_ids = [str(parsed_doc_ids).strip()]
        except (TypeError, ValueError, json.JSONDecodeError):
            related_doc_ids = [part.strip() for part in raw_related_doc_ids.split(',') if part.strip()]

    primary_doc_id = _get_ticket_primary_doc_id(ticket)
    ordered_doc_ids = []

    for doc_id in [primary_doc_id, *related_doc_ids]:
        clean_doc_id = str(doc_id or '').strip().strip('#')
        if clean_doc_id and clean_doc_id not in ordered_doc_ids:
            ordered_doc_ids.append(clean_doc_id)

    if ordered_doc_ids:
        summary_ids = [f'#{doc_id}' for doc_id in ordered_doc_ids[:2]]
        summary = ', '.join(summary_ids)
        if len(ordered_doc_ids) > 2:
            summary = f'{summary} +{len(ordered_doc_ids) - 2} more'

        meta = f'{len(ordered_doc_ids)} documents' if len(ordered_doc_ids) > 1 else ''
        return summary, meta

    fallback_name = str(ticket.document_name or '').strip()
    if fallback_name:
        return fallback_name, ''

    return '—', ''


def _attach_dashboard_ticket_display(ticket):
    ticket.customer_id_display = _format_dashboard_customer_id(ticket.customer_id)
    ticket.primary_doc_id = _get_ticket_primary_doc_id(ticket)
    ticket.document_ids_display, ticket.document_meta_display = _get_dashboard_document_display(ticket)
    return ticket


def _local_day_bounds(target_date=None):
    target_date = target_date or timezone.localdate()
    current_tz = timezone.get_current_timezone()
    day_start = timezone.make_aware(datetime.combine(target_date, datetime_time.min), current_tz)
    next_day_start = day_start + timedelta(days=1)
    return day_start, next_day_start


def _month_start_bounds(target_date=None):
    target_date = target_date or timezone.localdate()
    month_start_date = target_date.replace(day=1)
    current_tz = timezone.get_current_timezone()
    month_start = timezone.make_aware(datetime.combine(month_start_date, datetime_time.min), current_tz)
    if month_start_date.month == 12:
        next_month_date = month_start_date.replace(year=month_start_date.year + 1, month=1, day=1)
    else:
        next_month_date = month_start_date.replace(month=month_start_date.month + 1, day=1)
    next_month_start = timezone.make_aware(datetime.combine(next_month_date, datetime_time.min), current_tz)
    return month_start, next_month_start


def _get_payment_customer_id(payment):
    return str(payment.audit_customer_id or '').strip()


def _get_payment_doc_id(payment):
    return str(payment.audit_doc_id or '').strip()


def _format_threshold_percent(value):
    if value in (None, ''):
        return ''
    decimal_value = Decimal(str(value))
    normalized = decimal_value.normalize()
    return format(normalized, 'f').rstrip('0').rstrip('.') if '.' in format(normalized, 'f') else format(normalized, 'f')


def _build_sales_records(payments):
    grouped_records = {}

    for payment in payments:
        customer_id = _get_payment_customer_id(payment)
        approved_at = payment.approved_at
        payment_method = payment.payment_method or 'manual'
        approved_by = payment.approved_by or '—'
        group_key = (
            customer_id,
            approved_at.isoformat() if approved_at else '',
            payment_method,
            approved_by,
        )

        record = grouped_records.get(group_key)
        if record is None:
            record = {
                'row_id': f'{customer_id}-{payment.id}',
                'approved_at': approved_at,
                'customer_id': customer_id,
                'payment_method': payment_method,
                'approved_by': approved_by,
                'amount': Decimal('0.00'),
                'doc_ids': [],
                'pricing_thresholds': [],
            }
            grouped_records[group_key] = record

        record['amount'] += Decimal(payment.price or 0)

        doc_id = _get_payment_doc_id(payment)
        if doc_id and doc_id not in record['doc_ids']:
            record['doc_ids'].append(doc_id)

        threshold_display = _format_threshold_percent(payment.pricing_threshold_snapshot)
        if threshold_display and threshold_display not in record['pricing_thresholds']:
            record['pricing_thresholds'].append(threshold_display)

    sales_records = list(grouped_records.values())
    for record in sales_records:
        record['document_ids_display'] = ', '.join(record['doc_ids']) if record['doc_ids'] else '—'
        if record['pricing_thresholds']:
            record['pricing_threshold_display'] = ', '.join(record['pricing_thresholds'])
        else:
            record['pricing_threshold_display'] = '—'

    sales_records.sort(
        key=lambda item: (item['approved_at'] is not None, item['approved_at'] or timezone.make_aware(datetime.min, timezone.get_current_timezone())),
        reverse=True,
    )
    return sales_records


def _admin_log_sources():
    base_dir = settings.BASE_DIR
    return {
        'gunicorn_error': {
            'label': 'Gunicorn Error',
            'path': '/var/log/gunicorn/safeprint-error.log',
        },
        'gunicorn_access': {
            'label': 'Gunicorn Access',
            'path': '/var/log/gunicorn/safeprint-access.log',
        },
        'django_runtime': {
            'label': 'Django Runtime',
            'path': '/var/log/gunicorn/safeprint-django.log',
        },
        'django_app': {
            'label': 'Django App',
            'path': os.path.join(base_dir, 'logs', 'django.log'),
        },
        'printer_polling': {
            'label': 'Printer Polling',
            'path': os.path.join(base_dir, 'logs', 'printer_polling.log'),
        },
        'cron_purge': {
            'label': 'Cron Purge',
            'path': os.path.join(base_dir, 'logs', 'cron_purge_tickets.log'),
        },
    }


def _normalize_sales_voucher_filter(raw_value):
    voucher_filter = (raw_value or 'exclude').strip().lower()
    if voucher_filter not in {'exclude', 'all', 'only'}:
        return 'exclude'
    return voucher_filter


def _apply_sales_voucher_filter(queryset, voucher_filter):
    voucher_filter = _normalize_sales_voucher_filter(voucher_filter)
    if voucher_filter == 'exclude':
        return queryset.exclude(payment_method='voucher_credit')
    if voucher_filter == 'only':
        return queryset.filter(payment_method='voucher_credit')
    return queryset


def _get_sales_voucher_filter(request):
    raw_value = request.GET.get('voucher_filter')
    if raw_value is None:
        return _normalize_sales_voucher_filter(request.session.get('sales_voucher_filter', 'exclude'))

    voucher_filter = _normalize_sales_voucher_filter(raw_value)
    request.session['sales_voucher_filter'] = voucher_filter
    return voucher_filter


def _tail_log_lines(file_path, line_count):
    recent_lines = deque(maxlen=line_count)

    with open(file_path, 'r', encoding='utf-8', errors='replace') as handle:
        for line in handle:
            recent_lines.append(line.rstrip('\n'))

    return '\n'.join(recent_lines)

def dashboard(request):
    user_id = request.session.get('admin_user_id')
    if not user_id:
        raise Http404("User not found in session")
    
    try:
        user = AdminUser.objects.get(id=user_id)
    except AdminUser.DoesNotExist:
        raise Http404("User not found")
    
    # Dashboard Stats
    printer_errors_count = _active_printer_error_count()
    
    # Ticket queries
    active_tickets = list(SupportTicket.objects.filter(
        status__in=['open', 'in-progress']
    ).select_related('document').prefetch_related('proof_images').order_by('-created_at'))
    
    resolved_tickets = list(SupportTicket.objects.filter(
        status__in=['resolved', 'closed', 'voided', 'refunded']
    ).select_related('document').prefetch_related('proof_images').order_by('-resolved_at', '-updated_at'))
    
    # Attach payment amount to each ticket via its preserved payment snapshot
    for ticket in active_tickets:
        ticket.payment_amount = _get_ticket_payment_amount(ticket)
        _attach_dashboard_ticket_display(ticket)
    
    for ticket in resolved_tickets:
        ticket.payment_amount = _get_ticket_payment_amount(ticket)
        _attach_dashboard_ticket_display(ticket)
    
    today = timezone.localdate()
    today_start, tomorrow_start = _local_day_bounds(today)
    sales_voucher_filter = _normalize_sales_voucher_filter(request.session.get('sales_voucher_filter', 'exclude'))
    active_tickets_count = len(active_tickets)
    resolved_tickets_count = len(resolved_tickets)
    sales_today_amount = _apply_sales_voucher_filter(Payment.objects.filter(
        payment_status='Paid',
        approved_at__gte=today_start,
        approved_at__lt=tomorrow_start,
    ), sales_voucher_filter).aggregate(total=Sum('price'))['total'] or Decimal('0.00')
    
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
        'sales_today_amount': sales_today_amount,
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
VOUCHER_CREDIT_EXPIRY_DAYS = 120  # Credits expire after 120 days


def _refund_reserved_voucher(intent):
    if not intent.voucher_credit_code or Decimal(intent.credit_applied) <= Decimal('0'):
        return

    voucher = VoucherCredit.objects.filter(code=intent.voucher_credit_code).first()
    if not voucher:
        return

    voucher.remaining_balance = Decimal(voucher.remaining_balance) + Decimal(intent.credit_applied)
    voucher.is_active = True
    voucher.save(update_fields=['remaining_balance', 'is_active'])
    _log_voucher_audit(
        voucher,
        action='restored',
        amount=Decimal(intent.credit_applied),
        customer_id=intent.customer_id,
        reference=str(intent.intent_id),
        details='Voucher credit restored after payment intent cancellation or expiry.',
    )


def _generate_unique_voucher_code():
    import secrets
    import string

    for _ in range(10):
        code = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))
        if not VoucherCredit.objects.filter(code=code).exists():
            return code
    raise ValueError('Failed to generate unique voucher code')


def _get_document_payment_record(document):
    return Payment.objects.filter(
        Q(doc=document) | Q(doc_id_snapshot=document.doc_id)
    ).order_by('-approved_at', '-id').first()


def _calculate_unprinted_refund_amount(document):
    payment = _get_document_payment_record(document)
    if not payment:
        return Decimal('0.00')

    total_pages = max(1, document.get_total_pages() or 0)
    remaining_pages = len(document.get_remaining_pages())
    if remaining_pages <= 0:
        return Decimal('0.00')

    total_paid = Decimal(payment.price or 0)
    if remaining_pages >= total_pages:
        return total_paid.quantize(Decimal('0.01'))

    refund_amount = (total_paid * Decimal(remaining_pages) / Decimal(total_pages)).quantize(Decimal('0.01'))
    return max(Decimal('0.00'), refund_amount)


def _issue_auto_refund_voucher(document, amount, *, details):
    normalized_amount = Decimal(amount).quantize(Decimal('0.01'))
    if normalized_amount <= Decimal('0.00'):
        return None

    existing_audit = VoucherCreditAuditLog.objects.filter(
        action='created',
        reference=document.doc_id,
        performed_by='SYSTEM',
        details__icontains='Automatic voucher issued after unrecoverable print failure.',
    ).select_related('voucher').order_by('-created_at').first()
    if existing_audit:
        existing_voucher = existing_audit.voucher
        if not existing_voucher and existing_audit.voucher_code_snapshot:
            existing_voucher = VoucherCredit.objects.filter(code=existing_audit.voucher_code_snapshot).first()
        if existing_voucher:
            update_fields = []
            if not existing_voucher.last_customer_id:
                existing_voucher.last_customer_id = document.customer_id
                update_fields.append('last_customer_id')
            if update_fields:
                existing_voucher.save(update_fields=update_fields)
            return existing_voucher

    voucher = VoucherCredit.objects.create(
        code=_generate_unique_voucher_code(),
        original_amount=normalized_amount,
        remaining_balance=normalized_amount,
        is_active=True,
        last_customer_id=document.customer_id,
        expires_at=timezone.now() + timedelta(days=VOUCHER_CREDIT_EXPIRY_DAYS),
    )
    _log_voucher_audit(
        voucher,
        action='created',
        amount=normalized_amount,
        customer_id=document.customer_id,
        performed_by='SYSTEM',
        reference=document.doc_id,
        details=details,
    )
    return voucher


def _cancel_document_with_auto_voucher(document, *, reason):
    document.refresh_from_db()
    assigned_printer = document.printer_assigned
    refund_amount = _calculate_unprinted_refund_amount(document)
    voucher = _issue_auto_refund_voucher(
        document,
        refund_amount,
        details=f'Automatic voucher issued after unrecoverable print failure. {reason}',
    )

    message = reason
    if voucher:
        message = f'{reason} Auto voucher {voucher.code} generated for ₱{refund_amount:.2f}.'

    paper_size = str(getattr(document, 'paper_size', '') or '').strip()
    if voucher:
        compact_history_status = f"Error: {paper_size or 'Print'} no printer. Auto voucher {voucher.code}"
    else:
        compact_history_status = f"Error: {paper_size or 'Print'} no printer"
    compact_history_status = compact_history_status[:50]

    # Create the auto-voucher RerouteHistory entry BEFORE flipping the doc to
    # Cancelled. The customer SSE stream picks the latest 'Error: ...' entry as
    # `cancel_reason` the moment it sees doc_status='Cancelled' — if we save the
    # doc first, there's a race window where SSE emits a stale prior cancel
    # reason (e.g. "Error: Sleep") and the frontend voucher alert never matches
    # because it looks for the substring "auto voucher".
    _voucher_history = RerouteHistory.objects.create(
        document=document,
        printer=None,
        status=compact_history_status,
        timestamp=timezone.now(),
    )

    document.doc_status = 'Cancelled'
    document.printer_assigned = None
    document.status_updated_at = timezone.now()
    document.save(update_fields=['doc_status', 'printer_assigned', 'status_updated_at'])
    _sync_printer_scheduler_state(assigned_printer)
    Feedback.objects.create(
        category='Report a Problem',
        name='[SYSTEM GENERATED]',
        message=f'Automatic voucher flow triggered for {document.doc_id}. {message}',
    )
    print(f"[AUTO-VOUCHER] Document {document.doc_id} cancelled. {message}")
    return voucher


def _expire_stale_payment_intents(customer_id=None):
    stale_intents = PaymentIntent.objects.filter(
        status=PaymentIntent.STATUS_PENDING,
        expires_at__lt=timezone.now(),
    ).order_by('created_at')

    if customer_id:
        stale_intents = stale_intents.filter(customer_id=customer_id)

    for intent in stale_intents:
        with transaction.atomic():
            locked_intent = PaymentIntent.objects.select_for_update().get(pk=intent.pk)
            if locked_intent.status != PaymentIntent.STATUS_PENDING:
                continue
            _refund_reserved_voucher(locked_intent)
            locked_intent.status = PaymentIntent.STATUS_EXPIRED
            locked_intent.save(update_fields=['status', 'updated_at'])


def _queue_document_for_dispatch(document, *, priority, queued_at=None, clear_printer=True):
    queued_at = queued_at or timezone.now()
    document.doc_status = 'Queued'
    document.queue_priority = priority
    document.queued_at = queued_at
    document.status_updated_at = queued_at

    update_fields = ['doc_status', 'queue_priority', 'queued_at', 'status_updated_at']
    if clear_printer and document.printer_assigned_id is not None:
        document.printer_assigned = None
        update_fields.append('printer_assigned')

    document.save(update_fields=update_fields)
    return document


def _mark_customer_documents_paid(payments, *, approved_by, payment_method):
    approved_at = timezone.now()
    queued_any = False
    for payment_obj in payments:
        payment_obj.payment_status = 'Paid'
        payment_obj.payment_method = payment_method
        payment_obj.approved_at = approved_at
        payment_obj.approved_by = approved_by
        payment_obj.save(update_fields=['payment_status', 'payment_method', 'approved_at', 'approved_by'])

        document = payment_obj.doc
        _queue_document_for_dispatch(
            document,
            priority=Document.QueuePriority.NORMAL,
            queued_at=approved_at,
        )
        queued_any = True

    if queued_any:
        _schedule_queue_check(1.0)


def _payment_gateway_context(site):
    return {
        'recipient_name': site.gcash_recipient_name or 'GCash Recipient',
        'recipient_number': site.gcash_recipient_number or '09XX XXX XXXX',
        'recipient_qr_url': site.gcash_qr_image.url if site.gcash_qr_image else '',
        'payment_expiry_minutes': site.payment_expiry_minutes or 10,
        'block_payment_when_printers_unavailable': site.block_payment_when_printers_unavailable,
    }


def _pricing_settings_context(site):
    return {
        'letter_bw_price': str(site.letter_bw_price),
        'letter_partial_price': str(site.letter_partial_price),
        'letter_full_price': str(site.letter_full_price),
        'a4_bw_price': str(site.a4_bw_price),
        'a4_partial_price': str(site.a4_partial_price),
        'a4_full_price': str(site.a4_full_price),
        'long_bw_price': str(site.long_bw_price),
        'long_partial_price': str(site.long_partial_price),
        'long_full_price': str(site.long_full_price),
        'color_full_threshold_percent': str(site.color_full_threshold_percent),
    }


def _document_required_sheets(document):
    try:
        copies = max(1, int(getattr(document, 'num_copies', 1) or 1))
    except (TypeError, ValueError):
        copies = 1

    remaining_pages = document.get_remaining_pages() if hasattr(document, 'get_remaining_pages') else []
    total_pages = len(remaining_pages) if remaining_pages else (document.get_total_pages() or 0)
    return max(0, total_pages * copies)


def _printer_has_required_stock(printer, document):
    tray_level = (getattr(printer, 'tray_level', '') or '').strip()
    tray_current_count = getattr(printer, 'tray_current_count', None)

    if tray_level == 'Needs Refill':
        return False

    if tray_current_count is not None and tray_current_count < _document_required_sheets(document):
        return False

    return True


def _get_matching_printers(document, *, allowed_statuses):
    candidate_printers = Printer.objects.filter(
        paper_assigned=document.paper_size,
        is_temporarily_disabled=False,
        printer_status__in=allowed_statuses,
    )
    return [printer for printer in candidate_printers if _printer_has_required_stock(printer, document)]


def _available_printers_for_document(
    document,
    *,
    allowed_statuses,
    exclude_printer_id=None,
    exclude_printer_ids=None,
    lock_rows=False,
    sync_scheduler_state=False,
    require_idle=True,
):
    excluded_ids = set()
    if exclude_printer_id is not None:
        excluded_ids.add(exclude_printer_id)
    if exclude_printer_ids:
        excluded_ids.update(pid for pid in exclude_printer_ids if pid is not None)

    candidate_printers = Printer.objects.filter(
        paper_assigned=document.paper_size,
        is_temporarily_disabled=False,
        printer_status__in=allowed_statuses,
    ).exclude(id__in=excluded_ids).order_by('id')

    if lock_rows:
        candidate_printers = candidate_printers.select_for_update()

    available_printers = []
    for printer in candidate_printers:
        if sync_scheduler_state:
            _sync_printer_scheduler_state(printer)
        if require_idle and (getattr(printer, 'active_job_count', 0) or 0) > 0:
            continue
        if not _printer_has_required_stock(printer, document):
            continue
        available_printers.append(printer)

    available_printers.sort(key=_printer_scheduler_sort_key)
    return available_printers


def _printer_scheduler_sort_key(printer):
    last_assigned_at = getattr(printer, 'last_assigned_at', None)
    scheduling_weight = max(1, int(getattr(printer, 'scheduling_weight', 1) or 1))
    return (
        getattr(printer, 'active_job_count', 0) or 0,
        0 if last_assigned_at is None else 1,
        0 if last_assigned_at is None else int(last_assigned_at.timestamp() * 1000000),
        -scheduling_weight,
        printer.id,
    )


def _sync_printer_scheduler_state(printer, *, assigned_at=None):
    if not printer or not getattr(printer, 'id', None):
        return printer

    active_job_count = Document.objects.filter(
        doc_status='Printing',
        printer_assigned_id=printer.id,
    ).count()

    update_fields = []
    if (getattr(printer, 'active_job_count', 0) or 0) != active_job_count:
        printer.active_job_count = active_job_count
        update_fields.append('active_job_count')

    if assigned_at is not None:
        printer.last_assigned_at = assigned_at
        update_fields.append('last_assigned_at')

    if update_fields:
        printer.save(update_fields=update_fields)

    return printer


def select_printer_for_document(
    document,
    *,
    allowed_statuses,
    exclude_printer_id=None,
    exclude_printer_ids=None,
    lock_rows=False,
):
    available_printers = _available_printers_for_document(
        document,
        allowed_statuses=allowed_statuses,
        exclude_printer_id=exclude_printer_id,
        exclude_printer_ids=exclude_printer_ids,
        lock_rows=lock_rows,
        sync_scheduler_state=True,
    )
    return available_printers[0] if available_printers else None


def _failed_printer_ids_for_document(document):
    """Return the set of printer IDs that have already failed for this document.

    A printer is considered failed if there is at least one RerouteHistory entry
    for this document whose status starts with 'Error', 'Stalled', 'Failed', or
    'Timeout'. This is used to prevent the rerouter from ping-ponging between
    the same handful of unhealthy printers forever.
    """
    failure_prefixes = ('Error', 'Stalled', 'Failed', 'Timeout')
    failure_filter = Q()
    for prefix in failure_prefixes:
        failure_filter |= Q(status__istartswith=prefix)

    failed_ids = set(
        RerouteHistory.objects
        .filter(document=document)
        .filter(failure_filter)
        .exclude(printer__isnull=True)
        .values_list('printer_id', flat=True)
    )
    return failed_ids


def _active_printer_error_count():
    return Printer.objects.filter(is_temporarily_disabled=False).exclude(
        printer_status__in=['Sleep', 'Ready', 'Printing']
    ).count()


def _printer_has_hard_fault(printer):
    status_value = (getattr(printer, 'printer_status', '') or '').strip().lower()
    if not status_value or status_value in {'ready', 'sleep', 'printing', 'please wait.'}:
        return False

    hard_fault_keywords = (
        'offline',
        'error',
        'jam',
        'out of paper',
        'no paper',
        'cover open',
        'door open',
        'tray empty',
        'needs refill',
    )
    return any(keyword in status_value for keyword in hard_fault_keywords)


def _terminal_no_printer_reason(document, *, exclude_printer_ids=None):
    candidate_printers = list(
        Printer.objects.filter(
            paper_assigned=document.paper_size,
            is_temporarily_disabled=False,
        )
    )

    excluded_ids = {pid for pid in (exclude_printer_ids or set()) if pid is not None}

    if not candidate_printers:
        return f'No active printer supports {document.paper_size} paper.'

    eligible_candidates = [printer for printer in candidate_printers if printer.id not in excluded_ids]
    if excluded_ids and not eligible_candidates:
        exhausted_printers = [printer.printer_name for printer in candidate_printers if printer.id in excluded_ids]
        return (
            f'No eligible printer remains for {document.paper_size} after failures on '
            + ', '.join(exhausted_printers)
            + '.'
        )

    healthy_and_stocked = [
        printer for printer in eligible_candidates
        if not _printer_has_hard_fault(printer) and _printer_has_required_stock(printer, document)
    ]
    if healthy_and_stocked:
        return None

    faulted_printers = [printer.printer_name for printer in eligible_candidates if _printer_has_hard_fault(printer)]
    stock_blocked_printers = [
        printer.printer_name for printer in eligible_candidates
        if not _printer_has_required_stock(printer, document)
    ]

    reason_parts = []
    if faulted_printers:
        reason_parts.append(f'hard faults on {", ".join(faulted_printers)}')
    if stock_blocked_printers:
        reason_parts.append(f'insufficient paper stock on {", ".join(stock_blocked_printers)}')

    if reason_parts:
        return (
            f'No eligible printer can currently print {document.paper_size} because '
            + '; '.join(reason_parts)
            + '.'
        )

    return None


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


def sales_dashboard(request):
    user_id = request.session.get('admin_user_id')
    if not user_id:
        raise Http404("User not found in session")

    try:
        user = AdminUser.objects.get(id=user_id)
    except AdminUser.DoesNotExist:
        raise Http404("User not found")

    active_tickets_count = SupportTicket.objects.filter(status__in=['open', 'in-progress']).count()
    site = SiteSetting.load()
    paid_payments = Payment.objects.select_related('doc').filter(payment_status='Paid')

    search_query = (request.GET.get('q') or '').strip()
    date_from = (request.GET.get('date_from') or '').strip()
    date_to = (request.GET.get('date_to') or '').strip()
    voucher_filter = _get_sales_voucher_filter(request)
    paid_payments = _apply_sales_voucher_filter(paid_payments, voucher_filter)
    filtered_payments = paid_payments

    if search_query:
        normalized_search = search_query.strip().lstrip('#')
        filtered_payments = filtered_payments.filter(
            Q(customer_id_snapshot__icontains=normalized_search)
            | Q(doc_id_snapshot__icontains=normalized_search)
            | Q(doc__customer_id__icontains=normalized_search)
            | Q(doc__doc_id__icontains=normalized_search)
        )

    if date_from:
        filtered_payments = filtered_payments.filter(approved_at__gte=f'{date_from}T00:00:00')
    if date_to:
        filtered_payments = filtered_payments.filter(approved_at__lt=f'{date_to}T23:59:59.999999')

    today = timezone.localdate()
    today_start, tomorrow_start = _local_day_bounds(today)
    month_start, next_month_start = _month_start_bounds(today)

    today_sales = paid_payments.filter(approved_at__gte=today_start, approved_at__lt=tomorrow_start).aggregate(total=Sum('price'))['total'] or Decimal('0.00')
    month_sales = paid_payments.filter(approved_at__gte=month_start, approved_at__lt=next_month_start).aggregate(total=Sum('price'))['total'] or Decimal('0.00')
    lifetime_sales = paid_payments.aggregate(total=Sum('price'))['total'] or Decimal('0.00')
    recent_sales = _build_sales_records(filtered_payments.order_by('-approved_at', '-id')[:250])[:100]
    paid_transactions_count = len(recent_sales)

    return render(request, 'sales.html', {
        'user': user,
        'active_tickets_count': active_tickets_count,
        'today_sales': today_sales,
        'month_sales': month_sales,
        'lifetime_sales': lifetime_sales,
        'paid_transactions_count': paid_transactions_count,
        'recent_sales': recent_sales,
        'today_label': today.strftime('%b %d, %Y'),
        'month_label': today.strftime('%B %Y'),
        'sales_search_query': search_query,
        'sales_date_from': date_from,
        'sales_date_to': date_to,
        'sales_voucher_filter': voucher_filter,
        'pricing_config': _pricing_settings_context(site),
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
        admin_name = ''
        try:
            admin_name = AdminUser.objects.get(id=user_id).name
        except AdminUser.DoesNotExist:
            pass
        
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
        _log_voucher_audit(
            voucher,
            action='created',
            amount=Decimal(str(amount)),
            performed_by=admin_name,
            details='Voucher created by admin.',
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
        admin_name = ''
        try:
            admin_name = AdminUser.objects.get(id=user_id).name
        except AdminUser.DoesNotExist:
            pass
        voucher.is_active = not voucher.is_active
        voucher.save(update_fields=['is_active'])
        _log_voucher_audit(
            voucher,
            action='deactivated' if not voucher.is_active else 'reactivated',
            amount=Decimal('0.00'),
            performed_by=admin_name,
            details=f'Voucher manually {"deactivated" if not voucher.is_active else "reactivated"} by admin.',
        )
        
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
        admin_name = ''
        try:
            admin_name = AdminUser.objects.get(id=user_id).name
        except AdminUser.DoesNotExist:
            pass
        _log_voucher_audit(
            voucher,
            action='deleted',
            amount=Decimal('0.00'),
            performed_by=admin_name,
            details='Voucher deleted by admin.',
        )
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
            payment_amount = _get_ticket_payment_amount(ticket)

            customer_id_display = _format_dashboard_customer_id(ticket.customer_id)
            document_ids_display, document_meta_display = _get_dashboard_document_display(ticket)
            
            active_tickets_data.append({
                'id': ticket.id,
                'ticket_number': ticket.ticket_number,
                'customer_id': ticket.customer_id,
                'customer_id_display': customer_id_display,
                'customer_name': ticket.customer_name,
                'email': ticket.email,
                'phone_number': ticket.phone_number,
                'document_name': ticket.document_name,
                'document_ids_display': document_ids_display,
                'document_meta_display': document_meta_display,
                'problem_type': ticket.get_problem_type_display(),
                'description': ticket.description,
                'created_at': ticket.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                'payment_amount': float(payment_amount) if payment_amount is not None else None,
                'was_reprinted': ticket.was_reprinted,
                'doc_id': _get_ticket_primary_doc_id(ticket),
                'gcash_number': ticket.gcash_number,
                'receipt_code': ticket.receipt_code,
                'receipt_screenshot_url': ticket.receipt_screenshot.url if ticket.receipt_screenshot else '',
            })
        
        resolved_tickets_data = []
        for ticket in resolved_tickets:
            payment_amount = _get_ticket_payment_amount(ticket)

            customer_id_display = _format_dashboard_customer_id(ticket.customer_id)
            document_ids_display, document_meta_display = _get_dashboard_document_display(ticket)
            
            resolved_tickets_data.append({
                'id': ticket.id,
                'ticket_number': ticket.ticket_number,
                'customer_id': ticket.customer_id,
                'customer_id_display': customer_id_display,
                'customer_name': ticket.customer_name,
                'email': ticket.email,
                'phone_number': ticket.phone_number,
                'document_name': ticket.document_name,
                'document_ids_display': document_ids_display,
                'document_meta_display': document_meta_display,
                'problem_type': ticket.get_problem_type_display(),
                'description': ticket.description,
                'created_at': ticket.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                'payment_amount': float(payment_amount) if payment_amount is not None else None,
                'was_reprinted': ticket.was_reprinted,
                'doc_id': _get_ticket_primary_doc_id(ticket),
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
        
        today_start, tomorrow_start = _local_day_bounds()
        sales_voucher_filter = _normalize_sales_voucher_filter(request.session.get('sales_voucher_filter', 'exclude'))
        return JsonResponse({
            'success': True,
            'active_tickets': active_tickets_data,
            'resolved_tickets': resolved_tickets_data,
            'active_count': len(active_tickets_data),
            'resolved_count': len(resolved_tickets_data),
            'sales_today_amount': float(_apply_sales_voucher_filter(Payment.objects.filter(
                payment_status='Paid',
                approved_at__gte=today_start,
                approved_at__lt=tomorrow_start,
            ), sales_voucher_filter).aggregate(total=Sum('price'))['total'] or Decimal('0.00')),
        })
    except Exception as e:
        logger.error(f"Error fetching active tickets: {str(e)}")
        return JsonResponse({'success': False, 'error': str(e)})


def payment(request):
    """
    Handle the SafePrint-managed GCash payment flow backed by Firebase.
    """
    site = SiteSetting.load()
    gateway_context = _payment_gateway_context(site)

    default_context = {
        'customer_id': '',
        'documents': [],
        'total_price': 0,
        'stars': range(1, 6),
        'debug': False,
        'error': None,
        'payment_config': gateway_context,
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
                'payment_config': gateway_context,
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
            # ACTION: INITIATE — Create local payment intent and show GCash instructions
            # ─────────────────────────────────────────────
            if action == 'initiate':
                _expire_stale_payment_intents(customer_id=customer_id)

                phone_number = normalize_phone_number(data.get('phone_number', '').strip())
                voucher_credit_code = data.get('voucher_credit_code', '').strip().upper()

                if not documents_ids:
                    return JsonResponse({
                        'success': False,
                        'error': 'No documents specified'
                    })

                # ─── Check printer availability before proceeding ───
                if site.block_payment_when_printers_unavailable:
                    pending_docs = Document.objects.filter(doc_id__in=documents_ids, doc_status='Pending')
                    for doc in pending_docs:
                        matching_printers = _get_matching_printers(
                            doc,
                            allowed_statuses=['Ready', 'Printing', 'Sleep'],
                        )
                        if not matching_printers:
                            return JsonResponse({
                                'success': False,
                                'error': f'No available printer for {doc.paper_size} with enough paper loaded. Please try again later.'
                            })

                # Calculate total price from Payment records
                total_price = Decimal('0.00')
                for doc_id in documents_ids:
                    try:
                        payment_obj = Payment.objects.get(doc__doc_id=doc_id)
                        total_price += Decimal(payment_obj.price)
                    except Payment.DoesNotExist:
                        pass
                
                if total_price <= 0:
                    return JsonResponse({
                        'success': False,
                        'error': 'Invalid payment amount'
                    })
                
                # ─── Apply voucher credit if provided ───
                credit_applied = Decimal('0.00')
                credit_voucher = None
                
                if voucher_credit_code:
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
                        Decimal(credit_voucher.remaining_balance),
                        total_price
                    )
                
                balance_due = total_price - credit_applied
                
                # ─── Case 1: Fully covered by credit (₱0 charge) ───
                if balance_due <= 0:
                    with transaction.atomic():
                        credit_voucher.remaining_balance = Decimal(credit_voucher.remaining_balance) - credit_applied
                        if credit_voucher.remaining_balance <= 0:
                            credit_voucher.remaining_balance = Decimal('0.00')
                            credit_voucher.is_active = False
                        credit_voucher.last_customer_id = customer_id
                        credit_voucher.last_used_at = timezone.now()
                        credit_voucher.save()
                        _log_voucher_audit(
                            credit_voucher,
                            action='redeemed',
                            amount=credit_applied,
                            customer_id=customer_id,
                            reference=voucher_credit_code,
                            details='Voucher fully redeemed for a credit-only payment.',
                        )
                        
                        payments = list(
                            Payment.objects.select_related('doc').filter(
                                doc__doc_id__in=documents_ids,
                                doc__customer_id=customer_id,
                            )
                        )
                        _mark_customer_documents_paid(
                            payments,
                            approved_by=f'Credit:{voucher_credit_code}',
                            payment_method='voucher_credit',
                        )
                    
                    remaining = float(credit_voucher.remaining_balance)
                    
                    # Store remaining credit info in session + DB for confirmation page coupon
                    if remaining > 0:
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
                
                # ─── Phone number is required from here ───
                if not phone_number:
                    return JsonResponse({
                        'success': False,
                        'error': 'Phone number is required for payment.'
                    })

                if not re.match(r'^0?9\d{9}$', phone_number):
                    return JsonResponse({
                        'success': False,
                        'error': 'A valid GCash number is required for payment.'
                    })
                
                with transaction.atomic():
                    existing_intents = list(
                        PaymentIntent.objects.select_for_update().filter(
                            customer_id=customer_id,
                            status=PaymentIntent.STATUS_PENDING,
                        )
                    )
                    for pending_intent in existing_intents:
                        _refund_reserved_voucher(pending_intent)
                        pending_intent.status = PaymentIntent.STATUS_CANCELLED
                        pending_intent.save(update_fields=['status', 'updated_at'])

                    if credit_voucher and credit_applied > 0:
                        credit_voucher = VoucherCredit.objects.select_for_update().get(pk=credit_voucher.pk)
                        if not credit_voucher.is_usable or Decimal(credit_voucher.remaining_balance) < credit_applied:
                            return JsonResponse({
                                'success': False,
                                'error': 'Voucher balance is no longer available. Please re-apply the voucher.',
                            })
                        credit_voucher.remaining_balance = Decimal(credit_voucher.remaining_balance) - credit_applied
                        if credit_voucher.remaining_balance <= 0:
                            credit_voucher.remaining_balance = Decimal('0.00')
                            credit_voucher.is_active = False
                        credit_voucher.last_used_at = timezone.now()
                        credit_voucher.save(update_fields=['remaining_balance', 'is_active', 'last_used_at'])

                    expires_at = timezone.now() + timedelta(minutes=site.payment_expiry_minutes or 10)
                    payment_intent = PaymentIntent.objects.create(
                        customer_id=customer_id,
                        doc_ids=list(documents_ids),
                        payer_number=phone_number,
                        expected_amount=balance_due,
                        voucher_credit_code=voucher_credit_code,
                        credit_applied=credit_applied,
                        recipient_name=gateway_context['recipient_name'],
                        recipient_number=gateway_context['recipient_number'],
                        expires_at=expires_at,
                    )

                    if credit_voucher and credit_applied > 0:
                        _log_voucher_audit(
                            credit_voucher,
                            action='reserved',
                            amount=credit_applied,
                            customer_id=customer_id,
                            reference=str(payment_intent.intent_id),
                            details='Voucher credit reserved for a pending GCash listener payment intent.',
                        )

                    for payment_obj in Payment.objects.filter(doc__doc_id__in=documents_ids):
                        payment_obj.payment_method = 'gcash_listener'
                        payment_obj.phone_number = phone_number
                        payment_obj.save(update_fields=['payment_method', 'phone_number'])

                request.session['pending_payment_cid'] = customer_id
                request.session['pending_payment_doc_ids'] = documents_ids

                return JsonResponse({
                    'success': True,
                    'mode': 'payment',
                    'message': 'Payment instructions ready.',
                    'payment_intent_id': str(payment_intent.intent_id),
                    'amount': float(balance_due),
                    'original_total': float(total_price),
                    'credit_applied': float(credit_applied),
                    'recipient_name': gateway_context['recipient_name'],
                    'recipient_number': gateway_context['recipient_number'],
                    'recipient_qr_url': gateway_context['recipient_qr_url'],
                    'payment_expiry_minutes': gateway_context['payment_expiry_minutes'],
                    'expires_at': expires_at.isoformat(),
                    'open_url': 'gcash://',
                })

            # ─────────────────────────────────────────────
            # ACTION: VERIFY — Match pending payment intent against Firestore notification
            # ─────────────────────────────────────────────
            elif action == 'verify':
                _expire_stale_payment_intents(customer_id=customer_id)

                payment_intent = PaymentIntent.objects.filter(
                    customer_id=customer_id,
                    status=PaymentIntent.STATUS_PENDING,
                ).order_by('created_at').first()

                if not payment_intent:
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

                if payment_intent.is_expired:
                    with transaction.atomic():
                        locked_intent = PaymentIntent.objects.select_for_update().get(pk=payment_intent.pk)
                        if locked_intent.status == PaymentIntent.STATUS_PENDING:
                            _refund_reserved_voucher(locked_intent)
                            locked_intent.status = PaymentIntent.STATUS_EXPIRED
                            locked_intent.save(update_fields=['status', 'updated_at'])
                    return JsonResponse({
                        'success': False,
                        'status': 'expired',
                        'error': 'This payment attempt expired. Please start a new payment attempt.',
                    })

                older_pending_intent_exists = PaymentIntent.objects.filter(
                    status=PaymentIntent.STATUS_PENDING,
                    payer_number=payment_intent.payer_number,
                    expected_amount=payment_intent.expected_amount,
                    created_at__lt=payment_intent.created_at,
                    expires_at__gte=timezone.now(),
                ).exclude(pk=payment_intent.pk).exists()

                if older_pending_intent_exists:
                    return JsonResponse({
                        'success': False,
                        'status': 'pending',
                        'error': 'A previous payment attempt with the same number and amount is still waiting for confirmation.',
                    })

                try:
                    candidates = list_matching_notifications(
                        payer_number=payment_intent.payer_number,
                        expected_amount=Decimal(payment_intent.expected_amount),
                        earliest_at=payment_intent.created_at,
                        latest_at=payment_intent.expires_at,
                    )
                except FirebasePaymentError:
                    return JsonResponse({
                        'success': False,
                        'status': 'pending',
                        'error': 'Automatic payment checking is temporarily unavailable. Please try again in a moment, and keep your receipt for manual review if needed.',
                    })

                for candidate in candidates:
                    try:
                        claimed_payload = claim_notification(
                            notification_ref=candidate['reference'],
                            customer_id=customer_id,
                            intent_id=payment_intent.intent_id,
                        )
                    except FirebasePaymentError:
                        return JsonResponse({
                            'success': False,
                            'status': 'pending',
                            'error': 'Automatic payment checking is temporarily unavailable. Please try again in a moment, and keep your receipt for manual review if needed.',
                        })
                    if claimed_payload is None:
                        continue

                    payments = list(
                        Payment.objects.select_related('doc').filter(
                            doc__customer_id=customer_id,
                            doc__doc_id__in=payment_intent.doc_ids,
                            payment_status='Unpaid',
                        )
                    )

                    if not payments:
                        return JsonResponse({
                            'success': False,
                            'error': 'No unpaid documents were found for this payment attempt.',
                        })

                    with transaction.atomic():
                        locked_intent = PaymentIntent.objects.select_for_update().get(pk=payment_intent.pk)
                        if locked_intent.status != PaymentIntent.STATUS_PENDING:
                            break

                        locked_intent.status = PaymentIntent.STATUS_MATCHED
                        locked_intent.matched_notification_id = candidate['doc_id']
                        locked_intent.matched_raw_text = claimed_payload.get('rawText', '')
                        locked_intent.matched_at = timezone.now()
                        locked_intent.verification_source = 'firestore'
                        locked_intent.save(update_fields=['status', 'matched_notification_id', 'matched_raw_text', 'matched_at', 'verification_source', 'updated_at'])

                        if locked_intent.voucher_credit_code and Decimal(locked_intent.credit_applied) > Decimal('0'):
                            voucher = VoucherCredit.objects.filter(code=locked_intent.voucher_credit_code).first()
                            if voucher:
                                _log_voucher_audit(
                                    voucher,
                                    action='redeemed',
                                    amount=Decimal(locked_intent.credit_applied),
                                    customer_id=locked_intent.customer_id,
                                    reference=str(locked_intent.intent_id),
                                    details='Reserved voucher credit finalized after successful GCash listener payment verification.',
                                )

                        _mark_customer_documents_paid(
                            payments,
                            approved_by='GCash-Listener-Auto',
                            payment_method='gcash_listener',
                        )

                    request.session.pop('pending_payment_cid', None)
                    request.session.pop('pending_payment_doc_ids', None)

                    return JsonResponse({
                        'success': True,
                        'message': 'Payment verified! Your documents are now queued for printing.',
                        'redirect_url': f'/confirmation/{customer_id}/',
                    })

                return JsonResponse({
                    'success': False,
                    'error': 'Payment not yet confirmed. If auto-detection still fails, keep your receipt for manual review.',
                    'status': 'pending'
                })

            elif action == 'cancel':
                # Cancel payment - delete unpaid payments and associated documents
                customer_id = data.get('customer_id')
                if not customer_id:
                    return JsonResponse({'success': False, 'error': 'Missing customer_id'})

                pending_intents = list(
                    PaymentIntent.objects.filter(
                        customer_id=customer_id,
                        status=PaymentIntent.STATUS_PENDING,
                    )
                )

                for intent in pending_intents:
                    with transaction.atomic():
                        locked_intent = PaymentIntent.objects.select_for_update().get(pk=intent.pk)
                        if locked_intent.status != PaymentIntent.STATUS_PENDING:
                            continue
                        _refund_reserved_voucher(locked_intent)
                        locked_intent.status = PaymentIntent.STATUS_CANCELLED
                        locked_intent.save(update_fields=['status', 'updated_at'])
                
                # Delete unpaid payments and their documents
                unpaid_payments = Payment.objects.filter(
                    doc__customer_id=customer_id,
                    payment_status='Unpaid'
                )
                
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
                
                # Clear session flags
                request.session.pop('pending_payment_cid', None)
                request.session.pop('pending_payment_doc_ids', None)
                
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
        history_entries = list(doc.reroute_history.select_related('printer').all())
        reroute_histories[doc.doc_id] = history_entries

        printed_pages = sorted({int(page) for page in (doc.pages_printed or [])})
        total_pages = doc.get_total_pages()
        remaining_pages = doc.get_remaining_pages()
        # Match print_document_async: pages are sent highest-first (reverse order).
        # The next page to print is the largest remaining page number, not the smallest.
        next_page = remaining_pages[-1] if remaining_pages else None

        latest_reroute = ''
        for entry in history_entries:
            if entry.status == 'Rerouted' and entry.printer:
                latest_reroute = entry.printer.printer_name

        doc.queue_status_meta = []
        if latest_reroute:
            doc.queue_status_meta.append(f'Rerouted to {latest_reroute}')

        if printed_pages:
            ranges = []
            range_start = printed_pages[0]
            range_end = printed_pages[0]
            for page in printed_pages[1:]:
                if page == range_end + 1:
                    range_end = page
                    continue
                ranges.append(str(range_start) if range_start == range_end else f'{range_start}-{range_end}')
                range_start = page
                range_end = page
            ranges.append(str(range_start) if range_start == range_end else f'{range_start}-{range_end}')
            page_label = 'Pages' if len(printed_pages) > 1 else 'Page'
            doc.queue_status_meta.append(f'{page_label} printed: {", ".join(ranges)}')

        if doc.doc_status == 'Printing' and next_page is not None:
            if total_pages > 0:
                doc.queue_status_meta.append(f'Printing page {next_page} of {total_pages}')
            else:
                doc.queue_status_meta.append(f'Printing page {next_page}')

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
    return render(request, 'status.html', {
        'printers': printers,
        'paper_size_choices': paper_size_choices,
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
            elif field == 'is_temporarily_disabled':
                value = str(value).lower() in ('1', 'true', 'yes', 'on')
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
        _trigger_upload_folder_cleanup()
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

        now = timezone.now()
        
        # Update doc_status and status_updated_at for all docs
        for doc in docs:
            _queue_document_for_dispatch(
                doc,
                priority=Document.QueuePriority.NORMAL,
                queued_at=now,
            )
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
        
        doc_printer_info = []
        for doc in docs:
            # Get reroute history for the document
            history_entries = RerouteHistory.objects.filter(document_id=doc.doc_id).select_related('printer').order_by('timestamp')
            reroute_history = [entry.printer.printer_name for entry in history_entries if entry.printer]
            doc_info = {
                'doc_id': doc.doc_id,
                'reroute_history': reroute_history
            }
            doc_printer_info.append(doc_info)

        _schedule_queue_check(1.0)

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
            doc = Document.objects.select_related('printer_assigned').get(doc_id=doc_id)

            cancelled_jobs = []
            if doc.doc_status in ['Queued', 'Printing'] and doc.printer_assigned:
                cancelled_jobs = _cancel_jobs_for_printer(doc.printer_assigned)
                RerouteHistory.objects.create(
                    document=doc,
                    printer=doc.printer_assigned,
                    status='Cancelled by admin'
                )

            # Try to delete the file from disk using stored_name
            if doc.stored_name:
                uploads_dir = os.path.join(settings.MEDIA_ROOT, 'uploads')
                for root, dirs, files in os.walk(uploads_dir):
                    if doc.stored_name in files:
                        file_path = os.path.join(root, doc.stored_name)
                        if os.path.isfile(file_path):
                            os.remove(file_path)
                            break
            _preserve_or_delete_document_payment(doc)
            doc.delete()
            # Trigger folder cleanup after deleting a document
            _trigger_upload_folder_cleanup()
            return JsonResponse({'success': True, 'deleted_count': 1, 'cancelled_jobs': cancelled_jobs})
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
            _queue_document_for_dispatch(
                doc,
                priority=Document.QueuePriority.NORMAL,
                queued_at=now,
            )
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

        _schedule_queue_check(1.0)

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


@csrf_exempt
def update_payment_gateway_settings(request):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})

    user_id = request.session.get('admin_user_id')
    if not user_id:
        return JsonResponse({'success': False, 'error': 'Not authenticated'}, status=403)

    site = SiteSetting.load()
    recipient_name = request.POST.get('gcash_recipient_name', '').strip()
    recipient_number = normalize_phone_number(request.POST.get('gcash_recipient_number', '').strip())
    expiry_minutes = request.POST.get('payment_expiry_minutes', '').strip()
    color_full_threshold_percent = request.POST.get('color_full_threshold_percent', '').strip()
    block_when_unavailable = request.POST.get('block_payment_when_printers_unavailable')
    qr_image = request.FILES.get('gcash_qr_image')

    site.gcash_recipient_name = recipient_name
    site.gcash_recipient_number = recipient_number
    if block_when_unavailable is not None:
        site.block_payment_when_printers_unavailable = str(block_when_unavailable).lower() in ('1', 'true', 'yes', 'on')

    if expiry_minutes:
        try:
            site.payment_expiry_minutes = max(1, int(expiry_minutes))
        except ValueError:
            return JsonResponse({'success': False, 'error': 'Payment expiry must be a valid number of minutes.'})

    if color_full_threshold_percent:
        try:
            threshold_value = Decimal(color_full_threshold_percent)
        except Exception:
            return JsonResponse({'success': False, 'error': 'Full color cutoff must be a valid percentage.'})

        if threshold_value < 0 or threshold_value > 100:
            return JsonResponse({'success': False, 'error': 'Full color cutoff must be between 0 and 100.'})
        site.color_full_threshold_percent = threshold_value

    if qr_image:
        if site.gcash_qr_image:
            site.gcash_qr_image.delete(save=False)
        site.gcash_qr_image = qr_image

    site.save()

    return JsonResponse({
        'success': True,
        'payment_config': _payment_gateway_context(site),
        'color_full_threshold_percent': str(site.color_full_threshold_percent),
    })


def update_pricing_settings(request):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})

    user_id = request.session.get('admin_user_id')
    if not user_id:
        return JsonResponse({'success': False, 'error': 'Not authenticated'}, status=403)

    site = SiteSetting.load()

    try:
        letter_bw_price = Decimal(request.POST.get('letter_bw_price', '').strip())
        letter_partial_price = Decimal(request.POST.get('letter_partial_price', '').strip())
        letter_full_price = Decimal(request.POST.get('letter_full_price', '').strip())
        a4_bw_price = Decimal(request.POST.get('a4_bw_price', '').strip())
        a4_partial_price = Decimal(request.POST.get('a4_partial_price', '').strip())
        a4_full_price = Decimal(request.POST.get('a4_full_price', '').strip())
        long_bw_price = Decimal(request.POST.get('long_bw_price', '').strip())
        long_partial_price = Decimal(request.POST.get('long_partial_price', '').strip())
        long_full_price = Decimal(request.POST.get('long_full_price', '').strip())
        color_full_threshold_percent = Decimal(request.POST.get('color_full_threshold_percent', '').strip())
    except Exception:
        return JsonResponse({'success': False, 'error': 'Pricing values must be valid numbers.'})

    if any(value < 0 for value in [
        letter_bw_price,
        letter_partial_price,
        letter_full_price,
        a4_bw_price,
        a4_partial_price,
        a4_full_price,
        long_bw_price,
        long_partial_price,
        long_full_price,
    ]):
        return JsonResponse({'success': False, 'error': 'Prices cannot be negative.'})

    if color_full_threshold_percent < 0 or color_full_threshold_percent > 100:
        return JsonResponse({'success': False, 'error': 'Full color cutoff must be between 0 and 100.'})

    site.letter_bw_price = letter_bw_price
    site.letter_partial_price = letter_partial_price
    site.letter_full_price = letter_full_price
    site.a4_bw_price = a4_bw_price
    site.a4_partial_price = a4_partial_price
    site.a4_full_price = a4_full_price
    site.long_bw_price = long_bw_price
    site.long_partial_price = long_partial_price
    site.long_full_price = long_full_price
    site.color_full_threshold_percent = color_full_threshold_percent
    site.save(update_fields=[
        'letter_bw_price',
        'letter_partial_price',
        'letter_full_price',
        'a4_bw_price',
        'a4_partial_price',
        'a4_full_price',
        'long_bw_price',
        'long_partial_price',
        'long_full_price',
        'color_full_threshold_percent',
    ])

    return JsonResponse({
        'success': True,
        'pricing_config': _pricing_settings_context(site),
    })


def get_admin_live_logs(request):
    user_id = request.session.get('admin_user_id')
    if not user_id:
        return JsonResponse({'success': False, 'error': 'Unauthorized'}, status=403)

    try:
        AdminUser.objects.only('id').get(id=user_id)
    except AdminUser.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Unauthorized'}, status=403)

    sources = _admin_log_sources()
    requested_source = str(request.GET.get('source') or 'gunicorn_error').strip()
    if requested_source not in sources:
        requested_source = 'gunicorn_error'

    try:
        line_count = int(request.GET.get('lines', 120))
    except (TypeError, ValueError):
        line_count = 120
    line_count = max(20, min(line_count, 400))

    selected_source = sources[requested_source]
    file_path = selected_source['path']
    content = ''
    unavailable_reason = ''
    updated_at = None

    try:
        if not os.path.exists(file_path):
            unavailable_reason = 'Log file not found.'
        else:
            content = _tail_log_lines(file_path, line_count)
            updated_at = os.path.getmtime(file_path)
    except PermissionError:
        unavailable_reason = 'Log file is not readable by the web app.'
    except OSError as error:
        unavailable_reason = f'Failed to read log file: {error}'

    return JsonResponse({
        'success': True,
        'sources': [
            {
                'id': source_id,
                'label': source_meta['label'],
            }
            for source_id, source_meta in sources.items()
        ],
        'selected_source': requested_source,
        'line_count': line_count,
        'content': content,
        'unavailable_reason': unavailable_reason,
        'updated_at': updated_at,
    })


def printer_status_stream(request):
    # SSE headers
    response = StreamingHttpResponse(printer_status_event_stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
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

                # SNMP often lags behind physical activity; CUPS sees the queue
                # as "now printing" while the DB still says Sleep/Ready. Overlay
                # CUPS so the status page matches what users hear/see on the device.
                display_status = printer.printer_status
                try:
                    qname = _resolve_cups_queue_name(printer)
                    if qname and display_status in ('Sleep', 'Ready'):
                        if _get_cups_printer_state(qname) == 'printing':
                            display_status = 'Printing'
                except Exception:
                    pass

                data.append({
                    'id': printer.id,
                    'printer_name': printer.printer_name,
                    'model_name': getattr(printer, 'model_name', ''),
                    'ip_address': printer.ip_address,
                    'node_name': getattr(printer, 'node_name', ''),
                    'printer_status': display_status,
                    'ink_status': ink_status,
                    'paper_assigned': getattr(printer, 'paper_assigned', ''),
                    'is_temporarily_disabled': bool(getattr(printer, 'is_temporarily_disabled', False)),
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
    sales_voucher_filter = _normalize_sales_voucher_filter(request.session.get('sales_voucher_filter', 'exclude'))
    response = StreamingHttpResponse(dashboard_status_event_stream(sales_voucher_filter), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    return response


def dashboard_status_event_stream(sales_voucher_filter='exclude'):
    from django.db import close_old_connections
    last_data = None
    try:
        while True:
            close_old_connections()
            # Gather dashboard stats
            completed_jobs_count = Document.objects.filter(doc_status='Finished').count()
            printer_errors_count = _active_printer_error_count()
            pending_customers_count = Document.objects.filter(doc_status='Pending').values('customer_id').distinct().count()
            active_tickets_count = SupportTicket.objects.filter(status__in=['open', 'in-progress']).count()
            resolved_tickets_count = SupportTicket.objects.filter(status__in=['resolved', 'closed', 'voided', 'refunded']).count()
            today_start, tomorrow_start = _local_day_bounds()
            sales_today_amount = _apply_sales_voucher_filter(Payment.objects.filter(
                payment_status='Paid',
                approved_at__gte=today_start,
                approved_at__lt=tomorrow_start,
            ), sales_voucher_filter).aggregate(total=Sum('price'))['total'] or Decimal('0.00')
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
                'sales_today_amount': float(sales_today_amount),
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


def assign_document_to_printer(document, *, wait_for_availability=True):
    import time as _time
    TIMEOUT_SECONDS = 1800  # 30 minutes
    start_time = _time.monotonic()
    while True:
        cancel_reason = None
        wait_message = None

        with transaction.atomic():
            try:
                doc = Document.objects.select_for_update().get(doc_id=document.doc_id)
            except Document.DoesNotExist:
                print(f"[CANCELLED] Document {document.doc_id} was deleted or cancelled before printer assignment.")
                return None
            if doc.doc_status != 'Queued':
                print(f"[CANCELLED] Document {document.doc_id} is no longer queued (status: {doc.doc_status}). Aborting printer assignment.")
                return None

            elapsed = _time.monotonic() - start_time
            if elapsed >= TIMEOUT_SECONDS:
                cancel_reason = (
                    f'No eligible printer became available within {elapsed:.0f} seconds '
                    f'for {doc.paper_size} paper.'
                )
            else:
                is_rerouted = RerouteHistory.objects.filter(document=doc).exists()
                cumulative_excludes = _failed_printer_ids_for_document(doc)
                previous_failed_printer = getattr(document, 'previous_failed_printer', None)
                if previous_failed_printer is not None:
                    cumulative_excludes.add(previous_failed_printer)

                available = _available_printers_for_document(
                    doc,
                    allowed_statuses=['Ready', 'Sleep'],
                    exclude_printer_ids=cumulative_excludes,
                    lock_rows=True,
                    sync_scheduler_state=True,
                )
                if available:
                    if len(available) > 1:
                        print(f"[SCHED] Available printers for document {doc.doc_id}:")
                        for printer_option in available:
                            print(
                                f"  - {printer_option.printer_name}: status={printer_option.printer_status}, "
                                f"active_jobs={printer_option.active_job_count}, "
                                f"last_assigned_at={printer_option.last_assigned_at}, "
                                f"weight={printer_option.scheduling_weight}"
                            )

                    printer = available[0]
                    assigned_at = timezone.now()
                    print(
                        f"[SCHED] Selected printer {printer.printer_name} for {doc.doc_id} "
                        f"(rerouted={is_rerouted}, active_jobs={printer.active_job_count}, "
                        f"last_assigned_at={printer.last_assigned_at}, weight={printer.scheduling_weight})"
                    )

                    doc.printer_assigned = printer
                    doc.doc_status = 'Printing'
                    doc.save(update_fields=['printer_assigned', 'doc_status', 'status_updated_at'])
                    _sync_printer_scheduler_state(printer, assigned_at=assigned_at)
                    RerouteHistory.objects.create(document=doc, printer=printer, status='Assigned')
                    print(f"[ASSIGNED] Document {doc.doc_id} assigned to {printer.printer_name}.")
                    return printer

                terminal_reason = _terminal_no_printer_reason(doc, exclude_printer_ids=cumulative_excludes)
                if terminal_reason:
                    cancel_reason = terminal_reason
                elif not wait_for_availability:
                    print(
                        f"[ASSIGN] No printer currently available for {doc.doc_id} ({doc.paper_size}). "
                        "Leaving document queued for a later retry."
                    )
                    return None
                else:
                    wait_message = (
                        f"No available printer for {doc.paper_size}. "
                        f"Document {doc.doc_id} paused and will retry in 5 seconds."
                    )

        if cancel_reason:
            print(f"[ASSIGN] {cancel_reason} Cancelling {document.doc_id} with auto voucher.")
            _cancel_document_with_auto_voucher(document, reason=cancel_reason)
            return None

        if wait_message:
            print(wait_message)
        _time.sleep(5)


def _sanitize_cups_queue_name(value):
    return str(value or '').replace('-', '_').replace(' ', '_')


def _get_cups_destinations():
    result = subprocess.run(
        ['lpstat', '-v'],
        capture_output=True,
        text=True,
        check=False,
    )
    destinations = set()
    for line in result.stdout.splitlines():
        match = re.match(r'^device for\s+(\S+):', line.strip())
        if match:
            destinations.add(match.group(1))
    return destinations


def _resolve_cups_queue_name(printer):
    base_queue = _sanitize_cups_queue_name(printer.model_name or printer.printer_name)
    destinations = _get_cups_destinations()

    if printer.node_name:
        node_suffix = printer.node_name.lower()
        if node_suffix.startswith('brw'):
            node_suffix = node_suffix[3:]
        specific_queue = f"{base_queue}_{node_suffix}"
        if specific_queue in destinations:
            return specific_queue

    if base_queue in destinations:
        return base_queue

    fallback_queue = _sanitize_cups_queue_name(printer.printer_name)
    if fallback_queue in destinations:
        return fallback_queue

    return base_queue


def _parse_cups_job_id(lp_output):
    match = re.search(r'request id is\s+(\S+)', lp_output or '')
    return match.group(1) if match else None


def _cups_job_list_contains(lpstat_output, job_id):
    prefix = f'{job_id} '
    return any(line.startswith(prefix) for line in (lpstat_output or '').splitlines())


def _get_cups_job_state(job_id):
    if not job_id:
        return None

    pending = subprocess.run(
        ['lpstat', '-W', 'not-completed', '-o'],
        capture_output=True,
        text=True,
        check=False,
    )
    completed = subprocess.run(
        ['lpstat', '-W', 'completed', '-o'],
        capture_output=True,
        text=True,
        check=False,
    )
    pending_has = _cups_job_list_contains(pending.stdout, job_id)
    completed_has = _cups_job_list_contains(completed.stdout, job_id)
    if pending_has:
        return 'pending'
    if completed_has:
        return 'completed'

    return 'unknown'


def _get_cups_printer_state(queue_name):
    """Return the queue's current activity from CUPS.

    Possible return values:
      - 'printing': CUPS reports the printer is actively working a job right now.
      - 'idle':     CUPS reports the printer is free / not working on anything.
      - 'stopped':  CUPS reports the queue is disabled or stopped.
      - 'unknown':  Could not determine state.

    This lets us distinguish a slow-but-busy printer from one that is sitting
    idle while our job stays 'pending' (a real, fast-recoverable stall).
    """
    if not queue_name:
        return 'unknown'
    try:
        result = subprocess.run(
            ['lpstat', '-p', queue_name],
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception:
        return 'unknown'
    if result.returncode != 0:
        return 'unknown'
    output = (result.stdout or '').lower()
    if 'now printing' in output:
        return 'printing'
    if 'is idle' in output:
        return 'idle'
    if 'disabled' in output or 'stopped' in output:
        return 'stopped'
    return 'unknown'


def _cancel_cups_job(job_id):
    if not job_id:
        return False

    attempts = [
        ('cancel', ['cancel', job_id]),
        ('cancel -x', ['cancel', '-x', job_id]),
    ]

    for label, command in attempts:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
        )
        state_after_attempt = _get_cups_job_state(job_id)
        if result.returncode == 0 and state_after_attempt in (None, 'unknown', 'completed'):
            print(f"[CUPS] Cancelled job {job_id} with {label} before reroute.")
            return True
        if state_after_attempt in (None, 'unknown', 'completed'):
            print(f"[CUPS] Job {job_id} no longer appears in CUPS after {label}; treating as cancelled.")
            return True

        stderr = (result.stderr or '').strip()
        stdout = (result.stdout or '').strip()
        print(
            f"[CUPS] {label} did not clear job {job_id}. "
            f"state={state_after_attempt!r} stdout={stdout!r} stderr={stderr!r}"
        )

    print(f"[CUPS] Failed to fully cancel job {job_id} before reroute.")
    return False


def _get_cups_jobs_for_queue(queue_name):
    if not queue_name:
        return []

    result = subprocess.run(
        ['lpstat', '-W', 'not-completed', '-o', queue_name],
        capture_output=True,
        text=True,
        check=False,
    )
    jobs = []
    for line in (result.stdout or '').splitlines():
        token = line.strip().split(' ', 1)[0]
        if token:
            jobs.append(token)
    return jobs


def _cancel_jobs_for_printer(printer):
    if not printer:
        return []

    queue_name = _resolve_cups_queue_name(printer)
    job_ids = _get_cups_jobs_for_queue(queue_name)
    cancelled = [job_id for job_id in job_ids if _cancel_cups_job(job_id)]
    if cancelled:
        print(f"[CUPS] Cancelled jobs for printer {printer.printer_name}: {', '.join(cancelled)}")
    else:
        print(f"[CUPS] No active jobs found to cancel for printer {printer.printer_name} ({queue_name}).")
    return cancelled


def _recent_matching_reroute_history(document, printer, status, *, within_seconds=5):
    if not document or not status:
        return False

    last_entry = RerouteHistory.objects.filter(document=document).order_by('-timestamp').first()
    if not last_entry:
        return False

    if last_entry.status != status:
        return False

    last_printer_id = last_entry.printer_id
    printer_id = getattr(printer, 'id', None)
    if last_printer_id != printer_id:
        return False

    if not last_entry.timestamp:
        return False

    return (timezone.now() - last_entry.timestamp).total_seconds() <= within_seconds


def _finish_document_if_complete(document, *, printer=None):
    document.refresh_from_db()
    if document.doc_status in ['Finished', 'Picked Up', 'Cancelled']:
        return False

    if document.get_remaining_pages():
        return False

    completion_printer = printer or document.printed_at or document.printer_assigned
    update_fields = ['doc_status', 'status_updated_at']

    document.doc_status = 'Finished'
    document.status_updated_at = timezone.now()
    if completion_printer and document.printed_at_id != completion_printer.id:
        document.printed_at = completion_printer
        update_fields.append('printed_at')

    document.save(update_fields=update_fields)
    printers_to_sync = []
    if document.printer_assigned_id:
        printers_to_sync.append(document.printer_assigned)
    if completion_printer and completion_printer.id not in {printer_obj.id for printer_obj in printers_to_sync if printer_obj}:
        printers_to_sync.append(completion_printer)
    for printer_obj in printers_to_sync:
        _sync_printer_scheduler_state(printer_obj)
    print(f"[COMPLETE] Document {document.doc_id} printing complete. Printed at: {document.printed_at}")
    return True


def print_page(document, page_num):
    # Extract print preferences from document
    copies = max(1, int(getattr(document, 'num_copies', 1) or 1))
    orientation = getattr(document, 'orientation', 'portrait')
    color_mode = getattr(document, 'color_mode', 'color')
    paper_size = getattr(document, 'paper_size', 'A4')
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
    
    queue_name = _resolve_cups_queue_name(printer)

    # Use live CUPS queue state as the primary readiness signal before submit.
    # DB/SNMP status remains only as a hardware-fault fallback for cases like
    # paper jams, empty trays, or offline devices that CUPS does not describe well.
    if document.printer_assigned and document.printer_assigned.id == printer.id:
        while True:
            printer.refresh_from_db()
            cups_printer_state = _get_cups_printer_state(queue_name)

            if cups_printer_state == 'idle':
                break

            if _printer_has_hard_fault(printer) or not _printer_has_required_stock(printer, document):
                print(
                    f"[ERROR] Printer {printer.printer_name} reports a hardware fault "
                    f"before submit (status={printer.printer_status}, tray={printer.tray_level}). Rerouting document."
                )
                RerouteHistory.objects.create(
                    document=document,
                    printer=printer,
                    status=f"Error: {printer.printer_status or printer.tray_level or 'Unavailable'}"
                )
                reroute_document_on_error(document, failed_printer=printer)
                return

            if cups_printer_state == 'stopped':
                print(f"[ERROR] CUPS queue {queue_name} is stopped for printer {printer.printer_name}. Rerouting document.")
                RerouteHistory.objects.create(
                    document=document,
                    printer=printer,
                    status=f"Error: CUPS queue stopped ({queue_name})"
                )
                reroute_document_on_error(document, failed_printer=printer)
                return

            if cups_printer_state == 'unknown' and printer.printer_status in ['Ready', 'Sleep']:
                print(
                    f"[WAIT] CUPS state is unknown for {printer.printer_name}, but DB status is "
                    f"{printer.printer_status}. Proceeding with submit."
                )
                break

            print(
                f"[WAIT] Printer {printer.printer_name} not ready for submit yet "
                f"(cups={cups_printer_state}, db={printer.printer_status}). Waiting..."
            )
            time.sleep(1)
            printer.refresh_from_db()
            
            # Check again if document has been rerouted to a different printer
            document.refresh_from_db()
            if not document.printer_assigned or document.printer_assigned.id != printer.id:
                print(f"[REROUTED] Document {document.doc_id} was rerouted during wait. Skipping original printer.")
                return  # Exit this function, let the rerouting process handle printing
            
            # Increment retry counter
            retries += 1
            
            # If the queue stays busy/unknown for too long, stop waiting on this printer
            # and let the rerouter try another candidate.
            if retries >= max_retries:
                print(
                    f"[ERROR] Printer {printer.printer_name} is not becoming available for submit "
                    f"(cups={cups_printer_state}, db={printer.printer_status}). Rerouting document."
                )
                
                # Log the failed printer in reroute history
                RerouteHistory.objects.create(
                    document=document, 
                    printer=printer,
                    status=f"Error: submit wait cups={cups_printer_state}, printer={printer.printer_status}"
                )

                # Implement preemptive approach only after repeated non-operational checks.
                print(f"[PREEMPTIVE] Initiating preemptive rerouting for document {document.doc_id} from printer {printer.printer_name}")
                reroute_document_on_error(document, failed_printer=printer)
                return
    # Send print job
    print(f"[PRINT] Sending page {page_num} of document {document.doc_id} to printer {printer.printer_name} ({printer.printer_status})")

    print(f"[PRINT] Using CUPS queue name: {queue_name}")
    # Map paper_size to printer-compatible media
    if paper_size == 'Long':
        media_size = 'Folio'  
    else:
        media_size = paper_size
    lp_cmd = [
        'lp',
        '-d', queue_name,
        '-n', str(copies),
        '-o', f'page-ranges={page_num}',
        '-o', f'orientation-requested={"4" if orientation=="Landscape" else "3"}',
        '-o', f'{"print-color-mode=monochrome" if color_mode=="Black and White" else "print-color-mode=color"}',
        '-o', f'media={media_size}',  # Updated to use mapped media_size
        file_path
    ]
    try:
        lp_result = subprocess.run(lp_cmd, check=True, capture_output=True, text=True)
        lp_output = (lp_result.stdout or '') + (lp_result.stderr or '')
        job_id = _parse_cups_job_id(lp_output)
        if job_id:
            print(f"[PRINT] Submitted CUPS job {job_id} for document {document.doc_id} page {page_num}")
    except Exception as e:
        print(f"[ERROR] Failed to print page {page_num} of document {document.doc_id} on printer {printer.printer_name}: {e}")
        printer.printer_status = 'Error'
        printer.save()
        print(f"[REROUTE] Rerouting remaining pages of document {document.doc_id}")
        reroute_document_on_error(document, failed_printer=printer)
        return
    wait_cycles = 0
    max_wait_cycles = 90
    error_cycles = 0
    max_error_cycles = 5
    job_started = False
    ready_fallback_cycles = 0
    pending_stall_cycles = 0
    missing_job_cycles = 0
    # Fast-stall counter: CUPS reports the queue idle (not working on anything)
    # while our job is still pending. That means the printer never picked up
    # our job, so there is no point waiting the full ~60s long-stall threshold.
    idle_pending_cycles = 0

    while True:
        printer.refresh_from_db()
        cups_job_state = _get_cups_job_state(job_id)

        # Also check if the document still exists and hasn't been canceled
        try:
            doc_check = Document.objects.get(doc_id=document.doc_id)
            if _finish_document_if_complete(doc_check, printer=printer):
                return
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

        if cups_job_state == 'completed':
            print(f"[CUPS] Job {job_id} completed for document {document.doc_id} page {page_num}.")
            break

        if printer.printer_status == 'Printing' or cups_job_state == 'pending':
            job_started = True
            ready_fallback_cycles = 0

        # Some printers keep reporting "Printing" briefly after CUPS has already dropped the job.
        # Once the job was observed as started, treat a sustained missing CUPS job as completion
        # instead of waiting forever for SNMP to flip back to Ready/Sleep.
        if job_id and cups_job_state == 'unknown' and job_started and printer.printer_status in ['Printing', 'Ready', 'Sleep']:
            missing_job_cycles += 1
            if missing_job_cycles >= 3:
                print(
                    f"[FALLBACK] CUPS no longer reports job {job_id} for document {document.doc_id} "
                    f"page {page_num} while printer {printer.printer_name} remains {printer.printer_status}. "
                    "Assuming page completed."
                )
                break
        else:
            missing_job_cycles = 0

        # Fast-stall path: if CUPS reports the queue is idle but our job is
        # still 'pending', the printer never picked the job up. Don't make the
        # customer wait the full 60s long-stall threshold for those — reroute
        # quickly. A busy "now printing" queue resets this counter immediately.
        if job_started and cups_job_state == 'pending':
            cups_printer_activity = _get_cups_printer_state(queue_name)
            if cups_printer_activity == 'idle':
                idle_pending_cycles += 1
            elif cups_printer_activity == 'printing':
                # Printer is actively working our job — clear both stall counters
                # and let the normal completion path handle it.
                idle_pending_cycles = 0
                pending_stall_cycles = 0
            else:
                # Unknown / stopped: don't fast-stall on this cycle but don't
                # reset either, so a sustained 'unknown' eventually falls through
                # to the long-stall safety net.
                pass
            if idle_pending_cycles >= 8:
                print(
                    f"[FAST-STALL] CUPS queue {queue_name} is idle while job {job_id} is pending "
                    f"for document {document.doc_id} page {page_num}. Initiating reroute."
                )
                RerouteHistory.objects.create(
                    document=document,
                    printer=printer,
                    status=f"Stalled: queue idle, cups={cups_job_state}",
                    timestamp=timezone.now(),
                )
                reroute_document_on_error(document, failed_printer=printer, failed_job_id=job_id)
                return
        else:
            idle_pending_cycles = 0

        if job_started and cups_job_state == 'pending' and printer.printer_status in ['Ready', 'Sleep']:
            pending_stall_cycles += 1
            # Real printers (e.g. Brother DCP-T430W) can take 30-50s to physically
            # print a single page; CUPS keeps the job in 'pending' the entire time.
            # Use a generous 60-cycle (~60s) threshold so we don't reroute a job
            # that is actually being printed right now.
            if pending_stall_cycles >= 60:
                # Final completion check: a previous reproduction proved that the
                # job often moves to 'completed' within ~0.5s of when the stall
                # would have fired. Poll once more before declaring a stall so we
                # don't kill an already-finished print and trigger a duplicate.
                final_state = _get_cups_job_state(job_id)
                if final_state == 'completed':
                    break
                print(
                    f"[STALL] Job {job_id or 'unknown'} for document {document.doc_id} stayed pending "
                    f"while printer {printer.printer_name} remained {printer.printer_status}. Initiating reroute."
                )
                RerouteHistory.objects.create(
                    document=document,
                    printer=printer,
                    status=f"Stalled: printer={printer.printer_status}, cups={cups_job_state}",
                    timestamp=timezone.now()
                )
                reroute_document_on_error(document, failed_printer=printer, failed_job_id=job_id)
                return
        else:
            pending_stall_cycles = 0
            
        # Only fall back to Ready/Sleep-based completion when CUPS no longer reports the job.
        if job_id and cups_job_state == 'unknown' and printer.printer_status in ['Ready', 'Sleep']:
            ready_fallback_cycles += 1
            if ready_fallback_cycles >= 3:
                print(
                    f"[FALLBACK] Printer {printer.printer_name} returned to {printer.printer_status} "
                    f"and CUPS no longer reports job {job_id} for document {document.doc_id} page {page_num}."
                )
                break
        elif not job_id and job_started and printer.printer_status in ['Ready', 'Sleep']:
            print(f"[FALLBACK] Printer {printer.printer_name} returned to {printer.printer_status} after printing page {page_num}.")
            break
        else:
            ready_fallback_cycles = 0
        
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
                reroute_document_on_error(document, failed_printer=printer, failed_job_id=job_id)
                return
        else:
            # Reset error cycles if printer returns to a normal state
            error_cycles = 0
            wait_cycles += 1
            
            if wait_cycles % 10 == 0:
                print(
                    f"[WAIT] Document {document.doc_id} page {page_num}: "
                    f"printer={printer.printer_status}, cups_job={cups_job_state}, cycle={wait_cycles}/{max_wait_cycles}"
                )
        
        # If we've waited too long regardless of status, consider rerouting
        if wait_cycles >= max_wait_cycles:
            print(
                f"[TIMEOUT] Printer {printer.printer_name} did not confirm completion for page {page_num} "
                f"within {max_wait_cycles} seconds (status={printer.printer_status}, cups_job={cups_job_state}). Initiating reroute."
            )
            # Log the timeout in reroute history
            RerouteHistory.objects.create(
                document=document, 
                printer=printer,
                status=f"Timeout: printer={printer.printer_status}, cups={cups_job_state}",
                timestamp=timezone.now()
            )
            # Reroute remaining pages
            reroute_document_on_error(document, failed_printer=printer, failed_job_id=job_id)
            return
            
        time.sleep(1)
    # Mark page as printed in DB only after successful print and status transitions
    page_was_already_recorded = page_num in (document.pages_printed or [])
    document.mark_page_printed(page_num)
    if not page_was_already_recorded:
        RerouteHistory.objects.create(
            document=document,
            printer=printer,
            status=f'Printed page {page_num}'
        )
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

    _finish_document_if_complete(document, printer=printer)


def reroute_document_on_error(document, failed_printer=None, failed_job_id=None):
    """
    Reroute a document using the shared printer scheduler:
    - Preemptive: Document with error is immediately stopped and rerouted (already handled by caller)
    - Nonpreemptive: Rerouted document gets priority in the queue but doesn't interrupt current printing

    Safety guarantees:
    - Never reroutes a document that is already in a terminal state (Finished/Picked Up/Cancelled).
    - Always re-evaluates completion at the end so the document does not get stuck in 'Printing'
      after the new printer has actually finished the remaining pages.
    """
    document.refresh_from_db()

    # Guard: do not reroute a document that is already done or terminated.
    if document.doc_status in ('Finished', 'Picked Up', 'Cancelled'):
        print(f"[REROUTE] Skipping reroute for {document.doc_id}; already in terminal state '{document.doc_status}'.")
        # Cancel any leftover CUPS job from the caller so the queue is clean.
        if failed_job_id:
            _cancel_cups_job(failed_job_id)
        return

    remaining_pages = document.get_remaining_pages()

    # Guard: if there is nothing left to print, the document is effectively complete.
    if not remaining_pages:
        print(f"[REROUTE] No remaining pages for {document.doc_id}; marking complete instead of rerouting.")
        if failed_job_id:
            _cancel_cups_job(failed_job_id)
        _finish_document_if_complete(document, printer=failed_printer or document.printer_assigned)
        return

    # Store current printer ID as previous failed printer to avoid choosing it again
    current_printer_name = "Unknown"
    if failed_printer is None:
        failed_printer = document.printer_assigned

    if failed_printer:
        # We'll use a temporary attribute to track the failed printer
        # This won't be persisted to database but will be used during this rerouting process
        document.previous_failed_printer = failed_printer.id
        current_printer_name = failed_printer.printer_name
        print(f"[REROUTE] Marked printer {current_printer_name} as failed for document {document.doc_id}")

        _cancel_cups_job(failed_job_id)

        # Record the error printer in reroute history (if not already done by caller)
        # We can't use get_or_create here because timestamp makes entries unique
        # and we might have multiple error entries for the same printer/document
        error_status = f"Error: {failed_printer.printer_status}"

        if not _recent_matching_reroute_history(document, failed_printer, error_status):
            RerouteHistory.objects.create(
                document=document,
                printer=failed_printer,
                status=error_status,
                timestamp=timezone.now()
            )

    # Move the document back to the queue before attempting reassignment.
    _queue_document_for_dispatch(
        document,
        priority=Document.QueuePriority.REROUTE,
        queued_at=timezone.now(),
    )
    _sync_printer_scheduler_state(failed_printer)

    # Build a CUMULATIVE set of printers that have failed for THIS document so
    # far. Without this, reroute only excludes the most recent failed printer
    # and we ping-pong between the same handful of unhealthy printers forever.
    cumulative_failed_ids = _failed_printer_ids_for_document(document)
    if failed_printer is not None and failed_printer.id is not None:
        cumulative_failed_ids.add(failed_printer.id)
    previous_failed_attr = getattr(document, 'previous_failed_printer', None)
    if previous_failed_attr is not None:
        cumulative_failed_ids.add(previous_failed_attr)

    replacement_candidates = _available_printers_for_document(
        document,
        allowed_statuses=['Ready', 'Printing', 'Sleep'],
        exclude_printer_ids=cumulative_failed_ids,
        sync_scheduler_state=True,
        require_idle=False,
    )
    if not replacement_candidates:
        terminal_reason = _terminal_no_printer_reason(document, exclude_printer_ids=cumulative_failed_ids)
        if terminal_reason:
            _cancel_document_with_auto_voucher(document, reason=terminal_reason)
            return

        print(
            f"[REROUTE] No alternative printer is immediately available for {document.doc_id}; "
            "keeping the document queued with reroute priority."
        )
        _schedule_queue_check(1.0)
        print(f"[QUEUE-MONITOR] Scheduled queue check in 1 seconds to find printer for document {document.doc_id}")
        return

    # Try an immediate reassignment once using the same candidate rules.
    next_printer = assign_document_to_printer(document, wait_for_availability=False)
    if next_printer:
        # Continue printing remaining pages
        print(f"[REROUTE] Successfully rerouted document {document.doc_id} from {current_printer_name} to {next_printer.printer_name}")

        # Log successful reroute
        RerouteHistory.objects.create(
            document=document,
            printer=next_printer,
            status='Rerouted'
        )

        # Continue printing remaining pages on new printer.
        # We re-fetch the remaining pages on each iteration so we don't redundantly
        # send a page that a nested reroute (triggered inside print_page) has
        # already printed. Iterate in reverse so the last page goes first and
        # the output stack ends up in natural page order.
        for page_num in sorted(list(remaining_pages), reverse=True):
            document.refresh_from_db()
            if document.doc_status in ('Finished', 'Picked Up', 'Cancelled'):
                print(f"[REROUTE] {document.doc_id} reached terminal state '{document.doc_status}' mid-reroute; stopping further prints.")
                break
            if page_num in (document.pages_printed or []):
                print(f"[REROUTE] Page {page_num} of {document.doc_id} already marked printed; skipping duplicate submission.")
                continue
            print_page(document, page_num)

        # Final safety net: even if print_page returned through an early-exit path
        # (e.g. detected another reroute, or doc state change) we still need to
        # check whether the document is actually finished and flip the status so
        # the UI does not show 'Printing' forever after reroute completes.
        document.refresh_from_db()
        _safety_result = _finish_document_if_complete(document, printer=next_printer)
        if _safety_result:
            print(f"[REROUTE] Completion confirmed for {document.doc_id} on {next_printer.printer_name} after reroute.")
    else:
        print(
            f"[REROUTE] No free alternative printer is available yet for {document.doc_id}; "
            "keeping the document queued with reroute priority."
        )
        _schedule_queue_check(1.0)
        print(f"[QUEUE-MONITOR] Scheduled queue check in 1 seconds to find printer for document {document.doc_id}")


def _claim_next_queued_document_for_printer(printer):
    try:
        with transaction.atomic():
            locked_printer = Printer.objects.select_for_update().get(pk=printer.pk)
            _sync_printer_scheduler_state(locked_printer)

            if locked_printer.is_temporarily_disabled:
                return None
            if locked_printer.printer_status not in ['Ready', 'Sleep']:
                return None
            if (getattr(locked_printer, 'active_job_count', 0) or 0) > 0:
                return None

            queued_docs = Document.objects.select_for_update().filter(
                doc_status='Queued',
                printer_assigned__isnull=True,
                paper_size=locked_printer.paper_assigned,
            ).order_by('queue_priority', 'queued_at', 'time_submitted', 'doc_id')

            for queued_doc in queued_docs:
                failed_printer_ids = _failed_printer_ids_for_document(queued_doc)
                if locked_printer.id in failed_printer_ids:
                    continue
                if not _printer_has_required_stock(locked_printer, queued_doc):
                    continue

                assigned_at = timezone.now()
                queued_doc.printer_assigned = locked_printer
                queued_doc.doc_status = 'Printing'
                queued_doc.status_updated_at = assigned_at
                queued_doc.save(update_fields=['printer_assigned', 'doc_status', 'status_updated_at'])
                _sync_printer_scheduler_state(locked_printer, assigned_at=assigned_at)
                RerouteHistory.objects.create(document=queued_doc, printer=locked_printer, status='Assigned')
                print(f"[QUEUE-MONITOR] Assigned queued document {queued_doc.doc_id} to printer {locked_printer.printer_name}")
                return queued_doc
    except Printer.DoesNotExist:
        return None

    return None


def _cancel_terminal_queued_documents():
    cancelled_count = 0

    queued_documents = Document.objects.filter(doc_status='Queued').order_by('queue_priority', 'queued_at', 'time_submitted', 'doc_id')
    for queued_document in queued_documents:
        terminal_reason = _terminal_no_printer_reason(
            queued_document,
            exclude_printer_ids=_failed_printer_ids_for_document(queued_document),
        )
        if not terminal_reason:
            continue

        print(f"[QUEUE-MONITOR] {terminal_reason} Cancelling queued document {queued_document.doc_id} with auto voucher.")
        _cancel_document_with_auto_voucher(queued_document, reason=terminal_reason)
        cancelled_count += 1

    return cancelled_count


def _start_document_print_thread(document, printer, *, source):
    def _print_document_async(doc_id, printer_id):
        try:
            current_doc = Document.objects.get(doc_id=doc_id)
        except Document.DoesNotExist:
            print(f"[{source}] Document {doc_id} was deleted before printing started.")
            return

        remaining_pages = current_doc.get_remaining_pages()
        for page_num in sorted(list(remaining_pages), reverse=True):
            try:
                fresh_doc = Document.objects.get(doc_id=doc_id)
            except Document.DoesNotExist:
                print(f"[{source}] Document {doc_id} was deleted before printing page {page_num}.")
                break

            if fresh_doc.doc_status in ('Finished', 'Picked Up', 'Cancelled'):
                print(f"[{source}] {fresh_doc.doc_id} reached terminal state '{fresh_doc.doc_status}'; stopping further prints.")
                break
            if page_num in (fresh_doc.pages_printed or []):
                print(f"[{source}] Page {page_num} of {fresh_doc.doc_id} already printed; skipping duplicate submission.")
                continue

            print_page(fresh_doc, page_num)

        try:
            final_doc = Document.objects.get(doc_id=doc_id)
        except Document.DoesNotExist:
            return

        final_printer = final_doc.printer_assigned if final_doc.printer_assigned_id else printer
        if final_printer and _finish_document_if_complete(final_doc, printer=final_printer):
            print(f"[{source}] Completion confirmed for {final_doc.doc_id} on {final_printer.printer_name}.")

    worker = threading.Thread(target=_print_document_async, args=(document.doc_id, printer.id))
    worker.daemon = True
    worker.start()


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
    available_printers = Printer.objects.filter(
        printer_status__in=['Ready', 'Sleep'],
        is_temporarily_disabled=False,
    )
    available_count = available_printers.count()
    
    if available_count == 0:
        print("[QUEUE-MONITOR] No available printers found. Will retry later.")
        cancelled_count = _cancel_terminal_queued_documents()
        if cancelled_count:
            print(f"[QUEUE-MONITOR] Cancelled {cancelled_count} terminal queued document(s) on this pass.")
        # Schedule another check in 1 seconds
        if Document.objects.filter(doc_status='Queued').exists():
            _schedule_queue_check(1.0)
        return
        
    print(f"[QUEUE-MONITOR] Found {available_count} available printers.")

    dispatched_count = 0
    for printer in available_printers.order_by('id'):
        next_document = _claim_next_queued_document_for_printer(printer)
        if not next_document or not next_document.printer_assigned:
            continue

        dispatched_count += 1
        _start_document_print_thread(next_document, next_document.printer_assigned, source='QUEUE-MONITOR')

    if dispatched_count == 0:
        print("[QUEUE-MONITOR] No eligible queued documents could be dispatched on this pass.")
    else:
        print(f"[QUEUE-MONITOR] Dispatched {dispatched_count} queued document(s) on this pass.")

    cancelled_count = _cancel_terminal_queued_documents()
    if cancelled_count:
        print(f"[QUEUE-MONITOR] Cancelled {cancelled_count} terminal queued document(s) on this pass.")

    if Document.objects.filter(doc_status='Queued').exists():
        _schedule_queue_check(QUEUE_MONITOR_RETRY_SECONDS)
        print(f"[QUEUE-MONITOR] Scheduled next queue check in {int(QUEUE_MONITOR_RETRY_SECONDS)} seconds")


# Start the queue monitor when the module is loaded
def start_queue_monitor():
    """Initialize the queue monitoring system with a delay to let the system start up."""
    print("[QUEUE-MONITOR] Initializing queue monitoring system...")
    _schedule_queue_check(1.0)
    print("[QUEUE-MONITOR] Queue monitor scheduled to start in 1 seconds")

# Start the queue monitor
if getattr(settings, 'ENABLE_QUEUE_MONITOR', True):
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

            # Self-healing safety net: if every page is actually printed but the
            # document is still marked as Printing/Queued (e.g. a reroute path
            # bypassed the completion check), flip it to Finished here so the
            # UI never shows a stale "Printing..." badge after the physical
            # print job is done.
            if doc.doc_status in ('Printing', 'Queued'):
                try:
                    total_required = doc.get_total_pages()
                    printed_set = set(doc.pages_printed or [])
                    required_set = set(doc.get_page_list())
                    if total_required > 0 and required_set and required_set.issubset(printed_set):
                        previous_status = doc.doc_status
                        completion_printer = doc.printed_at or doc.printer_assigned
                        doc.doc_status = 'Finished'
                        doc.status_updated_at = timezone.now()
                        update_fields = ['doc_status', 'status_updated_at']
                        if completion_printer and doc.printed_at_id != completion_printer.id:
                            doc.printed_at = completion_printer
                            update_fields.append('printed_at')
                        doc.save(update_fields=update_fields)
                        print(
                            f"[SSE-HEAL] Document {doc.doc_id} had all {total_required} page(s) printed "
                            f"but was still '{previous_status}'. Auto-marked Finished."
                        )
                except Exception as heal_exc:
                    print(f"[SSE-HEAL] Failed to auto-finish {doc.doc_id}: {heal_exc}")

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
            auto_voucher_code = None
            if doc.doc_status == 'Cancelled':
                last_error = history_entries.filter(status__startswith='Error').last()
                if last_error:
                    cancel_reason = last_error.status
                else:
                    cancel_reason = 'No available Printer'
                # #region agent log
                try:
                    _all_history = list(history_entries.values('status', 'timestamp', 'printer_id'))
                    _all_error_history = [h for h in _all_history if (h.get('status') or '').startswith('Error')]
                    _dbg('views.py:sse:cancel_reason_picked', 'cancel_reason chosen for SSE payload', {
                        'doc_id': doc.doc_id,
                        'doc_status': doc.doc_status,
                        'cancel_reason': cancel_reason,
                        'last_error_status': last_error.status if last_error else None,
                        'last_error_ts': last_error.timestamp.isoformat() if last_error and last_error.timestamp else None,
                        'all_error_entries': [
                            {
                                'status': h.get('status'),
                                'ts': h.get('timestamp').isoformat() if h.get('timestamp') else None,
                                'printer_id': h.get('printer_id'),
                            }
                            for h in _all_error_history
                        ],
                    }, hypothesisId='H1')
                except Exception:
                    pass
                # #endregion

                if cancel_reason:
                    _vm = re.search(r'Auto voucher\s+(\S+)\s+generated', cancel_reason, re.IGNORECASE)
                    if _vm:
                        auto_voucher_code = _vm.group(1)

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
                'auto_voucher_code': auto_voucher_code,
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

        time.sleep(0.5)


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
        force = bool(data.get('force', False))

        if not doc_id:
            return JsonResponse({'success': False, 'error': 'doc_id is required'})

        doc = Document.objects.get(doc_id=doc_id)

        reroute_override = (
            force and
            doc.doc_status == 'Printing' and
            RerouteHistory.objects.filter(document=doc).exists()
        )

        if doc.doc_status != 'Finished' and not reroute_override:
            return JsonResponse({
                'success': False,
                'error': f'Document is not finished (current status: {doc.doc_status})'
            })

        if reroute_override:
            if not doc.pages_printed:
                doc.pages_printed = doc.get_page_list()
            if not doc.printed_at and doc.printer_assigned:
                doc.printed_at = doc.printer_assigned

        # Mark as Picked Up
        doc.doc_status = 'Picked Up'
        doc.status_updated_at = timezone.now()
        if reroute_override:
            doc.save(update_fields=['doc_status', 'status_updated_at', 'pages_printed', 'printed_at'])
        else:
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
        _preserve_or_delete_document_payment(doc)
        doc.delete()

        # If no documents remain for this CID, clear voucher association
        remaining_docs = Document.objects.filter(customer_id=cid).exists()
        if not remaining_docs:
            from portal.models import VoucherCredit
            VoucherCredit.objects.filter(last_customer_id=cid).update(last_customer_id=None)

        # Trigger folder cleanup
        _trigger_upload_folder_cleanup()

        return JsonResponse({'success': True, 'doc_id': doc_id})

    except Document.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Document not found'})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


@csrf_exempt
def finish_transaction(request):
    """
    Mark completed documents for a customer as 'Picked Up' before deleting their files.
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

        for doc in docs_to_process:
            reroute_override = (
                force and
                doc.doc_status == 'Printing' and
                RerouteHistory.objects.filter(document=doc).exists()
            )

            if doc.doc_status == 'Finished' or reroute_override:
                if reroute_override:
                    if not doc.pages_printed:
                        doc.pages_printed = doc.get_page_list()
                    if not doc.printed_at and doc.printer_assigned:
                        doc.printed_at = doc.printer_assigned

                doc.doc_status = 'Picked Up'
                doc.status_updated_at = timezone.now()
                update_fields = ['doc_status', 'status_updated_at']
                if reroute_override:
                    update_fields.extend(['pages_printed', 'printed_at'])
                doc.save(update_fields=update_fields)

        picked_up_count = _delete_customer_documents(customer_id, list(docs_to_process), log_prefix='FINISH TXN')

        return JsonResponse({
            'success': True,
            'picked_up_count': picked_up_count
        })

    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})


@csrf_exempt
def acknowledge_cancelled_voucher(request):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid request method'})

    try:
        data = json.loads(request.body)
        customer_id = str(data.get('customer_id') or '').strip()
        requested_doc_ids = [
            str(doc_id).strip()
            for doc_id in (data.get('doc_ids') or [])
            if str(doc_id).strip()
        ]

        if not customer_id:
            return JsonResponse({'success': False, 'error': 'customer_id is required'})

        customer_documents = list(
            Document.objects.filter(customer_id=customer_id).order_by('time_submitted', 'doc_id')
        )
        if not customer_documents:
            existing_ticket = SupportTicket.objects.filter(
                customer_id=customer_id,
                status__in=['open', 'in-progress']
            ).order_by('-created_at').first()
            if existing_ticket:
                return JsonResponse({
                    'success': True,
                    'created': False,
                    'ticket_number': existing_ticket.ticket_number,
                    'deleted_count': 0,
                })
            return JsonResponse({'success': False, 'error': 'No documents found for this customer'})

        customer_doc_ids = [doc.doc_id for doc in customer_documents]
        if requested_doc_ids and set(requested_doc_ids) != set(customer_doc_ids):
            return JsonResponse({'success': False, 'error': 'Document list no longer matches the current customer transaction'})

        if any(doc.doc_status != 'Cancelled' for doc in customer_documents):
            return JsonResponse({'success': False, 'error': 'All documents must be cancelled before acknowledging the voucher'})

        with transaction.atomic():
            ticket, created = _create_or_get_cancelled_voucher_ticket(customer_id, customer_documents)
            deleted_count = _delete_customer_documents(customer_id, customer_documents, log_prefix='CANCELLED ACK')

        return JsonResponse({
            'success': True,
            'created': created,
            'ticket_number': ticket.ticket_number,
            'deleted_count': deleted_count,
        })
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Invalid request data'})
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

        payment_amount = _get_ticket_payment_amount(ticket)

        return JsonResponse({
            'success': True,
            'ticket_id': ticket.id,
            'ticket_number': ticket.ticket_number,
            'status': 'Voided',
            'customer_name': ticket.customer_name,
            'customer_id': ticket.customer_id,
            'email': ticket.email,
            'phone': ticket.phone_number,
            'doc_id': _get_ticket_primary_doc_id(ticket),
            'doc_name': ticket.document_name,
            'description': ticket.description,
            'problem_type': ticket.get_problem_type_display(),
            'was_reprinted': ticket.was_reprinted,
            'resolved_by': admin_name,
            'payment_amount': float(payment_amount) if payment_amount is not None else None,
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
        payment_amount = _get_ticket_payment_amount(ticket)

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
            'doc_id': _get_ticket_primary_doc_id(ticket),
            'doc_name': ticket.document_name,
            'description': ticket.description,
            'problem_type': ticket.get_problem_type_display(),
            'was_reprinted': ticket.was_reprinted,
            'resolved_by': admin_name,
            'payment_amount': float(payment_amount) if payment_amount is not None else None,
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
                'printer_name': log.printer.printer_name if log.printer else 'Unknown',
                'printer_id': log.printer_id,
                'status': log.status,
                'ink_status': log.ink_status,
                'paper_level': log.paper_level,
                'timestamp': log.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            })

        # Get all printers for dropdown
        printers_list = [{'id': p.id, 'name': p.printer_name} for p in Printer.objects.all().order_by('printer_name')]

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
                'printer_name': log.printer.printer_name if log.printer else 'Unknown',
                'status': log.status,
                'ink_status': log.ink_status,
                'paper_level': log.paper_level,
                'timestamp': log.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            })

        # Get document lifecycle logs for this document
        primary_doc_id = _get_ticket_primary_doc_id(ticket)
        doc_logs = DocumentLifecycleLog.objects.filter(
            doc_id=primary_doc_id
        ).order_by('-timestamp') if primary_doc_id else []

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
        if primary_doc_id:
            from .models import RerouteHistory
            reroutes = RerouteHistory.objects.select_related('printer').filter(
                Q(document_id=primary_doc_id) | Q(doc_id_snapshot=primary_doc_id)
            ).order_by('-timestamp')
            for rr in reroutes:
                doc_data.append({
                    'doc_id': primary_doc_id,
                    'customer_id': ticket.customer_id,
                    'doc_name': ticket.document_name or '',
                    'event': 'Rerouted',
                    'printer_name': rr.printer.printer_name if rr.printer else rr.printer_name_snapshot or '—',
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
        site = SiteSetting.load()
        if not site.block_payment_when_printers_unavailable:
            return JsonResponse({'available': True, 'all_offline': False, 'unavailable_docs': [], 'bypass_enabled': True})

        data = json.loads(request.body)
        doc_ids = data.get('doc_ids', [])

        if not doc_ids:
            return JsonResponse({'available': True, 'all_offline': False, 'unavailable_docs': []})

        docs = Document.objects.filter(doc_id__in=doc_ids, doc_status='Pending')

        if not docs.exists():
            return JsonResponse({'available': True, 'all_offline': False, 'unavailable_docs': []})

        # Check each document's paper requirements against available printers.
        unavailable_docs = []
        for doc in docs:
            matching_printers = _get_matching_printers(
                doc,
                allowed_statuses=['Ready', 'Printing', 'Sleep'],
            )
            if not matching_printers:
                unavailable_docs.append({
                    'doc_id': doc.doc_id,
                    'filename': doc.filename,
                    'paper_size': doc.paper_size,
                    'required_sheets': _document_required_sheets(doc),
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