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

window.onload = function() {
    const alertData = sessionStorage.getItem('alert');
    if (alertData) {
        const { type, message } = JSON.parse(alertData);
        if (type === 'success') {
            createAlert('Success', 'Account Created', message, 'success', true, true, 'pageMessages');
            
        } else {
            createAlert('Error', 'Account Creation Failed', message, 'danger', true, true, 'pageMessages');
        }
        sessionStorage.removeItem('alert');
    }
};

let selectedIds = [];

document.addEventListener('DOMContentLoaded', () => {

    //Customer ID Enter key Functionality
    const customerIdInput = document.getElementById('customer-id-input');
    const searchBtn = document.getElementById('search-btn');
    if (customerIdInput && searchBtn) {
        customerIdInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchBtn.click();
            }
        });
    }

    // CID Post to Backend
    if (searchBtn) {
    searchBtn.addEventListener('click', function() {
        const customerId = document.getElementById('customer-id-input').value.trim();
        if (!customerId) {
            createAlert('Error', 'Customer ID Required', 'Please enter a Customer ID to search for documents.', 'danger', true, true, 'pageMessages');
            return;
        }
        fetch('/portal/search_customer/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken,
            },
            body: JSON.stringify({ customer_id: customerId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                displayDocuments(data.documents, data.total_price);
                document.getElementById('customer-id-input').value = data.customer_id;
                toggleActionButtons(true);
            } else {
                createAlert('Error', 'Search Failed', data.error || 'No documents found for the provided Customer ID.', 'danger', true, true, 'pageMessages');
                toggleActionButtons(false);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            createAlert('Error', 'Search Failed', 'An error occurred while searching for documents. Please try again later.', 'danger', true, true, 'pageMessages');
            });
        });
    }

    // Clear Button Functionality in Dashboard to clear price and CID
    const clearBtn = document.getElementById('clear-btn');
    const priceToPay = document.getElementById('price-to-pay');
    if (clearBtn && customerIdInput && priceToPay) {
        clearBtn.onclick = function() {
            customerIdInput.value = '';
            priceToPay.textContent = '₱0.00';
            toggleActionButtons(false);

            const resultsDiv = document.getElementById('document-results');
            if (resultsDiv) {
                const searchBar = resultsDiv.querySelector('.search-bar');
                const docTitle = resultsDiv.querySelector('.document-item-title');
                if (searchBar) searchBar.style.display = 'none';
                if (docTitle) docTitle.style.display = 'none';
                Array.from(resultsDiv.querySelectorAll('.document-item, .no-documents')).forEach(el => el.remove());
                resultsDiv.innerHTML += `
                    <div class="no-documents">
                        <img src="/static/assets/no-documents.png" alt="No Documents">
                        <p>No documents found, Please enter a Customer ID</p>
                    </div>
                `;
            }
        };
    }

    // Deny All Documents
    const denyAllBtn = document.getElementById('deny-all-btn');
    if (denyAllBtn) {
        denyAllBtn.addEventListener('click', function() {
            const customerId = document.getElementById('customer-id-input').value.trim();
            if (!customerId) {
                createAlert('Error', 'Customer ID Required', 'Please enter a Customer ID to deny all documents.', 'danger', true, true, 'pageMessages');
                return;
            }

            fetch(denyAllUrl, {
                method: "POST",
                headers: {
                    "X-CSRFToken": csrfToken,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ customer_id: customerId })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    createAlert('Success', 'Denied', `All documents denied.`, 'success', true, true, 'pageMessages');
                    // Remove all document items from the UI
                    document.querySelectorAll('.document-item').forEach(row => row.remove());
                    document.getElementById('price-to-pay').textContent = '₱0.00';
                    toggleActionButtons(false);
                } else {
                    createAlert('Error', 'Deny Failed', data.error || 'Unknown error.', 'danger', true, true, 'pageMessages');
                }
            })
            .catch(error => {
                createAlert('Error', 'Deny Failed', 'An error occurred while denying documents.', 'danger', true, true, 'pageMessages');
            });
        });
    }

    // Approve All Documents
    const approveAllBtn = document.querySelector('.approve-btn#approve-all-btn') || document.getElementById('approve-all-btn');
    if (approveAllBtn) {
        approveAllBtn.addEventListener('click', function() {
            const customerId = document.getElementById('customer-id-input').value.trim();
            if (!customerId) {
                createAlert('Error', 'Customer ID Required', 'Please enter a Customer ID to approve all documents.', 'danger', true, true, 'pageMessages');
                return;
            }

            fetch(approveAllUrl, {
                method: "POST",
                headers: {
                    "X-CSRFToken": csrfToken,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ customer_id: customerId })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    createAlert('Success', 'Approved', `All documents approved.`, 'success', true, true, 'pageMessages');
                    // Update "Approved by" only for affected documents
                    if (data.approved_doc_ids) {
                        data.approved_doc_ids.forEach(docId => {
                            // Place this line here:
                            const approvedCol = document.querySelector(`#onqueue-doc-${docId.toString()} .doc-approved`);
                            if (approvedCol) {
                                approvedCol.textContent = data.admin_name ? data.admin_name : '-';
                            }
                        });
                    }

                    // Remove all document items from the UI
                    document.querySelectorAll('.document-item').forEach(row => row.remove());
                    document.getElementById('price-to-pay').textContent = '₱0.00';
                    toggleActionButtons(false);
                } else {
                    createAlert('Error', 'Approve Failed', data.error || 'Unknown error.', 'danger', true, true, 'pageMessages');
                }
            })
            .catch(error => {
                createAlert('Error', 'Approve Failed', 'An error occurred while approving documents.', 'danger', true, true, 'pageMessages');
                    });
                });
        }

    // Change Profile Image
    const imageUpload = document.getElementById('image-upload');
    if (imageUpload) {
        imageUpload.addEventListener('change', function() {
            var fileInput = this;
            if (fileInput.files.length > 0) {
                var formData = new FormData();
                formData.append('profile_image', fileInput.files[0]);
                fetch(changeImageUrl, {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': csrfToken
                    },
                    body: formData
                })
                .then(response => response.json())
                .then(data => {
                    var img = document.getElementById('profile-img');
                    if (data.success) {
                        var img = document.getElementById('profile-img');
                        if (img) {
                            img.src = data.image_url + '?t=' + new Date().getTime();
                        };
                        createAlert('Success', 'Image Updated', 'Your profile image has been successfully updated.', 'success', true, true, 'pageMessages');
                        location.reload();
                    } else {
                        createAlert('Error', 'Image Upload Failed', data.error || 'An error occurred while uploading the image.', 'danger', true, true, 'pageMessages');
                    }
                });
            }
        });
    }

    // Edit Name
    const editNameForm = document.getElementById('edit-name-form');
    if (editNameForm) {
        editNameForm.onsubmit = function(e) {
        e.preventDefault();
        var formData = new FormData(this);
        fetch(updateNameUrl, {
            method: 'POST',
            headers: {
                'X-CSRFToken': csrfToken
            },
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                createAlert('Success', 'Name Updated', 'Your name has been successfully updated.', 'success', true, true, 'pageMessages');
                document.getElementById('Name').value = data.new_name;
                hidePopupOverlay('editNameOverlay');
                document.getElementById('edit-name-form').reset();
            } else {
                createAlert('Error', 'Update Failed', data.error || 'An error occurred while updating your name.', 'danger', true, true, 'pageMessages');
            }
        });
        };
    }
    
    // Edit Username
    const editUsernameForm = document.getElementById('edit-username-form');
    if (editUsernameForm) {
        editUsernameForm.onsubmit = function(e) {
        e.preventDefault();
        var formData = new FormData(this);
        fetch(updateUsernameUrl, {
            method: 'POST',
            headers: {
                'X-CSRFToken': csrfToken
            },
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                createAlert('Success', 'Username Updated', 'Your username has been successfully updated.', 'success', true, true, 'pageMessages');
                document.getElementById('Username').value = data.new_username;
                hidePopupOverlay('editUsernameOverlay');
                document.getElementById('edit-username-form').reset();
            } else {
                createAlert('Error', 'Update Failed', data.error || 'An error occurred while updating your username.','danger',true,false,'pageMessages');
            }
        });
        };
    }
    
    // Edit Password
    const editPasswordForm = document.getElementById('edit-password-form');
    if (editPasswordForm) {
        editPasswordForm.onsubmit = function(e) {
         e.preventDefault();
        var formData = new FormData(this);
        fetch(updatePasswordUrl, {
            method: 'POST',
            headers: {
                'X-CSRFToken': csrfToken
            },
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                createAlert('Success', 'Password Updated', 'Your password has been successfully updated.', 'success', true, true, 'pageMessages');
                hidePopupOverlay('editPasswordOverlay');
                document.getElementById('edit-password-form').reset();
            } else {
                createAlert('Error', 'Update Failed', data.error || 'An error occurred while updating your password.', 'danger', true, true, 'pageMessages');
            }
        });
        };
    }

    // Search User Accounts
    const searchUserInput = document.getElementById('searchUserInput');
    if (searchUserInput) {
        searchUserInput.addEventListener('input', function() {
            const filter = this.value.toLowerCase();
            const rows = document.querySelectorAll('.user-account-row');
            let visibleCount = 0;
            rows.forEach(row => {
                const usernameDiv = row.querySelector('.user-username');
                const nameDiv = row.querySelector('.user-name');
                if (usernameDiv && nameDiv) {
                    const username = usernameDiv.textContent.toLowerCase();
                    const name = nameDiv.textContent.toLowerCase();
                    const match = username.includes(filter) || name.includes(filter);
                    row.style.display = match ? '' : 'none';
                    if (match) visibleCount++;
                }
            });
            // Show "No match found" only if there are no visible user rows
            document.getElementById('no-match-row').style.display = visibleCount === 0 ? 'flex' : 'none';
        });    
    } 

    // Edit User Password
    const editUserPasswordForm = document.getElementById('edit-user-password-form');
    if (editUserPasswordForm) {
        editUserPasswordForm.onsubmit = function(e) {
        e.preventDefault();
        var formData = new FormData(this);
        fetch(updateUserPasswordUrl, {
            method: 'POST',
            headers: {
                'X-CSRFToken': csrfToken
            },
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                createAlert('Success', 'Password Updated', 'The user password has been successfully updated.', 'success', true, true, 'pageMessages');
                hidePopupOverlay('editUserPasswordOverlay');
                document.getElementById('edit-user-password-form').reset();
            } else {
                createAlert('Error', 'Update Failed', data.error || 'An error occurred while updating the user password.', 'danger', true, true, 'pageMessages');
            }
        });
        };
    }

    // Delete User
    var deleteBtn = document.getElementById('deleteConfirmBtn');
    if (deleteBtn) {
        deleteBtn.onclick = function() {
            var userId = document.getElementById('delete-user-id').value;
            fetch(deleteUserUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken,
                },
                credentials: 'same-origin',
                body: JSON.stringify({user_ids: selectedIds})
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    selectedIds.forEach(id => {
                        const row = document.getElementById('user-account-row-' + id);
                        if (row) row.remove();
                    });
                    hidePopupOverlay('deleteUserOverlay');
                    createAlert('Success', 'User Deleted', 'The user has been successfully deleted.', 'success', true, true, 'pageMessages');
                } else {
                    createAlert('Error', 'Delete Failed', data.error || 'An error occurred while deleting the user.', 'danger', true, true, 'pageMessages');
                }
            })
            .catch(error => {
                console.error('Error deleting user:', error);
                createAlert('Error', 'Delete Failed', 'An error occurred while deleting the user.', 'danger', true, true, 'pageMessages');
            });
        };
    }

    // Get all checkboxes and the delete button
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const userAccountsTable = document.querySelector('.user-accounts-table');
    if (deleteSelectedBtn && userAccountsTable) {
        // Delegate event to the container for dynamic rows
        userAccountsTable.addEventListener('change', function(e) {
            if (e.target.type === 'checkbox') {
                updateDeleteButton();
            }
        });

        // Define updateDeleteButton function within the scope
        function updateDeleteButton() {
            const checkedBoxes = document.querySelectorAll('.user-account-row input[type="checkbox"]:checked');
            deleteSelectedBtn.style.display = checkedBoxes.length > 0 ? 'inline-block' : 'none';
        }
        
        deleteSelectedBtn.addEventListener('click', function() {
            const checkedBoxes = document.querySelectorAll('.user-account-row input[type="checkbox"]:checked');
            const selectedIds = Array.from(checkedBoxes).map(cb => {
                const row = cb.closest('.user-account-row');
                return parseInt(row.id.replace('user-account-row-', ''), 10);
            });
            const label = selectedIds.length > 1 ? `${selectedIds.length} users` : `${selectedIds.length} user`;
            showDeleteUserOverlay(selectedIds, label);
        });
    }

    // Create Admin User Account
    const createAccountForm = document.getElementById('create-account-form');
    if (createAccountForm) {
        createAccountForm.onsubmit = function(e) {
         e.preventDefault();
        var form = this;
        var formData = new FormData(form);

        var name = formData.get('name');
        var username = formData.get('username');
        var password = formData.get('password');
        var confirmPassword = formData.get('confirm_password');

        fetch('/portal/add_user_ajax/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken 
            },
            body: JSON.stringify({
                name: name,
                username: username,
                password: password,
                confirm_password: confirmPassword
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                sessionStorage.setItem('alert', JSON.stringify({
                    type: 'success',
                    message: 'Account created successfully'
                }));
                location.reload();
            } else {
                sessionStorage.setItem('alert', JSON.stringify({
                    type: 'error',
                    message: data.error || 'An error occurred while creating the user account.'
                }));
                location.reload();
            }
        });
        };
    }

    // Feedback Modals Post to Backend
    const feedbackBtn = document.querySelector('.settings-feedback-btn');
    if (feedbackBtn) {
        feedbackBtn.addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('feedbackModal').style.display = 'block';
        fetch(updateFeebackUrl)
            .then(response => response.json())
            .then(data => {
                const list = document.querySelector("#feedbackModal .feedback-list");
                list.innerHTML = "";
                if (data.feedback_comments.length === 0) {
                    list.innerHTML = `<div class="feedback-card"><b>No feedback comments found.</b></div>`;
                } else {
                    data.feedback_comments.forEach(fb => {
                        list.innerHTML += `
                            <div class="feedback-card">
                                <b>Name</b><br>
                                ${fb.name}
                                <div class="feedback-spacer"></div>
                                <b>Message</b><br>
                                ${fb.message}
                                <div class="feedback-spacer"></div>
                                <b>Submitted at:</b><br>
                                ${fb.submitted_at}
                            </div>
                        `;
                    });
                }
            });
        });
    }

    // Problem Reports Modal Post to Backend
    const problemBtn = document.querySelector('.settings-problem-btn');
    if (problemBtn) {
        problemBtn.addEventListener('click', function(e) {
         e.preventDefault();
        document.getElementById('problemModal').style.display = 'block';
        fetch(updateProblemUrl)
            .then(response => response.json())
            .then(data => {
                const list = document.querySelector("#problemModal .feedback-list");
                list.innerHTML = "";
                if (data.problem_reports.length === 0) {
                    list.innerHTML = `<div class="feedback-card"><b>No problem reports found.</b></div>`;
                } else {
                    data.problem_reports.forEach(fb => {
                        list.innerHTML += `
                            <div class="feedback-card">
                                <b>Name</b><br>
                                ${fb.name}
                                <div class="feedback-spacer"></div>
                                <b>Message</b><br>
                                ${fb.message}
                                <div class="feedback-spacer"></div>
                                <b>Submitted at:</b><br>
                                ${fb.submitted_at}
                            </div>
                        `;
                    });
                }
            });
        });
    }

    // Feedback Comments Modal
    if (feedbackBtn) {
        feedbackBtn.onclick = function(e) {
        e.preventDefault();
        document.getElementById('feedbackModal').style.display = 'block';
        };
    }

    var closeFeedbackBtn = document.getElementById('closeFeedbackModal');
    if (closeFeedbackBtn) {
        closeFeedbackBtn.onclick = function() {
        document.getElementById('feedbackModal').style.display = 'none';
        };
    }

    // Problem Reports Modal
    if (problemBtn) {
        problemBtn.onclick = function(e) {
        e.preventDefault();
        document.getElementById('problemModal').style.display = 'block';
        };
    }

    var closeProblemBtn = document.getElementById('closeProblemModal');
    if (closeProblemBtn) {
        closeProblemBtn.onclick = function() {
        document.getElementById('problemModal').style.display = 'none';
        };
    }

    // Close modals when clicking outside modal content
    window.onclick = function(event) {
        var feedbackModal = document.getElementById('feedbackModal');
        var problemModal = document.getElementById('problemModal');
        if (event.target == feedbackModal) {
        feedbackModal.style.display = 'none';
        }
        if (event.target == problemModal) {
        problemModal.style.display = 'none';
        }
    }

    // Printer Status Dropdowns Update Database
    const dropdownSelects = document.querySelectorAll('.dropdown-select');
    if (dropdownSelects.length > 0) {
        dropdownSelects.forEach(function(select) {
            select.addEventListener('change', function() {
                const printerId = this.dataset.printerId;
                const field = this.dataset.field;
                const value = this.value;
                
                // Form data for the request
                const formData = new FormData();
                formData.append('printer_id', printerId);
                formData.append('field', field);
                formData.append('value', value);
                
                fetch(updatePrinterUrl, {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': csrfToken
                    },
                    body: formData
                })
                .then(response => {
                    if (!response.ok) {
                        return response.text().then(text => {
                            console.error('Server response:', text);
                            throw new Error(`Server error: ${response.status}`);
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    createAlert('Success', 'Status Updated', 'Printer status has been updated successfully.', 'success', true, true, 'pageMessages');
                })
                .catch(error => {
                    console.error('Error updating printer status:', error);
                    createAlert('Error', 'Update Failed', 'Failed to update printer status. Please try again or contact support.', 'danger', true, true, 'pageMessages');
                });
            });
        });
    }

    // Search Functionality of Pending-Document-List
    const searchInput = document.getElementById('pending-search');
    const noDocsRow = document.getElementById('no-pending-documents-row');
    let noMatchRow = document.getElementById('no-match-row');
    if (!noMatchRow && document.getElementById('pending-list')) {
        noMatchRow = document.createElement('div');
        noMatchRow.className = 'queue-row';
        noMatchRow.id = 'no-match-row';
        noMatchRow.style.display = 'none';
        noMatchRow.innerHTML = `<div class="queue-col" style="width: 100%; text-align: center;">No match found.</div>`;
        const pendingList = document.getElementById('pending-list');
        pendingList.appendChild(noMatchRow);
    }
    
    if (searchInput && document.getElementById('pending-list')) {
        searchInput.addEventListener('input', function() {
            const query = this.value.toLowerCase();
            let anyVisible = false;
            // Get all document rows, excluding special rows
            const rows = document.querySelectorAll('#pending-list .queue-row:not(#no-pending-documents-row):not(#no-match-row)');
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                if (text.includes(query)) {
                    row.style.display = '';
                    anyVisible = true;
                } else {
                    row.style.display = 'none';
                }
            });
            
            // Handle empty state and no match state
            if (query === '') {
                if (noDocsRow) noDocsRow.style.display = rows.length === 0 ? '' : 'none';
                if (noMatchRow) noMatchRow.style.display = 'none';
            } else {
                if (noDocsRow) noDocsRow.style.display = 'none';
                if (noMatchRow) noMatchRow.style.display = anyVisible ? 'none' : '';
            }
        });
    }
    
    // Search Functionality for On-Queue-Documents-List
    const onqueueSearchInput = document.getElementById('onqueue-search');
    const noOnqueueDocsRow = document.getElementById('no-onqueue-documents-row');
    let noOnqueueMatchRow = document.getElementById('no-onqueue-match-row');
    if (!noOnqueueMatchRow && document.querySelector('.on-queue-documents-list')) {
        noOnqueueMatchRow = document.createElement('div');
        noOnqueueMatchRow.className = 'on-queue-row';
        noOnqueueMatchRow.id = 'no-onqueue-match-row';
        noOnqueueMatchRow.style.display = 'none';
        noOnqueueMatchRow.innerHTML = `<div class="queue-col" style="width: 100%; text-align: center;">No match found.</div>`;
        const onqueueList = document.querySelector('.on-queue-documents-list');
        onqueueList.appendChild(noOnqueueMatchRow);
    }
    
    if (onqueueSearchInput && document.querySelector('.on-queue-documents-list')) {
        onqueueSearchInput.addEventListener('input', function() {
            const query = this.value.toLowerCase();
            let anyVisible = false;
            // Get all on-queue document rows, excluding special rows
            const onqueueRows = document.querySelectorAll('.on-queue-documents-list .on-queue-row:not(#no-onqueue-documents-row):not(#no-onqueue-match-row)');
            
            onqueueRows.forEach(row => {
                const text = row.textContent.toLowerCase();
                if (text.includes(query)) {
                    row.style.display = '';
                    anyVisible = true;
                } else {
                    row.style.display = 'none';
                }
            });
            
            // Handle empty state and no match state
            if (query === '') {
                if (noOnqueueDocsRow) noOnqueueDocsRow.style.display = onqueueRows.length === 0 ? '' : 'none';
                if (noOnqueueMatchRow) noOnqueueMatchRow.style.display = 'none';
            } else {
                if (noOnqueueDocsRow) noOnqueueDocsRow.style.display = 'none';
                if (noOnqueueMatchRow) noOnqueueMatchRow.style.display = anyVisible ? 'none' : '';
            }
        });
    }

    // Printer Search Functionality
    const printerSearchInput = document.getElementById('printer-search');
    const tableRows = document.querySelectorAll('.printer-table-row');
    if (!printerSearchInput || !tableRows.length) return;

    // Optional: Add a "no match" row if not present
    let printerNoMatchRow = document.getElementById('no-printer-match-row');
    if (!printerNoMatchRow) {
        printerNoMatchRow = document.createElement('div');
        printerNoMatchRow.className = 'printer-table-row';
        printerNoMatchRow.id = 'no-printer-match-row';
        printerNoMatchRow.style.display = 'none';
        printerNoMatchRow.innerHTML = `<div style="width: 100%; text-align: center; grid-column: 1 / -1;">No match found.</div>`;
        document.querySelector('.printer-table').appendChild(printerNoMatchRow);
    }

    printerSearchInput.addEventListener('input', function() {
        const query = this.value.trim().toLowerCase();
        let anyVisible = false;
        tableRows.forEach(row => {
            const name = row.querySelector('.printer-name')?.textContent.toLowerCase() || '';
            const serial = row.children[1]?.textContent.toLowerCase() || '';
            if (name.includes(query) || serial.includes(query)) {
                row.style.display = '';
                anyVisible = true;
            } else {
                row.style.display = 'none';
            }
        });
        printerNoMatchRow.style.display = (query && !anyVisible) ? '' : 'none';
    });


}); // End of DOMContentLoaded event listener


