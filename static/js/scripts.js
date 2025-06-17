document.addEventListener('DOMContentLoaded', () => {
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

    specificPagesRadio.addEventListener('change', () => {
        if (specificPagesRadio.checked) {
            pageInput.disabled = false; 
            pageInput.focus();
        }
    });

    allPagesRadio.addEventListener('change', () => {
        if (allPagesRadio.checked) {
            pageInput.disabled = true; 
            pageInput.value = ''; 
        }
    });

    // Grayscale Toggle Functionality
    const grayscaleToggle = document.getElementById('grayscale-toggle');

    // Add keydown event listener for toggling the switch with Enter key
    grayscaleToggle.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            grayscaleToggle.checked = !grayscaleToggle.checked; // Toggle the checked state
            grayscaleToggle.dispatchEvent(new Event('change')); // Trigger change event if needed
        }
    });

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

//TEMPORARILY BROWSE BUTTON FUNCTIONALITY TO LINK TO UPLOAD.HTML
document.addEventListener('DOMContentLoaded', () => {
    const browseButton = document.querySelector('.temporary-link');
    browseButton.addEventListener('click', () => {
        const url = browseButton.getAttribute('data-url');
        window.location.href = url;
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