let uploadedFiles = [];
let hasProceeded = false;
let isScanning = false; // Track if any file is being scanned for viruses
const docs = JSON.parse(sessionStorage.getItem('documents') || '[]');
document.addEventListener("touchstart", function () { }, true);

function clearActiveCustomerSession() {
    try {
        sessionStorage.removeItem('documents');
        sessionStorage.removeItem('customer_id');
    } catch (error) {
        console.warn('Unable to clear customer session storage:', error);
    }

    document.cookie = 'customer_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';

    if (customerSSE) {
        customerSSE.close();
        customerSSE = null;
    }
}

function redirectHomeAfterSessionClear(delayMs = 0) {
    const performRedirect = () => {
        clearActiveCustomerSession();
        window.location.href = '/';
    };

    if (delayMs > 0) {
        setTimeout(performRedirect, delayMs);
        return;
    }

    performRedirect();
}

function validateSpecificPageSelection(value, totalPages) {
    const rawValue = (value || '').trim();

    if (!rawValue) {
        return { valid: false, error: 'Enter at least one page number.' };
    }

    if (!/^[\d,\-\s]+$/.test(rawValue)) {
        return { valid: false, error: 'Use only page numbers, commas, and hyphens.' };
    }

    const parts = rawValue.split(',').map(part => part.trim()).filter(Boolean);
    if (!parts.length) {
        return { valid: false, error: 'Enter at least one valid page or range.' };
    }

    const normalizedParts = [];
    let pageCount = 0;

    for (const part of parts) {
        if (part.includes('-')) {
            const bounds = part.split('-').map(item => item.trim());
            if (bounds.length !== 2 || !bounds[0] || !bounds[1]) {
                return { valid: false, error: 'Use ranges like 1-3.' };
            }

            const start = Number(bounds[0]);
            const end = Number(bounds[1]);
            if (!Number.isInteger(start) || !Number.isInteger(end)) {
                return { valid: false, error: 'Use whole page numbers only.' };
            }

            if (start > end) {
                return { valid: false, error: `Invalid range ${start}-${end}.` };
            }

            if (start < 1 || end > totalPages) {
                return { valid: false, error: `Pages must be between 1 and ${totalPages}.` };
            }

            normalizedParts.push(`${start}-${end}`);
            pageCount += (end - start + 1);
            continue;
        }

        const pageNumber = Number(part);
        if (!Number.isInteger(pageNumber)) {
            return { valid: false, error: 'Use whole page numbers only.' };
        }

        if (pageNumber < 1 || pageNumber > totalPages) {
            return { valid: false, error: `Pages must be between 1 and ${totalPages}.` };
        }

        normalizedParts.push(String(pageNumber));
        pageCount += 1;
    }

    if (pageCount === 0) {
        return { valid: false, error: 'Enter at least one valid page or range.' };
    }

    return { valid: true, normalized: normalizedParts.join(',') };
}

document.addEventListener('DOMContentLoaded', () => {

    //Drag and Drop File Upload Functionality
    const dragArea = document.getElementById('drag-area');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.querySelector('.browse-btn');
    const proceedBtn = document.getElementById('to-upload');


    // Function to update proceed button visibility and state
    function updateProceedButton() {
        if (!proceedBtn) return;
        if (uploadedFiles.length > 0 && !isScanning) {
            proceedBtn.style.display = 'block';
            proceedBtn.disabled = false;
        } else {
            proceedBtn.style.display = 'none';
            proceedBtn.disabled = true;
        }
    }

    // Initialize proceed button state
    updateProceedButton();

    // Make drag area clickable to open file browser
    if (dragArea && fileInput) {
        dragArea.addEventListener('click', function (e) {
            // Prevent click event if the browse button inside the drag area was clicked
            if (e.target.closest('.browse-btn')) return;

            // Trigger file input click
            fileInput.click();
        });

        // Add pointer cursor to show it's clickable
        dragArea.style.cursor = 'pointer';
    }

    if (fileInput && browseBtn) {

        browseBtn.addEventListener('click', function () {
            fileInput.click();
        });

        fileInput.addEventListener('change', function () {
            const files = Array.from(fileInput.files);
            handleFiles(files);
            fileInput.value = '';
        });
    }

    const dragOverlay = document.getElementById('drag-overlay');
    let dragCounter = 0;

    if (dragOverlay) {
        document.addEventListener('dragenter', function (e) {
            if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
                dragCounter++;
                dragOverlay.style.display = 'block';
                if (dragArea) dragArea.classList.add('dragover');
            }
        });

        document.addEventListener('dragover', function (e) {
            if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                dragOverlay.style.display = 'block';
                if (dragArea) dragArea.classList.add('dragover');
            }
        });

        document.addEventListener('dragleave', function (e) {
            if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
                dragCounter--;
                if (dragCounter <= 0) {
                    dragOverlay.style.display = 'none';
                    if (dragArea) dragArea.classList.remove('dragover');
                    dragCounter = 0;
                }
            }
        });

        document.addEventListener('drop', function (e) {
            if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                e.preventDefault();
                dragOverlay.style.display = 'none';
                if (dragArea) dragArea.classList.remove('dragover');
                dragCounter = 0;
                handleFiles(e.dataTransfer.files);
            }
        });

        window.addEventListener('mouseleave', function () {
            dragOverlay.style.display = 'none';
            if (dragArea) dragArea.classList.remove('dragover');
            dragCounter = 0;
        });
    }

    function handleFiles(files) {
        // Accept unlimited number of PDF files, add to existing
        for (let file of files) {
            if (file.type !== "application/pdf") {
                alert(`"${file.name}" is not a PDF file. Only PDF files are allowed.`);
                continue;
            }
            // Prevent duplicate uploads by name and size
            if (uploadedFiles.some(f => f.name === file.name && f.size === file.size)) {
                continue;
            }
            uploadFile(file);
        }
    }

    function clearExampleFiles() {
        // Remove example file elements
        const exampleFiles = document.querySelectorAll('.file.upload-completed, .file.upload-error, .file.uploading');
        exampleFiles.forEach(file => file.remove());
    }

    // Store original file objects for retry
    const failedUploads = {};

    // Track xhr and paused state per file
    const uploadXhrs = {};
    const uploadPaused = {};
    const cancelledUploads = {};

    function deleteUploadedFileFromServer(filePath) {
        if (!filePath) return Promise.resolve(false);

        const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value ||
            document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

        const headers = {
            'Content-Type': 'application/json',
        };

        if (csrfToken) {
            headers['X-CSRFToken'] = csrfToken;
        }

        return fetch('/api/delete-file/', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                file_path: filePath,
            }),
        })
            .then(response => response.json())
            .then(data => !!data.success)
            .catch(() => false);
    }

    function uploadFile(file, retryFileId = null) {
        const fileId = retryFileId || (Date.now() + '_' + Math.random().toString(36).substr(2, 9));
        delete cancelledUploads[fileId];
        // If this is a retry, remove any previous failed record
        if (retryFileId && failedUploads[retryFileId]) {
            delete failedUploads[retryFileId];
        }
        // Create file element for uploading state
        const fileElement = createFileElement(file, fileId, 'uploading');

        // Insert the file element before the proceed button
        const fileUploadContainer = document.querySelector('.file-upload');
        const proceedButton = fileUploadContainer.querySelector('.proceed-btn');
        fileUploadContainer.insertBefore(fileElement, proceedButton);

        // Add pause/resume event listener
        const pauseIcon = fileElement.querySelector('.pause-icon');
        if (pauseIcon) {
            pauseIcon.addEventListener('click', function () {
                if (!uploadPaused[fileId]) {
                    // Pause: abort the xhr, mark as paused
                    if (uploadXhrs[fileId]) {
                        uploadXhrs[fileId].abort();
                        uploadPaused[fileId] = true;
                        pauseIcon.src = '/static/assets/play-icon.svg';
                        pauseIcon.alt = 'Resume Icon';
                        // Show paused status
                        const fileNameSpan = fileElement.querySelector('.file-name');
                        if (fileNameSpan) fileNameSpan.textContent = `Paused ${file.name}`;
                    }
                } else {
                    // Resume: restart upload from scratch (no partial resume in XHR)
                    uploadPaused[fileId] = false;
                    pauseIcon.src = '/static/assets/pause-icon.svg';
                    pauseIcon.alt = 'Pause Icon';
                    // Remove and re-upload
                    fileElement.remove();
                    uploadFile(file, fileId);
                }
            });
        }

        // Create FormData for upload
        const formData = new FormData();
        formData.append('file', file);

        // Get CSRF token
        const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value ||
            document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
        if (csrfToken) {
            formData.append('csrfmiddlewaretoken', csrfToken);
        }
        // Create XMLHttpRequest for progress tracking
        const xhr = new XMLHttpRequest();
        uploadXhrs[fileId] = xhr;

        // Set timeout for large file uploads (30 minutes)
        xhr.timeout = 30 * 60 * 1000;

        // Track upload progress
        xhr.upload.addEventListener('progress', function (e) {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                updateUploadProgress(fileId, percentComplete);
            }
        });

        xhr.addEventListener('load', function () {
            // Stop the scanning animation regardless of response
            const fileElement = document.querySelector(`[data-file-id="${fileId}"]`);
            const progressBar = fileElement?.querySelector('.progress');
            if (progressBar) {
                progressBar.classList.remove('scanning-pulse');
            }
            // Reset scanning flag and update proceed button
            isScanning = false;
            updateProceedButton();
            // Remove xhr tracking
            delete uploadXhrs[fileId];
            delete uploadPaused[fileId];
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (cancelledUploads[fileId]) {
                        delete cancelledUploads[fileId];
                        if (response.success && response.file_path) {
                            void deleteUploadedFileFromServer(response.file_path);
                        }
                        return;
                    }
                    if (response.success) {
                        // Upload and scan successful
                        updateFileStatus(fileId, 'completed', file.name, formatFileSize(file.size));
                        uploadedFiles.push({
                            id: fileId,
                            name: file.name,
                            size: file.size,
                            serverPath: response.file_path
                        });
                        updateProceedButton();
                    } else {
                        // Upload failed
                        updateFileStatus(fileId, 'error', file.name);
                        failedUploads[fileId] = file;
                        // Check if this is a virus detection
                        if (response.error && response.error.toLowerCase().includes('virus')) {
                            alert(`Security alert: The file "${file.name}" contains a virus and has been deleted.`);
                        } else {
                            console.error(`Upload failed for "${file.name}": ${response.error}`);
                        }
                    }
                } catch (e) {
                    updateFileStatus(fileId, 'error', file.name);
                    failedUploads[fileId] = file;
                }
            } else {
                updateFileStatus(fileId, 'error', file.name);
                failedUploads[fileId] = file;
            }
        });
        xhr.addEventListener('error', function () {
            if (cancelledUploads[fileId]) {
                delete cancelledUploads[fileId];
                isScanning = false;
                updateProceedButton();
                delete uploadXhrs[fileId];
                delete uploadPaused[fileId];
                return;
            }
            updateFileStatus(fileId, 'error', file.name);
            failedUploads[fileId] = file;
            isScanning = false;
            updateProceedButton();
            delete uploadXhrs[fileId];
            delete uploadPaused[fileId];
        });

        xhr.addEventListener('timeout', function () {
            updateFileStatus(fileId, 'error', file.name);
            failedUploads[fileId] = file;
            alert(`Upload of "${file.name}" timed out. Please try again.`);
            isScanning = false;
            updateProceedButton();
            delete uploadXhrs[fileId];
            delete uploadPaused[fileId];
        });

        // Send the request
        xhr.open('POST', '/api/upload-file/', true);
        // Ensure cookies (sessionid) are sent with the request
        xhr.withCredentials = true;
        xhr.send(formData);
    }

    function createFileElement(file, fileId, status) {
        const fileDiv = document.createElement('div');
        fileDiv.className = `file ${status}`;
        fileDiv.setAttribute('data-file-id', fileId);

        if (status === 'uploading') {
            const fileSizeText = formatFileSize(file.size);
            fileDiv.innerHTML = `
                <div class="file-rows">
                    <div class="file-title">
                        <span class="file-name">Uploading ${file.name}...</span>
                        <span class="file-size">0% • ${fileSizeText}</span>
                    </div>
                    <img src="/static/assets/pause-icon.svg" alt="Pause Icon" class="pause-icon" style="cursor:pointer;">
                    <img src="/static/assets/delete-icon.svg" alt="Delete Icon" class="delete-icon" onclick="cancelUpload('${fileId}')">
                </div>
                <div class="progress-bar">
                    <div class="progress" style="width: 0%;"></div>
                </div>
            `;
        }

        return fileDiv;
    }

    function updateUploadProgress(fileId, percentComplete) {
        const fileElement = document.querySelector(`[data-file-id="${fileId}"]`);
        if (fileElement) {
            const progressBar = fileElement.querySelector('.progress');
            const progressBarContainer = fileElement.querySelector('.progress-bar');
            const sizeSpan = fileElement.querySelector('.file-size');
            const remainingTime = Math.max(0, Math.round((100 - percentComplete) * 0.3)); // Rough estimate

            if (percentComplete < 100) {
                // Normal upload progress
                if (progressBar) {
                    progressBar.style.width = percentComplete + '%';
                    progressBar.classList.remove('scanning-pulse');
                    // Remove custom loading bar if present
                    const customBar = progressBarContainer?.querySelector('.loading-bar');
                    if (customBar) customBar.remove();
                }
                sizeSpan.textContent = `${Math.round(percentComplete)}% • ${remainingTime} seconds remaining`;
            } else {
                // At 100%, show scanning message and custom loading bar
                sizeSpan.textContent = `Scanning for viruses...`;
                if (progressBar) {
                    progressBar.style.width = '100%';
                    progressBar.classList.remove('scanning-pulse');
                    progressBar.style.display = 'none';
                }
                // Only add the custom loading bar if not already present
                if (progressBarContainer && !progressBarContainer.querySelector('.loading-bar')) {
                    const loadingBar = document.createElement('div');
                    loadingBar.className = 'loading-bar';
                    progressBarContainer.appendChild(loadingBar);
                }
                isScanning = true;
                updateProceedButton();
            }
        }
    }

    function updateFileStatus(fileId, status, fileName, fileSize = '') {
        const fileElement = document.querySelector(`[data-file-id="${fileId}"]`);
        if (fileElement) {
            fileElement.className = `file upload-${status}`;

            if (status === 'completed') {
                fileElement.innerHTML = `
                    <div class="file-rows">
                        <img src="/static/assets/pdf-icon.svg" alt="PDF Icon" class="file-icon">
                        <div class="file-title">
                            <span class="file-name">${fileName}</span>
                            <span class="file-size">${fileSize}</span>
                        </div>
                        <img src="/static/assets/delete-icon.svg" alt="Delete Icon" class="delete-icon" onclick="removeFile('${fileId}')">
                    </div>
                `;
            } else if (status === 'error') {
                fileElement.innerHTML = `
                    <div class="file-rows">
                        <img src="/static/assets/pdf-icon.svg" alt="PDF Icon" class="file-icon">
                        <div class="file-title">
                            <span class="file-name">${fileName}</span>
                            <span class="file-failed">Upload Failed</span>
                        </div>
                        <img src="/static/assets/trash-icon.svg" alt="Trash Icon" class="trash-icon" onclick="removeFile('${fileId}')">
                        <img src="/static/assets/repeat-icon.svg" alt="Repeat Icon" class="repeat-icon" onclick="retryUpload('${fileId}')">
                    </div>
                `;
            }
        }
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Global functions for file management
    window.removeFile = function (fileId) {
        const fileElement = document.querySelector(`[data-file-id="${fileId}"]`);
        if (fileElement) {
            // Find the file in uploadedFiles array to get the server path
            const fileToRemove = uploadedFiles.find(file => file.id === fileId);

            if (fileToRemove && fileToRemove.serverPath) {
                deleteUploadedFileFromServer(fileToRemove.serverPath)
                    .then(deleted => {
                        if (deleted) {
                            console.log('File deleted from server successfully');
                        } else {
                            console.error('Failed to delete file from server');
                        }
                    })
                    .catch(error => {
                        console.error('Error deleting file from server:', error);
                    });
            }

            // Remove from UI and local array
            fileElement.remove();
            uploadedFiles = uploadedFiles.filter(file => file.id !== fileId);
            updateProceedButton();
        }
    };

    window.retryUpload = function (fileId) {
        // Retry upload using the original file object if available
        const fileElement = document.querySelector(`[data-file-id="${fileId}"]`);
        if (fileElement) {
            fileElement.remove();
        }
        if (failedUploads[fileId]) {
            uploadFile(failedUploads[fileId], fileId);
        } else {
            alert('Original file not found for retry. Please reselect the file.');
        }
    };

    window.cancelUpload = function (fileId) {
        cancelledUploads[fileId] = true;
        if (uploadXhrs[fileId]) {
            uploadXhrs[fileId].abort();
        }
        const fileElement = document.querySelector(`[data-file-id="${fileId}"]`);
        if (fileElement) {
            fileElement.remove();
        }
        delete failedUploads[fileId];
        delete uploadPaused[fileId];
        isScanning = false;
        updateProceedButton();
    };

    // Handle proceed button click
    if (proceedBtn) {
        proceedBtn.addEventListener('click', function () {
            hasProceeded = true;
            // Show loading overlay immediately after clicking proceed
            const overlay = document.getElementById('loading-overlay');
            if (overlay) overlay.style.display = 'flex';
            if (uploadedFiles.length > 0) {
                // Gather server paths of uploaded files
                const filePaths = uploadedFiles.map(f => f.serverPath || f.file_path || f.path || f.name);
                const originalNames = {};
                uploadedFiles.forEach(f => {
                    const path = f.serverPath || f.file_path || f.path || f.name;
                    originalNames[path] = f.name;
                });
                fetch('/api/finalize-uploads/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]')?.value || document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                    },
                    body: JSON.stringify({ files: filePaths, original_names: originalNames })
                })
                    .then(res => res.json())
                    .then(data => {
                        if (!data.success && data.reason) {
                            // Show a detailed alert for the user
                            let msg = "ERROR:\n";
                            data.reason.forEach(err => {
                                msg += `• ${err.file} » ${err.reason}\n`;
                            });
                            msg += "\nIf need further help please approach to our store personnel.";
                            alert(msg); // Or use your custom alert system
                            if (overlay) overlay.style.display = 'none';
                            return; // Stop further processing
                        }
                        if (data.success) {
                            // Store document metadata in sessionStorage for preview
                            sessionStorage.setItem('documents', JSON.stringify(data.documents));
                            sessionStorage.setItem('customer_id', data.customer_id);
                            // Redirect to upload.html for preview
                            window.location.href = proceedBtn.getAttribute('data-url');
                        } else {
                            // Hide overlay if error
                            if (overlay) overlay.style.display = 'none';
                            alert('Failed to process documents: ' + data.error);
                        }
                    })
                    .catch(() => {
                        if (overlay) overlay.style.display = 'none';
                    });
            } else {
                // Hide overlay if no files
                if (overlay) overlay.style.display = 'none';
            }
        });
    }

    // Handle confirmation button click (save all current settings to backend)
    const confirmBtn = document.getElementById('to-confirmation');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', function () {
            hasProceeded = true;
            // Show loading overlay immediately after clicking confirm
            var overlay = document.getElementById('loading-overlay');
            if (overlay) overlay.style.display = 'flex';
            const docs = JSON.parse(sessionStorage.getItem('documents') || '[]');
            const uploadedFilesDiv = document.querySelector('.uploaded-files');
            if (!uploadedFilesDiv || !docs.length) {
                if (overlay) overlay.style.display = 'none';
                return;
            }
            const docDivs = uploadedFilesDiv.querySelectorAll('.file');
            let updates = [];
            let pageValidationError = '';
            docDivs.forEach((fileDiv, idx) => {
                if (pageValidationError) return;
                const doc = docs[idx];
                // Quantity
                const quantityInput = fileDiv.querySelector('.quantity-input');
                const quantity = quantityInput ? parseInt(quantityInput.value, 10) : 1;
                // Pages to print
                const allPagesRadio = fileDiv.querySelector('input[value="all"]');
                const specificPagesRadio = fileDiv.querySelector('input[value="specific-pages"]');
                let pages = '';
                if (allPagesRadio && allPagesRadio.checked) {
                    pages = `1-${doc.num_pages}`;
                } else if (specificPagesRadio && specificPagesRadio.checked) {
                    const pageInput = fileDiv.querySelector('.page-input');
                    const validation = validateSpecificPageSelection(pageInput ? pageInput.value : '', doc.num_pages);
                    if (!validation.valid) {
                        pageValidationError = `${doc.filename}: ${validation.error}`;
                        if (pageInput) {
                            pageInput.focus();
                            pageInput.select();
                        }
                        return;
                    }
                    if (pageInput) pageInput.style.borderColor = '';
                    pages = validation.normalized;
                }
                // Orientation
                const orientationRadio = fileDiv.querySelector('input[name="page-orientation-' + doc.doc_id + '"]:checked');
                const orientation = orientationRadio ? orientationRadio.value : 'portrait';
                // Grayscale/Color (from DB if available, else from UI)
                let grayscale = doc.grayscale;
                const grayscaleToggle = fileDiv.querySelector('.switch-input');
                if (typeof grayscale === 'undefined' && grayscaleToggle) {
                    grayscale = grayscaleToggle.checked ? 'Black and white' : 'Color';
                }
                // Paper size
                const paperSizeSelect = fileDiv.querySelectorAll('.dropdown-select')[0];
                const paperSize = paperSizeSelect ? paperSizeSelect.value : '';
                updates.push({
                    doc_id: doc.doc_id,
                    quantity,
                    pages,
                    orientation,
                    grayscale,
                    paper_size: paperSize
                });
            });
            if (pageValidationError) {
                if (overlay) overlay.style.display = 'none';
                alert('Failed to update settings: ' + pageValidationError);
                return;
            }
            // Send updates to backend
            fetch('/api/update-document-settings/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]')?.value || document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
                body: JSON.stringify({ updates })
            })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        const cid = sessionStorage.getItem('customer_id');
                        const docs = JSON.parse(sessionStorage.getItem('documents') || '[]');
                        // Build doc_ids query parameters for payment page
                        const docIdParams = docs.map(d => 'doc_ids=' + encodeURIComponent(d.doc_id)).join('&');
                        // Redirect to payment page with CID and doc_ids
                        window.location.href = '/payment/?customer_id=' + encodeURIComponent(cid) + '&' + docIdParams;
                    } else {
                        if (overlay) overlay.style.display = 'none';
                        alert('Failed to update settings: ' + (data.error || 'Unknown error'));
                    }
                })
                .catch(() => {
                    if (overlay) overlay.style.display = 'none';
                });
        });
    }



    // Make the navbar sticky on top when scrolling
    const navbar = document.querySelector(".navbar");

    const handleScroll = () => {
        if (window.scrollY > 0) {
            navbar.classList.add("scrolled");
        } else {
            navbar.classList.remove("scrolled");
        }
    };

    // Add scroll event listener
    document.addEventListener("scroll", handleScroll);

    // Initial check in case the page is loaded with scroll
    handleScroll();


    // Hamburger Menu Toggle (for mobile view)
    const hamburger = document.querySelector('.hamburger');
    const menu = document.querySelector('.menu');

    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        menu.classList.toggle('active');
    });

    // Close navbar when a link is clicked in mobile view
    const menuLinks = menu.querySelectorAll('a');
    menuLinks.forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            menu.classList.remove('active');
        });
    });

    // FAQ Card Toggle Functionality
    const faqCards = document.querySelectorAll('.faq-card');

    faqCards.forEach(card => {
        card.addEventListener('click', () => {
            const content = card.querySelector('.faq-card-content');
            const toggleIcon = card.querySelector('.faq-card-toggle');

            if (card.classList.contains('active')) {
                // If the card is already active, deactivate it
                card.classList.remove('active');
                content.style.maxHeight = null;
                toggleIcon.style.transform = 'rotate(0deg)';
                card.blur();
            } else {
                // Activate the clicked card
                card.classList.add('active');
                content.style.maxHeight = content.scrollHeight + 'px';
                toggleIcon.style.transform = 'rotate(45deg)';
            }
        });
    });

    // Quantity Input Increment/Decrement
    const quantitySelectors = document.querySelectorAll('.quantity-selector');

    quantitySelectors.forEach(selector => {
        const decreaseBtn = selector.querySelector('.decrease-btn');
        const increaseBtn = selector.querySelector('.increase-btn');
        const quantityInput = selector.querySelector('.quantity-input');

        decreaseBtn.addEventListener('click', () => {
            let currentValue = parseInt(quantityInput.value, 10);
            const minValue = parseInt(quantityInput.min, 10);
            if (currentValue > minValue) {
                quantityInput.value = currentValue - 1;
            }
        });

        increaseBtn.addEventListener('click', () => {
            let currentValue = parseInt(quantityInput.value, 10);
            const maxValue = parseInt(quantityInput.max, 10);
            if (currentValue < maxValue) {
                quantityInput.value = currentValue + 1;
            }
        });
    });

    //Specific Pages Input Event
    const specificPagesRadio = document.querySelector('input[value="specific-pages"]');
    const allPagesRadio = document.querySelector('input[value="all"]');
    const pageInput = document.querySelector('.page-input');

    if (specificPagesRadio) {
        specificPagesRadio.addEventListener('change', () => {
            if (specificPagesRadio.checked) {
                pageInput.disabled = false;
                pageInput.focus();
            }
        });
    }

    if (allPagesRadio) {
        allPagesRadio.addEventListener('change', () => {
            if (allPagesRadio.checked) {
                pageInput.disabled = true;
                pageInput.value = '';
            }
        });
    }

    // Grayscale Toggle Functionality
    const grayscaleToggle = document.getElementById('grayscale-toggle');
    if (grayscaleToggle) {
        grayscaleToggle.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                grayscaleToggle.checked = !grayscaleToggle.checked;
                grayscaleToggle.dispatchEvent(new Event('change'));
            }
        });
    }

    const feedbackForm = document.getElementById('feedback-form');
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const form = e.target;
            const formData = new FormData(form);

            fetch("/api/feedback/", {
                method: "POST",
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRFToken': formData.get('csrfmiddlewaretoken')
                },
                body: formData
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        window.location.reload();
                    }
                });
        });
    }

    if (typeof LoginError !== 'undefined' && LoginError) {
        createAlert(
            "Error",           // title
            "",                // summary
            LoginError,        // details
            "danger",          // severity
            true,              // dismissible
            true,              // autoDismiss
            "pageMessages"
        );
    }

    if (document.querySelector('.uploaded-files')) {
        const docs = JSON.parse(sessionStorage.getItem('documents') || '[]');
        if (docs.length === 0) {
            window.location.href = '/';
            return;
        }
        renderUploadedDocumentsPreview();
    }

    // // Only run on confirmation page
    // if (document.querySelector('.confirmation')) {
    //     // Redirect to homepage if no documents
    //     const docs = JSON.parse(sessionStorage.getItem('documents') || '[]');
    //     if (!docs || docs.length === 0) {
    //         window.location.href = '/';
    //     }

    //     // Clear docs and customer_id from sessionStorage
    //     sessionStorage.removeItem('documents');
    //     sessionStorage.removeItem('customer_id');

    //     // Remove CID cookie if set as a cookie (optional)
    //     document.cookie = "customer_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    // }

    const finishBtn = document.getElementById('finish-transaction-btn');
    if (finishBtn) {
        finishBtn.addEventListener('click', function () {
            if (finishBtn.dataset.mode === 'done') {
                confirmCancelledVoucherDone();
                return;
            }
            showPrintQualityOverlay();
        });
    }

    // ============================================================
    // CONFIRMATION PAGE - SSE REAL-TIME DOCUMENT STATUS
    // ============================================================
    if (document.querySelector('.confirmation')) {
        initConfirmationSSE();
    }

    // Page range radio button listeners
    const pageRangeRadios = document.querySelectorAll('.page-range-radio');
    const specificPagesInput = document.getElementById('specific-pages-input');

    if (pageRangeRadios.length > 0 && specificPagesInput) {
        pageRangeRadios.forEach(radio => {
            radio.addEventListener('change', function () {
                if (this.value === 'specific') {
                    specificPagesInput.disabled = false;
                    specificPagesInput.focus();
                } else {
                    specificPagesInput.disabled = true;
                    specificPagesInput.value = '';
                }
            });
        });
    }

}); // END OF DOMContentLoaded

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href').substring(1);
        const targetElement = document.getElementById(targetId);

        if (targetElement) {
            targetElement.scrollIntoView({
                behavior: 'smooth'
            });
        }
    });
});

