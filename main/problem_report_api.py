"""
Problem Report API Views

API endpoints for handling print error reports, reprints, and support tickets.
"""

import json
import logging
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_protect
from django.utils import timezone
from portal.models import Document, SupportTicket, DocumentReprintLog, Printer, TicketAuditLog

logger = logging.getLogger(__name__)


@require_POST
@csrf_protect
def check_print_logs(request):
    """
    Check if a document can be reprinted based on print logs.
    
    POST /api/check-print-logs/
    
    Request:
        {
            "doc_id": "string",
            "reason": "no-print" | "missing-pages-jam"
        }
    
    Response:
        {
            "can_reprint": true | false,
            "reason": "string (optional)"
        }
    """
    try:
        data = json.loads(request.body)
        doc_id = data.get('doc_id')
        reason = data.get('reason')
        
        if not doc_id:
            return JsonResponse({
                'can_reprint': False,
                'reason': 'Document ID is required'
            })
        
        # Check if document exists
        try:
            document = Document.objects.get(doc_id=doc_id)
        except Document.DoesNotExist:
            return JsonResponse({
                'can_reprint': False,
                'reason': 'Document not found'
            })
        
        # Check if already reprinted
        existing_reprint = DocumentReprintLog.objects.filter(document=document).exists()
        if existing_reprint:
            return JsonResponse({
                'can_reprint': False,
                'reason': 'This document has already been reprinted once. Please submit a ticket for further assistance.'
            })
        
        # Logic based on reason
        if reason == 'no-print':
            # Check if document is in completed logs (doc_status == 'Finished')
            if document.doc_status == 'Finished':
                # Document shows as printed in logs - cannot auto-reprint
                return JsonResponse({
                    'can_reprint': False,
                    'reason': 'Our records show this document was printed successfully. Please submit a ticket so we can investigate.'
                })
            else:
                # Document not marked as finished - can reprint
                return JsonResponse({
                    'can_reprint': True
                })
        
        elif reason == 'missing-pages-jam':
            # For paper jam, we allow reprint if document exists and hasn't been reprinted
            # In a real system, you might check printer logs for jam events
            return JsonResponse({
                'can_reprint': True
            })
        
        else:
            # Unknown reason - allow reprint by default if not already reprinted
            return JsonResponse({
                'can_reprint': True
            })
    
    except json.JSONDecodeError:
        return JsonResponse({
            'can_reprint': False,
            'reason': 'Invalid request data'
        }, status=400)
    except Exception as e:
        logger.error(f"Error checking print logs: {str(e)}")
        return JsonResponse({
            'can_reprint': False,
            'reason': 'An error occurred while checking logs'
        }, status=500)


@require_POST
@csrf_protect
def trigger_reprint(request):
    """
    Trigger a reprint of a document (only allowed once per document).
    
    POST /api/trigger-reprint/
    
    Request:
        {
            "doc_id": "string",
            "doc_ids": ["string"] (optional - for multiple documents),
            "reason": "low-quality" | "missing-pages-jam" | "no-print",
            "page_range": "all" | "specific",
            "specific_pages": "string",
            "description": "string"
        }
    
    Response (Success):
        {
            "success": true,
            "message": "[Doc Name] printed at [Printer]",
            "details": "Sent to printer queue"
        }
    
    Response (Error):
        {
            "success": false,
            "error": "Error message"
        }
    """
    try:
        data = json.loads(request.body)
        doc_id = data.get('doc_id')
        doc_ids = data.get('doc_ids', [doc_id] if doc_id else [])
        reason = data.get('reason', 'unknown')
        page_range = data.get('page_range', 'all')
        specific_pages = data.get('specific_pages', '')
        description = data.get('description', '')
        
        if not doc_ids:
            return JsonResponse({
                'success': False,
                'error': 'Document ID is required'
            })
        
        # Process the first document (primary)
        primary_doc_id = doc_ids[0] if isinstance(doc_ids, list) else doc_id
        
        try:
            document = Document.objects.get(doc_id=primary_doc_id)
        except Document.DoesNotExist:
            return JsonResponse({
                'success': False,
                'error': 'Document not found'
            })
        
        # Check if already reprinted
        existing_reprint = DocumentReprintLog.objects.filter(document=document).exists()
        if existing_reprint:
            return JsonResponse({
                'success': False,
                'error': 'This document has already been reprinted. Please submit a ticket for further assistance.'
            })
        
        # Get available printer
        # Try to use the same printer that was assigned, or find an available one
        printer = document.printer_assigned
        if not printer:
            # Find an available printer with matching paper size
            printer = Printer.objects.filter(
                paper_size=document.paper_size,
                status='Online'
            ).first()
        
        if not printer:
            # Find any online printer as fallback
            printer = Printer.objects.filter(status='Online').first()
        
        printer_name = printer.node_name if printer else "Default Printer"
        
        # Create reprint log
        reprint_log = DocumentReprintLog.objects.create(
            document=document,
            reason=reason,
            page_range=page_range,
            specific_pages=specific_pages,
            description=description,
            printer_used=printer,
            success=True
        )
        
        # In a real implementation, you would:
        # 1. Send the document to the printer queue
        # 2. Update document status
        # 3. Track the reprint job
        
        # For now, we just log it and return success
        logger.info(f"Reprint triggered for document {primary_doc_id} on printer {printer_name}")
        
        # Determine which pages were reprinted for the message
        if page_range == 'specific' and specific_pages:
            pages_msg = f"pages {specific_pages}"
        else:
            pages_msg = "all pages"
        
        return JsonResponse({
            'success': True,
            'message': f'{document.original_name} ({pages_msg}) sent to {printer_name}',
            'details': f'Reprint job queued successfully'
        })
    
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Invalid request data'
        }, status=400)
    except Exception as e:
        logger.error(f"Error triggering reprint: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': 'An error occurred while processing the reprint'
        }, status=500)


