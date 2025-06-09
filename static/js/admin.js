document.addEventListener('DOMContentLoaded', () => {
    // TEMPORARILY make the no-documents section hidden and document-results section visible
    const searchButton = document.querySelector('.search-btn');
    const noDocuments = document.getElementById('no-documents');
    const approvalButtons = document.querySelector('.approval-buttons');
    const documentResults = document.getElementById('document-results');

    if (searchButton && noDocuments && documentResults && approvalButtons) {
        searchButton.addEventListener('click', () => {
            // Hide the "no-documents" section
            noDocuments.style.display = 'none';
            searchButton.style.display = 'none';

            // Show the "document-results" and "approval-buttons" section
            documentResults.style.display = 'flex';
            approvalButtons.style.display = 'flex';
        });
    } else {
        console.error('One or more elements (search-btn, no-documents, document-results, approval-buttons) are missing in the DOM.');
    }

    // Clear Button Functionality
    const clearButton = document.querySelector('.clear-btn');
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            // Reset the search input
            const searchInput = document.querySelector('.search-input');
            if (searchInput) {
                searchInput.value = '';
            }

            // Hide the "document-results" and "approval-buttons" sections
            if (documentResults) {
                documentResults.style.display = 'none';
            }
            if (approvalButtons) {
                approvalButtons.style.display = 'none';
            }

            // Show the "no-documents" section
            if (noDocuments) {
                noDocuments.style.display = 'block';
            }

            // Show the search button again
            searchButton.style.display = 'block';
        });
    } else {
        console.error('Clear button is missing in the DOM.');
    }
});