function toggleActionButtons(showActions) {
    var searchBtn = document.getElementById('search-btn');
    var approvalActions = document.getElementById('approval-actions');
    if (showActions) {
        if (searchBtn) searchBtn.style.display = 'none';
        if (approvalActions) approvalActions.style.display = 'flex';
    } else {
        if (searchBtn) searchBtn.style.display = '';
        if (approvalActions) approvalActions.style.display = 'none';
    }
}

function showPopupOverlay(id) {
    var overlay = document.getElementById(id);
    if (overlay) overlay.style.display = 'flex';
}
function hidePopupOverlay(id) {
    var overlay = document.getElementById(id);
    if (overlay) overlay.style.display = 'none';
}

function showEditUserPasswordOverlay(userId, userName) {
    document.getElementById('edit-user-password-id').value = userId;
    document.getElementById('edit-user-password-name').textContent = userName;
    showPopupOverlay('editUserPasswordOverlay');
}

function showDeleteUserOverlay(userId, userName) {
    if (Array.isArray(userId)) {
        selectedIds = userId;
        document.getElementById('delete-user-id').value = userId.join(',');
        document.getElementById('delete-user-name').textContent = userName;
    } else {
        selectedIds = [userId];
        document.getElementById('delete-user-id').value = userId;
        document.getElementById('delete-user-name').textContent = userName;
    }
    showPopupOverlay('deleteUserOverlay');
}