// Display Alert Messages function
function createAlert(title, summary, details, severity, dismissible, autoDismiss, appendToId) {
    var iconMap = {
        info: "fa fa-info-circle",
        success: "fa fa-thumbs-up",
        warning: "fa fa-exclamation-triangle",
        danger: "fa fa-exclamation-circle"
    };

    var iconAdded = false;

    var alertClasses = ["alert", "animate__animated", "animate__flipInX"];
    alertClasses.push("alert-" + severity.toLowerCase());

    if (dismissible) {
        alertClasses.push("alert-dismissible");
    }

    var msgIcon = $("<i />", {
        "class": iconMap[severity]
    });

    var msg = $("<div />", {
        "class": alertClasses.join(" ")
    });

    if (title) {
        var msgTitle = $("<h4 />", {
            html: title
        }).appendTo(msg);

        if (!iconAdded) {
            msgTitle.prepend(msgIcon);
            iconAdded = true;
        }
    }

    if (summary) {
        var msgSummary = $("<strong />", {
            html: summary
        }).appendTo(msg);

        if (!iconAdded) {
            msgSummary.prepend(msgIcon);
            iconAdded = true;
        }
    }

    if (details) {
        var msgDetails = $("<p />", {
            html: details
        }).appendTo(msg);

        if (!iconAdded) {
            msgDetails.prepend(msgIcon);
            iconAdded = true;
        }
    }

    if (dismissible) {
        var msgClose = $("<span />", {
            "class": "close",
            "data-dismiss": "alert",
            html: "<i class='fa fa-times-circle'></i>"
        }).appendTo(msg);
    }

    $(document).on('click', '.alert .close', function () {
        $(this).closest('.alert').remove();
    });

    $('#' + appendToId).prepend(msg);

    if (autoDismiss) {
        setTimeout(function () {
            msg.removeClass("animate__flipInX").addClass("animate__flipOutX");
            setTimeout(function () {
                msg.remove();
            }, 1000);
        }, 5000);
    }
}


// Warn user about losing uploads on reload/close (only on pages with upload functionality)
if (document.querySelector('.uploaded') || document.querySelector('.drag-area')) {
    window.addEventListener('beforeunload', function (e) {
        if (
            typeof uploadedFiles !== 'undefined' &&
            uploadedFiles.length > 0 &&
            !hasProceeded
        ) {
            // Send a request to delete all uploaded files for this session
            navigator.sendBeacon('/api/delete-all-uploads/');
            e.preventDefault();
            e.returnValue = 'You have uploaded documents that are not yet submitted. If you reload or close this page, your uploaded documents will be lost. Are you sure you want to leave?';
        }

        if (docs.length > 0 && !hasProceeded) {
            e.preventDefault();
            e.returnValue = 'You have uploaded documents that are not yet submitted. If you reload or close this page, your uploaded documents will be lost. Are you sure you want to leave?';
            // Prepare data for deletion
            const payload = JSON.stringify({
                doc_id: docs.map(doc => doc.doc_id),
                session_key: window.sessionKey
            });
        }
    });
}

