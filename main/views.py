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
from apps.main.utils.page_range import parse_page_ranges
import os, uuid, math, time, random, string, json, PyPDF2, subprocess



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

    # Allow test_customer parameter when DEBUG is True
    from django.conf import settings as django_settings
    if django_settings.DEBUG and request.GET.get('test_customer'):
        customer_id = request.GET.get('test_customer')
        request.session['customer_id'] = customer_id

    if not customer_id:
        return redirect('home')

    # Get all documents for this customer
    documents = Document.objects.filter(
        customer_id=customer_id
    ).select_related('printer_assigned', 'printed_at').order_by('time_submitted')

    # Get total price from payments
    payments = Payment.objects.filter(doc__customer_id=customer_id)
    total_price = sum(p.price for p in payments)

    # Build initial document data for template (will be updated by SSE)
    docs_list = []
    for doc in documents:
        docs_list.append({
            'doc_id': doc.doc_id,
            'filename': doc.filename,
            'doc_status': doc.doc_status,
            'printer_name': doc.printer_assigned.printer_name if doc.printer_assigned else None,
        })

    context = {
        'customer_id': customer_id,
        'documents': docs_list,
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
        
        # Enforce 500MB file size limit
        if uploaded_file.size > 500 * 1024 * 1024:
            return JsonResponse({
                'success': False,
                'error': 'File size too large. Maximum 500MB allowed.'
            })
        
        try:
            # Generate unique filename
            file_extension = os.path.splitext(uploaded_file.name)[1]
            unique_filename = f"{uuid.uuid4()}{file_extension}"
            
            # Save file under a directory named after the session key
            file_path = default_storage.save(f'uploads/{session_key}/{unique_filename}', ContentFile(uploaded_file.read()))
            
            # Simulate upload delay for progress demonstration
            time.sleep(0.5)

            # --- ClamAV scan integration ---
            try:
                # Get absolute path for scanning
                abs_file_path = default_storage.path(file_path)
                import subprocess
                result = subprocess.run([
                    'clamdscan', '--no-summary', abs_file_path
                ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                if 'FOUND' in result.stdout:
                    # Infected: delete file and inform user
                    default_storage.delete(file_path)
                    return JsonResponse({
                        'success': False,
                        'paper_size_errors': [{
                            'file': uploaded_file.name,
                            'reason': 'File contains a virus and has been deleted.'
                        }],
                        'error': 'File contains a virus.'
                    })
                # Check exit code as well (1 means virus found, 0 means clean)
                if result.returncode == 1:
                    # This is a backup check in case 'FOUND' string is not detected
                    default_storage.delete(file_path)
                    return JsonResponse({
                        'success': False,
                        'paper_size_errors': [{
                            'file': uploaded_file.name,
                            'reason': 'File contains a virus and has been deleted.'
                        }],
                        'error': 'File contains a virus.'
                    })
            except Exception as scan_exc:
                # If ClamAV fails, treat as error
                default_storage.delete(file_path)
                return JsonResponse({
                    'success': False,
                    'error': f'Virus scan failed: {str(scan_exc)}'
                })

            # If clean, proceed as normal
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
                # Trigger folder cleanup after file deletion
                subprocess.Popen(['python3', '/home/safeprint/dev/SafePrint/scripts/clean_empty_upload_folders.py'])
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
                # Trigger folder cleanup after deleting all uploads
                subprocess.Popen(['python3', '/home/safeprint/dev/SafePrint/scripts/clean_empty_upload_folders.py'])
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
                    # Trigger folder cleanup after file deletion
                    subprocess.Popen(['python3', '/home/safeprint/dev/SafePrint/scripts/clean_empty_upload_folders.py'])
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
                            # Trigger folder cleanup after file deletion
                            subprocess.Popen(['python3', '/home/safeprint/dev/SafePrint/scripts/clean_empty_upload_folders.py'])
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
        'A4': [(595, 842), (842, 595)],
        'Letter': [(612, 792), (792, 612)],
        'Legal': [(612, 1008), (1008, 612)],  # 8.5x14 inches
        'Long': [(612, 936), (936, 612)],  # 8.5x13 inches
    }
    for name, dims in sizes.items():
        for w, h in dims:
            if (math.isclose(width, w, abs_tol=10) and math.isclose(height, h, abs_tol=10)) or \
               (math.isclose(width, h, abs_tol=10) and math.isclose(height, w, abs_tol=10)):
                # Special case to return "Long" for Legal sized paper
                if name == 'Legal' or name == 'Long':
                    return 'Long'
                return name
    return 'Custom'


def is_pdf_password_protected(file_path):
    try:
        with default_storage.open(file_path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            # First check if explicitly encrypted
            if reader.is_encrypted:
                print(f"PDF file is explicitly encrypted: {file_path}")
                return True
                
            # Try accessing page content to verify we can actually read it
            if len(reader.pages) > 0:
                try:
                    # Try to access content to verify no encryption issues
                    _ = reader.pages[0].extract_text()
                    return False
                except Exception as content_err:
                    print(f"Could not extract text from PDF: {file_path}, error: {str(content_err)}")
                    return True
            return False
    except PyPDF2.errors.PdfReadError as pdf_err:
        # This typically happens with encrypted files
        print(f"PdfReadError for file {file_path}: {str(pdf_err)}")
        return True
    except Exception as e:
        # Other issues might also indicate encryption or corruption
        print(f"Error checking PDF encryption for {file_path}: {str(e)}")
        return True


@csrf_exempt
def finalize_uploads_view(request):
    if request.method == 'POST':
        if not request.session.get('upload_session_key'):
            request.session['upload_session_key'] = str(uuid.uuid4())
        session_key = request.session['upload_session_key']
        customer_id = 'CID-' + ''.join(random.choices(string.digits, k=4))
        request.session['customer_id'] = customer_id
        try:
            data = json.loads(request.body)
            files = data.get('files', [])
            original_names = data.get('original_names', {})
        except Exception as e:
            return JsonResponse({'success': False, 'error': f'Invalid data: {str(e)}'})
        docs_data = []
        file_errors = []  
        allowed_paper_sizes = {'A4', 'Letter', 'Long'}
        
        for file_path in files:
            stored_name = os.path.basename(file_path)
            original_name = original_names.get(file_path, stored_name)
            has_error = False
            
            # First check for password protection
            if is_pdf_password_protected(file_path):
                file_errors.append({
                    'file': original_name,
                    'reason': 'Password protected or encrypted. Please remove protection.'
                })
                has_error = True
                continue  # Skip further processing for this file
            
            # Now check paper size if not password protected
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
                        # Check if paper size is supported
                        if paper_size not in allowed_paper_sizes:
                            file_errors.append({
                                'file': original_name,
                                'reason': 'Unsupported paper size. Only A4, Letter, or Long are allowed.'
                            })
                            has_error = True
                            continue
                    else:
                        file_errors.append({
                            'file': original_name,
                            'reason': 'Document contains no pages.'
                        })
                        has_error = True
                        continue
            except Exception as e:
                file_errors.append({
                    'file': original_name,
                    'reason': f'Error analyzing document: {str(e)}'
                })
                has_error = True
                continue
                
            # Skip to next file if there's an error
            if has_error:
                continue
                
            file_size = default_storage.size(file_path)

            while True:
                doc_id = 'DOC-' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
                if not Document.objects.filter(doc_id=doc_id).exists():
                    break

            if Document.objects.filter(stored_name=stored_name).exists():
                continue

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
        if file_errors:
            return JsonResponse({
                'success': False,
                'error': 'Some files have issues and cannot be processed.',
                'reason': file_errors 
            })
        return JsonResponse({'success': True, 'documents': docs_data, 'customer_id': customer_id})
    return JsonResponse({'success': False, 'error': 'Invalid request'})


@csrf_exempt
def update_document_settings(request):
    if request.method == 'POST':
        try:
            # Always use the same session key for the user session
            if not request.session.get('upload_session_key'):
                request.session['upload_session_key'] = str(uuid.uuid4())
            session_key = request.session['upload_session_key']
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

                    # --- Payment creation and color scanning now happens here ---
                    file_rel_path = f'uploads/{session_key}/{doc.stored_name}'
                    abs_path = default_storage.path(file_rel_path)
                    page_range_str = upd.get('pages', None)
                    if page_range_str and isinstance(page_range_str, str):
                        # Parse page indices before scanning
                        with default_storage.open(file_rel_path, 'rb') as f:
                            total_pages = len(PyPDF2.PdfReader(f).pages)
                        try:
                            page_indices = parse_page_ranges(page_range_str, total_pages)
                        except Exception as e:
                            return JsonResponse({'success': False, 'error': f'Invalid page range input: {str(e)}'}, status=400)
                        # Validate for out-of-bounds and invalid ranges
                        if not page_indices:
                            return JsonResponse({'success': False, 'error': 'No valid pages specified.'}, status=400)
                        for idx in page_indices:
                            if idx < 0 or idx >= total_pages:
                                return JsonResponse({'success': False, 'error': f'Page {idx+1} is out of bounds (document has {total_pages} pages).'}, status=400)
                        # Check for reversed ranges (e.g., 5-1)
                        for part in page_range_str.split(','):
                            part = part.strip()
                            if '-' in part:
                                try:
                                    start, end = map(int, part.split('-'))
                                    if start > end:
                                        return JsonResponse({'success': False, 'error': f'Invalid range: {start}-{end}. Start must be less than or equal to end.'}, status=400)
                                except Exception:
                                    return JsonResponse({'success': False, 'error': f'Invalid range format: {part}'}, status=400)
                        # Only scan selected pages
                        color_results = analyze_pdf_colors(abs_path, page_indices=page_indices)
                        filtered_color_results = color_results
                    else:
                        color_results = analyze_pdf_colors(abs_path)
                        filtered_color_results = color_results
                    total_cost, costs_per_page = calculate_page_costs(
                        filtered_color_results,
                        gsm=int(doc.paper_quality),
                        color_mode=doc.color_mode,
                        num_copies=doc.num_copies,
                    )
                    new_price = total_cost
                    try:
                        payment = Payment.objects.get(doc=doc)
                        payment.price = new_price
                        payment.save()
                    except Payment.DoesNotExist:
                        Payment.objects.create(
                            doc=doc,
                            price=new_price,
                            payment_status='Unpaid'
                        )
                except Document.DoesNotExist:
                    continue
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)})
    return JsonResponse({'success': False, 'error': 'Invalid request'}, status=400)
