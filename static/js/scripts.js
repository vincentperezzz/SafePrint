let uploadedFiles = [];
let hasProceeded = false;
let isScanning = false; // Track if any file is being scanned for viruses
const docs = JSON.parse(sessionStorage.getItem('documents') || '[]');
document.addEventListener("touchstart", function () { }, true);

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

    function uploadFile(file, retryFileId = null) {
        const fileId = retryFileId || (Date.now() + '_' + Math.random().toString(36).substr(2, 9));
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
                // Get CSRF token
                const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value ||
                    document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

                const headers = {
                    'Content-Type': 'application/json',
                };

                if (csrfToken) {
                    headers['X-CSRFToken'] = csrfToken;
                }

                // Call backend to delete the file from server
                fetch('/api/delete-file/', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        file_path: fileToRemove.serverPath
                    })
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            console.log('File deleted from server successfully');
                        } else {
                            console.error('Failed to delete file from server:', data.error);
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
        // Cancel ongoing upload
        const fileElement = document.querySelector(`[data-file-id="${fileId}"]`);
        if (fileElement) {
            fileElement.remove();
        }
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
            docDivs.forEach((fileDiv, idx) => {
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
                    pages = pageInput ? pageInput.value : '';
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
                // Paper quality
                const paperQualitySelect = fileDiv.querySelectorAll('.dropdown-select')[1];
                const paperQuality = paperQualitySelect ? paperQualitySelect.value : '';
                updates.push({
                    doc_id: doc.doc_id,
                    quantity,
                    pages,
                    orientation,
                    grayscale,
                    paper_size: paperSize,
                    paper_quality: paperQuality
                });
            });
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
            <div class="file-rows vertical-separator">
                <h5>Quality of the Paper</h5>
                <div class="dropdown">
                    <select class="dropdown-select">
                        <option value="80" ${doc.paper_quality == '80' || doc.paper_quality == '80gsm' ? 'selected' : ''}>80 GSM (thicker)</option>
                        <option value="70" ${doc.paper_quality == '70' || doc.paper_quality == '70gsm' ? 'selected' : ''}>70 GSM (thinner)</option>
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
let customerSSE = null;

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
                    <h6>${escapeHtml(doc.filename)}</h6>
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

    // Group reroute history into "print segments" by printer
    // Each "Assigned" entry followed by an "Error" or "Rerouted" means that segment was on that printer
    const segments = buildPrintSegments(doc, history);

    if (doc.doc_status === 'Pending') {
        // Waiting for admin approval
        badgesHtml = `<div class="badge status-warning">Waiting for Approval...</div>`;
    } else if (doc.doc_status === 'Queued') {
        // In queue, no printer assigned yet
        if (segments.length > 0) {
            // Was rerouted - show completed segments, then waiting
            badgesHtml = renderCompletedSegments(segments);
            badgesHtml += `<div class="badge status-info">Waiting...</div>`;
        } else {
            badgesHtml = `<div class="badge status-info">Waiting...</div>`;
        }
    } else if (doc.doc_status === 'Printing') {
        // Currently printing
        if (segments.length > 1) {
            // Has reroute history - show completed segments + current printing
            badgesHtml = renderCompletedSegments(segments.slice(0, -1));
        }
        const printerText = doc.printer_name ? ` (${escapeHtml(doc.printer_name)})` : '';
        badgesHtml += `<div class="badge status-info">Printing...${printerText}</div>`;
    } else if (doc.doc_status === 'Finished') {
        // Completed - show history segments + completion badge with pickup button
        if (segments.length > 1) {
            badgesHtml = renderCompletedSegments(segments.slice(0, -1));
        }
        const printerText = doc.printed_at ? ` (${escapeHtml(doc.printed_at)})` : '';
        badgesHtml += `
            <div class="status-group">
                <div class="badge status-success">Completed${printerText}</div>
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
        if (segments.length > 0) {
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
    /**
     * Build print segments from reroute history.
     * Each segment represents a printer that was assigned and what happened there.
     * Segments show: "Page X-Y (Printer Name)" for completed portions on rerouted printers.
     */
    const segments = [];
    let currentPrinter = null;
    let segmentStart = null;

    for (let i = 0; i < history.length; i++) {
        const entry = history[i];

        if (entry.status === 'Assigned') {
            currentPrinter = entry.printer_name;
            segmentStart = i;
        } else if (entry.status.startsWith('Error') || entry.status.startsWith('Timeout') || entry.status.startsWith('Failed')) {
            // This printer had an error - create a completed segment for pages printed there
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

function renderCompletedSegments(segments) {
    let html = '';
    segments.forEach(segment => {
        const printerText = segment.printer_name ? ` (${escapeHtml(segment.printer_name)})` : '';
        if (segment.status === 'error' || segment.status === 'rerouted') {
            // Pages that were printed on a rerouted printer (shown as primary/blue badge)
            html += `<div class="badge status-primary">Printed on${printerText}</div>`;
        }
    });
    return html;
}

function updateConfirmationUI(data) {
    // Update the title/subtitle based on overall status
    const titleEl = document.querySelector('.confirmation-title');
    const subtitleEl = document.querySelector('.confirmation-subtitle');
    const finishBtn = document.getElementById('finish-transaction-btn');

    if (!data.documents || data.documents.length === 0) return;

    const allPickedUp = data.documents.every(d => d.doc_status === 'Picked Up');
    const allFinished = data.documents.every(d => d.doc_status === 'Finished' || d.doc_status === 'Picked Up');
    const anyPrinting = data.documents.some(d => d.doc_status === 'Printing');
    const anyPending = data.documents.some(d => d.doc_status === 'Pending');
    const hasFinished = data.documents.some(d => d.doc_status === 'Finished');

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

function pickedUpDocument(docId) {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Processing...';

    fetch('/api/picked-up-document/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify({ doc_id: docId })
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
    if (el) el.style.display = 'block';
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

    // Use SSE-sourced documents if available, otherwise fall back to DOM scraping
    let docs = [];

    if (window.customerDocuments && window.customerDocuments.length > 0) {
        // Use SSE data - filter to show docs that are Queued, Printing, or Finished
        docs = window.customerDocuments.filter(doc =>
            ['Pending', 'Queued', 'Printing', 'Finished'].includes(doc.doc_status)
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
    prefillTicketForm();
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

    if (!customerName) {
        alert('Please enter your name.');
        document.getElementById('ticket-customer-name').focus();
        return;
    }

    if (!email) {
        alert('Please enter your email address.');
        document.getElementById('ticket-email').focus();
        return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        alert('Please enter a valid email address.');
        document.getElementById('ticket-email').focus();
        return;
    }

    if (!phoneNumber) {
        alert('Please enter your phone number.');
        document.getElementById('ticket-phone').focus();
        return;
    }

    if (!receiptCode) {
        alert('Please enter the receipt code from your payment receipt.');
        document.getElementById('ticket-receipt-code').focus();
        return;
    }

    if (!receiptFile) {
        alert('Please upload a screenshot of your payment receipt.');
        document.getElementById('ticket-receipt-screenshot').focus();
        return;
    }

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
        window.location.href = '/';
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
                // SSE will update the UI and redirect to thank you page
            } else {
                console.warn('Finish transaction warning:', data.error);
                // Still redirect even if there's an issue
                window.location.href = '/';
            }
        })
        .catch(error => {
            console.error('Error finishing transaction:', error);
            window.location.href = '/';
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
        const cid = document.getElementById('track-cid-input').value.trim();
        const errorDiv = document.getElementById('track-status-error');
        const btn = document.querySelector('.track-status-btn');

        if (!cid) return;

        // Hide previous error
        errorDiv.style.display = 'none';
        btn.disabled = true;
        btn.textContent = 'Checking...';

        fetch('/api/validate-cid/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer_id: cid })
        })
        .then(res => res.json())
        .then(data => {
            if (data.valid) {
                if (data.redirect === 'payment' && data.doc_ids && data.doc_ids.length > 0) {
                    // Unpaid documents — redirect to payment page
                    var docParams = data.doc_ids.map(function(id) {
                        return 'doc_ids=' + encodeURIComponent(id);
                    }).join('&');
                    window.location.href = '/payment/?customer_id=' + encodeURIComponent(data.customer_id || cid) + '&' + docParams;
                } else {
                    // All paid — redirect to confirmation
                    window.location.href = '/confirmation/' + encodeURIComponent(cid) + '/';
                }
            } else {
                errorDiv.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Track Status';
            }
        })
        .catch(() => {
            errorDiv.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Track Status';
        });
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
});
