// Photo Gallery Lightbox
(function() {
  const lightbox = document.getElementById('gallery-lightbox');
  if (!lightbox) return;

  const slides = lightbox.querySelectorAll('.gallery-lightbox__slide');
  const prevBtn = lightbox.querySelector('.gallery-lightbox__btn--prev');
  const nextBtn = lightbox.querySelector('.gallery-lightbox__btn--next');
  const closeBtn = lightbox.querySelector('.gallery-lightbox__close');
  const backdrop = lightbox.querySelector('.gallery-lightbox__backdrop');
  const counter = lightbox.querySelector('.gallery-lightbox__current');
  const thumbs = document.querySelectorAll('.photo-gallery__item');

  let currentIndex = 0;
  const total = slides.length;

  function openLightbox(index) {
    currentIndex = index;
    updateSlide();
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
    // Return focus to the thumbnail that was clicked
    if (thumbs[currentIndex]) {
      thumbs[currentIndex].focus();
    }
  }

  function updateSlide() {
    slides.forEach((slide, i) => {
      slide.classList.toggle('active', i === currentIndex);
    });
    if (counter) {
      counter.textContent = currentIndex + 1;
    }
  }

  function nextSlide() {
    currentIndex = (currentIndex + 1) % total;
    updateSlide();
  }

  function prevSlide() {
    currentIndex = (currentIndex - 1 + total) % total;
    updateSlide();
  }

  // Thumbnail click handlers
  thumbs.forEach((thumb) => {
    thumb.addEventListener('click', () => {
      const index = parseInt(thumb.dataset.index, 10);
      openLightbox(index);
    });
  });

  // Navigation
  prevBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    prevSlide();
  });

  nextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    nextSlide();
  });

  // Close handlers
  closeBtn.addEventListener('click', closeLightbox);
  backdrop.addEventListener('click', closeLightbox);

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('active')) return;

    switch (e.key) {
      case 'Escape':
        closeLightbox();
        break;
      case 'ArrowLeft':
        prevSlide();
        break;
      case 'ArrowRight':
        nextSlide();
        break;
    }
  });

  // Trap focus within lightbox
  lightbox.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;

    const focusable = lightbox.querySelectorAll('button');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
})();
