// Image Carousel
(function() {
  const carousel = document.querySelector('.carousel');
  if (!carousel) return;

  const slidesContainer = carousel.querySelector('.carousel__slides');
  const dotsContainer = carousel.querySelector('.carousel__indicators');
  const thumbsContainer = carousel.querySelector('.carousel__thumbnails');

  const autoplay = carousel.dataset.autoplay === 'true';
  const interval = (parseInt(carousel.dataset.interval, 10) || 5) * 1000;
  const randomize = carousel.dataset.randomize === 'true';
  const maxSlides = parseInt(carousel.dataset.maxSlides, 10) || 0;

  // Randomize order if enabled
  if (randomize) {
    const count = slidesContainer.children.length;
    const order = Array.from({ length: count }, (_, i) => i);

    // Fisher-Yates shuffle
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    // Apply same order to slides, dots, and thumbs
    const reorder = (container) => {
      if (!container) return;
      const children = Array.from(container.children);
      order.forEach(i => container.appendChild(children[i]));
    };

    reorder(slidesContainer);
    reorder(dotsContainer);
    reorder(thumbsContainer);

    // Reset active states to first element
    carousel.querySelectorAll('.active').forEach(el => el.classList.remove('active'));
    slidesContainer.children[0]?.classList.add('active');
    dotsContainer?.children[0]?.classList.add('active');
    thumbsContainer?.children[0]?.classList.add('active');
  }

  // Limit to maxSlides if set (hide extras after shuffling)
  if (maxSlides > 0) {
    const hideExtras = (container) => {
      if (!container) return;
      Array.from(container.children).forEach((child, i) => {
        if (i >= maxSlides) child.style.display = 'none';
      });
    };
    hideExtras(slidesContainer);
    hideExtras(dotsContainer);
    hideExtras(thumbsContainer);
  }

  // Get visible elements after potential reordering and limiting
  const visibleFilter = (el) => el.style.display !== 'none';
  const slides = Array.from(carousel.querySelectorAll('.carousel__slide')).filter(visibleFilter);
  const dots = Array.from(carousel.querySelectorAll('.carousel__dot')).filter(visibleFilter);
  const thumbs = Array.from(carousel.querySelectorAll('.carousel__thumb')).filter(visibleFilter);
  const prevBtn = carousel.querySelector('.carousel__btn--prev');
  const nextBtn = carousel.querySelector('.carousel__btn--next');

  let currentIndex = 0;
  let autoplayTimer = null;
  let isPaused = false;

  function goToSlide(index) {
    if (index < 0) index = slides.length - 1;
    if (index >= slides.length) index = 0;

    slides[currentIndex].classList.remove('active');
    dots[currentIndex]?.classList.remove('active');
    thumbs[currentIndex]?.classList.remove('active');

    currentIndex = index;

    slides[currentIndex].classList.add('active');
    dots[currentIndex]?.classList.add('active');
    thumbs[currentIndex]?.classList.add('active');
  }

  function nextSlide() {
    goToSlide(currentIndex + 1);
  }

  function prevSlide() {
    goToSlide(currentIndex - 1);
  }

  function startAutoplay() {
    if (autoplay && !isPaused) {
      autoplayTimer = setInterval(nextSlide, interval);
    }
  }

  function stopAutoplay() {
    if (autoplayTimer) {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
  }

  // Event listeners
  prevBtn?.addEventListener('click', () => {
    prevSlide();
    stopAutoplay();
    startAutoplay();
  });

  nextBtn?.addEventListener('click', () => {
    nextSlide();
    stopAutoplay();
    startAutoplay();
  });

  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      goToSlide(index);
      stopAutoplay();
      startAutoplay();
    });
  });

  thumbs.forEach((thumb, index) => {
    thumb.addEventListener('click', () => {
      goToSlide(index);
      stopAutoplay();
      startAutoplay();
    });
  });

  // Pause on hover
  carousel.addEventListener('mouseenter', () => {
    isPaused = true;
    stopAutoplay();
  });

  carousel.addEventListener('mouseleave', () => {
    isPaused = false;
    startAutoplay();
  });

  // Pause when page is hidden, restart fresh when visible
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAutoplay();
    } else {
      stopAutoplay();
      startAutoplay();
    }
  });

  // Keyboard navigation
  carousel.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      prevSlide();
      stopAutoplay();
      startAutoplay();
    } else if (e.key === 'ArrowRight') {
      nextSlide();
      stopAutoplay();
      startAutoplay();
    }
  });

  // Start autoplay
  startAutoplay();
})();
