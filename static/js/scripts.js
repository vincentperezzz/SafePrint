let uploadedFiles = [];
let hasProceeded = false;
const docs = JSON.parse(sessionStorage.getItem('documents') || '[]');
document.addEventListener("touchstart", function(){}, true);

document.addEventListener('DOMContentLoaded', () => {
    //Drag and Drop File Upload Functionality
    const dragArea = document.getElementById('drag-area');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.querySelector('.browse-btn');
    const proceedBtn = document.getElementById('to-upload');


    // Function to update proceed button visibility and state
    function updateProceedButton() {
        if (!proceedBtn) return; 
        if (uploadedFiles.length > 0) {
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
        dragArea.addEventListener('click', function(e) {
            // Prevent click event if the browse button inside the drag area was clicked
            if (e.target.closest('.browse-btn')) return;
            
            // Trigger file input click
            fileInput.click();
        });
        
        // Add pointer cursor to show it's clickable
        dragArea.style.cursor = 'pointer';
    }

    if (fileInput && browseBtn) {

        browseBtn.addEventListener('click', function() {
            fileInput.click();
        });

        fileInput.addEventListener('change', function() {
            const files = Array.from(fileInput.files);
            handleFiles(files);
            fileInput.value = '';
        });
    } 

    const dragOverlay = document.getElementById('drag-overlay');
    let dragCounter = 0;
    
    if (dragOverlay) {
        document.addEventListener('dragenter', function(e) {
            if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
                dragCounter++;
                dragOverlay.style.display = 'block';
                if (dragArea) dragArea.classList.add('dragover');
            }
        });

        document.addEventListener('dragover', function(e) {
            if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                dragOverlay.style.display = 'block';
                if (dragArea) dragArea.classList.add('dragover');
            }
        });

        document.addEventListener('dragleave', function(e) {
            if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
                dragCounter--;
                if (dragCounter <= 0) {
                    dragOverlay.style.display = 'none';
                    if (dragArea) dragArea.classList.remove('dragover');
                    dragCounter = 0;
                }
            }
        });

        document.addEventListener('drop', function(e) {
            if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                e.preventDefault();
                dragOverlay.style.display = 'none';
                if (dragArea) dragArea.classList.remove('dragover');
                dragCounter = 0;
                handleFiles(e.dataTransfer.files);
            }
        });

        window.addEventListener('mouseleave', function() {
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

        // Set timeout for large file uploads (30 minutes)
        xhr.timeout = 30 * 60 * 1000;

        // Track upload progress
        xhr.upload.addEventListener('progress', function(e) {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                updateUploadProgress(fileId, percentComplete);
            }
        });

        xhr.addEventListener('load', function() {
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (response.success) {
                        // Upload successful
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
                        console.error(`Upload failed for "${file.name}": ${response.error}`);
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
        xhr.addEventListener('error', function() {
            updateFileStatus(fileId, 'error', file.name);
            failedUploads[fileId] = file;
        });

        xhr.addEventListener('timeout', function() {
            updateFileStatus(fileId, 'error', file.name);
            failedUploads[fileId] = file;
            alert(`Upload of "${file.name}" timed out. Please try again.`);
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
                    <img src="/static/assets/pause-icon.svg" alt="Pause Icon" class="pause-icon">
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
            const sizeSpan = fileElement.querySelector('.file-size');
            const remainingTime = Math.max(0, Math.round((100 - percentComplete) * 0.3)); // Rough estimate
            
            progressBar.style.width = percentComplete + '%';
            if (percentComplete < 100) {
                sizeSpan.textContent = `${Math.round(percentComplete)}% • ${remainingTime} seconds remaining`;
            } else {
                sizeSpan.textContent = `Upload complete`;
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
    window.removeFile = function(fileId) {
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

    window.retryUpload = function(fileId) {
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

    window.cancelUpload = function(fileId) {
        // Cancel ongoing upload
        const fileElement = document.querySelector(`[data-file-id="${fileId}"]`);
        if (fileElement) {
            fileElement.remove();
        }
    };

    // Handle proceed button click
    if (proceedBtn) {
        proceedBtn.addEventListener('click', function() {
            hasProceeded = true;
            // Show loading overlay immediately after clicking proceed
            var overlay = document.getElementById('loading-overlay');
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
                    if (!data.success && data.paper_size_errors) {
                        // Show a detailed alert for the user
                        let msg = "Paper Size Error:\n";
                        data.paper_size_errors.forEach(err => {
                            msg += `- ${err.file}: ${err.reason}\n`;
                        });
                        msg += "\nPlease remove this file and approach our store personnel for custom paper size.";
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
        confirmBtn.addEventListener('click', function() {
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
                    window.location.href = confirmBtn.getAttribute('data-url');
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

    if(specificPagesRadio){
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
        feedbackForm.addEventListener('submit', function(e) {
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

    // Only run on confirmation page
    if (document.querySelector('.confirmation')) {
        // Redirect to homepage if no documents
        const docs = JSON.parse(sessionStorage.getItem('documents') || '[]');
        if (!docs || docs.length === 0) {
            window.location.href = '/';
        }

        // Clear docs and customer_id from sessionStorage
        sessionStorage.removeItem('documents');
        sessionStorage.removeItem('customer_id');

        // Remove CID cookie if set as a cookie (optional)
        document.cookie = "customer_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    }

    const finishBtn = document.getElementById('finish-transaction-btn');
    if (finishBtn) {
        finishBtn.addEventListener('click', function () {
            hasProceeded = true;
            var overlay = document.getElementById('loading-overlay');
            if (overlay) overlay.style.display = 'flex';
            window.location.href = '/';
        });
    }

    const feedbackBtn = document.querySelector('.feedback-btn');
    if (feedbackBtn) {
        feedbackBtn.addEventListener('click', function () {
            hasProceeded = true;
            window.location.href = '/#feedback';
        });
    }



}); // END OF DOMContentLoaded

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
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


// Display Alert Messages
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

    $(document).on('click', '.alert .close', function() {
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


// Warn user about losing uploads on reload/close
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
                    <span class="file-size">${(doc.file_size/1024).toFixed(1)} KB</span>
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
window.addEventListener('DOMContentLoaded', function() {
    var overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
});