function renderUploadedDocumentsPreview() {
    const uploadedFilesDiv = document.querySelector('.uploaded-files');
    if (!uploadedFilesDiv) return;

    const docs = JSON.parse(sessionStorage.getItem('documents') || '[]');

    uploadedFilesDiv.innerHTML = '';

    docs.forEach(doc => {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'file';
        fileDiv.innerHTML = `
            <div class="file-rows">
                <img src="/static/assets/pdf-icon.svg" alt="PDF Icon" class="file-icon">
                <div class="file-title">
                    <span class="file-name">${doc.filename}</span>
                    <span class="file-size">${(doc.file_size / 1024).toFixed(1)} KB</span>
                </div> 
                <img src="/static/assets/delete-icon.svg" alt="Delete Icon" class="delete-icon">
            </div>
            <div class="file-rows">
                <h5>Copies</h5>
                <div class="quantity-selector">
                    <button class="decrease-btn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="19" height="16" viewBox="0 0 19 16" fill="none">
                            <path d="M4.50732 8H14.5372" stroke="#18191F" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <input type="number" class="quantity-input" value="1" min="1" max="500">
                    <button class="increase-btn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="19" height="16" viewBox="0 0 19 16" fill="none">
                            <path d="M9.52246 3.625V12.375" stroke="#18191F" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M4.50732 8H14.5372" stroke="#18191F" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="file-rows vertical-separator">
                <h5>Pages to Print</h5>
                <div class="radio-group">
                    <label class="radio-option">
                        <input type="radio" name="page-selection-${doc.doc_id}" value="all" checked>
                        <span class="radio-circle"></span>
                        <span class="radio-label">All Pages</span>
                    </label>
                    <label class="radio-option">
                        <input type="radio" name="page-selection-${doc.doc_id}" value="specific-pages">
                        <span class="radio-circle"></span>
                        <span class="radio-label">Specific Pages</span>
                    </label>
                </div>
                <input type="text" class="page-input" placeholder="1-${doc.num_pages}" disabled>
            </div>
            <div class="file-rows vertical-separator">
                <h5>Page Orientation</h5>
                <div class="radio-group">
                    <label class="radio-option">
                        <input type="radio" name="page-orientation-${doc.doc_id}" value="portrait" ${doc.orientation === 'Portrait' ? 'checked' : ''}>
                        <span class="radio-circle"></span>
                        <span class="radio-label">Portrait</span>
                    </label>
                    <label class="radio-option">
                        <input type="radio" name="page-orientation-${doc.doc_id}" value="landscape" ${doc.orientation === 'Landscape' ? 'checked' : ''}>
                        <span class="radio-circle"></span>
                        <span class="radio-label">Landscape</span>
                    </label>
                </div>
            </div>
            <div class="file-rows">
                <h5>Print in Grayscale</h5>
                <div class="switch">
                    <input type="checkbox" class="switch-input" tabindex="0">
                    <label class="switch-label">
                        <span class="switch-circle">
                            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36" fill="none">
                                <rect x="1" y="1" width="34" height="34" rx="17" fill="white" stroke="#18191F" stroke-width="2"/>
                                <rect x="11" y="11" width="14" height="14" rx="7" stroke="#18191F" stroke-width="2"/>
                            </svg>
                        </span>
                    </label>
                </div>
            </div>
            <div class="file-rows vertical-separator">
                <h5>Paper Size</h5>
                <div class="dropdown">
                    <select class="dropdown-select">
                        <option value="Long" ${doc.paper_size === 'Long' ? 'selected' : ''}>Long (8.5x13in)</option>
                        <option value="Letter" ${doc.paper_size === 'Letter' ? 'selected' : ''}>Letter (8.5x11in)</option>
                        <option value="A4" ${doc.paper_size === 'A4' ? 'selected' : ''}>A4 (8.3x11.7in)</option>
                    </select>
                    <span class="dropdown-arrow">
                        <svg xmlns="http://www.w3.org/2000/svg" width="35" height="18" viewBox="0 0 24 24" fill="none">
                            <path d="M7 10l5 5 5-5" stroke="#000000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </span>
                </div>
            </div>
        `;
        uploadedFilesDiv.appendChild(fileDiv);

        // --- Attach event listeners for dynamic controls ---
        // Quantity selector
        const decreaseBtn = fileDiv.querySelector('.decrease-btn');
        const increaseBtn = fileDiv.querySelector('.increase-btn');
        const quantityInput = fileDiv.querySelector('.quantity-input');
        if (decreaseBtn && quantityInput) {
            decreaseBtn.addEventListener('click', () => {
                let currentValue = parseInt(quantityInput.value, 10);
                const minValue = parseInt(quantityInput.min, 10);
                if (currentValue > minValue) {
                    quantityInput.value = currentValue - 1;
                }
            });
        }
        if (increaseBtn && quantityInput) {
            increaseBtn.addEventListener('click', () => {
                let currentValue = parseInt(quantityInput.value, 10);
                const maxValue = parseInt(quantityInput.max, 10);
                if (currentValue < maxValue) {
                    quantityInput.value = currentValue + 1;
                }
            });
        }

        // Delete document from preview and sessionStorage
        const deleteIcon = fileDiv.querySelector('.delete-icon');
        if (deleteIcon) {
            deleteIcon.addEventListener('click', () => {
                fetch('/api/delete-document/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]')?.value ||
                            document.querySelector('meta[name=csrf-token]')?.getAttribute('content'),
                    },
                    body: JSON.stringify({
                        doc_id: doc.doc_id,
                        session_key: window.sessionKey
                    })
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            fileDiv.remove();
                            const updatedDocs = docs.filter(d => d.doc_id !== doc.doc_id);
                            sessionStorage.setItem('documents', JSON.stringify(updatedDocs));
                            if (updatedDocs.length === 0) {
                                window.location.href = '/';
                            } else {
                                renderUploadedDocumentsPreview();
                            }
                        } else {
                            alert('Failed to delete document: ' + (data.error || 'Unknown error'));
                        }
                    })
                    .catch(() => {
                        alert('Failed to communicate with server.');
                    });
            });
        }
        // Grayscale switch
        const grayscaleToggle = fileDiv.querySelector('.switch-input');
        const switchLabel = fileDiv.querySelector('.switch-label');
        if (grayscaleToggle) {
            // Set initial state based on doc.grayscale from DB
            if (doc.grayscale === 'Black and white') {
                grayscaleToggle.checked = true;
            } else {
                grayscaleToggle.checked = false;
            }
            // Toggle on click (for accessibility)
            grayscaleToggle.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    grayscaleToggle.checked = !grayscaleToggle.checked;
                    grayscaleToggle.dispatchEvent(new Event('change'));
                }
            });
            // Toggle on label click
            if (switchLabel) {
                switchLabel.addEventListener('click', () => {
                    grayscaleToggle.checked = !grayscaleToggle.checked;
                    grayscaleToggle.dispatchEvent(new Event('change'));
                });
            }
        }

        // Specific pages radio/textbox
        const specificPagesRadio = fileDiv.querySelector('input[value="specific-pages"]');
        const allPagesRadio = fileDiv.querySelector('input[value="all"]');
        const pageInput = fileDiv.querySelector('.page-input');

        if (specificPagesRadio && pageInput) {
            specificPagesRadio.addEventListener('change', () => {
                if (specificPagesRadio.checked) {
                    pageInput.disabled = false;
                    pageInput.placeholder = "e.g., 1-3,5,7-9";
                }
            });
        }
        if (allPagesRadio && pageInput) {
            allPagesRadio.addEventListener('change', () => {
                if (allPagesRadio.checked) {
                    pageInput.disabled = true;
                    pageInput.value = '';
                    pageInput.placeholder = `1-${doc.num_pages}`;
                }
            });
        }
    });
}

// Hide loading overlay on DOMContentLoaded
window.addEventListener('DOMContentLoaded', function () {
    var overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
});

// ============================================================
// CONFIRMATION PAGE - SSE & DYNAMIC RENDERING
// ============================================================

// Global state for SSE documents (used by problem report)
window.customerDocuments = [];
window.customerDocumentArchive = [];
let customerSSE = null;

function getCustomerDocumentArchiveKey() {
    const customerIdEl = document.getElementById('customer-id-data');
    const customerId = customerIdEl ? customerIdEl.value : '';
    return customerId ? `customerDocumentArchive:${customerId}` : 'customerDocumentArchive';
}

function loadCustomerDocumentArchive() {
    try {
        window.customerDocumentArchive = JSON.parse(sessionStorage.getItem(getCustomerDocumentArchiveKey()) || '[]');
    } catch (error) {
        window.customerDocumentArchive = [];
    }
    return window.customerDocumentArchive;
}

function storeCustomerDocumentArchive(documents) {
    if (!Array.isArray(documents) || documents.length === 0) return;

    const archive = loadCustomerDocumentArchive();
    const archiveMap = new Map(archive.map(doc => [doc.doc_id, doc]));

    documents.forEach(doc => {
        if (doc && doc.doc_id) {
            archiveMap.set(doc.doc_id, { ...archiveMap.get(doc.doc_id), ...doc });
        }
    });

    window.customerDocumentArchive = Array.from(archiveMap.values());

    try {
        sessionStorage.setItem(getCustomerDocumentArchiveKey(), JSON.stringify(window.customerDocumentArchive));
    } catch (error) {
        console.warn('Could not store customer document archive:', error);
    }
}

// --- Print completion sound & tab title flash ---
const confirmationBaseTitle = document.title;
let confirmationTitleFlashInterval = null;
let previousDocStatuses = {}; // Track previous statuses by doc_id
const printCompleteAudio = new Audio('/static/sounds/chime.mp3');
const rerouteAlertAudio = new Audio('/static/sounds/rerouted.mp3');

// Request browser notification permission on confirmation page
if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
}

// Fetch configured customer sounds from server
(function loadCustomerSoundPrefs() {
    fetch('/api/get-customer-sound-prefs/')
        .then(r => r.json())
        .then(data => {
            if (data.completion_sound) printCompleteAudio.src = data.completion_sound;
            if (data.reroute_sound) rerouteAlertAudio.src = data.reroute_sound;
        })
        .catch(() => {});
})();

function playPrintCompleteSound() {
    printCompleteAudio.currentTime = 0;
    printCompleteAudio.volume = 1.0;
    printCompleteAudio.play().catch(e => console.warn('Could not play completion sound:', e));
}

function playRerouteSound() {
    rerouteAlertAudio.currentTime = 0;
    rerouteAlertAudio.volume = 1.0;
    rerouteAlertAudio.play().catch(e => console.warn('Could not play reroute sound:', e));
}

function startConfirmationTitleFlash(count) {
    if (confirmationTitleFlashInterval) {
        clearInterval(confirmationTitleFlashInterval);
    }
    let showAlert = true;
    confirmationTitleFlashInterval = setInterval(() => {
        document.title = showAlert
            ? `(${count}) Document${count > 1 ? 's' : ''} Ready!`
            : confirmationBaseTitle;
        showAlert = !showAlert;
    }, 1000);
}

function stopConfirmationTitleFlash() {
    if (confirmationTitleFlashInterval) {
        clearInterval(confirmationTitleFlashInterval);
        confirmationTitleFlashInterval = null;
    }
    document.title = confirmationBaseTitle;
}

function checkForNewCompletions(documents) {
    if (!documents || documents.length === 0) return;

    let newlyFinished = 0;
    let newlyRerouted = 0;

    documents.forEach(doc => {
        const prev = previousDocStatuses[doc.doc_id];
        if (prev) {
            // Detect newly finished
            if (doc.doc_status === 'Finished' && prev !== 'Finished') {
                newlyFinished++;
            }
            // Detect reroute: was Printing, now Queued (rerouted to another printer)
            if (prev === 'Printing' && doc.doc_status === 'Queued') {
                newlyRerouted++;
            }
        }
    });

    // Update previous statuses
    documents.forEach(doc => {
        previousDocStatuses[doc.doc_id] = doc.doc_status;
    });

    // Play appropriate sounds (finished takes priority)
    if (newlyFinished > 0) {
        playPrintCompleteSound();
        showPrintCompleteToast();
        // Show browser notification (works even when tab is in background)
        if ("Notification" in window && Notification.permission === "granted") {
            new Notification("SafePrint — Print Complete!", {
                body: newlyFinished === 1
                    ? "Your document is ready for pickup!"
                    : newlyFinished + " documents are ready for pickup!",
                icon: "/static/assets/safeprint-logo.png"
            });
        }
    } else if (newlyRerouted > 0) {
        playRerouteSound();
        if ("Notification" in window && Notification.permission === "granted") {
            new Notification("SafePrint — Print Rerouted", {
                body: "Your document has been rerouted to another printer.",
                icon: "/static/assets/safeprint-logo.png"
            });
        }
    }

    // Count total finished (not picked up) for title flash
    const finishedCount = documents.filter(d => d.doc_status === 'Finished').length;
    if (finishedCount > 0) {
        startConfirmationTitleFlash(finishedCount);
    } else {
        stopConfirmationTitleFlash();
    }
}

// Track which docs have already triggered the timeout popup
var _timeoutPopupShown = {};
var _voucherCancellationShown = {};

function checkForTimeoutCancellations(documents) {
    if (!documents || documents.length === 0) return;
    documents.forEach(function(doc) {
        if (doc.doc_status === 'Cancelled' && !_timeoutPopupShown[doc.doc_id]) {
            var reason = (doc.cancel_reason || '').toLowerCase();
            if (reason.indexOf('no printer available for') !== -1 && reason.indexOf('auto voucher') === -1) {
                _timeoutPopupShown[doc.doc_id] = true;
                // Auto-show the problem report overlay for this timed-out document
                if (typeof showProblemReportOverlay === 'function') {
                    showProblemReportOverlay();
                }
            }
        }
    });
}

function checkForAutoVoucherCancellations(documents) {
    if (!documents || documents.length === 0) return;

    documents.forEach(function(doc) {
        var reason = doc.cancel_reason || '';
        var normalizedReason = reason.toLowerCase();
        var hasVoucherCode = !!(doc.auto_voucher_code && String(doc.auto_voucher_code).trim());
        if (
            doc.doc_status === 'Cancelled' &&
            (normalizedReason.indexOf('auto voucher') !== -1 || hasVoucherCode) &&
            !_voucherCancellationShown[doc.doc_id]
        ) {
            _voucherCancellationShown[doc.doc_id] = true;
            var alertBody = reason;
            if (hasVoucherCode && normalizedReason.indexOf('auto voucher') === -1) {
                var amountSuffix = doc.auto_voucher_amount ? ' worth P' + doc.auto_voucher_amount : '';
                alertBody = reason + (reason ? ' ' : '') + 'Auto voucher ' + doc.auto_voucher_code + amountSuffix + ' was issued for the unprinted portion.';
            }
            createAlert(
                'Print Cancelled',
                'Voucher generated for the affected document.',
                alertBody,
                'warning',
                true,
                false,
                'pageMessages'
            );
        }
    });
}

// Track whether auto-ticket popup has already been triggered this page load
var _autoTicketTriggered = false;

function getCancelledVoucherCodes(documents) {
    const voucherCodes = [];
    (documents || []).forEach((doc) => {
        const reason = String(doc && doc.cancel_reason ? doc.cancel_reason : '');
        const match = reason.match(/Auto voucher\s+(\S+)/i);
        if (!match) {
            return;
        }
        const voucherCode = match[1].replace(/[.,;:]+$/, '');
        if (voucherCode && !voucherCodes.includes(voucherCode)) {
            voucherCodes.push(voucherCode);
        }
    });
    return voucherCodes;
}

function confirmCancelledVoucherDone() {
    const docs = Array.isArray(window.customerDocuments) ? window.customerDocuments : [];
    const cancelledDocs = docs.filter((doc) => doc.doc_status === 'Cancelled');
    const customerIdEl = document.getElementById('customer-id-data');
    const customerId = customerIdEl ? customerIdEl.value : '';
    const voucherCodes = getCancelledVoucherCodes(cancelledDocs);
    const voucherLine = voucherCodes.length > 0
        ? `\n\nVoucher${voucherCodes.length > 1 ? 's' : ''}: ${voucherCodes.join(', ')}`
        : '';

    const confirmed = confirm(
        'Have you captured the voucher to reprint later once the printer issue is fixed?' +
        voucherLine +
        '\n\nPress OK to continue. A ticket will be automatically created so the admin knows this happened.'
    );

    if (!confirmed) {
        return;
    }

    if (!customerId || cancelledDocs.length === 0) {
        hasProceeded = true;
        redirectHomeAfterSessionClear();
        return;
    }

    hasProceeded = true;
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'flex';

    fetch('/api/acknowledge-cancelled-voucher/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify({
            customer_id: customerId,
            doc_ids: cancelledDocs.map((doc) => doc.doc_id),
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                redirectHomeAfterSessionClear();
                return;
            }

            throw new Error(data.error || 'Unable to notify admin about the cancelled voucher.');
        })
        .catch(error => {
            console.error('Error acknowledging cancelled voucher:', error);
            hasProceeded = false;
            if (overlay) overlay.style.display = 'none';
            alert('Could not create the admin ticket automatically. Please try Done again so the voucher capture is recorded.');
        });
}

function checkForAutoTicketTrigger(data) {
    if (_autoTicketTriggered) return;
    var documents = data.documents || [];
    var otherQueueCount = data.other_queue_count || 0;
    var timeoutMinutes = data.auto_ticket_timeout || 5;

    // Only trigger if no other customers' docs are in queue
    if (otherQueueCount > 0) return;

    // Check if any of THIS customer's docs have been Queued beyond the timeout
    var now = new Date();
    var hasQueuedTimeout = false;

    for (var i = 0; i < documents.length; i++) {
        var doc = documents[i];
        if (doc.doc_status === 'Queued' && doc.status_updated_at) {
            var queuedSince = new Date(doc.status_updated_at);
            var elapsedMs = now.getTime() - queuedSince.getTime();
            var elapsedMin = elapsedMs / 60000;
            if (elapsedMin >= timeoutMinutes) {
                hasQueuedTimeout = true;
                break;
            }
        }
    }

    if (hasQueuedTimeout) {
        _autoTicketTriggered = true;
        console.log('[AUTO-TICKET] Document queued for >' + timeoutMinutes + ' min with empty queue. Triggering problem report.');
        if (typeof showProblemReportOverlay === 'function') {
            showProblemReportOverlay();
        }
    }
}

// --- End print completion sound & tab title flash ---

// --- Toast notification ---
let toastAutoDismissTimer = null;

function showPrintCompleteToast() {
    const toast = document.getElementById('printCompleteToast');
    if (!toast) return;
    toast.classList.remove('toast-hiding');
    toast.style.display = 'flex';
    // Auto-dismiss after 10 seconds
    if (toastAutoDismissTimer) clearTimeout(toastAutoDismissTimer);
    toastAutoDismissTimer = setTimeout(dismissToast, 10000);
}

function dismissToast() {
    const toast = document.getElementById('printCompleteToast');
    if (!toast) return;
    if (toastAutoDismissTimer) {
        clearTimeout(toastAutoDismissTimer);
        toastAutoDismissTimer = null;
    }
    toast.classList.add('toast-hiding');
    setTimeout(() => { toast.style.display = 'none'; }, 300);
}
// --- End toast notification ---

