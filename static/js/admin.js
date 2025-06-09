document.addEventListener('DOMContentLoaded', () => {
    // TEMPORARILY make the no-documents section hidden and document-results section visible
    const searchButton = document.querySelector('.search-btn');
    const noDocuments = document.getElementById('no-documents');
    const documentResults = document.getElementById('document-results');

    if (searchButton && noDocuments && documentResults) {
        searchButton.addEventListener('click', () => {
            // Hide the "no-documents" section
            noDocuments.style.display = 'none';

            // Show the "document-results" section
            documentResults.style.display = 'flex';
        });
    } else {
        console.error('One or more elements (search-btn, no-documents, document-results) are missing in the DOM.');
    }
});