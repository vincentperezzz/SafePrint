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
    const clearBtn = document.getElementById('clear-btn');
    const customerIdInput = document.getElementById('customer-id-input');
    const priceToPay = document.getElementById('price-to-pay');
    if (clearBtn && customerIdInput && priceToPay) {
        clearBtn.onclick = function() {
            window.location.href = window.location.pathname;
        };
    }

    if (window.dashboardNotFound === true) {
        if (typeof createAlert === 'function') {
            createAlert('Error', 'Customer Not Found', 'No documents found for this Customer ID.', 'danger', true, true, 'pageMessages');
        }
    }

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



}); // End of DOMContentLoaded event listener

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

document.querySelector('.search-btn').addEventListener('click', function() {
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
        body: JSON.stringify({
            customer_id: customerId
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            displayDocuments(data.documents, data.total_price);
        } else {
            createAlert('Error', 'Search Failed', data.error || 'No documents found for the provided Customer ID.', 'danger', true, true, 'pageMessages');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        createAlert('Error', 'Search Failed', 'An error occurred while searching for documents. Please try again later.', 'danger', true, true, 'pageMessages');
    });
});