function initConfirmationSSE() {
    const customerIdEl = document.getElementById('customer-id-data');
    if (!customerIdEl) return;

    const customerId = customerIdEl.value;
    if (!customerId) return;

    console.log('Setting up SSE for customer documents:', customerId);

    // Show "might take a while" hint after 3 seconds if still loading
    setTimeout(() => {
        const hint = document.querySelector('.loading-subtext-hint');
        if (hint) hint.style.display = 'block';
    }, 3000);

    customerSSE = new EventSource(`/sse/customer-documents/${customerId}/`);

    customerSSE.onopen = function () {
        console.log('Customer documents SSE connected');
    };

    customerSSE.onmessage = function (event) {
        try {
            const data = JSON.parse(event.data);
            window.customerDocuments = data.documents || [];
            storeCustomerDocumentArchive(window.customerDocuments);
            checkForNewCompletions(data.documents || []);
            checkForTimeoutCancellations(data.documents || []);
            checkForAutoVoucherCancellations(data.documents || []);
            checkForAutoTicketTrigger(data);
            renderDocumentRows(data.documents);
            updateConfirmationUI(data);
        } catch (e) {
            console.error('Error parsing SSE data:', e);
        }
    };

    customerSSE.onerror = function (err) {
        console.error('Customer documents SSE error:', err);
        // Reconnect after 3 seconds
        setTimeout(() => {
            if (customerSSE) {
                customerSSE.close();
            }
            initConfirmationSSE();
        }, 3000);
    };
}

function renderDocumentRows(documents) {
    const container = document.getElementById('confirmation-doc-list');
    if (!container) return;

    if (!documents || documents.length === 0) {
        container.innerHTML = '<div class="doc-row"><div class="doc-left"><div class="doc-meta"><h6>No documents found</h6></div></div></div>';
        return;
    }

    container.innerHTML = '';

    documents.forEach(doc => {
        const row = document.createElement('div');
        row.className = 'doc-row';
        row.setAttribute('data-doc-id', doc.doc_id);

        // Left side: icon + name + doc ID
        const leftHtml = `
            <div class="doc-left">
                <img src="/static/assets/pdf-icon.svg" alt="PDF Icon">
                <div class="doc-meta">
                    <h6 title="${escapeHtml(doc.filename)}">${escapeHtml(doc.filename)}</h6>
                    <span class="doc-id">#${escapeHtml(doc.doc_id)}</span>
                </div>
            </div>
        `;

        // Right side: badges based on status and reroute history
        const rightHtml = buildDocumentBadges(doc);

        row.innerHTML = leftHtml + rightHtml;
        container.appendChild(row);
    });
}

function buildDocumentBadges(doc) {
    let badgesHtml = '';
    const history = doc.reroute_history || [];

    const segments = buildPrintSegments(doc, history);
    const hasPageSegments = segments.some(segment => Array.isArray(segment.pages) && segment.pages.length > 0);
    const rerouteDestination = getLatestRerouteDestination(history);
    const pickupSummaryHtml = renderPickupHistorySummary(doc, segments);

    if (doc.doc_status === 'Pending') {
        // Waiting for admin approval
        badgesHtml = `<div class="badge status-warning">Waiting for Approval...</div>`;
    } else if (doc.doc_status === 'Queued') {
        // In queue, no printer assigned yet
        if (segments.length > 0) {
            badgesHtml = renderCompletedSegments(segments);
        }
        if (rerouteDestination) {
            badgesHtml += `<div class="badge status-primary">Rerouted to (${escapeHtml(rerouteDestination)})</div>`;
        }
        badgesHtml += `<div class="badge status-info">Waiting...</div>`;
    } else if (doc.doc_status === 'Printing') {
        if (segments.length > 0) {
            badgesHtml = renderCompletedSegments(hasPageSegments ? segments : segments.slice(0, -1));
        }
        if (rerouteDestination) {
            badgesHtml += `<div class="badge status-primary">Rerouted to (${escapeHtml(rerouteDestination)})</div>`;
        }
        badgesHtml += `<div class="badge status-info">${formatCurrentPrintingBadge(doc)}</div>`;
    } else if (doc.doc_status === 'Finished') {
        if (pickupSummaryHtml) {
            badgesHtml = pickupSummaryHtml;
        } else if (segments.length > 0) {
            badgesHtml = renderCompletedSegments(segments);
        }
        badgesHtml += `
            <div class="status-group">
                <div class="badge status-success">Completed</div>
                <button class="picked-up-btn" onclick="pickedUpDocument('${escapeHtml(doc.doc_id)}')">Picked Up</button>
            </div>
        `;
    } else if (doc.doc_status === 'Cancelled') {
        // Cancelled - show reason
        const reason = doc.cancel_reason ? ` (${escapeHtml(doc.cancel_reason)})` : ' (No available Printer)';
        if (segments.length > 0) {
            badgesHtml = renderCompletedSegments(segments);
        }
        badgesHtml += `<div class="badge status-danger">Cancelled${reason}</div>`;
    } else if (doc.doc_status === 'Picked Up') {
        // Already picked up
        if (pickupSummaryHtml) {
            badgesHtml = pickupSummaryHtml;
        } else if (segments.length > 0) {
            badgesHtml = renderCompletedSegments(segments);
        }
        badgesHtml += `<div class="badge status-success">Picked Up</div>`;
    }

    // Append ticket label if a support ticket was created for this document
    if (doc.has_ticket) {
        const ticketNum = doc.ticket_number ? ` #${escapeHtml(doc.ticket_number)}` : '';
        badgesHtml += `<div class="badge status-ticket"><i class="fa-solid fa-ticket"></i> Report Filed${ticketNum}</div>`;
    }

    return `<div class="doc-right">${badgesHtml}</div>`;
}

function buildPrintSegments(doc, history) {
    const pageSegments = [];
    let currentPageSegment = null;

    history.forEach((entry) => {
        const match = /^Printed page\s+(\d+)$/i.exec(entry.status || '');
        if (!match) {
            return;
        }

        const printerName = entry.printer_name || 'Unknown';
        const pageNumber = Number.parseInt(match[1], 10);
        if (Number.isNaN(pageNumber)) {
            return;
        }

        if (!currentPageSegment || currentPageSegment.printer_name !== printerName) {
            currentPageSegment = {
                printer_name: printerName,
                pages: [],
            };
            pageSegments.push(currentPageSegment);
        }

        if (!currentPageSegment.pages.includes(pageNumber)) {
            currentPageSegment.pages.push(pageNumber);
        }
    });

    if (pageSegments.length > 0) {
        return pageSegments;
    }

    const segments = [];
    let currentPrinter = null;

    for (let i = 0; i < history.length; i++) {
        const entry = history[i];

        if (entry.status === 'Assigned') {
            currentPrinter = entry.printer_name;
        } else if (entry.status.startsWith('Error') || entry.status.startsWith('Timeout') || entry.status.startsWith('Failed')) {
            if (currentPrinter) {
                segments.push({
                    printer_name: currentPrinter,
                    status: 'error',
                    error_detail: entry.status,
                });
            }
            currentPrinter = null;
        } else if (entry.status === 'Rerouted') {
            // Rerouted to a new printer
            if (currentPrinter) {
                segments.push({
                    printer_name: currentPrinter,
                    status: 'rerouted',
                });
            }
            currentPrinter = entry.printer_name;
        }
    }

    // Add the current/last segment if printing is ongoing or finished
    if (currentPrinter && (doc.doc_status === 'Printing' || doc.doc_status === 'Finished')) {
        segments.push({
            printer_name: currentPrinter,
            status: doc.doc_status === 'Finished' ? 'completed' : 'printing',
        });
    }

    return segments;
}

function getLatestRerouteDestination(history) {
    let latestDestination = '';

    (history || []).forEach((entry) => {
        if (entry.status === 'Rerouted' && entry.printer_name) {
            latestDestination = entry.printer_name;
        }
    });

    return latestDestination;
}

function renderCompletedSegments(segments) {
    let html = '';
    segments.forEach(segment => {
        const printerText = segment.printer_name ? ` (${escapeHtml(segment.printer_name)})` : '';
        if (Array.isArray(segment.pages) && segment.pages.length > 0) {
            html += `<div class="badge status-primary">Printed: ${formatPrintedPageRanges(segment.pages)}${printerText}</div>`;
        }
    });
    return html;
}

function renderPickupHistorySummary(doc, segments) {
    const pageSegments = (segments || []).filter(
        (segment) => Array.isArray(segment.pages) && segment.pages.length > 0
    );

    if (pageSegments.length === 0) {
        return '';
    }

    const expectedPages = Array.from(new Set(getDocumentPageList(doc.pages_num))).sort((a, b) => a - b);
    const printedPages = Array.from(
        new Set(pageSegments.flatMap((segment) => segment.pages || []).map((page) => Number(page)).filter((page) => !Number.isNaN(page)))
    ).sort((a, b) => a - b);
    const printedPrinters = Array.from(
        new Set(pageSegments.map((segment) => segment.printer_name).filter(Boolean))
    );
    const routePrinters = getRoutePrinterNames(doc.reroute_history || []);

    const coversAllExpectedPages = expectedPages.length > 0
        && expectedPages.every((page) => printedPages.includes(page));

    if (coversAllExpectedPages && printedPrinters.length === 1 && routePrinters.length <= 1) {
        return `<div class="badge status-primary">All pages printed to (${escapeHtml(printedPrinters[0])})</div>`;
    }

    let html = renderCompletedSegments(pageSegments);

    if (routePrinters.length > 1) {
        const missingRoutePrinters = routePrinters.filter((printerName) => !printedPrinters.includes(printerName));
        if (missingRoutePrinters.length > 0) {
            html += `<div class="badge status-info">Route history: ${escapeHtml(routePrinters.join(' -> '))}</div>`;
        }
    }

    return html;
}

function getRoutePrinterNames(history) {
    const routePrinters = [];

    (history || []).forEach((entry) => {
        const printerName = (entry && entry.printer_name) ? String(entry.printer_name).trim() : '';
        if (!printerName || printerName === 'Unknown') {
            return;
        }

        const status = String((entry && entry.status) || '');
        const isRouteStatus = status === 'Assigned'
            || status === 'Rerouted'
            || status.startsWith('Printed page')
            || status.startsWith('Error')
            || status.startsWith('Timeout')
            || status.startsWith('Failed');

        if (isRouteStatus && !routePrinters.includes(printerName)) {
            routePrinters.push(printerName);
        }
    });

    return routePrinters;
}

function formatPrintedPageRanges(pages) {
    const sortedPages = Array.from(new Set((pages || []).map((page) => Number(page)).filter((page) => !Number.isNaN(page)))).sort((a, b) => a - b);
    if (sortedPages.length === 0) {
        return 'Page';
    }

    const ranges = [];
    let start = sortedPages[0];
    let end = sortedPages[0];

    for (let i = 1; i < sortedPages.length; i++) {
        const page = sortedPages[i];
        if (page === end + 1) {
            end = page;
            continue;
        }
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        start = page;
        end = page;
    }

    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    const label = ranges.length > 1 ? 'Pages' : 'Page';
    return `${label} ${ranges.join(', ')}`;
}

function getDocumentPageList(pagesNum) {
    if (!pagesNum) {
        return [];
    }

    const pages = [];
    String(pagesNum).split(',').forEach((part) => {
        const trimmed = part.trim();
        if (!trimmed) {
            return;
        }

        if (trimmed.includes('-')) {
            const [start, end] = trimmed.split('-').map((value) => Number.parseInt(value, 10));
            if (Number.isNaN(start) || Number.isNaN(end)) {
                return;
            }
            for (let page = start; page <= end; page++) {
                pages.push(page);
            }
            return;
        }

        const page = Number.parseInt(trimmed, 10);
        if (!Number.isNaN(page)) {
            pages.push(page);
        }
    });

    return pages;
}

function formatCurrentPrintingBadge(doc) {
    const pageList = getDocumentPageList(doc.pages_num);
    const printedPages = new Set((doc.pages_printed || []).map((page) => Number(page)));
    // Backend prints pages in reverse order (last page first) so the output
    // stack ends up in natural reading order. The "currently printing" page is
    // therefore the HIGHEST page number that has not yet been printed.
    const remaining = pageList.filter((page) => !printedPages.has(page));
    const nextPage = remaining.length ? remaining[remaining.length - 1] : undefined;
    const printerLabel = doc.printer_name ? `${escapeHtml(doc.printer_name)} - ` : '';
    if (typeof nextPage === 'number') {
        return `${printerLabel}Now printing page ${escapeHtml(String(nextPage))}`;
    }
    return `${printerLabel}Printing...`;
}

function updateConfirmationUI(data) {
    // Update the title/subtitle based on overall status
    const titleEl = document.querySelector('.confirmation-title');
    const subtitleEl = document.querySelector('.confirmation-subtitle');
    const finishBtn = document.getElementById('finish-transaction-btn');

    if (!data.documents || data.documents.length === 0) return;

    const allPickedUp = data.documents.every(d => d.doc_status === 'Picked Up');
    const allFinished = data.documents.every(d => d.doc_status === 'Finished' || d.doc_status === 'Picked Up');
    const allTerminal = data.documents.every(d => ['Finished', 'Picked Up', 'Cancelled'].includes(d.doc_status));
    const allCancelled = data.documents.every(d => d.doc_status === 'Cancelled');
    const anyPrinting = data.documents.some(d => d.doc_status === 'Printing');
    const anyPending = data.documents.some(d => d.doc_status === 'Pending');
    const hasFinished = data.documents.some(d => d.doc_status === 'Finished');

    if (finishBtn) {
        finishBtn.dataset.mode = 'pickup';
        finishBtn.textContent = 'Picked Up All Printed Documents';
        finishBtn.style.display = 'none';
    }

    if (allPickedUp) {
        if (titleEl) titleEl.textContent = 'All done! Thank you!';
        if (subtitleEl) subtitleEl.textContent = 'All your documents have been picked up. Have a great day!';
        if (finishBtn) finishBtn.style.display = 'none';
        // Close SSE connection
        if (customerSSE) {
            customerSSE.close();
            customerSSE = null;
        }
        // Redirect to homepage after a short delay
        setTimeout(() => {
            window.location.href = '/';
        }, 3000);
    } else if (allFinished) {
        if (titleEl) titleEl.textContent = 'Printing Complete!';
        if (subtitleEl) subtitleEl.textContent = 'Your documents are ready for pickup. Pick them up from the printer trays below.';
        if (finishBtn) finishBtn.style.display = 'block';
    } else if (allCancelled) {
        if (titleEl) titleEl.textContent = 'Printing Cancelled';
        if (subtitleEl) subtitleEl.textContent = 'Your documents have reached their final cancelled state. Tap Done to close this page.';
        if (finishBtn) {
            finishBtn.dataset.mode = 'done';
            finishBtn.textContent = 'Done';
            finishBtn.style.display = 'block';
        }
    } else if (allTerminal && hasFinished) {
        if (titleEl) titleEl.textContent = 'Printing Complete!';
        if (subtitleEl) subtitleEl.textContent = 'Finished documents are ready for pickup. Any other documents have already reached their final status.';
        if (finishBtn) finishBtn.style.display = 'block';
    } else if (anyPrinting) {
        if (titleEl) titleEl.textContent = 'Payment Confirmed! Printing in progress...';
        if (subtitleEl) subtitleEl.textContent = 'Your documents are now being printed. Please wait.';
        if (finishBtn) finishBtn.style.display = 'none';
    } else if (anyPending) {
        if (titleEl) titleEl.textContent = 'Payment Confirmed! Waiting for approval...';
        if (subtitleEl) subtitleEl.textContent = 'Your documents are awaiting admin approval to start printing.';
        if (finishBtn) finishBtn.style.display = 'none';
    }

    // Show finish button only when there are finished docs to pick up
    if (finishBtn && hasFinished && !allPickedUp) {
        finishBtn.style.display = 'block';
    }
}

function pickedUpDocument(docId, force = false) {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Processing...';

    fetch('/api/picked-up-document/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify({ doc_id: docId, force })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // SSE will update the UI automatically
                console.log(`Document ${docId} marked as picked up`);
            } else {
                alert('Error: ' + (data.error || 'Failed to mark as picked up'));
                btn.disabled = false;
                btn.textContent = 'Picked Up';
            }
        })
        .catch(error => {
            console.error('Error marking as picked up:', error);
            alert('An error occurred. Please try again.');
            btn.disabled = false;
            btn.textContent = 'Picked Up';
        });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

// ============================================================
// PROBLEM REPORT WORKFLOW - Complete Implementation
// ============================================================

// State management for problem report workflow
window.problemReportState = {
    selectedDocs: [],
    currentDocIndex: 0,
    isIndividualMode: false,
    problemType: null,
    description: '',
    pageRange: 'all',
    specificPages: '',
    hasReprinted: false,
    previousStep: null,
    loadingTimeout: null
};

