// Main JavaScript for Droposting Landing Page

// Debounce function to limit scroll event calls
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

document.addEventListener('DOMContentLoaded', function() {
    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            if(targetId === '#') return; // Skip if href is just '#'
            
            const targetElement = document.querySelector(targetId);
            if(targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 80, // Account for fixed navbar
                    behavior: 'smooth'
                });
            }
        });
    });

    // Optimized navbar background change on scroll
    const navbar = document.querySelector('.navbar');
    const optimizedScrollHandler = debounce(function() {
        if(window.scrollY > 50) {
            navbar.classList.add('shadow-sm');
        } else {
            navbar.classList.remove('shadow-sm');
        }
    }, 10); // 10ms debounce

    window.addEventListener('scroll', optimizedScrollHandler);

    // Animation for elements when they come into view
    if('IntersectionObserver' in window) {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver(function(entries) {
            entries.forEach(entry => {
                if(entry.isIntersecting) {
                    entry.target.classList.add('animate__animated', 'animate__fadeInUp');
                    observer.unobserve(entry.target); // Stop observing after animation
                }
            });
        }, observerOptions);

        // Observe elements that should animate
        document.querySelectorAll('.card, .hero-section .col-lg-6, .section-title').forEach(el => {
            observer.observe(el);
        });
    } else {
        // Fallback if Intersection Observer is not supported
        document.querySelectorAll('.card, .hero-section .col-lg-6, .section-title').forEach(el => {
            el.classList.add('animate__animated', 'animate__fadeInUp');
        });
    }
});

// Function to handle form submissions
function handleFormSubmit(event, formName) {
    event.preventDefault();
    console.log(`${formName} form submitted`);
    // Add your form submission logic here
    alert(`${formName} form submitted successfully!`);
}

// Lazy loading images if supported
if ('loading' in HTMLImageElement.prototype) {
    // Browser supports native lazy loading
    const images = document.querySelectorAll('img[loading="lazy"]');
    images.forEach(img => {
        // Optional: add placeholder or fade-in effect
        img.addEventListener('load', function() {
            this.style.opacity = 1;
        });
    });
} else {
    // Fallback for older browsers using Intersection Observer
    // (Implementation would go here if needed)
}