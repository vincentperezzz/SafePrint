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
        fetch('/api/search_customer/', {
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

            fetch('/api/deny-all-documents/', {
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

            fetch('/api/approve-all-documents/', {
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
                    clearCustomerIdAndPrice();
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
                fetch('/api/change-image-ajax/', {
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
        fetch('/api/update-name/', {
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
        fetch('/api/update-username/', {
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
        fetch('/api/update-password/', {
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
        fetch('/api/update-user-password/', {
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
            fetch('/api/delete_user_ajax/', {
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

        fetch('/api/add_user_ajax/', {
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
        fetch('/api/feedback-comments/')
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
        fetch('/api/problem-reports/')
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
                
                fetch('/api/update_printer_field/', {
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
            fetch('/api/deny-document/', {
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

                    // Recalculate total price
                    let total = 0;
                    resultsDiv.querySelectorAll('.document-item .document-info span').forEach(span => {
                        total += parseFloat(span.textContent.replace('₱', '')) || 0;
                    });
                    document.getElementById('price-to-pay').textContent = '₱' + total.toFixed(2);
                    
                    // If no more documents, clear everything and hide search/title
                    if (resultsDiv.querySelectorAll('.document-item').length === 0) {
                        clearCustomerIdAndPrice();
                        const searchBar = resultsDiv.querySelector('.search-bar');
                        const docTitle = resultsDiv.querySelector('.document-item-title');
                        if (searchBar) searchBar.style.display = 'none';
                        if (docTitle) docTitle.style.display = 'none';
                        Array.from(resultsDiv.querySelectorAll('.no-documents')).forEach(el => el.remove());
                        resultsDiv.innerHTML += `
                            <div class="no-documents">
                                <img src="/static/assets/no-documents.png" alt="No Documents">
                                <p>No documents found, Please enter a Customer ID</p>
                            </div>
                        `;
                    }
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
            fetch('/api/approve-document/', {
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
                    
                    // Recalculate total price
                    let total = 0;
                    resultsDiv.querySelectorAll('.document-item .document-info span').forEach(span => {
                        total += parseFloat(span.textContent.replace('₱', '')) || 0;
                    });
                    document.getElementById('price-to-pay').textContent = '₱' + total.toFixed(2);

                    // If no more documents, clear everything
                    if (resultsDiv.querySelectorAll('.document-item').length === 0) {
                        clearCustomerIdAndPrice();
                        const searchBar = resultsDiv.querySelector('.search-bar');
                        const docTitle = resultsDiv.querySelector('.document-item-title');
                        if (searchBar) searchBar.style.display = 'none';
                        if (docTitle) docTitle.style.display = 'none';
                        Array.from(resultsDiv.querySelectorAll('.no-documents')).forEach(el => el.remove());
                        resultsDiv.innerHTML += `
                            <div class="no-documents">
                                <img src="/static/assets/no-documents.png" alt="No Documents">
                                <p>No documents found, Please enter a Customer ID</p>
                            </div>
                        `;
                    }
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

// Auto-clear CID and Price
function clearCustomerIdAndPrice() {
    const customerInput = document.getElementById('customer-id-input');
    const priceDisplay = document.getElementById('price-to-pay');
    if (customerInput) customerInput.value = '';
    if (priceDisplay) priceDisplay.textContent = '₱0.00';
    toggleActionButtons(false);
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
            fetch('/api/deny-document/', {
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

                    // When updating the pending list (e.g., after approve/deny):
                    const pendingList = document.getElementById('pending-list');
                    const noMatchRow = document.getElementById('no-match-row');
                    if (pendingList && noMatchRow) {
                        // Only count actual pending docs, not the empty/match rows
                        const remainingRows = pendingList.querySelectorAll('.queue-row[id^="pending-doc-"]');
                        if (remainingRows.length === 0) {
                            noMatchRow.style.display = 'flex';
                        } else {
                            noMatchRow.style.display = 'none';
                        }
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
            fetch('/api/approve-document/', {
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

                    // When updating the pending list (e.g., after approve/deny):
                    const pendingList = document.getElementById('pending-list');
                    let noPendingRow = document.getElementById('no-pending-documents-row');
                    if (pendingList) {
                        const remainingRows = pendingList.querySelectorAll('.queue-row[id^="pending-doc-"]');
                        if (remainingRows.length === 0) {
                            if (!noPendingRow) {
                                noPendingRow = document.createElement('div');
                                noPendingRow.className = 'queue-row';
                                noPendingRow.id = 'no-pending-documents-row';
                                noPendingRow.style.display = 'flex';
                                noPendingRow.innerHTML = `<div class="queue-col" style="width: 100%; text-align: center;">No pending documents.</div>`;
                                pendingList.appendChild(noPendingRow);
                            } else {
                                noPendingRow.style.display = 'flex';
                            }
                        } else if (noPendingRow) {
                            noPendingRow.style.display = 'none';
                        }
                    }
    
                    // Remove "No documents in queue." if present
                    const onQueueList = document.querySelector('.on-queue-documents-list');
                    const noOnqueueRow = document.getElementById('no-onqueue-documents-row');
                    if (noOnqueueRow) {
                        noOnqueueRow.remove();
                    }
    
                    // Add the newly approved document to On Queue Documents
                    if (onQueueList) {
                        const filename = row.querySelector('.doc-title').textContent;
                        const price = row.querySelector('.doc-price') ? row.querySelector('.doc-price').textContent : '';
                        const docIdText = row.querySelector('.queue-col.doc-id').textContent;
                        const customerId = row.querySelector('.queue-col.doc-customer') ? row.querySelector('.queue-col.doc-customer').textContent : '';
    
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
                                <div>
                                    <span class="printer-status printer-queued"></span>
                                    No Printer Assigned (Queued)
                                </div>
                            </div>
                            <div class="queue-col doc-approved">${data.admin_name ? data.admin_name : '-'}</div>
                            <div class="queue-col doc-id">${docIdText}</div>
                            <div class="queue-col doc-customer">${customerId}</div>
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
                                fetch('/api/deny-document/', {
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
                                        updateOnQueueEmptyState();
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
            fetch('/api/deny-document/', {
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
                    updateOnQueueEmptyState();
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
            fetch('/api/deny-document/', {
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
                    const printerCard = row.closest('.completed-printer-card');
                    row.remove();

                    // Check if there are any more completed jobs for this printer
                    const remainingRows = printerCard.querySelectorAll('.completed-row[data-doc-id]');
                    if (remainingRows.length === 0) {
                        // Add the empty state for this printer
                        const emptyDiv = document.createElement('div');
                        emptyDiv.className = 'completed-row completed-empty';
                        emptyDiv.innerHTML = `
                            <img src="/static/assets/all-completed.png" alt="All Completed" class="all-completed">
                            <div class="completed-empty-text">All jobs handed over!</div>
                        `;
                        printerCard.appendChild(emptyDiv);
                    }

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
    document.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('jobs-done-btn')) {
            const btn = e.target;
            const wrapper = btn.closest('.jobs-item-wrapper');
            const jobsItem = wrapper ? wrapper.parentElement : null;
            const docId = btn.getAttribute('data-doc-id');
            if (!docId) return;
            fetch('/api/deny-document/', {
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
                    if (wrapper) wrapper.remove();
    
                    // If no more jobs, show the empty state
                    if (jobsItem && jobsItem.querySelectorAll('.jobs-item-wrapper').length === 0) {
                        jobsItem.innerHTML = `
                            <div class="no-jobs">
                                <img src="/static/assets/empty-jobs.png" alt="Completed Jobs">
                                <p>All Completed!</p>
                            </div>
                        `;
                        // Hide the completedJobs-item-title if present
                        const title = document.querySelector('.completedJobs-item-title');
                        if (title) title.style.display = 'none';
                    }
    
                    if (typeof createAlert === "function") {
                        createAlert('Success', 'Handed Over', 'Document handed over.', 'success', true, true, 'pageMessages');
                    }
                } else {
                    alert('Failed: ' + (data.error || 'Unknown error.'));
                }
            })
            .catch(() => alert('An error occurred while marking as handed over.'));
        }
    });

    // Function to update printer status in the UI
    function update_printer(printer) {
        // Find the printer row by its ID
        const row = document.querySelector(`.printer-table-row [data-printer-id="${printer.id}"]`)?.closest('.printer-table-row') ||
                Array.from(document.querySelectorAll('.printer-table-row')).find(row => {
                    const printerName = row.querySelector('.printer-name')?.textContent?.trim();
                    return printerName === printer.printer_name;
                });
                
        if (!row) return; // Printer not found in the UI
        
        // Update printer name and model
        const printerNameElement = row.querySelector('.printer-name');
        if (printerNameElement) {
            printerNameElement.textContent = printer.printer_name;
        }
        
        const printerModelElement = row.querySelector('.printer-model');
        if (printerModelElement) {
            printerModelElement.textContent = printer.model_name;
        }
        
        // Update IP address
        const ipElement = row.children[1]; 
        if (ipElement) {
            ipElement.textContent = printer.ip_address;
        }
        
        // Update Node name
        const nodeElement = row.children[2];
        if (nodeElement) {
            nodeElement.textContent = printer.node_name;
        }
        
        // Update status dot and text
        const statusDot = row.querySelector('.status-dot');
        if (statusDot) {
            statusDot.classList.remove('ready', 'sleep', 'printing', 'error');
            if (printer.printer_status === 'Ready') statusDot.classList.add('ready');
            else if (printer.printer_status === 'Sleep') statusDot.classList.add('sleep');
            else if (printer.printer_status === 'Printing') statusDot.classList.add('printing');
            else statusDot.classList.add('error');
            
            const statusContainer = statusDot.parentElement;
            if (statusContainer) {
                let node = statusDot.nextSibling;
                while (node) {
                    const nextNode = node.nextSibling;
                    if (node.nodeType === 3 || node.tagName !== 'SPAN') {
                        statusContainer.removeChild(node);
                    }
                    node = nextNode;
                }
                statusContainer.appendChild(document.createTextNode(' ' + printer.printer_status));
            }
        }
        
        // Update ink bars
        const inkBarsContainer = row.querySelector('.ink-bars');
        if (inkBarsContainer) {
            inkBarsContainer.innerHTML = '';
            
            if (printer.ink_status === 'OK') {
                // For OK status, show all colors (b, y, c, m)
                ['b', 'y', 'c', 'm'].forEach(color => {
                    const inkSpan = document.createElement('span');
                    inkSpan.className = 'ink ' + color;
                    inkSpan.title = 'OK';
                    inkBarsContainer.appendChild(inkSpan);
                });
                
                const inkStatusSpan = row.querySelector('.ink-status');
                if (inkStatusSpan) {
                    inkStatusSpan.textContent = 'OK';
                    inkStatusSpan.className = 'ink-status ok';
                }
            } else if (printer.ink_status && printer.ink_status !== 'OK') {
                // For LOW INK status, only show the specific colors listed
                const lowColors = printer.ink_status.split(',');
                lowColors.forEach(color => {
                    color = color.trim().toLowerCase();
                    if (color) {
                        // Map color names to their abbreviations
                        const colorMap = { 'black': 'b', 'yellow': 'y', 'cyan': 'c', 'magenta': 'm' };
                        const className = colorMap[color] || color;
                        
                        const inkSpan = document.createElement('span');
                        inkSpan.className = 'ink ' + className;
                        inkSpan.title = 'LOW';
                        inkBarsContainer.appendChild(inkSpan);
                    }
                });
                
                const inkStatusSpan = row.querySelector('.ink-status');
                if (inkStatusSpan) {
                    inkStatusSpan.textContent = 'LOW INK';
                    inkStatusSpan.className = 'ink-status low';
                }
            }
        }
        
        // Update paper assigned and GSM dropdowns if needed
        if (printer.paper_assigned) {
            const paperSelect = row.querySelector('select[data-field="paper_assigned"]');
            if (paperSelect) {
                paperSelect.value = printer.paper_assigned;
            }
        }
        
        if (printer.paper_quality) {
            const gsmSelect = row.querySelector('select[data-field="paper_quality"]');
            if (gsmSelect) {
                gsmSelect.value = printer.paper_quality;
            }
        }
    }

    // SSE for real-time printer status and ink updates
    if (window.location.pathname.includes('/portal/status/')) {
        console.log('Setting up SSE connection for printer status...');
        let evtSource = new EventSource('/sse/printer-status/');
        
        evtSource.onopen = function() {
            console.log('SSE connection opened successfully');
        };
        
        evtSource.onerror = function(err) {
            console.error('SSE connection error:', err);
            
            // Try to reconnect after a delay
            setTimeout(() => {
                evtSource.close();
                evtSource = new EventSource('/sse/printer-status/');
            }, 5000);
        };
        
        evtSource.onmessage = function(event) {
            console.log('SSE message received:', event.data);
            try {
                const data = JSON.parse(event.data);
                // Flexibly handle different data formats
                const printers = Array.isArray(data) ? data : (data.printers || []);
                
                console.log('SSE parsed printer data:', printers); // Debug logging
                
                // Update each printer in the UI
                printers.forEach(printer => {
                    console.log('Updating printer:', printer.printer_name);
                    console.log('  IP Address:', printer.ip_address);
                    console.log('  Node Name:', printer.node_name);
                    console.log('  Status:', printer.printer_status);
                    console.log('  Ink Status:', printer.ink_status);
                    update_printer(printer);
                });
                
                // Last update timestamp has been removed
            } catch (e) {
                console.error('SSE parse error:', e, event.data);
            }
        };
    }

    // Global SSE for dashboard stats across all portal pages (for tab title flashing).
    if (window.location.pathname.startsWith('/portal/')) {
        let baseTitle = document.title;
        let titleFlashInterval = null;
        
        function startTitleFlash(completedCount) {
            // Coerce and guard: if 0 or invalid, stop flashing
            completedCount = parseInt(String(completedCount), 10) || 0;
            if (completedCount <= 0) {
                stopTitleFlash();
                return;
            }
            // Reset any existing interval before starting
            if (titleFlashInterval) {
                clearInterval(titleFlashInterval);
                titleFlashInterval = null;
            }
            let showCompleted = true;
            titleFlashInterval = setInterval(() => {
                document.title = showCompleted ? `(${completedCount}) Print Jobs Completed` : baseTitle;
                showCompleted = !showCompleted;
            }, 1000);
        }

        function stopTitleFlash() {
            if (titleFlashInterval) {
                clearInterval(titleFlashInterval);
                titleFlashInterval = null;
            }
            document.title = baseTitle;
        }

    const evtSourceDash = new EventSource('/sse/dashboard-status/');
        evtSourceDash.onmessage = function(event) {
            try {
        const stats = JSON.parse(event.data);
                // Use the "Print Jobs Completed" value directly for the flashing count (coerced to number).
                let completedCount = parseInt(String(stats.completed_jobs_count), 10);
                if (Number.isNaN(completedCount)) {
                    completedCount = Array.isArray(stats.completed_documents)
                        ? stats.completed_documents.length
                        : 0;
                }
                completedCount = Math.max(0, completedCount);
                if (completedCount > 0) {
                    startTitleFlash(completedCount);
                    console.log(completedCount)
                } else {
                    stopTitleFlash();
                }

                // Only update dashboard DOM when on dashboard page (support with/without trailing slash)
                if (window.location.pathname.includes('/portal/dashboard')) {
                    // Update Print Jobs Completed
                    const completedElem = document.querySelector('.stat-card.green p');
                    if (completedElem && stats.hasOwnProperty('completed_jobs_count')) {
                        completedElem.textContent = String(stats.completed_jobs_count);
                    }
                    // Update Printer Errors
                    const errorElem = document.querySelector('.stat-card.red p');
                    if (errorElem && stats.hasOwnProperty('printer_errors_count')) {
                        errorElem.textContent = String(stats.printer_errors_count);
                    }
                    // Update Pending Customers
                    const pendingElem = document.querySelector('.stat-card.yellow p');
                    if (pendingElem && stats.hasOwnProperty('pending_customers_count')) {
                        pendingElem.textContent = String(stats.pending_customers_count);
                    }

                    // Update Completed Jobs List (dashboard-right)
                    const completedSection = document.querySelector('.completed-jobs');
                    if (completedSection && Array.isArray(stats.completed_documents)) {
                        const docs = stats.completed_documents;

                        // Ensure title row exists/visibility when there are docs
                        let titleRow = completedSection.querySelector('.completedJobs-item-title');
                        const headerRow = completedSection.querySelector('.dashboard-rows');
                        if (docs.length > 0) {
                            if (!titleRow) {
                                titleRow = document.createElement('div');
                                titleRow.className = 'completedJobs-item-title';
                                titleRow.innerHTML = '<span>Document Name</span><p>Printer Assigned</p>';
                                if (headerRow && headerRow.parentNode) {
                                    headerRow.parentNode.insertBefore(titleRow, headerRow.nextSibling);
                                } else {
                                    completedSection.prepend(titleRow);
                                }
                            } else {
                                titleRow.style.display = '';
                            }
                        } else if (titleRow) {
                            // Hide title when no docs
                            titleRow.style.display = 'none';
                        }

                        // Ensure the container exists
                        let jobsItem = completedSection.querySelector('.jobs-item');
                        if (!jobsItem) {
                            jobsItem = document.createElement('div');
                            jobsItem.className = 'jobs-item';
                            completedSection.appendChild(jobsItem);
                        }

                        // Remove any outer no-jobs placeholders inside the section
                        completedSection.querySelectorAll('.no-jobs').forEach(el => el.remove());

                        // Populate list or show empty state
                        if (docs.length > 0) {
                            jobsItem.innerHTML = '';
                            docs.forEach(doc => {
                                const wrapper = document.createElement('div');
                                wrapper.className = 'jobs-item-wrapper';
                                const printerAssigned = doc.printer_name || doc.printed_at || 'No Printer';
                                wrapper.innerHTML = `
                                    <h6 title="${doc.filename}">${doc.filename}</h6>
                                    <div class="Printer-Assigned">${printerAssigned}</div>
                                    <button class="jobs-done-btn" data-doc-id="${doc.doc_id}">Done</button>
                                `;
                                jobsItem.appendChild(wrapper);
                            });
                        } else {
                            jobsItem.innerHTML = `
                                <div class="no-jobs">
                                    <img src="/static/assets/empty-jobs.png" alt="Completed Jobs">
                                    <p>All Completed!</p>
                                </div>
                            `;
                        }
                    }
                }
            } catch (e) {
                console.error('Dashboard SSE parse error:', e);
            }
        };
    }

});

// Utility function to update the On Queue empty state
function updateOnQueueEmptyState() {
    const onQueueList = document.querySelector('.on-queue-documents-list');
    let noOnqueueRow = document.getElementById('no-onqueue-documents-row');
    if (onQueueList) {
        const remainingOnQueueRows = onQueueList.querySelectorAll('.on-queue-row[id^="onqueue-doc-"]');
        if (remainingOnQueueRows.length === 0) {
            if (!noOnqueueRow) {
                noOnqueueRow = document.createElement('div');
                noOnqueueRow.className = 'on-queue-row';
                noOnqueueRow.id = 'no-onqueue-documents-row';
                noOnqueueRow.style.display = 'flex';
                noOnqueueRow.innerHTML = `<div class="queue-col" style="width: 100%; text-align: center;">No documents in queue.</div>`;
                onQueueList.appendChild(noOnqueueRow);
            } else {
                noOnqueueRow.style.display = 'flex';
            }
        } else if (noOnqueueRow) {
            noOnqueueRow.style.display = 'none';
        }
    }
}

// Printer Status Edit Button
let currentEditPrinterId = null;
function openPrinterEditPopup(printerName, printerIP, printerId) {
  document.getElementById('printerEditPopup').style.display = 'flex';
  document.getElementById('editPrinterName').value = printerName || '';
  document.getElementById('editPrinterIP').value = printerIP || '';
  currentEditPrinterId = printerId;
}

function closePrinterEditPopup() {
  document.getElementById('printerEditPopup').style.display = 'none';
  currentEditPrinterId = null;
}

// Printer Status Add Printer Button modal control
function openAddPrinterPopup() {
  var popup = document.getElementById('addPrinterPopup');
  if (popup) popup.style.display = 'flex';
}

function closeAddPrinterPopup() {
  var popup = document.getElementById('addPrinterPopup');
  if (popup) popup.style.display = 'none';
}

document.getElementById('printerEditForm').onsubmit = function(e) {
  e.preventDefault();
  var printerName = document.getElementById('editPrinterName').value;
  var printerIP = document.getElementById('editPrinterIP').value;
  var printerId = currentEditPrinterId;
  if (printerName && printerIP && printerId) {
    var data = new FormData();
    data.append('printer_id', printerId);
    data.append('printer_name', printerName);
    data.append('ip_address', printerIP);
    fetch('/api/edit_printer/', {
      method: 'POST',
      headers: { 'X-CSRFToken': csrfToken },
      body: data
    }).then(res => res.json()).then(resp => {
      if (resp.success) {
        if (typeof createAlert === 'function') {
          createAlert('Success', 'Printer Updated', 'Printer details updated successfully.', 'success', true, true, 'pageMessages');
        }
        window.location.reload();
      } else {
        if (typeof createAlert === 'function') {
          createAlert('Error', 'Update Failed', resp.error || 'Failed to update printer.', 'danger', true, true, 'pageMessages');
        } else {
          alert(resp.error || 'Failed to update printer');
        }
      }
    }).catch(() => {
      if (typeof createAlert === 'function') {
        createAlert('Error', 'Update Failed', 'An error occurred while updating the printer.', 'danger', true, true, 'pageMessages');
      } else {
        alert('An error occurred while updating the printer.');
      }
    });
  }
  closePrinterEditPopup();
};

// Printer Status Add Printer Button
document.getElementById('addPrinterForm').onsubmit = function(e) {
  e.preventDefault();
  var printerName = document.getElementById('addPrinterName').value;
  var printerIP = document.getElementById('addPrinterIP').value;
  if (printerName && printerIP) {
    var data = new FormData();
    data.append('printer_name', printerName);
    data.append('ip_address', printerIP);
    fetch('/api/add_printer/', {
      method: 'POST',
      headers: { 'X-CSRFToken': csrfToken },
      body: data
    }).then(res => res.json()).then(resp => {
      if (resp.success) {
        if (typeof createAlert === 'function') {
          createAlert('Success', 'Printer Added', 'Printer added successfully.', 'success', true, true, 'pageMessages');
        }
        window.location.reload();
      } else {
        if (typeof createAlert === 'function') {
          createAlert('Error', 'Add Failed', resp.error || 'Failed to add printer.', 'danger', true, true, 'pageMessages');
        } else {
          alert(resp.error || 'Failed to add printer');
        }
      }
    }).catch(() => {
      if (typeof createAlert === 'function') {
        createAlert('Error', 'Add Failed', 'An error occurred while adding the printer.', 'danger', true, true, 'pageMessages');
      } else {
        alert('An error occurred while adding the printer.');
      }
    });
  }
  closeAddPrinterPopup();
};

// Settings page: Notification sound preferences
document.addEventListener('DOMContentLoaded', function () {
    if (!window.location.pathname.includes('/portal/settings')) return;

    const soundSelect = document.getElementById('notification-sound');
    const enabledToggle = document.getElementById('sound-enabled');
    const volumeRange = document.getElementById('sound-volume');
    const volumeValue = document.getElementById('sound-volume-value');
    const previewBtn = document.getElementById('preview-sound');
    const previewAudio = document.getElementById('sound-preview');
    const saveBtn = document.getElementById('save-sound-prefs');

    if (!soundSelect || !previewAudio) return; // nothing to do

    // Build a sound map from option data attributes
    const soundMap = {};
    Array.from(soundSelect.options || []).forEach(opt => {
        soundMap[opt.value] = opt.getAttribute('data-filepath') || '';
    });

    function clamp01(x) { return Math.max(0, Math.min(1, x)); }

    function setPreviewSrc() {
        const slug = soundSelect.value;
        const src = soundMap[slug];
        if (src) previewAudio.src = src;
    }

    if (volumeRange && volumeValue) {
        volumeRange.addEventListener('input', function () {
            volumeValue.textContent = this.value;
            const v = parseInt(this.value, 10);
            previewAudio.volume = clamp01((isNaN(v) ? 0 : v) / 100);
        });
    }

    if (previewBtn) {
        previewBtn.addEventListener('click', function () {
            setPreviewSrc();
            try { previewAudio.currentTime = 0; } catch (e) {}
            previewAudio.play().catch(() => {});
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', function () {
            const payload = {
                sound_slug: soundSelect.value || null,
                sound_enabled: !!(enabledToggle && enabledToggle.checked),
                sound_volume: volumeRange ? parseInt(volumeRange.value, 10) : 100
            };
            fetch('/api/update-notification-prefs/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': typeof csrfToken !== 'undefined' ? csrfToken : '',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            })
                .then(r => r.json())
                .then(data => {
                    if (data && data.success) {
                        if (typeof createAlert === 'function') {
                            createAlert('Success', 'Saved', 'Notification preferences updated.', 'success', true, true, 'pageMessages');
                        }
                    } else {
                        if (typeof createAlert === 'function') {
                            createAlert('Error', 'Save Failed', (data && data.error) || 'Unable to save preferences.', 'danger', true, true, 'pageMessages');
                        }
                    }
                })
                .catch(() => {
                    if (typeof createAlert === 'function') {
                        createAlert('Error', 'Save Failed', 'Network error saving preferences.', 'danger', true, true, 'pageMessages');
                    }
                });
        });
    }

    // Initialize preview state
    setPreviewSrc();
    const initVol = volumeRange ? parseInt(volumeRange.value, 10) : 100;
    previewAudio.volume = clamp01((isNaN(initVol) ? 1 : initVol) / 100);
});