let lastDocuments = [];

function displayDocuments(documents, total_price) {
    lastDocuments = documents; // Store for filtering

    document.getElementById('price-to-pay').textContent = '₱' + (total_price || 0).toFixed(2);

    const resultsDiv = document.getElementById('document-results');
    if (!resultsDiv) return;

    // Remove previous document items and no-documents message
    Array.from(resultsDiv.querySelectorAll('.document-item, .no-documents')).forEach(el => el.remove());

    const searchBar = resultsDiv.querySelector('.search-bar');
    const docTitle = resultsDiv.querySelector('.document-item-title');


    // Show the search bar and document title
    if (searchBar) searchBar.style.display = 'flex';
    if (docTitle) docTitle.style.display = 'flex';

    // Render all documents initially
    renderDocumentItems(documents, resultsDiv);

    // Attach filter event to the dashboard search input
    const dashboardSearchInput = document.getElementById('dashboard-search');
    if (dashboardSearchInput) {
        dashboardSearchInput.value = '';
        dashboardSearchInput.oninput = function() {
            const filter = dashboardSearchInput.value.trim().toLowerCase();
            const filteredDocs = lastDocuments.filter(doc =>
                doc.filename.toLowerCase().includes(filter) ||
                doc.doc_id.toLowerCase().includes(filter)
            );
            renderDocumentItems(filteredDocs, resultsDiv);
        };
    }
}