@require_POST
@csrf_protect
def submit_ticket(request):
    """
    Create a support ticket for unresolved printing issues.
    
    POST /api/submit-ticket/
    
    Accepts both JSON and multipart/form-data (for file uploads).
    
    Fields:
        customer_id, document_id, document_name, customer_name,
        email, phone_number, problem_type, description,
        page_range, specific_pages, reprinted,
        receipt_code, receipt_screenshot (file)
    """
    try:
        content_type = request.content_type or ''
        
        if 'multipart/form-data' in content_type:
            # Multipart form data (has file upload)
            data = request.POST
            receipt_screenshot = request.FILES.get('receipt_screenshot')
        else:
            # JSON body (legacy, no file)
            data = json.loads(request.body)
            receipt_screenshot = None
        
        # Required fields
        customer_id = data.get('customer_id', '')
        document_id = data.get('document_id', '')
        document_name = data.get('document_name', 'Unknown Document')
        customer_name = data.get('customer_name', '').strip()
        email = data.get('email', '').strip()
        phone_number = data.get('phone_number', '').strip()
        problem_type = data.get('problem_type', 'other')
        description = data.get('description', '').strip()
        
        # Optional fields
        page_range = data.get('page_range', 'all')
        specific_pages = data.get('specific_pages', '')
        was_reprinted = data.get('reprinted', False)
        if isinstance(was_reprinted, str):
            was_reprinted = was_reprinted.lower() in ('true', '1', 'yes')
        receipt_code = data.get('receipt_code', '').strip()
        gcash_number = data.get('gcash_number', '').strip()
        
        # Handle documents list (for multi-doc mode)
        documents_list = data.get('documents')
        if documents_list and isinstance(documents_list, str):
            import json as json_module
            try:
                documents_list = json_module.loads(documents_list)
            except (json_module.JSONDecodeError, TypeError):
                documents_list = None
        
        # Validation
        if not customer_name:
            return JsonResponse({
                'success': False,
                'error': 'Customer name is required'
            })
        
        if not email:
            return JsonResponse({
                'success': False,
                'error': 'Email is required'
            })
        
        if not description:
            return JsonResponse({
                'success': False,
                'error': 'Issue description is required'
            })
        
        # Get document if exists
        document = None
        if document_id:
            try:
                document = Document.objects.get(doc_id=document_id)
            except Document.DoesNotExist:
                pass  # Document might have been deleted
        
        # Create the ticket
        ticket = SupportTicket.objects.create(
            customer_id=customer_id,
            document=document,
            document_name=document_name,
            customer_name=customer_name,
            email=email,
            phone_number=phone_number,
            problem_type=problem_type,
            description=description,
            page_range=page_range,
            specific_pages=specific_pages,
            was_reprinted=was_reprinted,
            receipt_code=receipt_code,
            receipt_screenshot=receipt_screenshot,
            gcash_number=gcash_number,
        )
        
        logger.info(f"Support ticket created: {ticket.ticket_number} for customer {customer_name}")
        
        # Create audit log entry for ticket creation
        TicketAuditLog.objects.create(
            ticket=ticket,
            action='created',
            new_status='open',
            performed_by=customer_name,
            details=f"Ticket submitted by {customer_name}. Problem: {ticket.get_problem_type_display()}."
        )
        
        # Send email alert to admins
        try:
            from portal.services.email_notify import alert_new_ticket
            alert_new_ticket(ticket.ticket_number, customer_name, problem_type, description)
        except Exception:
            pass  # Email failure should not block ticket creation
        
        return JsonResponse({
            'success': True,
            'ticket_number': ticket.ticket_number
        })
    
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Invalid request data'
        }, status=400)
    except Exception as e:
        logger.error(f"Error submitting ticket: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': 'An error occurred while submitting the ticket'
        }, status=500)