// Get CSRF token
function getCsrfToken() {
    return document.querySelector('[name=csrfmiddlewaretoken]')?.value ||
        document.cookie.split('; ').find(row => row.startsWith('csrftoken='))?.split('=')[1] || '';
}

// Hide all step sections
function hideAllSteps() {
    const steps = [
        'step-document-selection',
        'step-problem-type',
        'step-low-quality',
        'step-missing-pages',
        'step-other',
        'step-loading',
        'step-reprint-status',
        'step-ticket-form',
        'step-ticket-success'
    ];
    steps.forEach(stepId => {
        const el = document.getElementById(stepId);
        if (el) el.style.display = 'none';
    });
}

// Show a specific step
function showStep(stepId) {
    hideAllSteps();
    const el = document.getElementById(stepId);
    if (el) {
        // Use flex display for sections that need it
        if (el.classList.contains('problem-ticket-section')) {
            el.style.display = 'flex';
        } else {
            el.style.display = 'block';
        }
    }
}

// Show Problem Report Overlay
function showProblemReportOverlay() {
    const overlay = document.getElementById('problemReportOverlay');
    if (!overlay) return;

    // Reset state
    window.problemReportState = {
        selectedDocs: [],
        currentDocIndex: 0,
        isIndividualMode: false,
        problemType: null,
        description: '',
        pageRange: 'all',
        specificPages: '',
        hasReprinted: false,
        previousStep: null,
        loadingTimeout: null
    };

    overlay.style.display = 'flex';
    populateDocumentsList();

    // If only one document, auto-select it and skip to problem type
    const checkboxes = document.querySelectorAll('.problem-doc-checkbox');
    if (checkboxes.length === 1) {
        checkboxes[0].checked = true;
        window.problemReportState.selectedDocs = [{
            doc_id: checkboxes[0].value,
            doc_name: checkboxes[0].dataset.docname
        }];
        updateTitle('Print Error Report Form');
        proceedToProblemTypeStep();
    } else {
        showStep('step-document-selection');
        updateTitle('Print Error Report Form');
    }
}

// Hide Problem Report Overlay
function hideProblemReportOverlay() {
    const overlay = document.getElementById('problemReportOverlay');
    if (overlay) {
        overlay.style.display = 'none';

        // Clear loading timeout if any
        if (window.problemReportState.loadingTimeout) {
            clearTimeout(window.problemReportState.loadingTimeout);
        }

        // Reset all form fields
        resetFormFields();
    }
}

// Reset all form fields
function resetFormFields() {
    // Checkboxes
    document.querySelectorAll('.problem-doc-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('.problem-type-radio').forEach(r => r.checked = false);
    document.querySelectorAll('.page-range-radio').forEach(r => {
        r.checked = r.value === 'all';
    });
    document.querySelectorAll('.paper-jam-radio').forEach(r => r.checked = false);

    // Text inputs
    const fieldsToReset = [
        'specific-pages-input',
        'problem-description-quality',
        'problem-description-other',
        'ticket-customer-name',
        'ticket-email',
        'ticket-phone',
        'ticket-description'
    ];
    fieldsToReset.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const specificPagesInput = document.getElementById('specific-pages-input');
    if (specificPagesInput) specificPagesInput.disabled = true;

    // Clear proof photos
    var proofInput = document.getElementById('ticket-proof-photos');
    if (proofInput) proofInput.value = '';
    var proofPreview = document.getElementById('proof-photos-preview');
    if (proofPreview) proofPreview.innerHTML = '';
    var proofLabel = document.getElementById('proof-photos-name');
    if (proofLabel) proofLabel.textContent = 'No files chosen';
    // Clear receipt screenshot
    var receiptInput = document.getElementById('ticket-receipt-screenshot');
    if (receiptInput) receiptInput.value = '';
    var receiptLabel = document.getElementById('receipt-file-name');
    if (receiptLabel) receiptLabel.textContent = 'No file chosen';
}

// Update popup title
function updateTitle(title) {
    const titleElement = document.getElementById('problemReportTitle');
    if (titleElement) {
        titleElement.textContent = title;
    }
}

// Populate documents list
function populateDocumentsList() {
    const documentsList = document.querySelector('.problem-documents-list');
    if (!documentsList) return;

    documentsList.innerHTML = '';
    loadCustomerDocumentArchive();

    // Use SSE-sourced documents if available, otherwise fall back to DOM scraping
    let docs = [];

    if (window.customerDocuments && window.customerDocuments.length > 0) {
        // Use SSE data when available.
        docs = window.customerDocuments.filter(doc =>
            ['Pending', 'Queued', 'Printing', 'Finished', 'Cancelled', 'Picked Up'].includes(doc.doc_status)
        );
    } else if (window.customerDocumentArchive && window.customerDocumentArchive.length > 0) {
        docs = window.customerDocumentArchive.filter(doc =>
            ['Pending', 'Queued', 'Printing', 'Finished', 'Cancelled', 'Picked Up'].includes(doc.doc_status)
        );
    } else {
        // Fallback: scrape from DOM
        const docRows = document.querySelectorAll('.doc-row');
        const uniqueDocs = new Map();

        docRows.forEach(row => {
            const nameElement = row.querySelector('.doc-meta h6');
            const idElement = row.querySelector('.doc-id');

            if (nameElement && idElement) {
                const docName = nameElement.textContent.trim();
                const docId = idElement.textContent.trim().replace('#', '');

                if (!uniqueDocs.has(docId)) {
                    uniqueDocs.set(docId, { name: docName, id: docId });
                }
            }
        });

        uniqueDocs.forEach((doc, docId) => {
            docs.push({ doc_id: docId, filename: doc.name });
        });
    }

    if (docs.length === 0) {
        documentsList.innerHTML = '<div class="no-documents-msg">No documents found.</div>';
        return;
    }

    docs.forEach(doc => {
        const docId = doc.doc_id;
        const docName = doc.filename || doc.name || 'Unknown';
        const docElement = document.createElement('div');
        docElement.className = 'problem-doc-row';
        docElement.innerHTML = `
            <input type="checkbox" class="problem-doc-checkbox" value="${docId}" data-docname="${docName}">
            <div class="problem-doc-info">
                <div class="problem-doc-name">${docName}</div>
                <div class="problem-doc-id">${docId}</div>
            </div>
        `;
        documentsList.appendChild(docElement);
    });
}

// Step 1: Next from document selection
function nextProblemStep() {
    const selectedCheckboxes = document.querySelectorAll('.problem-doc-checkbox:checked');

    if (selectedCheckboxes.length === 0) {
        alert('Please select at least one document.');
        return;
    }

    // Store selected documents
    window.problemReportState.selectedDocs = [];
    selectedCheckboxes.forEach(checkbox => {
        window.problemReportState.selectedDocs.push({
            doc_id: checkbox.value,
            doc_name: checkbox.dataset.docname
        });
    });

    // If multiple documents selected, ask if they share the same issue
    if (selectedCheckboxes.length > 1) {
        hideProblemReportOverlay();
        document.getElementById('sameIssueOverlay').style.display = 'flex';
        return;
    }

    // Single document - proceed to problem type
    proceedToProblemTypeStep();
}

// Same Issue Popup handlers
function hideSameIssueOverlay() {
    document.getElementById('sameIssueOverlay').style.display = 'none';
    document.getElementById('problemReportOverlay').style.display = 'flex';
}

function handleSameIssueYes() {
    // All documents share the same issue - single report flow
    document.getElementById('sameIssueOverlay').style.display = 'none';
    document.getElementById('problemReportOverlay').style.display = 'flex';
    window.problemReportState.isIndividualMode = false;
    proceedToProblemTypeStep();
}

function handleSameIssueNo() {
    // Different issues - loop through each document
    document.getElementById('sameIssueOverlay').style.display = 'none';
    document.getElementById('problemReportOverlay').style.display = 'flex';
    window.problemReportState.isIndividualMode = true;
    window.problemReportState.currentDocIndex = 0;
    showCurrentDocumentReport();
}

// Show report form for current document in queue
function showCurrentDocumentReport() {
    const state = window.problemReportState;

    if (state.currentDocIndex >= state.selectedDocs.length) {
        // All documents processed
        alert('All problem reports have been submitted. Thank you for letting us know!');
        hideProblemReportOverlay();
        return;
    }

    const currentDoc = state.selectedDocs[state.currentDocIndex];
    updateTitle(`Print Error Report Form for ${currentDoc.doc_name}`);

    // Reset form for this document
    resetFormFields();
    state.hasReprinted = false;

    proceedToProblemTypeStep();
}

// Proceed to problem type step
function proceedToProblemTypeStep() {
    showStep('step-problem-type');
    window.problemReportState.previousStep = 'step-document-selection';
}

// Back to document selection
function backToDocumentSelection() {
    if (window.problemReportState.isIndividualMode) {
        // In individual mode, going back closes the flow
        hideProblemReportOverlay();
    } else {
        // If only one document, going back closes the overlay (no selection step to show)
        const checkboxes = document.querySelectorAll('.problem-doc-checkbox');
        if (checkboxes.length <= 1) {
            hideProblemReportOverlay();
        } else {
            showStep('step-document-selection');
        }
    }
}

// Back to problem type
function backToProblemType() {
    showStep('step-problem-type');
}

// Process problem type selection
function processProblemType() {
    const selectedType = document.querySelector('.problem-type-radio:checked');

    if (!selectedType) {
        alert('Please select a problem type.');
        return;
    }

    window.problemReportState.problemType = selectedType.value;

    switch (selectedType.value) {
        case 'quality':
            showStep('step-low-quality');
            break;
        case 'missing-pages':
            showStep('step-missing-pages');
            break;
        case 'no-print':
            // Immediately check logs for "no print" case
            checkPrintLogsAndProcess();
            break;
        case 'other':
            showStep('step-other');
            break;
    }
}

// Low Quality: Trigger reprint
function triggerLowQualityReprint() {
    const pageRangeRadio = document.querySelector('.page-range-radio:checked');
    const specificPagesInput = document.getElementById('specific-pages-input');
    const description = document.getElementById('problem-description-quality').value.trim();

    if (pageRangeRadio && pageRangeRadio.value === 'specific' && !specificPagesInput.value.trim()) {
        alert('Please specify which pages were affected.');
        specificPagesInput.focus();
        return;
    }

    if (!description) {
        alert('Please describe the issue.');
        document.getElementById('problem-description-quality').focus();
        return;
    }

    // Store values
    window.problemReportState.pageRange = pageRangeRadio ? pageRangeRadio.value : 'all';
    window.problemReportState.specificPages = specificPagesInput.value.trim();
    window.problemReportState.description = description;

    // Trigger reprint
    triggerReprint('low-quality');
}

// Missing Pages: Process user choice
function processMissingPagesChoice() {
    const paperJamRadio = document.querySelector('.paper-jam-radio:checked');

    if (!paperJamRadio) {
        alert('Please select an option.');
        return;
    }

    if (paperJamRadio.value === 'yes') {
        // Paper jam - check logs and reprint
        showLoadingScreen('Checking print logs...');
        callCheckLogsAPI('missing-pages-jam');
    } else {
        // No jam - go directly to ticket
        window.problemReportState.description = 'Pages missing - no paper jam observed';
        goToTicketForm();
    }
}

// Check print logs and process
function checkPrintLogsAndProcess() {
    showLoadingScreen('Checking print logs...');
    callCheckLogsAPI('no-print');
}

// Show loading screen
function showLoadingScreen(message) {
    showStep('step-loading');
    document.getElementById('loading-main-text').textContent = message;
    const subText = document.getElementById('loading-sub-text');
    subText.style.display = 'none';

    // Check if current document has >10 pages and show extra hint
    const state = window.problemReportState;
    const currentDoc = state.isIndividualMode
        ? state.selectedDocs[state.currentDocIndex]
        : state.selectedDocs[0];

    // Find page count from SSE data
    let totalPages = 0;
    if (window.customerDocuments && currentDoc) {
        const docData = window.customerDocuments.find(d => d.doc_id === currentDoc.doc_id);
        if (docData) totalPages = docData.total_pages || 0;
    }

    if (totalPages > 10) {
        subText.textContent = `Your document has ${totalPages} pages — this might take a while, please wait`;
        subText.style.display = 'block';
    } else {
        // Show generic "please wait" message after 3 seconds
        window.problemReportState.loadingTimeout = setTimeout(() => {
            subText.textContent = 'Please wait, it might take a while';
            subText.style.display = 'block';
        }, 3000);
    }
}

// Call API to check logs
function callCheckLogsAPI(reason) {
    const state = window.problemReportState;
    const currentDoc = state.isIndividualMode
        ? state.selectedDocs[state.currentDocIndex]
        : state.selectedDocs[0];

    fetch('/api/check-print-logs/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify({
            doc_id: currentDoc.doc_id,
            reason: reason
        })
    })
        .then(response => response.json())
        .then(data => {
            clearTimeout(window.problemReportState.loadingTimeout);

            if (data.can_reprint) {
                // Document can be reprinted
                triggerReprint(reason);
            } else {
                // Cannot reprint - go to ticket form
                if (data.reason) {
                    window.problemReportState.description = data.reason;
                }
                goToTicketForm();
            }
        })
        .catch(error => {
            console.error('Error checking logs:', error);
            clearTimeout(window.problemReportState.loadingTimeout);
            alert('Error checking print logs. Please try again.');
            backToProblemType();
        });
}

// Trigger reprint API call
function triggerReprint(reason) {
    const state = window.problemReportState;

    // Check if already reprinted
    if (state.hasReprinted) {
        goToTicketForm();
        return;
    }

    showLoadingScreen('Reprinting document...');

    const currentDoc = state.isIndividualMode
        ? state.selectedDocs[state.currentDocIndex]
        : state.selectedDocs[0];

    const reprintData = {
        doc_id: currentDoc.doc_id,
        reason: reason,
        page_range: state.pageRange,
        specific_pages: state.specificPages,
        description: state.description
    };

    // For multiple docs in same-issue mode, include all doc IDs
    if (!state.isIndividualMode && state.selectedDocs.length > 1) {
        reprintData.doc_ids = state.selectedDocs.map(d => d.doc_id);
    }

    fetch('/api/trigger-reprint/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify(reprintData)
    })
        .then(response => response.json())
        .then(data => {
            clearTimeout(window.problemReportState.loadingTimeout);
            state.hasReprinted = true;

            if (data.success) {
                showReprintStatus(data.message, data.details || '');
            } else {
                alert('Reprint failed: ' + (data.error || 'Unknown error'));
                goToTicketForm();
            }
        })
        .catch(error => {
            console.error('Error triggering reprint:', error);
            clearTimeout(window.problemReportState.loadingTimeout);
            alert('Error triggering reprint. Please submit a ticket.');
            goToTicketForm();
        });
}

// Show reprint status screen
function showReprintStatus(message, details) {
    showStep('step-reprint-status');
    document.getElementById('reprint-status-message').textContent = message;
    document.getElementById('reprint-status-details').textContent = details;
}

// Mark as resolved (All Goods clicked)
function markAsResolved() {
    const state = window.problemReportState;

    if (state.isIndividualMode) {
        // Move to next document
        state.currentDocIndex++;
        showCurrentDocumentReport();
    } else {
        // Single report - close
        hideProblemReportOverlay();
    }
}

// Go to ticket form
function goToTicketForm() {
    // Capture description from problem type textareas if not already set
    const state = window.problemReportState;
    if (!state.description) {
        if (state.problemType === 'other') {
            const otherDesc = document.getElementById('problem-description-other');
            if (otherDesc && otherDesc.value.trim()) {
                state.description = otherDesc.value.trim();
            }
        } else if (state.problemType === 'quality') {
            const qualityDesc = document.getElementById('problem-description-quality');
            if (qualityDesc && qualityDesc.value.trim()) {
                state.description = qualityDesc.value.trim();
            }
        }
    }
    showStep('step-ticket-form');
    showTicketSubstep('ticket-step-contact');
    prefillTicketForm();
}

// Show a specific ticket sub-step
function showTicketSubstep(stepId) {
    document.querySelectorAll('.ticket-substep').forEach(function(el) {
        el.style.display = 'none';
    });
    var el = document.getElementById(stepId);
    if (el) el.style.display = 'flex';
}

