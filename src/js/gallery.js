/**
 * Photo Gallery with Lightbox
 * Provides a fullscreen image viewer with navigation
 */
(function() {
  'use strict';

  const lightbox = document.getElementById('lightbox');
  if (!lightbox) return;

  const lightboxImage = lightbox.querySelector('.lightbox__image');
  const lightboxCaption = lightbox.querySelector('.lightbox__caption');
  const closeBtn = lightbox.querySelector('.lightbox__close');
  const prevBtn = lightbox.querySelector('.lightbox__nav--prev');
  const nextBtn = lightbox.querySelector('.lightbox__nav--next');
  const galleryItems = document.querySelectorAll('.photo-gallery__item');

  // Get images from the global variable set by the template
  const images = window.galleryImages || [];
  let currentIndex = 0;

  function openLightbox(index) {
    currentIndex = index;
    updateLightboxImage();
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
    // Return focus to the gallery item that opened the lightbox
    if (galleryItems[currentIndex]) {
      galleryItems[currentIndex].focus();
    }
  }

  function updateLightboxImage() {
    if (images[currentIndex]) {
      lightboxImage.src = images[currentIndex].src;
      lightboxImage.alt = images[currentIndex].alt;
      lightboxCaption.textContent = images[currentIndex].alt;
    }
  }

  function showPrevious() {
    currentIndex = (currentIndex - 1 + images.length) % images.length;
    updateLightboxImage();
  }

  function showNext() {
    currentIndex = (currentIndex + 1) % images.length;
    updateLightboxImage();
  }

  // Event listeners for gallery items
  galleryItems.forEach(function(item) {
    item.addEventListener('click', function() {
      const index = parseInt(this.getAttribute('data-index'), 10);
      openLightbox(index);
    });
  });

  // Close button
  closeBtn.addEventListener('click', closeLightbox);

  // Navigation buttons
  prevBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    showPrevious();
  });

  nextBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    showNext();
  });

  // Close on background click
  lightbox.addEventListener('click', function(e) {
    if (e.target === lightbox) {
      closeLightbox();
    }
  });

  // Keyboard navigation
  document.addEventListener('keydown', function(e) {
    if (!lightbox.classList.contains('active')) return;

    switch (e.key) {
      case 'Escape':
        closeLightbox();
        break;
      case 'ArrowLeft':
        showPrevious();
        break;
      case 'ArrowRight':
        showNext();
        break;
    }
  });

  // Trap focus within lightbox when open
  lightbox.addEventListener('keydown', function(e) {
    if (e.key !== 'Tab') return;

    const focusableElements = lightbox.querySelectorAll('button');
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  });
})();
