const header = document.querySelector('[data-header]');
const nav = document.querySelector('[data-nav]');
const navToggle = document.querySelector('[data-nav-toggle]');
const navLinks = Array.from(document.querySelectorAll('.site-nav a'));
const navTargets = navLinks.map(link => {
  const id = link.getAttribute('href')?.replace('#', '');
  return { id, link, section: id ? document.getElementById(id) : null };
});
const revealItems = Array.from(document.querySelectorAll('.reveal'));
const carousel = document.querySelector('[data-gallery-carousel]');
const AUTOPLAY_MS = 5600;
let scrollTicking = false;

function updateHeaderState() {
  if (!header) return;
  header.classList.toggle('is-scrolled', window.scrollY > 8);
}

function closeNav() {
  if (!nav || !navToggle) return;
  nav.classList.remove('is-open');
  navToggle.setAttribute('aria-expanded', 'false');
}

function setActiveLink() {
  const fromTop = window.scrollY + 130;
  let activeId = '';

  for (const { id, section } of navTargets) {
    if (section && section.offsetTop <= fromTop) {
      activeId = id;
    }
  }

  for (const { id, link } of navTargets) {
    link.classList.toggle('is-active', Boolean(id && id === activeId));
  }
}

function scheduleScrollWork() {
  if (scrollTicking) return;
  scrollTicking = true;

  window.requestAnimationFrame(() => {
    updateHeaderState();
    setActiveLink();
    scrollTicking = false;
  });
}

if (navToggle && nav) {
  navToggle.addEventListener('click', () => {
    const nextOpen = !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', nextOpen);
    navToggle.setAttribute('aria-expanded', String(nextOpen));
  });
}

for (const link of navLinks) {
  link.addEventListener('click', closeNav);
}

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.12 }
  );

  for (const item of revealItems) {
    observer.observe(item);
  }
} else {
  for (const item of revealItems) {
    item.classList.add('is-visible');
  }
}

function setupGalleryCarousel() {
  if (!carousel) return;

  const image = carousel.querySelector('[data-gallery-image]');
  const title = carousel.querySelector('[data-gallery-title]');
  const description = carousel.querySelector('[data-gallery-description]');
  const count = carousel.querySelector('[data-gallery-count]');
  const progress = carousel.querySelector('[data-gallery-progress]');
  const previous = carousel.querySelector('[data-gallery-prev]');
  const next = carousel.querySelector('[data-gallery-next]');
  const thumbs = Array.from(carousel.querySelectorAll('[data-gallery-index]'));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!image || !title || !description || !count || thumbs.length === 0) return;

  const slides = thumbs.map(thumb => ({
    src: thumb.dataset.src || '',
    title: thumb.dataset.title || '',
    description: thumb.dataset.description || '',
    alt: thumb.dataset.alt || '',
  }));
  let activeIndex = 0;
  let timer = 0;
  let carouselVisible = !('IntersectionObserver' in window);
  let userPaused = false;

  function restartProgress() {
    if (!progress || reduceMotion) return;
    carousel.classList.remove('is-playing');
    void progress.offsetWidth;
    carousel.classList.add('is-playing');
  }

  function setActiveThumb(index) {
    thumbs.forEach((thumb, thumbIndex) => {
      const active = thumbIndex === index;
      thumb.classList.toggle('is-active', active);
      thumb.setAttribute('aria-selected', String(active));
    });
  }

  function setSlide(index) {
    const nextIndex = (index + slides.length) % slides.length;
    const slide = slides[nextIndex];
    activeIndex = nextIndex;
    carousel.classList.add('is-swapping');

    window.setTimeout(() => {
      image.setAttribute('src', slide.src);
      image.setAttribute('alt', slide.alt);
      title.textContent = slide.title;
      description.textContent = slide.description;
      count.textContent = `${String(nextIndex + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
      setActiveThumb(nextIndex);
      carousel.classList.remove('is-swapping');
      restartProgress();
    }, 120);
  }

  function stopAutoplay() {
    if (timer) {
      window.clearInterval(timer);
      timer = 0;
    }
    carousel.classList.remove('is-playing');
  }

  function startAutoplay() {
    if (reduceMotion || timer || userPaused || !carouselVisible) return;
    restartProgress();
    timer = window.setInterval(() => {
      setSlide(activeIndex + 1);
    }, AUTOPLAY_MS);
  }

  function syncAutoplay() {
    if (carouselVisible && !userPaused) {
      startAutoplay();
    } else {
      stopAutoplay();
    }
  }

  previous?.addEventListener('click', () => {
    stopAutoplay();
    setSlide(activeIndex - 1);
    syncAutoplay();
  });

  next?.addEventListener('click', () => {
    stopAutoplay();
    setSlide(activeIndex + 1);
    syncAutoplay();
  });

  thumbs.forEach((thumb, index) => {
    thumb.addEventListener('click', () => {
      stopAutoplay();
      setSlide(index);
      syncAutoplay();
    });
  });

  carousel.addEventListener('mouseenter', () => {
    userPaused = true;
    stopAutoplay();
  });
  carousel.addEventListener('mouseleave', () => {
    userPaused = false;
    syncAutoplay();
  });
  carousel.addEventListener('focusin', () => {
    userPaused = true;
    stopAutoplay();
  });
  carousel.addEventListener('focusout', () => {
    userPaused = false;
    syncAutoplay();
  });

  if ('IntersectionObserver' in window) {
    const carouselObserver = new IntersectionObserver(
      entries => {
        carouselVisible = entries.some(entry => entry.isIntersecting);
        syncAutoplay();
      },
      { threshold: 0.16 }
    );
    carouselObserver.observe(carousel);
  }

  setActiveThumb(activeIndex);
  syncAutoplay();
}

window.addEventListener('scroll', scheduleScrollWork, { passive: true });

updateHeaderState();
setActiveLink();
setupGalleryCarousel();