// Navigate to next ticket sub-step with validation
function nextTicketStep(fromStep) {
    if (fromStep === 1) {
        var name = document.getElementById('ticket-customer-name').value.trim();
        var email = document.getElementById('ticket-email').value.trim();
        var phone = document.getElementById('ticket-phone').value.trim();

        if (!name) {
            alert('Please enter your name.');
            document.getElementById('ticket-customer-name').focus();
            return;
        }
        if (!email) {
            alert('Please enter your email address.');
            document.getElementById('ticket-email').focus();
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            alert('Please enter a valid email address.');
            document.getElementById('ticket-email').focus();
            return;
        }
        if (!phone) {
            alert('Please enter your phone number.');
            document.getElementById('ticket-phone').focus();
            return;
        }
        if (!/^09\d{9}$/.test(phone)) {
            alert('Please enter a valid Philippine mobile number (e.g. 09171234567).');
            document.getElementById('ticket-phone').focus();
            return;
        }
        showTicketSubstep('ticket-step-proof');
    } else if (fromStep === 2) {
        var receiptCode = document.getElementById('ticket-receipt-code').value.trim();
        var receiptFile = document.getElementById('ticket-receipt-screenshot').files[0];

        if (!receiptCode) {
            alert('Please enter the receipt code from your payment receipt.');
            document.getElementById('ticket-receipt-code').focus();
            return;
        }
        if (!receiptFile) {
            alert('Please upload a screenshot of your payment receipt.');
            return;
        }
        var proofFiles = document.getElementById('ticket-proof-photos').files;
        if (!proofFiles || proofFiles.length === 0) {
            alert('Please upload at least one proof photo of the issue.');
            return;
        }
        // Skip description step if already captured from problem type (e.g. "Other")
        var state = window.problemReportState;
        if (state.description) {
            document.getElementById('ticket-description').value = state.description;
            submitTicketForm();
        } else {
            showTicketSubstep('ticket-step-describe');
        }
    }
}

// Navigate to previous ticket sub-step
function prevTicketStep(fromStep) {
    if (fromStep === 2) {
        showTicketSubstep('ticket-step-contact');
    } else if (fromStep === 3) {
        showTicketSubstep('ticket-step-proof');
    }
}

// Prefill ticket form with known data
function prefillTicketForm() {
    const state = window.problemReportState;
    const docs = state.selectedDocs || [];
    const currentDoc = state.isIndividualMode
        ? docs[state.currentDocIndex]
        : docs[0];

    // Customer ID from page
    const customerIdElement = document.querySelector('.customer-id-value');
    const customerId = customerIdElement ? customerIdElement.textContent.trim() : '';

    document.getElementById('ticket-customer-id').value = customerId;

    // Handle multi-document display
    if (!state.isIndividualMode && docs.length > 1) {
        // Multiple documents — show comma-separated IDs and count
        const allIds = docs.map(d => d.doc_id).join(', ');
        document.getElementById('ticket-document-id').value = allIds;
        document.getElementById('ticket-document-name').value = `${docs.length} documents selected`;
    } else {
        document.getElementById('ticket-document-id').value = currentDoc.doc_id;
        document.getElementById('ticket-document-name').value = currentDoc.doc_name;
    }

    // Prefill description if we have one
    if (state.description) {
        document.getElementById('ticket-description').value = state.description;
    }
}

// Back from ticket form
function backFromTicketForm() {
    // Go back to the appropriate step based on problem type
    switch (window.problemReportState.problemType) {
        case 'quality':
            showStep('step-low-quality');
            break;
        case 'missing-pages':
            showStep('step-missing-pages');
            break;
        case 'no-print':
        case 'other':
        default:
            showStep('step-problem-type');
            break;
    }
}

// Submit ticket form
function submitTicketForm() {
    const customerName = document.getElementById('ticket-customer-name').value.trim();
    const email = document.getElementById('ticket-email').value.trim();
    const phoneNumber = document.getElementById('ticket-phone').value.trim();
    const receiptCode = document.getElementById('ticket-receipt-code').value.trim();
    const receiptFile = document.getElementById('ticket-receipt-screenshot').files[0];
    const description = document.getElementById('ticket-description').value.trim();

    if (!description) {
        alert('Please describe the issue.');
        document.getElementById('ticket-description').focus();
        return;
    }

    const state = window.problemReportState;
    const currentDoc = state.isIndividualMode
        ? state.selectedDocs[state.currentDocIndex]
        : state.selectedDocs[0];

    // Use FormData for file upload
    var formData = new FormData();
    formData.append('customer_id', document.getElementById('ticket-customer-id').value);
    formData.append('document_id', currentDoc.doc_id);
    formData.append('document_name', currentDoc.doc_name);
    formData.append('customer_name', customerName);
    formData.append('email', email);
    formData.append('phone_number', phoneNumber);
    formData.append('problem_type', state.problemType);
    formData.append('description', description);
    formData.append('page_range', state.pageRange);
    formData.append('specific_pages', state.specificPages || '');
    formData.append('reprinted', state.hasReprinted ? 'true' : 'false');
    formData.append('receipt_code', receiptCode);
    formData.append('receipt_screenshot', receiptFile);
    var proofPhotos = document.getElementById('ticket-proof-photos').files;
    for (var i = 0; i < proofPhotos.length; i++) {
        formData.append('proof_photos', proofPhotos[i]);
    }
    var gcashNumber = document.getElementById('ticket-gcash-number');
    if (gcashNumber && gcashNumber.value.trim()) {
        formData.append('gcash_number', gcashNumber.value.trim());
    }

    // For multiple docs in same-issue mode
    if (!state.isIndividualMode && state.selectedDocs.length > 1) {
        formData.append('documents', JSON.stringify(state.selectedDocs));
    }

    showLoadingScreen('Submitting ticket...');

    fetch('/api/submit-ticket/', {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCsrfToken()
        },
        body: formData
    })
        .then(response => response.json())
        .then(data => {
            clearTimeout(window.problemReportState.loadingTimeout);

            if (data.success) {
                showTicketSuccess(data.ticket_number || '#TKT-0000');
            } else {
                alert('Error submitting ticket: ' + (data.error || 'Unknown error'));
                showStep('step-ticket-form');
            }
        })
        .catch(error => {
            console.error('Error submitting ticket:', error);
            clearTimeout(window.problemReportState.loadingTimeout);
            alert('Error submitting ticket. Please try again.');
            showStep('step-ticket-form');
        });
}

// Show ticket success screen
function showTicketSuccess(ticketNumber) {
    showStep('step-ticket-success');
    document.getElementById('ticket-number').textContent = ticketNumber;
}

// Finish ticket process
function finishTicketProcess() {
    const state = window.problemReportState;

    if (state.isIndividualMode) {
        // Move to next document
        state.currentDocIndex++;
        state.hasReprinted = false;
        showCurrentDocumentReport();
    } else {
        // Single report - close
        hideProblemReportOverlay();
    }
}

// Page range radio button handlers
document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('change', function (e) {
        if (e.target.classList.contains('page-range-radio')) {
            const specificPagesInput = document.getElementById('specific-pages-input');
            if (specificPagesInput) {
                if (e.target.value === 'specific') {
                    specificPagesInput.disabled = false;
                    specificPagesInput.focus();
                } else {
                    specificPagesInput.disabled = true;
                    specificPagesInput.value = '';
                }
            }
        }
    });
});

// Print Quality Overlay Functions
function showPrintQualityOverlay() {
    const overlay = document.getElementById('printQualityOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
    }
}

function hidePrintQualityOverlay() {
    const overlay = document.getElementById('printQualityOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function reportPrintError() {
    hidePrintQualityOverlay();
    showProblemReportOverlay();
}

function confirmAllGood() {
    // Check if any documents are NOT finished printing yet
    var docs = window.customerDocuments || [];
    var unfinishedDocs = docs.filter(function(d) {
        return d.doc_status !== 'Finished' && d.doc_status !== 'Picked Up';
    });

    var forcePickup = false;

    if (unfinishedDocs.length > 0) {
        // Build warning message listing unfinished documents
        var docList = unfinishedDocs.map(function(d) {
            var statusText = d.doc_status || 'Unknown';
            if (statusText === 'Queued') statusText = 'Waiting';
            if (statusText === 'Printing') statusText = 'Printing...';
            if (statusText === 'Cancelled') statusText = 'Cancelled';
            return '• ' + (d.filename || d.doc_id) + ' — ' + statusText;
        }).join('\n');

        var confirmed = confirm(
            '⚠️ Some documents are not yet finished printing:\n\n' +
            docList + '\n\n' +
            'If you proceed, ALL documents will be marked as picked up and their files will be permanently deleted from the server. ' +
            'Unfinished documents will NOT be printed.\n\n' +
            'Are you sure you want to proceed?'
        );

        if (!confirmed) {
            return;  // User cancelled — don't proceed
        }
        forcePickup = true;
    }

    hasProceeded = true;
    hidePrintQualityOverlay();

    const customerIdEl = document.getElementById('customer-id-data');
    const customerId = customerIdEl ? customerIdEl.value : '';

    if (!customerId) {
        // Fallback: just redirect
        var overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'flex';
        redirectHomeAfterSessionClear();
        return;
    }

    // Call finish-transaction API to mark all finished docs as picked up and delete files
    var overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'flex';

    fetch('/api/finish-transaction/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify({ customer_id: customerId, force: forcePickup })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log(`Finished transaction: ${data.picked_up_count} docs picked up`);
                // Redirect immediately — documents are deleted so SSE can't detect the change
                redirectHomeAfterSessionClear(1500);
            } else {
                console.warn('Finish transaction warning:', data.error);
                redirectHomeAfterSessionClear();
            }
        })
        .catch(error => {
            console.error('Error finishing transaction:', error);
            redirectHomeAfterSessionClear();
        });
}

// ============================================================
// FEEDBACK POPUP FUNCTIONS
// ============================================================

function showFeedbackOverlay() {
    const overlay = document.getElementById('feedbackOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
        // Reset to form step
        document.getElementById('step-feedback-form').style.display = 'block';
        document.getElementById('step-feedback-success').style.display = 'none';
        // Reset form fields
        document.getElementById('feedback-name').value = '';
        document.getElementById('feedback-message').value = '';
    }
}

function hideFeedbackOverlay() {
    const overlay = document.getElementById('feedbackOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function submitFeedbackForm() {
    const name = document.getElementById('feedback-name').value.trim();
    const message = document.getElementById('feedback-message').value.trim();

    if (!message) {
        alert('Please enter your message.');
        document.getElementById('feedback-message').focus();
        return;
    }

    // Submit via API - category defaults to 'Comment'
    fetch('/api/feedback-submit/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify({
            name: name,
            message: message,
            category: 'Comment'
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Show success message
                document.getElementById('step-feedback-form').style.display = 'none';
                document.getElementById('step-feedback-success').style.display = 'block';
            } else {
                alert('Error: ' + (data.error || 'Failed to submit feedback'));
            }
        })
        .catch(error => {
            console.error('Error submitting feedback:', error);
            alert('An error occurred. Please try again.');
        });
}

// ============================================================
// SCROLL REVEAL ANIMATIONS (index.html)
// ============================================================
(function initScrollReveal() {
    // Only run on the index/landing page
    if (!document.querySelector('.file-upload')) return;

    // Elements to animate on scroll (everything below the hero upload area)
    const revealSelectors = [
        '.section-container',
        '.card-container > .card',
        '.faq-card-section > .faq-card',
        '.aboutus-section',
        '.feedback-container',
        '.footer-section'
    ];

    // Tag each element with the scroll-reveal class + stagger delays for groups
    revealSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el, index) => {
            el.classList.add('scroll-reveal');
            // Add stagger delay for card and FAQ groups
            if (selector.includes('.card') || selector.includes('.faq-card')) {
                const delayClass = 'delay-' + Math.min(index + 1, 6);
                el.classList.add(delayClass);
            }
        });
    });

    // Intersection Observer to trigger reveal
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                observer.unobserve(entry.target); // Only animate once

                // After reveal animation completes, remove scroll-reveal classes
                // so the element's original hover transitions (transform, box-shadow, etc.) work again
                const el = entry.target;
                let totalTime = 700; // Base animation duration (0.7s)
                for (let i = 1; i <= 6; i++) {
                    if (el.classList.contains('delay-' + i)) {
                        totalTime += i * 100;
                        break;
                    }
                }
                setTimeout(() => {
                    el.classList.remove('scroll-reveal', 'revealed',
                        'delay-1', 'delay-2', 'delay-3', 'delay-4', 'delay-5', 'delay-6');
                }, totalTime + 100); // +100ms buffer
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px'
    });

    document.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el));
})();

/* ======================== */
/*  Track Status Form       */
/* ======================== */
(function() {
    const trackForm = document.getElementById('track-status-form');
    if (!trackForm) return;

    trackForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const input = document.getElementById('track-cid-input').value.trim().toUpperCase();
        const errorDiv = document.getElementById('track-status-error');
        const voucherResult = document.getElementById('track-voucher-result');
        const btn = document.querySelector('.track-status-btn');

        if (!input) return;

        // Hide previous results
        errorDiv.style.display = 'none';
        if (voucherResult) voucherResult.style.display = 'none';
        btn.disabled = true;
        btn.textContent = 'Checking...';

        // Detect: CID (starts with CID- or looks like a customer ID) vs Voucher code
        const isCID = /^CID[-\s]?\d+$/i.test(input) || /^\d{4,}$/.test(input);

        if (isCID) {
            // CID flow — validate and redirect
            fetch('/api/validate-cid/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customer_id: input })
            })
            .then(res => res.json())
            .then(data => {
                if (data.valid) {
                    if (data.redirect === 'payment' && data.doc_ids && data.doc_ids.length > 0) {
                        var docParams = data.doc_ids.map(function(id) {
                            return 'doc_ids=' + encodeURIComponent(id);
                        }).join('&');
                        window.location.href = '/payment/?customer_id=' + encodeURIComponent(data.customer_id || input) + '&' + docParams;
                    } else {
                        window.location.href = '/confirmation/' + encodeURIComponent(input) + '/';
                    }
                } else {
                    errorDiv.textContent = 'No printing session found for this Customer ID.';
                    errorDiv.style.display = 'block';
                    btn.disabled = false;
                    btn.textContent = 'Check';
                }
            })
            .catch(() => {
                errorDiv.textContent = 'Connection error. Please try again.';
                errorDiv.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Check';
            });
        } else {
            // Voucher flow — check voucher balance/validity
            fetch('/api/check-voucher/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: input })
            })
            .then(res => res.json())
            .then(data => {
                btn.disabled = false;
                btn.textContent = 'Check';
                if (data.success) {
                    // Show voucher result card
                    document.getElementById('voucher-result-balance').textContent = '₱' + parseFloat(data.balance).toFixed(2) + ' available';
                    document.getElementById('voucher-result-code').textContent = data.code;
                    document.getElementById('voucher-result-status').textContent = 'Active — use on your next print!';
                    document.getElementById('voucher-result-expiry').textContent = 'Valid until ' + data.expires_at;
                    voucherResult.style.display = 'block';
                } else {
                    errorDiv.textContent = data.error || 'No voucher found for this code.';
                    errorDiv.style.display = 'block';
                }
            })
            .catch(() => {
                errorDiv.textContent = 'Connection error. Please try again.';
                errorDiv.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Check';
            });
        }
    });
})();

// Receipt screenshot file input: show selected file name
document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'ticket-receipt-screenshot') {
        const label = document.getElementById('receipt-file-name');
        if (label) {
            label.textContent = e.target.files.length > 0 ? e.target.files[0].name : 'No file chosen';
        }
    }
    if (e.target && e.target.id === 'payment-ticket-receipt-screenshot') {
        const label = document.getElementById('payment-ticket-receipt-file-name');
        if (label) {
            label.textContent = e.target.files.length > 0 ? e.target.files[0].name : 'No file chosen';
        }
    }
    // Proof photos file input: show count and thumbnail previews
    if (e.target && e.target.id === 'ticket-proof-photos') {
        const label = document.getElementById('proof-photos-name');
        const preview = document.getElementById('proof-photos-preview');
        const files = e.target.files;
        if (label) {
            label.textContent = files.length > 0 ? files.length + ' file(s) selected' : 'No files chosen';
        }
        if (preview) {
            preview.innerHTML = '';
            for (var i = 0; i < files.length; i++) {
                (function(file, idx) {
                    var thumb = document.createElement('div');
                    thumb.className = 'proof-thumb';
                    var img = document.createElement('img');
                    img.alt = 'Proof ' + (idx + 1);
                    var reader = new FileReader();
                    reader.onload = function(ev) { img.src = ev.target.result; };
                    reader.readAsDataURL(file);
                    thumb.appendChild(img);
                    preview.appendChild(thumb);
                })(files[i], i);
            }
        }
    }
    // GCash "Same as Contact Number" checkbox
    if (e.target && e.target.id === 'gcash-same-as-phone') {
        var gcashInput = document.getElementById('ticket-gcash-number');
        var phoneInput = document.getElementById('ticket-phone');
        if (gcashInput && phoneInput) {
            if (e.target.checked) {
                gcashInput.value = phoneInput.value;
                gcashInput.readOnly = true;
                gcashInput.style.backgroundColor = '#f5f5f5';
            } else {
                gcashInput.readOnly = false;
                gcashInput.style.backgroundColor = '';
            }
        }
    }
});

