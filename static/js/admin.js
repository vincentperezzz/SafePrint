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
    // TEMPORARILY make the no-documents section hidden and document-results section visible
    const searchButton = document.querySelector('.search-btn');
    const noDocuments = document.getElementById('no-documents');
    const approvalButtons = document.querySelector('.approval-buttons');
    const documentResults = document.getElementById('document-results');

     // Temporarily Completed Job Part
    const noJobsSection = document.querySelector('.no-jobs');
    const completedJobsTitle = document.querySelector('.completedJobs-item-title');
    const jobsItem = document.querySelector('.jobs-item');

    if (searchButton && noDocuments && documentResults && approvalButtons) {
        searchButton.addEventListener('click', () => {
            noDocuments.style.display = 'none';
            searchButton.style.display = 'none';
            documentResults.style.display = 'flex';
            approvalButtons.style.display = 'flex';

            // Temporarily Completed Job Part
            noJobsSection.style.display = 'none';
            completedJobsTitle.style.display = 'flex';
            jobsItem.style.display = 'flex';
        });
    } else {
        console.error('One or more elements (search-btn, no-documents, document-results, approval-buttons) are missing in the DOM.');
    }

    // Clear Button Functionality
    const clearButton = document.querySelector('.clear-btn');
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            const searchInput = document.querySelector('.search-input');
            if (searchInput) searchInput.value = '';
            if (documentResults) documentResults.style.display = 'none';
            if (approvalButtons) approvalButtons.style.display = 'none';
            if (noDocuments) noDocuments.style.display = 'block';
            searchButton.style.display = 'block';

            // Temporarily Completed Job Part
            if (noJobsSection) noJobsSection.style.display = 'block';
            if (completedJobsTitle) completedJobsTitle.style.display = 'none';
            if (jobsItem) jobsItem.style.display = 'none';
        });
    } else {
        console.error('Clear button is missing in the DOM.');
    }

    document.getElementById('image-upload').addEventListener('change', function() {
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

    // Edit Name
    document.getElementById('edit-name-form').onsubmit = function(e) {
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
    
    // Edit Username
    document.getElementById('edit-username-form').onsubmit = function(e) {
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
    
    // Edit Password
    document.getElementById('edit-password-form').onsubmit = function(e) {
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

    // Edit User Password
    document.getElementById('edit-user-password-form').onsubmit = function(e) {
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

    // Create Admin User Account
    document.getElementById('create-account-form').onsubmit = function(e) {
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

document.getElementById('searchUserInput').addEventListener('input', function() {
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

document.addEventListener('DOMContentLoaded', function() {
  // Feedback Comments Modal
  var feedbackBtn = document.querySelector('.settings-feedback-btn');
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
  var problemBtn = document.querySelector('.settings-problem-btn');
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
});


// Get all checkboxes and the delete button
const deleteBtn = document.getElementById('deleteSelectedBtn');

// Delegate event to the container for dynamic rows
document.querySelector('.user-accounts-table').addEventListener('change', function(e) {
    if (e.target.type === 'checkbox') {
        updateDeleteButton();
    }
});

function updateDeleteButton() {
    const checkedBoxes = document.querySelectorAll('.user-account-row input[type="checkbox"]:checked');
    deleteBtn.style.display = checkedBoxes.length > 0 ? 'inline-block' : 'none';
}

// When the button is clicked, collect selected user IDs and show popup
deleteBtn.addEventListener('click', function() {
    const checkedBoxes = document.querySelectorAll('.user-account-row input[type="checkbox"]:checked');
    const selectedIds = Array.from(checkedBoxes).map(cb => {
        const row = cb.closest('.user-account-row');
        return parseInt(row.id.replace('user-account-row-', ''), 10);
    });
    const label = selectedIds.length > 1 ? `${selectedIds.length} users` : `${selectedIds.length} user`;
    showDeleteUserOverlay(selectedIds, label);
});