function renderDocumentItems(documents, resultsDiv) {
    // Remove previous document items and no-documents message
    Array.from(resultsDiv.querySelectorAll('.document-item, .no-documents')).forEach(el => el.remove());
    let html = '';
    documents.forEach(doc => {
        html += `
        <div class="document-item" data-doc-id="${doc.doc_id}">
            <div class="document-item-wrapper">
                <img src="/static/assets/pdf-icon.svg" alt="PDF Icon">
                <div class="document-info">
                    <h6 title="${doc.filename}">${doc.filename}</h6>
                    <span>₱${parseFloat(doc.price).toFixed(2)}</span>
                </div>
            </div>
            <div class="document-id">${doc.doc_id}</div>
            <div class="actions">
                <button class="deny-btn">Deny</button>
                <button class="approve-btn">Approve</button>
            </div>
        </div>
        `;
    });
    if (documents.length === 0) {
        html = `
            <div class="no-documents">
                <img src="/static/assets/no-documents.png" alt="No Documents">
                <p>No documents found for this search.</p>
            </div>
        `;
    }
    resultsDiv.insertAdjacentHTML('beforeend', html);

    // Attach event listeners to each deny button
    resultsDiv.querySelectorAll('.document-item .deny-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const docItem = btn.closest('.document-item');
            const docId = docItem.getAttribute('data-doc-id');
            fetch(denyDocumentUrl, {
                method: "POST",
                headers: {
                    "X-CSRFToken": csrfToken,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ doc_id: docId })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    createAlert('Success', 'Denied', 'Document denied.', 'success', true, true, 'pageMessages');
                    docItem.remove();
                } else {
                    createAlert('Error', 'Deny Failed', data.error || 'Unknown error.', 'danger', true, true, 'pageMessages');
                }
            })
            .catch(error => {
                createAlert('Error', 'Deny Failed', 'An error occurred while denying the document.', 'danger', true, true, 'pageMessages');
            });
        });
    });

    // Attach event listeners to each approve button
    resultsDiv.querySelectorAll('.document-item .approve-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const docItem = btn.closest('.document-item');
            const docId = docItem.getAttribute('data-doc-id');
            fetch(approveDocumentUrl, {
                method: "POST",
                headers: {
                    "X-CSRFToken": csrfToken,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ doc_id: docId })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    createAlert('Success', 'Approved', 'Document approved.', 'success', true, true, 'pageMessages');
                    docItem.remove();
                } else {
                    createAlert('Error', 'Approve Failed', data.error || 'Unknown error.', 'danger', true, true, 'pageMessages');
                }
            })
            .catch(error => {
                createAlert('Error', 'Approve Failed', 'An error occurred while approving the document.', 'danger', true, true, 'pageMessages');
            });
        });
    });
}

