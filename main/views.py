from django.shortcuts import render, redirect
from django.urls import reverse, path
from portal.models import AdminUser, Document, Payment
from django.contrib.auth.hashers import check_password
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.utils import timezone
from apps.main.utils.pdf_color_detection import analyze_pdf_colors, calculate_page_costs 
import os, uuid, math, time, random, string, json, PyPDF2



def index_view(request):
    return render(request, 'index.html')


def upload_view(request):
    # Ensure a session key exists for uploads
    if not request.session.get('upload_session_key'):
        request.session['upload_session_key'] = str(uuid.uuid4())
    session_key = request.session['upload_session_key']
    return render(request, 'upload.html', {'session_key': session_key})


def confirmation(request):
    customer_id = request.session.get('customer_id')
    # Get all payments for this customer/session via related Document
    payments = Payment.objects.filter(doc__customer_id=customer_id)
    documents = []
    total_price = 0

    for payment in payments:
        doc = payment.doc  # Use the related Document
        documents.append({
            'name': doc.filename, 
            'price': payment.price,  # Use 'price' field
            'doc_id': doc.doc_id,  
        })
        total_price += payment.price

    context = {
        'customer_id': customer_id,
        'documents': documents,
        'total_price': total_price,
        'stars': range(4), 
    }
    return render(request, 'confirmation.html', context)


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
    # Auto-create session key if missing
    if not request.session.get('upload_session_key'):
        request.session['upload_session_key'] = str(uuid.uuid4())
    session_key = request.session['upload_session_key']

    if request.method == 'POST' and request.FILES.get('file'):
        uploaded_file = request.FILES['file']
        
        # Validate file type
        if not uploaded_file.name.lower().endswith('.pdf'):
            return JsonResponse({
                'success': False,
                'error': 'Only PDF files are allowed.'
            })
        
        # Enforce 100MB file size limit
        if uploaded_file.size > 100 * 1024 * 1024:
            return JsonResponse({
                'success': False,
                'error': 'File size too large. Maximum 100MB allowed.'
            })
        
        try:
            # Generate unique filename
            file_extension = os.path.splitext(uploaded_file.name)[1]
            unique_filename = f"{uuid.uuid4()}{file_extension}"
            
            # Save file under a directory named after the session key
            file_path = default_storage.save(f'uploads/{session_key}/{unique_filename}', ContentFile(uploaded_file.read()))
            
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


def list_uploaded_files_view(request):
    """
    Returns a list of uploaded files for the current session key.
    """
    session_key = request.session.get('upload_session_key')
    if not session_key:
        return JsonResponse({'success': False, 'error': 'Session key missing.'})
    # List files in the session's upload directory
    upload_dir = f'uploads/{session_key}/'
    try:
        if default_storage.exists(upload_dir):
            file_list = default_storage.listdir(upload_dir)[1]  # [1] is files
            files = []
            for fname in file_list:
                file_path = os.path.join(upload_dir, fname)
                files.append({
                    'file_path': file_path,
                    'name': fname,
                    'size': default_storage.size(file_path)
                })
            return JsonResponse({'success': True, 'files': files})
        else:
            return JsonResponse({'success': True, 'files': []})
    except Exception as e:
        return JsonResponse({'success': False, 'error': f'Failed to list files: {str(e)}'})


@csrf_exempt
def delete_all_uploads_view(request):
    session_key = request.session.get('upload_session_key')
    if session_key:
        upload_dir = f'uploads/{session_key}/'
        try:
            if default_storage.exists(upload_dir):
                # Delete all files in the directory
                for fname in default_storage.listdir(upload_dir)[1]:
                    default_storage.delete(os.path.join(upload_dir, fname))
                # Optionally, delete the directory itself
                default_storage.delete(upload_dir)
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)})
    return JsonResponse({'success': False, 'error': 'Session key missing'})


@csrf_exempt  
def delete_document(request):
    if request.method == 'POST':
        import json
        data = json.loads(request.body)
        doc_id = data.get('doc_id')
        session_key = data.get('session_key')
        if not doc_id or not session_key:
            return JsonResponse({'success': False, 'error': 'doc_id and session_key are required'}, status=400)
        try:
            doc = Document.objects.get(doc_id=doc_id)
            # Attempt to delete the file from storage
            if hasattr(doc, 'stored_name') and doc.stored_name:
                file_path = f'uploads/{session_key}/{doc.stored_name}'
                from django.core.files.storage import default_storage
                if default_storage.exists(file_path):
                    default_storage.delete(file_path)
            doc.delete()
            return JsonResponse({'success': True})
        except Document.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Document not found'}, status=404)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=500)
    return JsonResponse({'success': False, 'error': 'Invalid request'}, status=400)

@csrf_exempt
def delete_all_documents(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body.decode('utf-8'))
            doc_ids = data.get('doc_id', [])
            session_key = data.get('session_key')
            if not doc_ids or not session_key:
                return JsonResponse({'success': False, 'error': 'doc_id and session_key are required'}, status=400)
            for doc_id in doc_ids:
                # delete document from the database table in models.py
                try:
                    doc = Document.objects.get(doc_id=doc_id)
                    # Attempt to delete the file from storage
                    if hasattr(doc, 'stored_name') and doc.stored_name:
                        file_path = f'uploads/{session_key}/{doc.stored_name}'
                        from django.core.files.storage import default_storage
                        if default_storage.exists(file_path):
                            default_storage.delete(file_path)
                    doc.delete()
                except Document.DoesNotExist:
                    continue  # Skip if document does not exist
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)})
    return JsonResponse({'success': False, 'error': 'Invalid method'})