// Keep GCash synced with phone when checkbox is checked
document.addEventListener('input', function(e) {
    if (e.target && e.target.id === 'ticket-phone') {
        // Strip non-digits
        e.target.value = e.target.value.replace(/\D/g, '');
        var cb = document.getElementById('gcash-same-as-phone');
        if (cb && cb.checked) {
            var gcashInput = document.getElementById('ticket-gcash-number');
            if (gcashInput) gcashInput.value = e.target.value;
        }
    }
    // GCash number: digits only
    if (e.target && e.target.id === 'ticket-gcash-number') {
        e.target.value = e.target.value.replace(/\D/g, '');
    }
});

// =========================================================================
// PAYMENT PAGE LOGIC
// =========================================================================
(function () {
    // Only run on payment page
    if (!window.PAYMENT_DATA) return;

    const PAYMENT = window.PAYMENT_DATA;
    const GCASH_WEBSITE_URL = 'https://www.gcash.com/';
    const GCASH_APP_URL = 'gcash://';
    const GCASH_ANDROID_PACKAGE = 'com.globe.gcash.android';
    const GCASH_ANDROID_INTENT_URL = 'intent://open/#Intent;scheme=gcash;package=com.globe.gcash.android;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.globe.gcash.android;end';
    const PAYMENT_CACHE_KEY_PREFIX = 'pending_payment:';
    let pollInterval = null;
    let pollAttempts = 0;
    let maxPollAttempts = Math.ceil(((PAYMENT.paymentConfig?.paymentExpiryMinutes || 10) * 60) / 5);
    let paymentOpenUrl = 'gcash://';
    let currentPaymentIntentId = PAYMENT.pendingIntent?.intent_id || null;
    let appliedVoucherCode = null;
    let appliedCreditAmount = 0;
    let cachedPendingPayment = null;

    function showPaymentStep2() {
        const step1 = document.getElementById('payment-step-1');
        const voucherSection = document.getElementById('voucher-section');
        const discountSummary = document.getElementById('discount-summary');
        const step2 = document.getElementById('payment-step-2');

        if (step1) step1.style.display = 'none';
        if (voucherSection) voucherSection.style.display = 'none';
        if (discountSummary) discountSummary.style.display = 'none';
        if (step2) step2.style.display = 'flex';
    }

    function getNormalizedPaymentDocIds() {
        return (PAYMENT.docIds || []).map(function (docId) {
            return String(docId || '').trim();
        }).filter(Boolean).sort();
    }

    function getPaymentCacheKey() {
        return PAYMENT_CACHE_KEY_PREFIX + String(PAYMENT.customerId || '').trim() + ':' + getNormalizedPaymentDocIds().join(',');
    }

    function clearPaymentCache() {
        try {
            localStorage.removeItem(getPaymentCacheKey());
            localStorage.removeItem('pending_payment');
        } catch (error) {
            // Ignore storage cleanup errors.
        }
        cachedPendingPayment = null;
    }

    function savePaymentCache(source) {
        if (!source) {
            return;
        }

        const expiresAt = source.expires_at || source.expiresAt || null;
        const phoneValue = source.phone_number || document.getElementById('phone-number')?.value?.replace(/\s/g, '').trim() || '';
        const intentId = source.intent_id || source.payment_intent_id || currentPaymentIntentId;

        if (!intentId || !expiresAt) {
            return;
        }

        const payload = {
            customer_id: PAYMENT.customerId,
            doc_ids: getNormalizedPaymentDocIds(),
            intent_id: intentId,
            phone_number: phoneValue,
            amount: Number(source.amount || Math.max(0, PAYMENT.totalPrice - appliedCreditAmount)),
            recipient_name: source.recipient_name || PAYMENT.paymentConfig?.recipientName || '',
            recipient_number: source.recipient_number || PAYMENT.paymentConfig?.recipientNumber || '',
            recipient_qr_url: source.recipient_qr_url || PAYMENT.paymentConfig?.recipientQrUrl || '',
            payment_expiry_minutes: source.payment_expiry_minutes || PAYMENT.paymentConfig?.paymentExpiryMinutes || 10,
            expires_at: expiresAt,
            open_url: source.open_url || paymentOpenUrl || 'gcash://',
        };

        try {
            localStorage.setItem(getPaymentCacheKey(), JSON.stringify(payload));
            cachedPendingPayment = payload;
        } catch (error) {
            // Ignore storage quota or privacy mode failures.
        }
    }

    function loadPaymentCache() {
        try {
            const raw = localStorage.getItem(getPaymentCacheKey());
            if (!raw) {
                return null;
            }

            const parsed = JSON.parse(raw);
            const sameCustomer = String(parsed.customer_id || '').trim() === String(PAYMENT.customerId || '').trim();
            const sameDocs = JSON.stringify((parsed.doc_ids || []).slice().sort()) === JSON.stringify(getNormalizedPaymentDocIds());
            const expiresAtMs = Date.parse(parsed.expires_at || '');

            if (!sameCustomer || !sameDocs || !expiresAtMs || expiresAtMs <= Date.now()) {
                clearPaymentCache();
                return null;
            }

            cachedPendingPayment = parsed;
            return parsed;
        } catch (error) {
            clearPaymentCache();
            return null;
        }
    }

    function restorePendingPaymentAttempt(source) {
        if (!source) {
            return false;
        }

        const phoneInput = document.getElementById('phone-number');
        if (phoneInput && source.phone_number) {
            phoneInput.value = source.phone_number;
        }

        currentPaymentIntentId = source.intent_id || currentPaymentIntentId;
        showPaymentStep2();
        setPaymentInstructions(source);
        savePaymentCache(source);
        startAutoPolling();
        return true;
    }

    /** Show full-screen loading overlay */
    function showOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'flex';
    }

    /** Hide full-screen loading overlay */
    function hideOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    function isAndroidDevice() {
        return /Android/i.test(navigator.userAgent || '');
    }

    async function copyTextWithFallback(text) {
        if (!text) {
            return false;
        }

        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (error) {
                // Fall through to textarea-based copy.
            }
        }

        try {
            const helper = document.createElement('textarea');
            helper.value = text;
            helper.setAttribute('readonly', 'readonly');
            helper.style.position = 'fixed';
            helper.style.opacity = '0';
            helper.style.pointerEvents = 'none';
            document.body.appendChild(helper);
            helper.focus();
            helper.select();
            helper.setSelectionRange(0, helper.value.length);
            const copied = document.execCommand('copy');
            document.body.removeChild(helper);
            return copied;
        } catch (error) {
            return false;
        }
    }

    function getPaymentDocuments() {
        if (Array.isArray(PAYMENT.documents) && PAYMENT.documents.length > 0) {
            return PAYMENT.documents;
        }

        return (PAYMENT.docIds || []).map(function (docId) {
            return {
                docId: docId,
                name: docId,
            };
        });
    }

    function getPaymentTicketSummary() {
        const docs = getPaymentDocuments();
        const recipientNumber = document.getElementById('payment-recipient-number')?.textContent?.trim() || PAYMENT.paymentConfig?.recipientNumber || '';
        const expectedAmount = document.getElementById('payment-send-amount')?.textContent?.trim() || ('₱' + Number(Math.max(0, PAYMENT.totalPrice - appliedCreditAmount)).toFixed(2));
        const payerNumber = document.getElementById('phone-number')?.value?.replace(/\D/g, '').trim() || '';
        return {
            docs: docs,
            recipientNumber: recipientNumber,
            expectedAmount: expectedAmount,
            payerNumber: payerNumber,
        };
    }

    function setPaymentTicketStatus(message, tone) {
        const statusEl = document.getElementById('payment-ticket-status');
        if (!statusEl) {
            return;
        }

        if (!message) {
            statusEl.style.display = 'none';
            statusEl.textContent = '';
            statusEl.style.color = '';
            return;
        }

        statusEl.style.display = 'block';
        statusEl.textContent = message;
        statusEl.style.color = tone === 'success' ? '#166534' : '#b91c1c';
    }

    function populatePaymentTicketDefaults() {
        const phoneInput = document.getElementById('phone-number');
        const ticketPhone = document.getElementById('payment-ticket-phone');
        const ticketGcash = document.getElementById('payment-ticket-gcash-number');
        const normalizedPhone = phoneInput?.value?.replace(/\D/g, '').trim() || '';

        if (ticketPhone && !ticketPhone.value.trim() && normalizedPhone) {
            ticketPhone.value = normalizedPhone;
        }

        if (ticketGcash && !ticketGcash.value.trim() && normalizedPhone) {
            ticketGcash.value = normalizedPhone;
        }
    }

    function buildPaymentIssueDescription() {
        const issueTypeEl = document.getElementById('payment-ticket-issue');
        const notesEl = document.getElementById('payment-ticket-notes');
        const ticketGcashEl = document.getElementById('payment-ticket-gcash-number');
        const summary = getPaymentTicketSummary();
        const issueLabels = {
            'wrong-amount': 'Wrong amount sent',
            'wrong-recipient': 'Sent to the wrong GCash number',
            'not-detected': 'Payment not auto-detected',
            'gcash-launch': 'Open GCash button did not open the app correctly',
            'other': 'Other payment concern',
        };
        const issueValue = issueTypeEl?.value || 'other';
        const noteValue = notesEl?.value?.trim() || '';
        const payerGcashNumber = ticketGcashEl?.value?.replace(/\D/g, '').trim() || summary.payerNumber || 'Not provided';
        const lines = [
            'Payment issue reported from payment page.',
            'Issue type: ' + (issueLabels[issueValue] || issueLabels.other),
            'Customer ID: #' + PAYMENT.customerId,
            'Document IDs: ' + summary.docs.map(function (doc) { return doc.docId; }).join(', '),
            'Expected Amount: ' + summary.expectedAmount,
            'Recipient Number: ' + (summary.recipientNumber || 'Not available'),
            'Customer GCash Number: ' + payerGcashNumber,
        ];

        if (noteValue) {
            lines.push('Customer note: ' + noteValue);
        }

        lines.push('Customer requested personnel follow-up from the payment page.');
        return lines.join('\n');
    }

    function setPaymentTicketSubmitting(isSubmitting) {
        const submitBtn = document.getElementById('payment-ticket-submit-btn');
        if (!submitBtn) {
            return;
        }

        submitBtn.disabled = isSubmitting;
        submitBtn.textContent = isSubmitting ? 'Creating Ticket...' : 'Create Ticket';
    }

    /** Update the displayed charge amount and button text based on credit */
    function updatePriceDisplay(creditAmount, creditCode) {
        const total = PAYMENT.totalPrice;
        const balanceDue = Math.max(0, total - creditAmount);
        const chargeAmount = balanceDue;

        // Update amount display
        const amountEl = document.getElementById('display-amount');
        const labelEl = document.getElementById('amount-label');
        const btn = document.getElementById('pay-now-btn');
        const phoneSection = document.getElementById('phone-section');
        const step1Title = document.getElementById('step1-title');
        const step1Hint = document.getElementById('step1-hint');
        const discountSummary = document.getElementById('discount-summary');

        if (creditAmount > 0) {
            // Show discount breakdown
            discountSummary.style.display = 'block';
            document.getElementById('original-total-display').textContent = '\u20B1' + total.toFixed(2);
            document.getElementById('credit-applied-display').textContent = '-\u20B1' + creditAmount.toFixed(2);
            document.getElementById('final-charge-display').textContent = '\u20B1' + chargeAmount.toFixed(2);
        } else {
            discountSummary.style.display = 'none';
        }

        if (balanceDue <= 0) {
            // Fully covered by credit — no payment needed
            amountEl.textContent = '\u20B10.00';
            labelEl.textContent = 'Covered by Credit';
            btn.textContent = 'Print Now (Using Credit)';
            btn.type = 'button';
            btn.onclick = function () { initiatePayment(); };
            if (phoneSection) phoneSection.style.display = 'none';
            if (step1Title) step1Title.textContent = 'Ready to Print!';
            if (step1Hint) step1Hint.textContent = 'Your voucher credit fully covers this print job.';
        } else {
            amountEl.textContent = '\u20B1' + chargeAmount.toFixed(2);
            labelEl.textContent = creditAmount > 0 ? 'Balance Due' : 'Amount to Pay';
            btn.textContent = 'Continue to GCash Details';
            btn.type = 'submit';
            btn.onclick = null;
            if (phoneSection) phoneSection.style.display = '';
            if (step1Title) step1Title.textContent = 'Pay with E-Wallet';
            if (step1Hint) step1Hint.textContent = 'Provide the GCash number you will use to send the payment.';
        }
    }

    function setPaymentInstructions(data) {
        const recipientName = data.recipient_name || PAYMENT.paymentConfig?.recipientName || 'GCash Recipient';
        const recipientNumber = data.recipient_number || PAYMENT.paymentConfig?.recipientNumber || '09XX XXX XXXX';
        const qrUrl = data.recipient_qr_url || PAYMENT.paymentConfig?.recipientQrUrl || '';
        const expiryMinutes = data.payment_expiry_minutes || PAYMENT.paymentConfig?.paymentExpiryMinutes || 10;
        const amount = Number(data.amount || Math.max(0, PAYMENT.totalPrice - appliedCreditAmount));
        currentPaymentIntentId = data.payment_intent_id || data.intent_id || currentPaymentIntentId;

        PAYMENT.paymentConfig = {
            recipientName: recipientName,
            recipientNumber: recipientNumber,
            recipientQrUrl: qrUrl,
            paymentExpiryMinutes: expiryMinutes,
        };
        paymentOpenUrl = data.open_url || 'gcash://';
        maxPollAttempts = Math.ceil((expiryMinutes * 60) / 5);

        const recipientNameEl = document.getElementById('payment-recipient-name');
        const recipientNumberEl = document.getElementById('payment-recipient-number');
        const amountEl = document.getElementById('payment-send-amount');
        const expiryEl = document.getElementById('payment-expiry-text');
        const qrEl = document.getElementById('payment-recipient-qr');
        const qrPlaceholder = document.getElementById('payment-qr-placeholder');

        if (recipientNameEl) recipientNameEl.textContent = recipientName;
        if (recipientNumberEl) recipientNumberEl.textContent = recipientNumber;
        if (amountEl) amountEl.textContent = '₱' + amount.toFixed(2);
        if (expiryEl) expiryEl.textContent = 'This payment attempt expires after ' + expiryMinutes + ' minutes.';

        if (qrEl) {
            if (qrUrl) {
                qrEl.src = qrUrl;
                qrEl.style.display = 'block';
                if (qrPlaceholder) qrPlaceholder.style.display = 'none';
            } else {
                qrEl.style.display = 'none';
                if (qrPlaceholder) qrPlaceholder.style.display = 'flex';
            }
        }

        savePaymentCache({
            intent_id: currentPaymentIntentId,
            phone_number: document.getElementById('phone-number')?.value?.replace(/\s/g, '').trim() || data.phone_number || '',
            amount: amount,
            recipient_name: recipientName,
            recipient_number: recipientNumber,
            recipient_qr_url: qrUrl,
            payment_expiry_minutes: expiryMinutes,
            expires_at: data.expires_at || PAYMENT.pendingIntent?.expires_at || null,
            open_url: paymentOpenUrl,
        });
    }

    /**
     * Toggle voucher section dropdown
     */
    window.toggleVoucherSection = function () {
        const body = document.getElementById('voucher-body');
        const chevron = document.getElementById('voucher-chevron');
        if (body.style.display === 'none') {
            body.style.display = 'block';
            chevron.classList.add('open');
        } else {
            body.style.display = 'none';
            chevron.classList.remove('open');
        }
    };

    /**
     * Apply voucher credit code
     */
    window.applyVoucher = async function () {
        const input = document.getElementById('voucher-code-input');
        const statusEl = document.getElementById('voucher-status');
        const btn = document.getElementById('apply-voucher-btn');
        const code = input.value.trim().toUpperCase();

        if (!code) {
            alert('Please enter a voucher code.');
            input.focus();
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Checking...';

        try {
            const response = await fetch('/api/check-voucher/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                },
                body: JSON.stringify({ code: code }),
            });

            const data = await response.json();

            if (data.success) {
                appliedVoucherCode = data.code;
                appliedCreditAmount = Math.min(data.balance, PAYMENT.totalPrice);

                statusEl.innerHTML =
                    '<span class="voucher-valid">\u2705 ₱' + data.balance.toFixed(2) +
                    ' credit available (expires ' + data.expires_at + ')</span>' +
                    '<button type="button" class="voucher-remove-btn" onclick="removeVoucher()">Remove</button>';
                statusEl.style.display = 'flex';
                input.disabled = true;
                btn.style.display = 'none';

                updatePriceDisplay(appliedCreditAmount, appliedVoucherCode);
            } else {
                alert(data.error);
                appliedVoucherCode = null;
                appliedCreditAmount = 0;
            }
        } catch (err) {
            alert('Network error checking voucher. Please try again.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Apply';
        }
    };

    /**
     * Remove applied voucher credit
     */
    window.removeVoucher = function () {
        appliedVoucherCode = null;
        appliedCreditAmount = 0;
        const input = document.getElementById('voucher-code-input');
        const statusEl = document.getElementById('voucher-status');
        const btn = document.getElementById('apply-voucher-btn');
        input.disabled = false;
        input.value = '';
        statusEl.style.display = 'none';
        btn.style.display = '';
        updatePriceDisplay(0, null);
    };

    /**
    * STEP 1: Initiate payment
    * Sends phone number + CID to Django → creates a payment intent → shows GCash instructions
     */
    window.initiatePayment = async function () {
        const phoneInput = document.getElementById('phone-number');
        const btn = document.getElementById('pay-now-btn');
        const balanceDue = PAYMENT.totalPrice - appliedCreditAmount;

        if (!printersAvailable) {
            if (btn) {
                btn.disabled = true;
            }
            alert('Payment is temporarily unavailable because no printers can accept this job right now.');
            return;
        }

        // If NOT fully covered by credit, validate phone number
        if (balanceDue > 0) {
            const phone = phoneInput.value.replace(/\s/g, '').trim();
            const phoneRegex = /^(\+?63|0)(9\d{9})$/;
            if (!phoneRegex.test(phone)) {
                alert('Please enter a valid Philippine phone number (e.g., 09171234567).');
                phoneInput.focus();
                return;
            }
        }

        btn.disabled = true;
        btn.textContent = 'Processing...';
        showOverlay();

        try {
            const payload = {
                action: 'initiate',
                customer_id: PAYMENT.customerId,
                doc_ids: PAYMENT.docIds,
                phone_number: balanceDue > 0 ? phoneInput.value.replace(/\s/g, '').trim() : '',
            };

            if (appliedVoucherCode) {
                payload.voucher_credit_code = appliedVoucherCode;
            }

            const response = await fetch('/payment/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (data.success) {
                if (data.mode === 'credit_only') {
                    // Fully covered by credit — skip payment, redirect to confirmation
                    // Remaining credit (if any) is shown as coupon banner on confirmation page
                    clearPaymentCache();
                    sessionStorage.clear();
                    window.location.href = data.redirect_url;
                    return;
                }

                // Normal payment flow — switch to step 2
                showPaymentStep2();
                setPaymentInstructions(data);
                startAutoPolling();
            } else {
                alert(data.error || 'Payment setup failed. Please try again.');
                btn.disabled = false;
                btn.textContent = 'Continue to GCash Details';
            }
        } catch (err) {
            alert('Network error. Please check your connection and try again.');
            btn.disabled = false;
            btn.textContent = 'Continue to GCash Details';
        } finally {
            hideOverlay();
        }
    };

    /**
     * STEP 2: Verify payment
     * Polls Django → Firestore claim matcher → if paid, redirects to confirmation
     */
    window.verifyPayment = async function () {
        const btn = document.getElementById('verify-btn');

        btn.disabled = true;
        btn.textContent = 'Checking...';
        showOverlay();

        try {
            const response = await fetch('/payment/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                },
                body: JSON.stringify({
                    action: 'verify',
                    customer_id: PAYMENT.customerId,
                    payment_intent_id: currentPaymentIntentId,
                }),
            });

            const data = await response.json();

            if (data.success) {
                stopAutoPolling();
                clearPaymentCache();
                sessionStorage.clear();
                alert(data.message || 'Payment verified! Redirecting to print queue...');
                window.location.href = data.redirect_url || '/confirmation/' + PAYMENT.customerId + '/';
            } else {
                if (data.status === 'pending' || data.status === 'expired') {
                    if (data.status === 'expired') {
                        clearPaymentCache();
                        currentPaymentIntentId = null;
                    }
                    setPaymentHelpOpen(true);
                        alert('Payment not yet detected. If you sent a different amount, tap Payment Issue? below and keep your receipt for manual review.');
                } else {
                    if (currentPaymentIntentId && /No pending payment found/i.test(String(data.error || ''))) {
                        clearPaymentCache();
                        currentPaymentIntentId = null;
                    }
                    alert(data.error || 'Verification failed.');
                }
                btn.disabled = false;
                btn.textContent = 'I Have Paid \u2713';
            }
        } catch (err) {
            alert('Network error. Please check your connection and try again.');
            btn.disabled = false;
            btn.textContent = 'I Have Paid \u2713';
        } finally {
            hideOverlay();
        }
    };

    /**
     * Auto-poll every 5 seconds to check if payment has been confirmed.
     */
    function startAutoPolling() {
        pollAttempts = 0;
        pollInterval = setInterval(async () => {
            pollAttempts++;
            if (pollAttempts > maxPollAttempts) {
                stopAutoPolling();
                return;
            }
            try {
                const response = await fetch('/payment/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCsrfToken(),
                    },
                    body: JSON.stringify({
                        action: 'verify',
                        customer_id: PAYMENT.customerId,
                        payment_intent_id: currentPaymentIntentId,
                    }),
                });
                const data = await response.json();
                if (data.success) {
                    stopAutoPolling();
                    clearPaymentCache();
                    sessionStorage.clear();
                    alert(data.message || 'Payment verified! Redirecting to print queue...');
                    window.location.href = data.redirect_url || '/confirmation/' + PAYMENT.customerId + '/';
                    return;
                }

                if (data.status === 'expired') {
                    stopAutoPolling();
                    clearPaymentCache();
                    currentPaymentIntentId = null;
                }
            } catch (e) {
                // Silently continue polling on network errors
            }
        }, 5000);
    }

    function stopAutoPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    function setPaymentHelpOpen(isOpen) {
        const panel = document.getElementById('payment-help-panel');
        const btn = document.getElementById('payment-help-btn');
        if (!panel || !btn) {
            return;
        }

        panel.style.display = isOpen ? 'block' : 'none';
        btn.textContent = isOpen
            ? 'Hide Payment Issue?'
            : 'Payment Issue?';

        if (isOpen) {
            populatePaymentTicketDefaults();
            setPaymentTicketStatus('', '');
        }
    }

    window.togglePaymentHelp = function () {
        const panel = document.getElementById('payment-help-panel');
        if (!panel) {
            return;
        }
        setPaymentHelpOpen(panel.style.display === 'none' || !panel.style.display);
    };

    window.copyPaymentHelpDetails = async function () {
        const summary = getPaymentTicketSummary();
        const helpText = [
            'SafePrint Payment Ticket Details',
            'Customer ID: #' + PAYMENT.customerId,
            'Document IDs: ' + summary.docs.map(function (doc) { return doc.docId; }).join(', '),
            'Expected Amount: ' + summary.expectedAmount,
            'My GCash Number: ' + (summary.payerNumber || 'Not provided'),
            'Recipient Number: ' + (summary.recipientNumber || 'Not available'),
            'Use this together with your receipt screenshot and reference code.',
        ].join('\n');

        try {
            const copied = await copyTextWithFallback(helpText);
            if (copied) {
                alert('Payment details copied. You can paste them into your ticket notes if needed.');
                return;
            }
            throw new Error('Copy unavailable');
        } catch (err) {
            window.prompt('Copy these payment details for your ticket:', helpText);
        }
    };

    /**
     * Cancel payment - confirms with user, deletes print job, redirects home
     */
    window.cancelPayment = function () {
        if (!confirm('Are you sure you want to cancel this payment? Your print job will be deleted and you will need to start over.')) {
            return;
        }
        stopAutoPolling();
        showOverlay();
        fetch('/payment/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken(),
            },
            body: JSON.stringify({
                action: 'cancel',
                customer_id: PAYMENT.customerId,
                doc_ids: PAYMENT.docIds,
            }),
        })
            .then(function (response) {
                return response.json();
            })
            .then(function (data) {
                if (!data.success) {
                    throw new Error(data.error || 'Could not cancel this payment attempt.');
                }

                clearPaymentCache();
                sessionStorage.clear();
                window.location.href = '/';
            })
            .catch(function (error) {
                hideOverlay();
                alert(error.message || 'Could not cancel this payment attempt. Please try again.');
            });
    };

    /**
     * Copy the recipient number so the user can paste it in GCash.
     */
    window.copyPaymentNumber = async function (suppressErrors) {
        const recipientNumber = document.getElementById('payment-recipient-number')?.textContent?.trim();
        if (!recipientNumber) {
            if (!suppressErrors) {
                alert('Recipient number is not available yet.');
            }
            return false;
        }

        try {
            const copied = await copyTextWithFallback(recipientNumber);
            if (!copied) {
                throw new Error('Copy unavailable');
            }
            return true;
        } catch (err) {
            if (!suppressErrors) {
                window.prompt('Copy the GCash number manually before sending payment:', recipientNumber);
            }
            return false;
        }
    };

    function launchGcashWithFallback(targetUrl) {
        let appLaunchDetected = false;

        function markAppLaunch() {
            appLaunchDetected = true;
        }

        function handleVisibilityChange() {
            if (document.visibilityState === 'hidden') {
                markAppLaunch();
            }
        }

        function cleanup() {
            window.removeEventListener('blur', markAppLaunch);
            window.removeEventListener('pagehide', markAppLaunch);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        }

        window.addEventListener('blur', markAppLaunch);
        window.addEventListener('pagehide', markAppLaunch);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        try {
            openUrlViaAnchor(targetUrl, true);
        } catch (error) {
            cleanup();
            window.location.href = GCASH_WEBSITE_URL;
            return;
        }

        window.setTimeout(function () {
            cleanup();
            if (!appLaunchDetected && document.visibilityState === 'visible') {
                window.location.href = GCASH_WEBSITE_URL;
            }
        }, 1500);
    }

    function launchGcashDirect(targetUrl) {
        try {
            openUrlViaAnchor(targetUrl, true);
        } catch (error) {
            // Ignore here; Android should stay on the page if the app cannot be opened.
        }
    }

    function openUrlViaAnchor(targetUrl, openInNewTab) {
        const anchor = document.createElement('a');
        anchor.href = targetUrl;
        if (openInNewTab) {
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
        }
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
    }

    window.openGCashApp = function () {
        if (isAndroidDevice()) {
            try {
                openUrlViaAnchor(GCASH_ANDROID_INTENT_URL);
            } catch (error) {
                launchGcashDirect('intent://open/#Intent;scheme=gcash;package=' + GCASH_ANDROID_PACKAGE + ';action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end');
            }
            return;
        }

        window.copyPaymentNumber(false).then(function () {
            launchGcashWithFallback(paymentOpenUrl || GCASH_APP_URL);
        }).catch(function () {
            launchGcashWithFallback(paymentOpenUrl || GCASH_APP_URL);
        });
    };

    cachedPendingPayment = loadPaymentCache();

    if (PAYMENT.pendingIntent) {
        restorePendingPaymentAttempt(PAYMENT.pendingIntent);
    } else if (cachedPendingPayment) {
        restorePendingPaymentAttempt(cachedPendingPayment);
    }

    window.addEventListener('pageshow', function () {
        if (PAYMENT.pendingIntent && !document.getElementById('payment-step-2')?.offsetParent) {
            restorePendingPaymentAttempt(PAYMENT.pendingIntent);
        } else if (cachedPendingPayment && !document.getElementById('payment-step-2')?.offsetParent) {
            restorePendingPaymentAttempt(cachedPendingPayment);
        }
    });

    window.submitPaymentIssueTicket = async function () {
        const nameEl = document.getElementById('payment-ticket-name');
        const emailEl = document.getElementById('payment-ticket-email');
        const phoneEl = document.getElementById('payment-ticket-phone');
        const gcashEl = document.getElementById('payment-ticket-gcash-number');
        const receiptCodeEl = document.getElementById('payment-ticket-receipt-code');
        const receiptScreenshotEl = document.getElementById('payment-ticket-receipt-screenshot');
        const notesEl = document.getElementById('payment-ticket-notes');
        const docs = getPaymentDocuments();
        const firstDoc = docs[0] || { docId: '', name: 'Payment concern' };
        const customerName = nameEl?.value?.trim() || '';
        const email = emailEl?.value?.trim() || '';
        const phoneNumber = phoneEl?.value?.replace(/\D/g, '').trim() || '';
        const gcashNumber = gcashEl?.value?.replace(/\D/g, '').trim() || '';
        const receiptCode = receiptCodeEl?.value?.trim() || '';
        const receiptScreenshot = receiptScreenshotEl?.files?.[0] || null;
        const notesValue = notesEl?.value?.trim() || '';

        if (!customerName) {
            alert('Please enter your name so personnel can identify your ticket.');
            nameEl?.focus();
            return;
        }

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            alert('Please enter a valid email address.');
            emailEl?.focus();
            return;
        }

        if (!/^09\d{9}$/.test(phoneNumber)) {
            alert('Please enter a valid Philippine mobile number (e.g. 09171234567).');
            phoneEl?.focus();
            return;
        }

        if (gcashNumber && !/^09\d{9}$/.test(gcashNumber)) {
            alert('Please enter a valid GCash mobile number (e.g. 09171234567).');
            gcashEl?.focus();
            return;
        }

        if (!receiptCode) {
            alert('Please enter the receipt reference code from GCash.');
            receiptCodeEl?.focus();
            return;
        }

        if (!receiptScreenshot) {
            alert('Please upload your GCash receipt screenshot so personnel can review the payment.');
            receiptScreenshotEl?.focus();
            return;
        }

        if (!notesValue) {
            alert('Please describe what happened so personnel know how to help.');
            notesEl?.focus();
            return;
        }

        const formData = new FormData();
        formData.append('customer_id', PAYMENT.customerId);
        formData.append('document_id', firstDoc.docId || '');
        formData.append('document_name', docs.length > 1 ? docs.length + ' payment-related documents' : (firstDoc.name || firstDoc.docId || 'Payment concern'));
        formData.append('customer_name', customerName);
        formData.append('email', email);
        formData.append('phone_number', phoneNumber);
        formData.append('problem_type', 'other');
        formData.append('description', buildPaymentIssueDescription());
        formData.append('page_range', 'all');
        formData.append('specific_pages', '');
        formData.append('reprinted', 'false');
        formData.append('receipt_code', receiptCode);
        formData.append('receipt_screenshot', receiptScreenshot);
        formData.append('proof_photos', receiptScreenshot);
        if (gcashNumber) {
            formData.append('gcash_number', gcashNumber);
        }
        if (docs.length > 1) {
            formData.append('documents', JSON.stringify(docs.map(function (doc) {
                return {
                    doc_id: doc.docId,
                    doc_name: doc.name,
                };
            })));
        }

        setPaymentTicketSubmitting(true);
        setPaymentTicketStatus('', '');

        try {
            const response = await fetch('/api/submit-ticket/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': getCsrfToken(),
                },
                body: formData,
            });
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Ticket creation failed.');
            }

            stopAutoPolling();
            setPaymentTicketStatus('Ticket ' + (data.ticket_number || '') + ' created. SafePrint personnel can now review the payment and contact you.', 'success');
            alert('Payment ticket created: ' + (data.ticket_number || 'Ticket submitted') + '. SafePrint personnel can now review your payment concern.');
        } catch (error) {
            setPaymentTicketStatus(error.message || 'Could not create the ticket right now.', 'error');
            alert(error.message || 'Could not create the ticket right now.');
        } finally {
            setPaymentTicketSubmitting(false);
        }
    };

    // Clean up polling on page unload
    window.addEventListener('beforeunload', stopAutoPolling);

    // ── Printer availability check ──
    let printersAvailable = true;
    let printerCheckInterval = null;

    async function checkPrinterAvailability() {
        try {
            const response = await fetch('/portal/api/check-printer-availability/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                },
                body: JSON.stringify({ doc_ids: PAYMENT.docIds }),
            });
            const data = await response.json();
            const banner = document.getElementById('printer-unavailable-banner');
            const payBtn = document.getElementById('pay-now-btn');
            const phoneInput = document.getElementById('phone-number');

            if (!data.available) {
                printersAvailable = false;
                if (payBtn) payBtn.disabled = true;
                if (phoneInput) phoneInput.disabled = true;
                if (banner) {
                    let msg = '';
                    if (data.all_offline) {
                        msg = 'All printers are currently offline. Payment is temporarily unavailable. Please try again later.';
                    } else if (data.unavailable_docs && data.unavailable_docs.length > 0) {
                        const specs = data.unavailable_docs.map(function(d) {
                            return d.required_sheets ? `${d.paper_size} (${d.required_sheets} sheets needed)` : d.paper_size;
                        });
                        msg = 'No available printer for: ' + specs.join(', ') + '. Please try again later.';
                    } else {
                        msg = 'No available printers at this time. Please try again later.';
                    }
                    banner.textContent = msg;
                    banner.style.display = 'block';
                }
            } else {
                printersAvailable = true;
                if (payBtn && !payBtn.classList.contains('processing')) payBtn.disabled = false;
                if (phoneInput) phoneInput.disabled = false;
                if (banner) banner.style.display = 'none';
            }
        } catch (e) {
            // On error, allow payment (don't block on network glitch)
        }
    }

    // Check immediately and poll every 10 seconds
    checkPrinterAvailability();
    printerCheckInterval = setInterval(checkPrinterAvailability, 10000);
    window.addEventListener('beforeunload', function() {
        if (printerCheckInterval) clearInterval(printerCheckInterval);
    });

    updatePriceDisplay(0, null);
})();