document.addEventListener('DOMContentLoaded', function() {
    // Deny button for pending documents
    document.querySelectorAll('.queue-deny-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const row = btn.closest('.queue-row');
            let docId = null;
            if (row.id.startsWith('pending-doc-')) {
                docId = row.id.replace('pending-doc-', '');
            } else if (row.id.startsWith('onqueue-doc-')) {
                docId = row.id.replace('onqueue-doc-', '');
            }
            fetch(denyDocumentUrl, {
                method: "POST",
                headers: {
                    "X-CSRFToken": csrfToken,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ doc_id: docId })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    row.remove();
                    if (typeof createAlert === "function") {
                        createAlert('Success', 'Denied', 'Document denied.', 'success', true, true, 'pageMessages');
                    }
                } else {
                    alert('Deny failed: ' + (data.error || 'Unknown error.'));
                }
            })
            .catch(() => alert('An error occurred while denying the document.'));
        });
    });

    // Approve button for pending documents
    document.querySelectorAll('.queue-approve-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const row = btn.closest('.queue-row');
            let docId = null;
            if (row.id.startsWith('pending-doc-')) {
                docId = row.id.replace('pending-doc-', '');
            } else if (row.id.startsWith('onqueue-doc-')) {
                docId = row.id.replace('onqueue-doc-', '');
            }
            fetch(approveDocumentUrl, {
                method: "POST",
                headers: {
                    "X-CSRFToken": csrfToken,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ doc_id: docId })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Remove from pending
                    row.remove();
                    if (typeof createAlert === "function") {
                        createAlert('Success', 'Approved', 'Document approved.', 'success', true, true, 'pageMessages');
                    }

                    // Get info from the old row
                    const filename = row.querySelector('.doc-title').textContent;
                    const price = row.querySelector('.doc-price').textContent;
                    const docIdText = row.querySelector('.queue-col.doc-id').textContent;

                    // On Queue Documents
                    const onQueueList = document.querySelector('.on-queue-documents-list');
                    if (onQueueList) {
                        const existingRow = document.getElementById('onqueue-doc-' + docId);
                        if (existingRow) {
                            existingRow.remove();
                        }

                        const newRow = document.createElement('div');
                        newRow.className = 'on-queue-row';
                        newRow.id = 'onqueue-doc-' + docId;

                        newRow.innerHTML = `
                            <div class="queue-col doc-name">
                                <img src="/static/assets/pdf-icon.svg" alt="PDF Icon" class="pdf-icon">
                                <div class="doc-info">
                                    <div class="doc-title" title="${filename}">${filename}</div>
                                    <div class="doc-price">${price}</div>
                                </div>
                            </div>
                            <div class="queue-col doc-printer">
                                <span class="printer-status printer-queued"></span>
                                No Printer Assigned (Queued)
                            </div>
                            <div class="queue-col doc-approved">${data.admin_name ? data.admin_name : '-'}</div>
                            <div class="queue-col doc-id">${docIdText}</div>
                            <div class="queue-col doc-actions">
                                <button class="queue-cancel-btn">Cancel</button>
                            </div>
                        `;
                        onQueueList.appendChild(newRow);

                        // Attach cancel event to the new cancel button
                        const cancelBtn = newRow.querySelector('.queue-cancel-btn');
                        if (cancelBtn) {
                            cancelBtn.addEventListener('click', function() {
                                const row = cancelBtn.closest('.on-queue-row');
                                let docId = null;
                                if (row && row.id.startsWith('onqueue-doc-')) {
                                    docId = row.id.replace('onqueue-doc-', '');
                                }
                                if (!docId) return;
                                fetch(denyDocumentUrl, {
                                    method: "POST",
                                    headers: {
                                        "X-CSRFToken": csrfToken,
                                        "Content-Type": "application/json"
                                    },
                                    body: JSON.stringify({ doc_id: docId })
                                })
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        row.remove();
                                        if (typeof createAlert === "function") {
                                            createAlert('Success', 'Cancelled', 'Document cancelled.', 'success', true, true, 'pageMessages');
                                        }
                                    } else {
                                        alert('Cancel failed: ' + (data.error || 'Unknown error.'));
                                    }
                                })
                                .catch(() => alert('An error occurred while cancelling the document.'));
                            });
                        }
                    }
                } else {
                    alert('Approve failed: ' + (data.error || 'Unknown error.'));
                }
            })
            .catch(() => alert('An error occurred while approving the document.'));
        });
    });

    // Cancel button for on-queue documents
    document.querySelectorAll('.queue-cancel-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const row = btn.closest('.on-queue-row');
            let docId = null;
            if (row && row.id.startsWith('onqueue-doc-')) {
                docId = row.id.replace('onqueue-doc-', '');
            }
            if (!docId) return;
            fetch(denyDocumentUrl, {
                method: "POST",
                headers: {
                    "X-CSRFToken": csrfToken,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ doc_id: docId })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    row.remove();
                    if (typeof createAlert === "function") {
                        createAlert('Success', 'Cancelled', 'Document cancelled.', 'success', true, true, 'pageMessages');
                    }
                } else {
                    alert('Cancel failed: ' + (data.error || 'Unknown error.'));
                }
            })
            .catch(() => alert('An error occurred while cancelling the document.'));
        });
    });

    // Handed Over button for completed documents
    document.querySelectorAll('.handed-over-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const row = btn.closest('.completed-row');
            const docId = row ? row.getAttribute('data-doc-id') : null;
            if (!docId) return;
            fetch(denyDocumentUrl, {
                method: "POST",
                headers: {
                    "X-CSRFToken": csrfToken,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ doc_id: docId })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    row.remove();
                    if (typeof createAlert === "function") {
                        createAlert('Success', 'Handed Over', 'Document handed over.', 'success', true, true, 'pageMessages');
                    }
                } else {
                    alert('Failed: ' + (data.error || 'Unknown error.'));
                }
            })
            .catch(() => alert('An error occurred while marking as handed over.'));
        });
    });

    // Handled Done button for completed jobs (dashboard)
    document.querySelectorAll('.jobs-done-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const docId = btn.getAttribute('data-doc-id');
            if (!docId) return;
            fetch(denyDocumentUrl, {
                method: "POST",
                headers: {
                    "X-CSRFToken": csrfToken,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ doc_id: docId })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Remove the job from the DOM
                    const wrapper = btn.closest('.jobs-item-wrapper');
                    if (wrapper) wrapper.remove();
                    if (typeof createAlert === "function") {
                        createAlert('Success', 'Done', 'Document marked as done.', 'success', true, true, 'pageMessages');
                    }
                } else {
                    alert('Failed: ' + (data.error || 'Unknown error.'));
                }
            })
            .catch(() => alert('An error occurred while marking as done.'));
        });
    });
});