def get_paper_size(width, height):
    # Sizes in points (1 pt = 1/72 inch)
    sizes = {
        'A4': (595, 842),
        'Letter': (612, 792),
        'Legal': (612, 1008),
        'Long': (612, 936),  # Example, adjust as needed
    }
    for name, (w, h) in sizes.items():
        if math.isclose(width, w, abs_tol=10) and math.isclose(height, h, abs_tol=10):
            return name
    return 'Custom'


@csrf_exempt
def finalize_uploads_view(request):
    if request.method == 'POST':
        session_key = request.session.get('upload_session_key')
        if not session_key:
            return JsonResponse({'success': False, 'error': 'Session key missing.'})
        # Always generate a new CID for every proceed-btn click
        customer_id = 'CID-' + ''.join(random.choices(string.digits, k=4))
        request.session['customer_id'] = customer_id
        try:
            data = json.loads(request.body)
            files = data.get('files', [])
            original_names = data.get('original_names', {})
        except Exception as e:
            return JsonResponse({'success': False, 'error': f'Invalid data: {str(e)}'})
        docs_data = []
        for file_path in files:
            abs_path = default_storage.path(file_path)
            try:
                with default_storage.open(file_path, 'rb') as f:
                    reader = PyPDF2.PdfReader(f)
                    num_pages = len(reader.pages)
                    if num_pages > 0:
                        page = reader.pages[0]
                        width = float(page.mediabox.width)
                        height = float(page.mediabox.height)
                        orientation = 'Landscape' if width > height else 'Portrait'
                        paper_size = get_paper_size(width, height)
                    else:
                        orientation = 'Portrait'
                        paper_size = 'Custom'
            except Exception:
                num_pages = 0
                orientation = 'Portrait'
                paper_size = 'Custom'
            file_size = default_storage.size(file_path)
            stored_name = os.path.basename(file_path)
            # Always use original name from mapping, fallback to stored_name
            original_name = original_names.get(file_path, stored_name)

            # Generate unique DOC_ID
            while True:
                doc_id = 'DOC-' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
                if not Document.objects.filter(doc_id=doc_id).exists():
                    break

            # Prevent duplicate stored_name
            if Document.objects.filter(stored_name=stored_name).exists():
                continue  # Skip this file

            doc = Document.objects.create(
                doc_id=doc_id,
                customer_id=customer_id,
                filename=original_name, 
                num_copies=1,
                pages_num=str(num_pages),
                orientation=orientation,
                color_mode='Colored',
                paper_size=paper_size,
                paper_quality='70',
                original_name=original_name,
                stored_name=stored_name,
                file_name=original_name,  
                file_type='pdf',
                file_size=file_size,
                doc_status='Pending',
                time_submitted=timezone.now(),
            )
            # --- Create Payment record for this document ---
            price = 10 * int(doc.num_copies)  # Changed from 5 to 10 currency units per copy
            Payment.objects.create(
                doc=doc,
                price=price,
                payment_status='Pending'
            )
            docs_data.append({
                'doc_id': doc_id,
                'filename': original_name,  
                'num_pages': num_pages,
                'file_size': file_size,
                'orientation': orientation,
                'paper_size': paper_size,
                'stored_name': stored_name,
                'paper_quality': doc.paper_quality,
                'color_mode': doc.color_mode,
            })
            print(f"Document {doc_id} created for customer {customer_id}")
            print(doc)
        return JsonResponse({'success': True, 'documents': docs_data, 'customer_id': customer_id})
    return JsonResponse({'success': False, 'error': 'Invalid request'})


@csrf_exempt
def update_document_settings(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            updates = data.get('updates', [])
            for upd in updates:
                doc_id = upd.get('doc_id')
                if not doc_id:
                    continue
                try:
                    doc = Document.objects.get(doc_id=doc_id)
                    # Update fields if present in update
                    if 'quantity' in upd:
                        doc.num_copies = upd['quantity']
                    if 'pages' in upd:
                        doc.pages_num = upd['pages']
                    if 'orientation' in upd:
                        doc.orientation = upd['orientation'].capitalize()
                    if 'grayscale' in upd:
                        # Map to your color_mode field
                        doc.color_mode = 'Black and White' if upd['grayscale'] == 'Black and white' else 'Color'
                    if 'paper_size' in upd:
                        doc.paper_size = upd['paper_size']
                    if 'paper_quality' in upd:
                        doc.paper_quality = upd['paper_quality']
                    doc.save()
                    # --- Update or create Payment record for this document ---
                    try:
                        payment = Payment.objects.get(doc=doc)
                        payment.price = 10 * int(doc.num_copies)  # Changed from 5 to 10 currency units per copy
                        payment.save()
                    except Payment.DoesNotExist:
                        Payment.objects.create(
                            doc=doc,
                            price=10 * int(doc.num_copies),  # Changed from 5 to 10 currency units per copy
                            payment_status='Unpaid'
                        )
                except Document.DoesNotExist:
                    continue
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)})
    return JsonResponse({'success': False, 'error': 'Invalid request'}, status=400)
