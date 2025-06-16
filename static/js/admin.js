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
                    location.reload();
                } else {
                    alert(data.error || "Upload failed.");
                }
            });
        }
    });
}); // End of DOMContentLoaded event listener

