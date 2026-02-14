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

window.onload = function () {
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
    const ticketModal = document.getElementById('ticket-modal');
    const openTicketButtons = document.querySelectorAll('[data-open-ticket-modal]');
    const closeTicketTargets = document.querySelectorAll('[data-close-ticket-modal]');

    const openTicketModal = (button) => {
        if (!ticketModal) return;

        // Populate modal fields from data attributes on the clicked button
        if (button) {
            document.getElementById('modal-customer-id').textContent = '#' + (button.getAttribute('data-customer-id') || '');
            document.getElementById('modal-doc-id').textContent = button.getAttribute('data-doc-id') || '—';
            document.getElementById('modal-customer-name').textContent = button.getAttribute('data-customer-name') || '';
            document.getElementById('modal-doc-name').textContent = button.getAttribute('data-doc-name') || '';
            document.getElementById('modal-email').textContent = button.getAttribute('data-email') || '';
            document.getElementById('modal-phone').textContent = button.getAttribute('data-phone') || '—';
            document.getElementById('modal-issue').textContent = button.getAttribute('data-issue') || '';
            document.getElementById('modal-problem-type').textContent = button.getAttribute('data-problem-type') || '';
            document.getElementById('modal-reprinted').textContent = button.getAttribute('data-was-reprinted') === 'True' ? 'Yes' : 'No';
            document.getElementById('ticket-modal-title').textContent = 'Ticket ' + (button.getAttribute('data-ticket-number') || '');
        }

        ticketModal.classList.add('is-open');
        ticketModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    };

    const closeTicketModal = () => {
        if (!ticketModal) return;
        ticketModal.classList.remove('is-open');
        ticketModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    };

    if (ticketModal) {
        // Use event delegation so dynamically added buttons also work
        document.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-open-ticket-modal]');
            if (btn) openTicketModal(btn);
        });

        closeTicketTargets.forEach((target) => {
            target.addEventListener('click', closeTicketModal);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && ticketModal.classList.contains('is-open')) {
                closeTicketModal();
            }
        });
    }

    const activeResults = document.getElementById('document-results');
    const resolvedResults = document.querySelector('.resolved-list-container .document-results');

    const buildResolvedRow = (data) => {
        const row = document.createElement('div');
        row.className = 'document-item resolved-row';
        const priceText = data.payment_amount ? '₱' + Number(data.payment_amount).toFixed(2) : (data.price || '—');
        const ticketNumber = data.ticket_number || data.ticketNumber || '';
        const customerName = data.customer_name || data.customerName || '';
        const email = data.email || '';
        const verifiedBy = data.resolved_by || data.verifiedBy || '—';
        const status = data.status || '';
        const ticketId = data.ticket_id || '';
        const customerId = data.customer_id || '';
        const phone = data.phone || '';
        const docId = data.doc_id || '';
        const docName = data.doc_name || '';
        const issue = data.description || '';
        const problemType = data.problem_type || '';
        const wasReprinted = data.was_reprinted ? 'True' : 'False';

        row.innerHTML = `
            <div class="ticket-cell">
                <img src="/static/assets/ticket-icon.png" alt="Ticket" class="ticket-icon">
                <div class="ticket-meta">
                    <h6>${ticketNumber}</h6>
                    <span>${priceText}</span>
                </div>
            </div>
            <div class="resolved-customer">${customerName}</div>
            <div class="resolved-email">${email}</div>
            <div class="resolved-verifier">${verifiedBy}</div>
            <div class="resolved-status">${status}</div>
            <div class="resolved-details">
                <button class="approve-btn view-details-btn" type="button" data-open-ticket-modal
                    data-ticket-id="${ticketId}"
                    data-ticket-number="${ticketNumber}"
                    data-customer-id="${customerId}"
                    data-customer-name="${customerName}"
                    data-email="${email}"
                    data-phone="${phone}"
                    data-doc-id="${docId}"
                    data-doc-name="${docName}"
                    data-issue="${issue}"
                    data-problem-type="${problemType}"
                    data-was-reprinted="${wasReprinted}"
                >View Details</button>
            </div>
        `;
        return row;
    };

    const updateTicketCounts = () => {
        const activeCountEl = document.getElementById('active-tickets-count');
        const resolvedCountEl = document.getElementById('resolved-tickets-count');

        if (activeResults && activeCountEl) {
            const activeRows = Array.from(activeResults.querySelectorAll('.document-item'))
                .filter((row) => !row.classList.contains('empty-row'));
            activeCountEl.textContent = activeRows.length.toString();
        }

        if (resolvedResults && resolvedCountEl) {
            const resolvedRows = Array.from(resolvedResults.querySelectorAll('.document-item.resolved-row'))
                .filter((row) => !row.classList.contains('empty-row'));
            resolvedCountEl.textContent = resolvedRows.length.toString();
        }
    };

    const updateResolvedEmptyState = () => {
        if (!resolvedResults) return;
        const existingEmptyRow = resolvedResults.querySelector('.document-item.empty-row');
        const rows = Array.from(resolvedResults.querySelectorAll('.document-item.resolved-row'));

        if (rows.length === 0) {
            if (!existingEmptyRow) {
                const emptyRow = document.createElement('div');
                emptyRow.className = 'document-item resolved-row empty-row';
                emptyRow.innerHTML = `
                    <div class="ticket-cell">
                        <div class="ticket-meta">
                            <h6>No resolved tickets.</h6>
                        </div>
                    </div>
                    <div class="resolved-customer"></div>
                    <div class="resolved-email"></div>
                    <div class="resolved-verifier"></div>
                    <div class="resolved-status"></div>
                `;
                resolvedResults.appendChild(emptyRow);
            }
        } else if (existingEmptyRow) {
            existingEmptyRow.remove();
        }
    };

    const updateActiveEmptyState = () => {
        if (!activeResults) return;
        const existingEmpty = activeResults.querySelector('.no-documents');
        const existingEmptyRow = activeResults.querySelector('.document-item.empty-row');
        const rows = Array.from(activeResults.querySelectorAll('.document-item'));

        if (rows.length === 0) {
            if (!existingEmptyRow) {
                if (existingEmpty) existingEmpty.remove();
                const emptyRow = document.createElement('div');
                emptyRow.className = 'document-item empty-row';
                emptyRow.innerHTML = `
                    <div class="ticket-cell">
                        <div class="ticket-meta">
                            <h6>No active tickets.</h6>
                        </div>
                    </div>
                    <div class="ticket-customer"></div>
                    <div class="ticket-date"></div>
                    <div class="ticket-doc"></div>
                    <div class="actions"></div>
                `;
                activeResults.appendChild(emptyRow);
            }
        } else {
            if (existingEmpty) existingEmpty.remove();
            if (existingEmptyRow) existingEmptyRow.remove();
        }
    };

    const moveToResolved = (row, status) => {
        if (!resolvedResults || !row) return;

        const ticketNumber = row.querySelector('.ticket-meta h6')?.textContent?.trim() || '-';
        const price = row.querySelector('.ticket-meta span')?.textContent?.trim() || '-';
        const customerId = row.querySelector('.ticket-customer')?.textContent?.trim() || 'Customer';

        const data = {
            ticketNumber,
            price,
            customerName: row.dataset.customerName || customerId,
            email: row.dataset.customerEmail || 'example@email.com',
            verifiedBy: row.dataset.verifiedBy || 'Admin',
            status
        };

        const newRow = buildResolvedRow(data);
        const header = resolvedResults.querySelector('.list-header');
        if (header && header.nextSibling) {
            resolvedResults.insertBefore(newRow, null);
        } else {
            resolvedResults.appendChild(newRow);
        }

        row.remove();
        updateActiveEmptyState();
        updateResolvedEmptyState();
        updateTicketCounts();
    };

    // Void / Refund button handlers (same pattern as 'Picked Up' on completed page)
    if (activeResults) {
        updateActiveEmptyState();

        // Void buttons
        activeResults.querySelectorAll('.deny-btn[data-action="void"]').forEach(btn => {
            btn.addEventListener('click', function () {
                const row = btn.closest('.document-item');
                const ticketId = btn.getAttribute('data-ticket-id');
                if (!ticketId) return;

                fetch('/portal/api/void-ticket/', {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': csrfToken,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ ticket_id: ticketId })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        if (row) row.remove();

                        // Build and add resolved row
                        if (resolvedResults) {
                            const emptyRow = resolvedResults.querySelector('.empty-row');
                            if (emptyRow) emptyRow.remove();
                            const newRow = buildResolvedRow(data);
                            resolvedResults.appendChild(newRow);
                        }

                        updateActiveEmptyState();
                        updateResolvedEmptyState();
                        updateTicketCounts();

                        if (typeof createAlert === 'function') {
                            createAlert('Success', 'Voided', 'Ticket has been voided.', 'success', true, true, 'pageMessages');
                        }
                    } else {
                        alert('Error: ' + (data.error || 'Unknown error'));
                    }
                })
                .catch(err => alert('Request failed: ' + err.message));
            });
        });

        // Refund buttons
        activeResults.querySelectorAll('.refund-btn[data-action="refund"]').forEach(btn => {
            btn.addEventListener('click', function () {
                const row = btn.closest('.document-item');
                const ticketId = btn.getAttribute('data-ticket-id');
                if (!ticketId) return;

                fetch('/portal/api/refund-ticket/', {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': csrfToken,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ ticket_id: ticketId })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        if (row) row.remove();

                        // Build and add resolved row
                        if (resolvedResults) {
                            const emptyRow = resolvedResults.querySelector('.empty-row');
                            if (emptyRow) emptyRow.remove();
                            const newRow = buildResolvedRow(data);
                            resolvedResults.appendChild(newRow);
                        }

                        updateActiveEmptyState();
                        updateResolvedEmptyState();
                        updateTicketCounts();

                        if (typeof createAlert === 'function') {
                            createAlert('Success', 'Refunded', 'Ticket has been refunded.', 'success', true, true, 'pageMessages');
                        }
                    } else {
                        alert('Error: ' + (data.error || 'Unknown error'));
                    }
                })
                .catch(err => alert('Request failed: ' + err.message));
            });
        });
    }

    updateResolvedEmptyState();

    //Customer ID Enter key Functionality
    const customerIdInput = document.getElementById('customer-id-input');
    const searchBtn = document.getElementById('search-btn');
    if (customerIdInput && searchBtn) {
        customerIdInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchBtn.click();
            }
        });
    }

    // CID Post to Backend
    if (searchBtn) {
        searchBtn.addEventListener('click', function () {
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
        clearBtn.onclick = function () {
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
        denyAllBtn.addEventListener('click', function () {
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
        approveAllBtn.addEventListener('click', function () {
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
        imageUpload.addEventListener('change', function () {
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
        editNameForm.onsubmit = function (e) {
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
        editUsernameForm.onsubmit = function (e) {
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
                        createAlert('Error', 'Update Failed', data.error || 'An error occurred while updating your username.', 'danger', true, false, 'pageMessages');
                    }
                });
        };
    }

    // Edit Password
    const editPasswordForm = document.getElementById('edit-password-form');
    if (editPasswordForm) {
        editPasswordForm.onsubmit = function (e) {
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
        searchUserInput.addEventListener('input', function () {
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
        editUserPasswordForm.onsubmit = function (e) {
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
        deleteBtn.onclick = function () {
            var userId = document.getElementById('delete-user-id').value;
            fetch('/api/delete_user_ajax/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken,
                },
                credentials: 'same-origin',
                body: JSON.stringify({ user_ids: selectedIds })
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
        userAccountsTable.addEventListener('change', function (e) {
            if (e.target.type === 'checkbox') {
                updateDeleteButton();
            }
        });

        // Define updateDeleteButton function within the scope
        function updateDeleteButton() {
            const checkedBoxes = document.querySelectorAll('.user-account-row input[type="checkbox"]:checked');
            deleteSelectedBtn.style.display = checkedBoxes.length > 0 ? 'inline-block' : 'none';
        }

        deleteSelectedBtn.addEventListener('click', function () {
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
        createAccountForm.onsubmit = function (e) {
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
        feedbackBtn.addEventListener('click', function (e) {
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
        problemBtn.addEventListener('click', function (e) {
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

    // Close Feedback Modal
    var closeFeedbackBtn = document.getElementById('closeFeedbackModal');
    if (closeFeedbackBtn) {
        closeFeedbackBtn.onclick = function () {
            document.getElementById('feedbackModal').style.display = 'none';
        };
    }

    // Close Problem Reports Modal
    var closeProblemBtn = document.getElementById('closeProblemModal');
    if (closeProblemBtn) {
        closeProblemBtn.onclick = function () {
            document.getElementById('problemModal').style.display = 'none';
        };
    }

    // Close modals when clicking outside modal content
    window.addEventListener('click', function (event) {
        var feedbackModal = document.getElementById('feedbackModal');
        var problemModal = document.getElementById('problemModal');
        if (feedbackModal && event.target == feedbackModal) {
            feedbackModal.style.display = 'none';
        }
        if (problemModal && event.target == problemModal) {
            problemModal.style.display = 'none';
        }
    })

    // Printer Status Dropdowns Update Database
    const dropdownSelects = document.querySelectorAll('.dropdown-select');
    if (dropdownSelects.length > 0) {
        dropdownSelects.forEach(function (select) {
            select.addEventListener('change', function () {
                const printerId = this.dataset.printerId;
                const field = this.dataset.field;
                const value = this.value;
                // Only handle printer status dropdowns that declare both data attributes
                if (!printerId || !field) return;

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
        searchInput.addEventListener('input', function () {
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
        onqueueSearchInput.addEventListener('input', function () {
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

    if (window.location.pathname.includes('/portal/settings/')) {

        // NOTIFICATIONS SETTINGS API
        const soundSelect = document.getElementById('notification-sound');
        const enabledToggle = document.getElementById('sound-enabled');
        const previewAudio = document.getElementById('sound-preview');

        // Build a sound map from option data attributes
        const soundMap = {};
        Array.from(soundSelect.options || []).forEach(opt => {
            soundMap[opt.value] = opt.dataset.filepath || '';
        });

        function setPreviewSrc() {
            const selectedSound = soundSelect.value;
            if (selectedSound && soundMap[selectedSound]) {
                previewAudio.src = soundMap[selectedSound];
            }
        }

        // Fetch current settings from server first when page loads
        function fetchNotificationPrefs() {
            console.log("Fetching notification preferences from server...");
            fetch('/api/get-notification-prefs/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken,
                    'Content-Type': 'application/json'
                }
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        console.log("Received notification preferences from server:", data);

                        // Update the UI with server values
                        if (data.sound_slug && soundSelect.querySelector(`option[value="${data.sound_slug}"]`)) {
                            soundSelect.value = data.sound_slug;
                        }
                        enabledToggle.checked = data.sound_enabled;

                        // Update localStorage with server values
                        localStorage.setItem('sound_slug', data.sound_slug);
                        localStorage.setItem('sound_enabled', data.sound_enabled ? 'true' : 'false');

                        // Update preview source
                        setPreviewSrc();

                        console.log("Updated settings from server - Sound enabled:", data.sound_enabled, "Sound slug:", data.sound_slug);
                    } else {
                        console.error("Failed to fetch notification preferences:", data.error);
                    }
                })
                .catch(error => {
                    console.error("Error fetching notification preferences:", error);
                });
        }

        // Fetch preferences from server when settings page loads
        fetchNotificationPrefs();

        function savePrefs(payload, onSuccess) {
            fetch('/api/update-notification-prefs/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        if (typeof createAlert === "function") {
                            createAlert('Success', 'Preferences Updated', 'Your notification preferences have been saved.', 'success', true, true, 'pageMessages');
                        }
                        if (onSuccess) onSuccess(data);
                    } else {
                        if (typeof createAlert === "function") {
                            createAlert('Error', 'Update Failed', data.error || 'Failed to update preferences.', 'danger', true, true, 'pageMessages');
                        } else {
                            alert(data.error || 'Failed to update preferences');
                        }
                    }
                })
                .catch(error => {
                    console.error('Error saving preferences:', error);
                    if (typeof createAlert === "function") {
                        createAlert('Error', 'Update Failed', 'An error occurred while saving preferences.', 'danger', true, true, 'pageMessages');
                    } else {
                        alert('An error occurred while saving preferences.');
                    }
                });
        }

        // Autosave: sound change -> save and auto preview
        soundSelect.addEventListener('change', function () {
            setPreviewSrc();
            // Play preview if enabled
            if (enabledToggle.checked) {
                previewAudio.play().catch(e => console.error("Couldn't play preview:", e));
            }
            // Save sound selection to localStorage
            localStorage.setItem('sound_slug', this.value);

            // Save selection with both sound slug and enabled state to server
            savePrefs({
                sound_slug: this.value,
                sound_enabled: enabledToggle.checked
            });
        });

        // Autosave: enabled toggle
        enabledToggle.addEventListener('change', function () {
            console.log('Toggle changed:', this.checked, soundSelect.value);
            // Save enabled state to localStorage
            localStorage.setItem('sound_enabled', this.checked);

            savePrefs({
                sound_enabled: this.checked,
                sound_slug: soundSelect.value
            });
        });

        // Additional keyboard accessibility
        enabledToggle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                enabledToggle.checked = !enabledToggle.checked;
                enabledToggle.dispatchEvent(new Event('change'));
            }
        });
        const enabledLabel = document.querySelector('label[for="sound-enabled"], .switch-label[for="sound-enabled"]');
        if (enabledLabel && enabledLabel.classList.contains('switch-label')) {
            enabledLabel.addEventListener('click', () => {
                enabledToggle.checked = !enabledToggle.checked;
                enabledToggle.dispatchEvent(new Event('change'));
            });
        }

        // Initialize preview state
        setPreviewSrc();
        // Default preview volume
        previewAudio.volume = 1;
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

    printerSearchInput.addEventListener('input', function () {
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
        dashboardSearchInput.oninput = function () {
            const filter = dashboardSearchInput.value.trim().toLowerCase();
            const filteredDocs = lastDocuments.filter(doc =>
                (doc.filename || '').toLowerCase().includes(filter) ||
                (doc.doc_id || '').toLowerCase().includes(filter) ||
                (doc.ticket_number || '').toLowerCase().includes(filter) ||
                (doc.customer_id || '').toLowerCase().includes(filter)
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
        const ticketNumber = doc.ticket_number || doc.doc_id || '';
        const customerId = doc.customer_id ? `#${doc.customer_id.replace('#', '')}` : '';
        const timeSubmitted = doc.time_submitted || '';
        const documentId = doc.document_id || doc.doc_id || '';
        const price = Number.parseFloat(doc.price || 0);
        html += `
        <div class="document-item" data-doc-id="${doc.doc_id}">
            <div class="ticket-cell">
                <img src="/static/assets/pdf-icon.svg" alt="Ticket">
                <div class="ticket-meta">
                    <h6 title="${ticketNumber}">${ticketNumber}</h6>
                    <span>₱${price.toFixed(2)}</span>
                </div>
            </div>
            <div class="ticket-customer">${customerId}</div>
            <div class="ticket-date">${timeSubmitted}</div>
            <div class="ticket-doc">${documentId}</div>
            <div class="actions">
                <button class="deny-btn" type="button">Void</button>
                <button class="approve-btn" type="button">Verify</button>
                <button class="refund-btn" type="button">Refund</button>
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
        btn.addEventListener('click', function () {
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
                        resultsDiv.querySelectorAll('.document-item .ticket-meta span').forEach(span => {
                            total += parseFloat(span.textContent.replace('₱', '')) || 0;
                        });
                        const priceDisplay = document.getElementById('price-to-pay');
                        if (priceDisplay) priceDisplay.textContent = '₱' + total.toFixed(2);

                        // If no more documents, clear everything and hide search/title
                        if (resultsDiv.querySelectorAll('.document-item').length === 0) {
                            if (typeof clearCustomerIdAndPrice === 'function') {
                                clearCustomerIdAndPrice();
                            }
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
        btn.addEventListener('click', function () {
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
                        resultsDiv.querySelectorAll('.document-item .ticket-meta span').forEach(span => {
                            total += parseFloat(span.textContent.replace('₱', '')) || 0;
                        });
                        const priceDisplay = document.getElementById('price-to-pay');
                        if (priceDisplay) priceDisplay.textContent = '₱' + total.toFixed(2);

                        // If no more documents, clear everything
                        if (resultsDiv.querySelectorAll('.document-item').length === 0) {
                            if (typeof clearCustomerIdAndPrice === 'function') {
                                clearCustomerIdAndPrice();
                            }
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

document.addEventListener('DOMContentLoaded', function () {
    // Deny button for pending documents
    document.querySelectorAll('.queue-deny-btn').forEach(btn => {
        btn.addEventListener('click', function () {
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
        btn.addEventListener('click', function () {
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
                                cancelBtn.addEventListener('click', function () {
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
        btn.addEventListener('click', function () {
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
        btn.addEventListener('click', function () {
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
    document.addEventListener('click', function (e) {
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

            if (printer.ink_status === 'N/A') {
                // For N/A status (Offline printer), show no ink bars and black text
                const inkStatusSpan = row.querySelector('.ink-status');
                if (inkStatusSpan) {
                    inkStatusSpan.textContent = 'N/A';
                    inkStatusSpan.className = 'ink-status';
                    inkStatusSpan.style.color = '#000000'; // Black font
                }
            } else if (printer.ink_status === 'OK') {
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
                    inkStatusSpan.style.removeProperty('color'); // Use default color from class
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
                    inkStatusSpan.style.removeProperty('color'); // Use default color from class
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

        function setupPrinterSSE() {
            let evtSource = new EventSource('/sse/printer-status/');

            evtSource.onopen = function () {
                console.log('SSE connection opened successfully');
            };

            evtSource.onerror = function (err) {
                console.error('SSE connection error:', err);
                evtSource.close();
                // Reconnect after a delay (re-attaches all handlers)
                setTimeout(setupPrinterSSE, 5000);
            };

            evtSource.onmessage = function (event) {
                try {
                    const data = JSON.parse(event.data);
                    // Flexibly handle different data formats
                    const printers = Array.isArray(data) ? data : (data.printers || []);

                    // Update each printer in the UI
                    printers.forEach(printer => {
                        update_printer(printer);
                    });
                } catch (e) {
                    console.error('SSE parse error:', e, event.data);
                }
            };
        }

        setupPrinterSSE();
    }

    // Global SSE for dashboard stats across all portal pages (for tab title flashing).
    if (window.location.pathname.startsWith('/portal/')) {
        let baseTitle = document.title;
        let titleFlashInterval = null;
        let previousCompletedCount = 0; // Track previous count to detect changes

        // Create notification audio element
        const notificationAudio = new Audio();

        // Initialize sound settings from server on page load
        function initSoundSettings() {
            fetch('/api/get-notification-prefs/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken,
                    'Content-Type': 'application/json'
                }
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        localStorage.setItem('sound_slug', data.sound_slug || 'chime');
                        localStorage.setItem('sound_enabled', data.sound_enabled ? 'true' : 'false');
                    } else {
                        console.error("Failed to fetch sound settings:", data.error);
                    }
                })
                .catch(error => {
                    console.error("Error fetching sound settings:", error);
                });
        }

        initSoundSettings();

        // Request notification permission if we haven't asked before
        function requestNotificationPermission() {
            if ("Notification" in window && Notification.permission === "default") {
                Notification.requestPermission().then(permission => {
                    console.log("Notification permission:", permission);
                });
            }
        }

        // Request permission when dashboard page loads
        if (window.location.pathname.includes('/portal/dashboard')) {
            requestNotificationPermission();
        }

        function playNotificationSound() {

            // If sound settings are missing from localStorage, fetch them from server first
            if (!localStorage.getItem('sound_slug')) {
                fetch('/api/get-notification-prefs/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrfToken
                    }
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            // Save to localStorage
                            localStorage.setItem('sound_slug', data.sound_slug);
                            localStorage.setItem('sound_enabled', data.sound_enabled ? 'true' : 'false');

                            // Only play if actually enabled
                            if (data.sound_enabled) {
                                const soundPath = `/static/sounds/${data.sound_slug}.mp3`;
                                notificationAudio.src = soundPath;
                                notificationAudio.volume = 1.0;
                                notificationAudio.play()
                                    .then(() => console.log("Sound played successfully"))
                                    .catch(e => console.error("Couldn't play notification sound:", e));
                            }
                        }
                    })
                    .catch(e => console.error("Couldn't fetch sound preferences:", e));
            } else {
                // Sound settings exist in localStorage
                const soundEnabled = localStorage.getItem('sound_enabled') === 'true';
                let soundSlug = localStorage.getItem('sound_slug');

                if (soundEnabled) {
                    // Normal path - sound slug is available
                    const soundPath = `/static/sounds/${soundSlug}.mp3`;
                    notificationAudio.src = soundPath;
                    notificationAudio.volume = 1.0;
                    notificationAudio.play()
                        .then(() => console.log("Sound played successfully"))
                        .catch(e => console.error("Couldn't play notification sound:", e));
                }
            }
        }

        function startTitleFlash(activeCount) {
            // Coerce and guard: if 0 or invalid, stop flashing
            activeCount = parseInt(String(activeCount), 10) || 0;
            if (activeCount <= 0) {
                stopTitleFlash();
                return;
            }
            // Reset any existing interval before starting
            if (titleFlashInterval) {
                clearInterval(titleFlashInterval);
                titleFlashInterval = null;
            }
            let showActive = true;
            titleFlashInterval = setInterval(() => {
                document.title = showActive ? `(${activeCount}) Active Tickets` : baseTitle;
                showActive = !showActive;
            }, 1000);
        }

        function stopTitleFlash() {
            if (titleFlashInterval) {
                clearInterval(titleFlashInterval);
                titleFlashInterval = null;
            }
            document.title = baseTitle;
        }

        function setupDashboardSSE() {
            let evtSourceDash = new EventSource('/sse/dashboard-status/');

            evtSourceDash.onopen = function () {
                console.log('Dashboard SSE connection established');
            };

            evtSourceDash.onerror = function (err) {
                console.error('Dashboard SSE connection error:', err);
                evtSourceDash.close();
                // Reconnect after a delay (re-attaches all handlers)
                setTimeout(setupDashboardSSE, 5000);
            };

            evtSourceDash.onmessage = function (event) {
            try {
                const stats = JSON.parse(event.data);
                // Use the "Print Jobs Completed" value directly for the flashing count
                let completedCount = parseInt(String(stats.completed_jobs_count), 10);
                if (Number.isNaN(completedCount)) {
                    completedCount = Array.isArray(stats.completed_documents)
                        ? stats.completed_documents.length
                        : 0;
                }
                completedCount = Math.max(0, completedCount);

                // Track document IDs instead of just counts
                const currentDocIds = Array.isArray(stats.completed_documents)
                    ? stats.completed_documents.map(doc => doc.doc_id)
                    : [];

                // Get previously seen document IDs from sessionStorage
                const seenDocIds = JSON.parse(sessionStorage.getItem('seenDocIds') || '[]');

                // Find new document IDs that we haven't seen before
                const newDocIds = currentDocIds.filter(id => !seenDocIds.includes(id));

                // If there are any new document IDs, play the notification
                if (newDocIds.length > 0) {
                    console.log("New completed jobs detected:", newDocIds.length);
                    playNotificationSound();

                    // Show browser notification if supported and permitted
                    if ("Notification" in window && Notification.permission === "granted") {
                        new Notification("SafePrint", {
                            body: `${newDocIds.length} new print job${newDocIds.length > 1 ? 's' : ''} completed`,
                            icon: "/static/assets/favicon.ico"
                        });
                    }

                    // Update the seen document IDs in sessionStorage
                    sessionStorage.setItem('seenDocIds', JSON.stringify(currentDocIds));
                }

                // Use active tickets for title flashing instead of completed jobs
                const activeCount = parseInt(String(stats.active_tickets_count || 0), 10) || 0;
                if (activeCount > 0) {
                    startTitleFlash(activeCount);
                } else {
                    stopTitleFlash();
                }

                // Only update dashboard DOM when on dashboard page
                if (window.location.pathname.includes('/portal/dashboard')) {
                    // Update Print Jobs Completed
                    const completedElem = document.querySelector('.stat-card.green p');
                    if (completedElem && stats.hasOwnProperty('completed_jobs_count')) {
                        completedElem.textContent = String(stats.completed_jobs_count);
                    }
                    // Update Printer Errors / Active Tickets
                    const errorElem = document.getElementById('active-tickets-count');
                    if (errorElem && stats.hasOwnProperty('active_tickets_count')) {
                        errorElem.textContent = String(stats.active_tickets_count);
                    }
                    // Update Pending Customers / Resolved Tickets
                    const pendingElem = document.getElementById('resolved-tickets-count');
                    if (pendingElem && stats.hasOwnProperty('resolved_tickets_count')) {
                        pendingElem.textContent = String(stats.resolved_tickets_count);
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

        setupDashboardSSE();
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

// Printer Delete Function
function showDeletePrinterOverlay(printerId, printerName) {
    document.getElementById('delete-printer-id').value = printerId;
    document.getElementById('delete-printer-name').textContent = printerName;
    showPopupOverlay('deletePrinterOverlay');
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

var printerEditForm = document.getElementById('printerEditForm');
if (printerEditForm) {
    printerEditForm.onsubmit = function (e) {
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
}

// Add event listener for delete printer confirmation button
document.addEventListener('DOMContentLoaded', function () {
    const deletePrinterBtn = document.getElementById('deletePrinterConfirmBtn');
    if (deletePrinterBtn) {
        deletePrinterBtn.addEventListener('click', function () {
            const printerId = document.getElementById('delete-printer-id').value;

            if (!printerId) return;

            fetch('/api/delete_printer/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({ printer_id: printerId })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        createAlert('Success', 'Printer Deleted', 'Printer has been successfully deleted.', 'success', true, true, 'pageMessages');
                        // Reload the page to show updated printer list
                        setTimeout(() => {
                            window.location.reload();
                        }, 1000);
                    } else {
                        createAlert('Error', 'Delete Failed', data.error || 'Failed to delete printer.', 'danger', true, true, 'pageMessages');
                    }
                    hidePopupOverlay('deletePrinterOverlay');
                })
                .catch(error => {
                    console.error('Error deleting printer:', error);
                    createAlert('Error', 'Delete Failed', 'An error occurred while deleting the printer.', 'danger', true, true, 'pageMessages');
                    hidePopupOverlay('deletePrinterOverlay');
                });
        });
    }
});

// Printer Status Add Printer Button
var addPrinterForm = document.getElementById('addPrinterForm');
if (addPrinterForm) {
    addPrinterForm.onsubmit = function (e) {
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
}
// ==================== Real-time Dashboard Ticket Updates ====================
(function() {
    // Only run on dashboard page
    if (!document.getElementById('document-results')) {
        return;
    }

    let lastActiveCount = null;
    let lastResolvedCount = null;

    function renderActiveTicketRow(ticket) {
        const paymentDisplay = ticket.payment_amount ? `₱${ticket.payment_amount.toFixed(2)}` : '—';
        let actionButtons = `
            <button class="deny-btn" type="button" data-action="void" data-ticket-id="${ticket.id}">Void</button>
            <button class="approve-btn" type="button" data-open-ticket-modal
                data-ticket-id="${ticket.id}"
                data-ticket-number="${ticket.ticket_number}"
                data-customer-id="${ticket.customer_id}"
                data-customer-name="${ticket.customer_name}"
                data-email="${ticket.email}"
                data-phone="${ticket.phone_number}"
                data-doc-id="${ticket.doc_id || ''}"
                data-doc-name="${ticket.document_name}"
                data-issue="${ticket.description.replace(/"/g, '&quot;')}"
                data-problem-type="${ticket.problem_type}"
                data-was-reprinted="${ticket.was_reprinted}">Verify</button>
            <button class="refund-btn" type="button" data-action="refund" data-ticket-id="${ticket.id}">Refund</button>
        `;

        return `
            <div class="document-item" data-ticket-number="${ticket.ticket_number}" data-ticket-id="${ticket.id}">
                <div class="ticket-cell">
                    <img src="/static/assets/ticket-icon.png" alt="Ticket" class="ticket-icon">
                    <div class="ticket-meta">
                        <h6>${ticket.ticket_number}</h6>
                        <span>${paymentDisplay}</span>
                    </div>
                </div>
                <div class="ticket-issue">${ticket.problem_type}</div>
                <div class="ticket-date">${ticket.created_at}</div>
                <div class="ticket-customer">#${ticket.customer_id}</div>
                <div class="actions">
                    ${actionButtons}
                </div>
            </div>
        `;
    }

    function renderResolvedTicketRow(ticket) {
        const paymentDisplay = ticket.payment_amount ? `₱${ticket.payment_amount.toFixed(2)}` : '—';
        return `
            <div class="document-item resolved-row">
                <div class="ticket-cell">
                    <img src="/static/assets/ticket-icon.png" alt="Ticket" class="ticket-icon">
                    <div class="ticket-meta">
                        <h6>${ticket.ticket_number}</h6>
                        <span>${paymentDisplay}</span>
                    </div>
                </div>
                <div class="resolved-customer">${ticket.customer_name}</div>
                <div class="resolved-email">${ticket.email}</div>
                <div class="resolved-verifier">${ticket.resolved_by || '—'}</div>
                <div class="resolved-status">${ticket.status}</div>
                <div class="resolved-details">
                    <button class="approve-btn view-details-btn" type="button" data-open-ticket-modal
                        data-ticket-id="${ticket.id}"
                        data-ticket-number="${ticket.ticket_number}"
                        data-customer-id="${ticket.customer_id}"
                        data-customer-name="${ticket.customer_name}"
                        data-email="${ticket.email}"
                        data-phone="${ticket.phone_number}"
                        data-doc-id="${ticket.doc_id || ''}"
                        data-doc-name="${ticket.document_name}"
                        data-issue="${ticket.description.replace(/"/g, '&quot;')}"
                        data-problem-type="${ticket.problem_type}"
                        data-was-reprinted="${ticket.was_reprinted}">View Details</button>
                </div>
            </div>
        `;
    }

    function updateActiveTickets(tickets) {
        // Merge new tickets into the current DOM instead of replacing all HTML.
        const container = document.getElementById('document-results');
        if (!container) return;

        console.log('[tickets] updateActiveTickets called —', tickets.length, 'tickets');

        // Ensure the header/search exists (don't stomp other scripts)
        let header = container.querySelector('.list-header');
        if (!header) {
            header = document.createElement('div');
            header.className = 'list-header';
            header.innerHTML = `
                <div class="search-bar">
                    <input type="text" id="dashboard-search" placeholder="Search by Ticket Number">
                    <span class="search-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z" stroke="#18191F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M20.9999 21L16.6499 16.65" stroke="#18191F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </span>
                </div>
                <div class="document-item-title">
                    <span>Ticket Number</span>
                    <p>Issue</p>
                    <p>Date Submitted</p>
                    <p>Customer ID</p>
                    <span class="action-title"></span>
                </div>
            `;
            // Insert header at top
            container.insertAdjacentElement('afterbegin', header);
        }

        // Build a set of incoming ticket IDs
        const incomingIds = new Set(tickets.map(t => String(t.id)));

        // Remove DOM items that are no longer active
        Array.from(container.querySelectorAll('.document-item[data-ticket-id]')).forEach(el => {
            const id = el.getAttribute('data-ticket-id');
            if (!incomingIds.has(id)) {
                el.remove();
            }
        });

        // For each incoming ticket, append if not present
        tickets.forEach(ticket => {
            const exists = container.querySelector('.document-item[data-ticket-id="' + ticket.id + '"]');
            if (!exists) {
                console.log('[tickets] adding ticket', ticket.id, ticket.ticket_number);
                // Insert new ticket right after the header
                const temp = document.createElement('div');
                temp.innerHTML = renderActiveTicketRow(ticket);
                const node = temp.firstElementChild;
                if (header.nextSibling) {
                    container.insertBefore(node, header.nextSibling);
                } else {
                    container.appendChild(node);
                }
            } else {
                // existing
                // console.log('[tickets] already present', ticket.id);
            }
        });

        // If there are no tickets, ensure an empty-row message exists
        if (tickets.length === 0) {
            if (!container.querySelector('.empty-row')) {
                const empty = document.createElement('div');
                empty.className = 'document-item empty-row';
                empty.innerHTML = `<p style="text-align:center; width:100%; padding:1em; color:#888;">No active tickets</p>`;
                container.appendChild(empty);
            }
        } else {
            // Remove any empty-row placeholder
            Array.from(container.querySelectorAll('.empty-row')).forEach(el => el.remove());
        }

        attachTicketEventListeners();
    }

    function updateResolvedTickets(tickets) {
        const container = document.querySelector('.resolved-list-container .document-results');
        if (!container) return;

        if (tickets.length === 0) {
            container.innerHTML = `
                <div class="list-header">
                    <div class="search-bar">
                        <input type="text" placeholder="Search by Ticket Number">
                        <span class="search-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z" stroke="#18191F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M20.9999 21L16.6499 16.65" stroke="#18191F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </span>
                    </div>
                    <div class="document-item-title resolved-header">
                        <span>Ticket Number</span>
                        <p>Customer Name</p>
                        <p>Email</p>
                        <p>Verified by</p>
                        <p>Status</p>
                        <p></p>
                    </div>
                </div>
                <div class="document-item resolved-row empty-row">
                    <p style="text-align:center; width:100%; padding:1em; color:#888;">No resolved tickets</p>
                </div>
            `;
        } else {
            let html = `
                <div class="list-header">
                    <div class="search-bar">
                        <input type="text" placeholder="Search by Ticket Number">
                        <span class="search-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z" stroke="#18191F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M20.9999 21L16.6499 16.65" stroke="#18191F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </span>
                    </div>
                    <div class="document-item-title resolved-header">
                        <span>Ticket Number</span>
                        <p>Customer Name</p>
                        <p>Email</p>
                        <p>Verified by</p>
                        <p>Status</p>
                        <p></p>
                    </div>
                </div>
            `;
            tickets.forEach(ticket => {
                html += renderResolvedTicketRow(ticket);
            });
            container.innerHTML = html;
        }

        attachTicketEventListeners();
    }

    function attachTicketEventListeners() {
        // Re-attach modal opener listeners to dynamically added elements
        document.querySelectorAll('[data-open-ticket-modal]').forEach(button => {
            button.onclick = function(e) {
                e.preventDefault();
                const ticketId = this.getAttribute('data-ticket-id');
                const ticketNumber = this.getAttribute('data-ticket-number');
                const customerId = this.getAttribute('data-customer-id');
                const customerName = this.getAttribute('data-customer-name');
                const email = this.getAttribute('data-email');
                const phone = this.getAttribute('data-phone');
                const docId = this.getAttribute('data-doc-id');
                const docName = this.getAttribute('data-doc-name');
                const issue = this.getAttribute('data-issue');
                const problemType = this.getAttribute('data-problem-type');
                const wasReprinted = this.getAttribute('data-was-reprinted');

                document.getElementById('modal-customer-id').textContent = customerId;
                document.getElementById('modal-doc-id').textContent = docId;
                document.getElementById('modal-customer-name').textContent = customerName;
                document.getElementById('modal-doc-name').textContent = docName;
                document.getElementById('modal-email').textContent = email;
                document.getElementById('modal-problem-type').textContent = problemType;
                document.getElementById('modal-phone').textContent = phone;
                document.getElementById('modal-reprinted').textContent = wasReprinted ? 'Yes' : 'No';
                document.getElementById('modal-issue').textContent = issue;

                document.getElementById('ticket-modal').setAttribute('aria-hidden', 'false');
            };
        });

        // Re-attach action listeners
        document.querySelectorAll('[data-action="void"]').forEach(button => {
            button.onclick = handleVoidTicket;
        });

        document.querySelectorAll('[data-action="refund"]').forEach(button => {
            button.onclick = handleRefundTicket;
        });

        // Re-attach modal close listeners
        document.querySelectorAll('[data-close-ticket-modal]').forEach(el => {
            el.onclick = function() {
                document.getElementById('ticket-modal').setAttribute('aria-hidden', 'true');
            };
        });
    }

    function handleVoidTicket(e) {
        e.preventDefault();
        const ticketId = this.getAttribute('data-ticket-id');
        if (confirm('Are you sure you want to void this ticket?')) {
            fetch('/api/void-ticket/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({ ticket_id: ticketId })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    createAlert('Success', 'Ticket Voided', 'The ticket has been successfully voided.', 'success', true, true, 'pageMessages');
                    refreshTickets();
                } else {
                    createAlert('Error', 'Void Failed', data.error || 'Failed to void the ticket.', 'danger', true, true, 'pageMessages');
                }
            })
            .catch(error => {
                console.error('Error voiding ticket:', error);
                createAlert('Error', 'Void Failed', 'An error occurred while voiding the ticket.', 'danger', true, true, 'pageMessages');
            });
        }
    }

    function handleRefundTicket(e) {
        e.preventDefault();
        const ticketId = this.getAttribute('data-ticket-id');
        if (confirm('Are you sure you want to refund this ticket?')) {
            fetch('/api/refund-ticket/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({ ticket_id: ticketId })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    createAlert('Success', 'Ticket Refunded', 'The ticket has been successfully refunded.', 'success', true, true, 'pageMessages');
                    refreshTickets();
                } else {
                    createAlert('Error', 'Refund Failed', data.error || 'Failed to refund the ticket.', 'danger', true, true, 'pageMessages');
                }
            })
            .catch(error => {
                console.error('Error refunding ticket:', error);
                createAlert('Error', 'Refund Failed', 'An error occurred while refunding the ticket.', 'danger', true, true, 'pageMessages');
            });
        }
    }

    function refreshTickets() {
        console.log('[tickets] refreshTickets -> fetching /portal/api/get-active-tickets/');
        fetch('/portal/api/get-active-tickets/')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const activeCount = data.active_count || 0;
                    const resolvedCount = data.resolved_count || 0;

                    // Update counts in stat cards
                    document.getElementById('active-tickets-count').textContent = activeCount;
                    document.getElementById('resolved-tickets-count').textContent = resolvedCount;

                    // Update ticket lists
                    updateActiveTickets(data.active_tickets);
                    updateResolvedTickets(data.resolved_tickets);

                    // Play notification sound if new tickets arrived
                    if (lastActiveCount !== null && activeCount > lastActiveCount) {
                        playNotificationSound();
                    }

                    lastActiveCount = activeCount;
                    lastResolvedCount = resolvedCount;
                }
            })
            .catch(error => console.error('Error refreshing tickets:', error));
    }

    function playNotificationSound() {
        try {
            const soundElement = document.getElementById('notification-sound');
            if (soundElement) {
                soundElement.currentTime = 0;
                soundElement.play().catch(err => console.log('Audio play error:', err));
            }
        } catch (error) {
            console.log('Could not play notification sound:', error);
        }
    }

    // Initial fetch and setup polling
    refreshTickets();
    setInterval(refreshTickets, 5000); // Poll every 5 seconds
})();