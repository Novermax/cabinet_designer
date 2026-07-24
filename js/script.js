// ============================================================
// Cabinet Designer — Landing Page Scripts
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

  // =============================================================
  // 0. HERO — reveal only after the background image is fully loaded
  // =============================================================
  // The hero picture is a CSS background, so on a slow (mobile) connection it
  // paints in chunks. Keep it (and the text block) hidden until the file is
  // fully decoded, wait ~1s so the reveal reads as intentional, then fade the
  // whole thing in as one piece. A fallback timer guarantees it never stays
  // hidden if the image errors or the connection stalls.
  (() => {
    const hero = document.getElementById('hero');
    if (!hero) return;
    const HERO_SRC = 'assets/images/hero.png';
    const REVEAL_DELAY = 1000;   // pause after load before the reveal
    const MAX_WAIT = 8000;       // never keep the hero hidden longer than this
    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      hero.classList.add('hero-ready');
    };
    const img = new Image();
    const start = () => setTimeout(reveal, REVEAL_DELAY);
    img.onload = () => {
      // decode() ensures the bitmap is fully ready (no progressive paint).
      if (img.decode) img.decode().then(start).catch(start);
      else start();
    };
    img.onerror = reveal;        // broken image → show the rest anyway
    img.src = HERO_SRC;
    if (img.complete) img.onload();   // already cached
    setTimeout(reveal, MAX_WAIT);     // hard fallback
  })();

  // =============================================================
  // 1. NAVBAR — Scroll effect, progress bar & mobile toggle
  // =============================================================
  const navbar = document.getElementById('navbar');
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  const handleScroll = () => {
    const y = window.scrollY;
    navbar.classList.toggle('scrolled', y > 60);
  };
  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    const icon = navToggle.querySelector('i');
    icon.classList.toggle('fa-bars');
    icon.classList.toggle('fa-times');
  });

  navLinks.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      const icon = navToggle.querySelector('i');
      icon.classList.add('fa-bars');
      icon.classList.remove('fa-times');
    });
  });

  // =============================================================
  // 2. PARALLAX HERO
  // =============================================================
  const hero = document.querySelector('.hero');
  const heroContent = document.querySelector('.hero-content');

  if (hero && heroContent) {
    window.addEventListener('scroll', () => {
      const scrolled = window.scrollY;
      if (scrolled < window.innerHeight) {
        heroContent.style.transform = `translateY(${scrolled * 0.15}px)`;
        heroContent.style.opacity = 1 - (scrolled / window.innerHeight) * 0.3;
      }
    }, { passive: true });
  }

  // =============================================================
  // 3. FADE-IN ON SCROLL (staggered)
  // =============================================================
  const fadeElements = document.querySelectorAll('.fade-section');

  const observerOptions = {
    threshold: 0.12,
    rootMargin: '0px 0px -30px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const delay = Array.from(entry.target.parentNode.children)
          .indexOf(entry.target) * 80;
        entry.target.style.transitionDelay = `${delay}ms`;
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  fadeElements.forEach(el => observer.observe(el));

  // =============================================================
  // 4. STAT COUNTER ANIMATION (eased)
  // =============================================================
  const statNumbers = document.querySelectorAll('.stat-number');

  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.getAttribute('data-count'), 10);
        if (!Number.isNaN(target)) animateCounter(el, target);
        counterObserver.unobserve(el);
      }
    });
  }, { threshold: 0.4 });

  statNumbers.forEach(el => counterObserver.observe(el));

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animateCounter(el, target) {
    const duration = 1800;
    const start = performance.now();
    const prefix = el.getAttribute('data-prefix') || '';
    const suffix = el.getAttribute('data-suffix') || '';

    function render(value) {
      const num = value >= 1000 ? value.toLocaleString() : value;
      el.textContent = prefix + num + suffix;
    }

    function update(now) {
      const progress = Math.min((now - start) / duration, 1);
      render(Math.round(easeOutCubic(progress) * target));
      if (progress < 1) requestAnimationFrame(update);
      else render(target);
    }

    requestAnimationFrame(update);
  }

  // =============================================================
  // 5. 3D TILT EFFECT ON CARDS
  // =============================================================
  const tiltCards = document.querySelectorAll('.feature-card, .pricing-card, .testimonial-card');

  tiltCards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = (y - centerY) / centerY * -6;
      const rotateY = (x - centerX) / centerX * 6;

      card.style.transform =
        `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });

  // =============================================================
  // 6. CONTACT FORM VALIDATION
  // =============================================================
  const contactForm = document.getElementById('contactForm');
  const formSuccess = document.getElementById('formSuccess');

  if (contactForm) {
    const contactIframe = document.getElementById('contact_hidden_iframe');
    const contactSubmitBtn = document.getElementById('contactSubmitBtn');
    let contactSubmitted = false;

    contactForm.addEventListener('submit', (e) => {
      let valid = true;

      const nameInput = document.getElementById('name');
      const emailInput = document.getElementById('email');
      const messageInput = document.getElementById('message');

      clearErrors();

      if (!nameInput.value.trim()) {
        showError(nameInput, 'Name is required.');
        valid = false;
      }

      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailInput.value.trim()) {
        showError(emailInput, 'Email is required.');
        valid = false;
      } else if (!emailPattern.test(emailInput.value.trim())) {
        showError(emailInput, 'Please enter a valid email address.');
        valid = false;
      }

      if (!messageInput.value.trim()) {
        showError(messageInput, 'Message is required.');
        valid = false;
      }

      if (!valid) {
        e.preventDefault();
        return;
      }

      // Valid: let the form submit natively to the hidden iframe (POST to Apps Script).
      contactSubmitted = true;
      contactSubmitBtn.disabled = true;
      contactSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…';
    });

    if (contactIframe) {
      contactIframe.addEventListener('load', () => {
        if (!contactSubmitted) return; // ignore the initial about:blank load
        formSuccess.classList.add('visible');
        contactForm.reset();
        contactSubmitBtn.disabled = false;
        contactSubmitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Message';
        contactSubmitted = false;
        setTimeout(() => formSuccess.classList.remove('visible'), 5000);
      });
    }

    function showError(input, message) {
      const group = input.closest('.form-group');
      group.classList.add('error');
      const errorEl = group.querySelector('.form-error');
      if (errorEl) errorEl.textContent = message;
    }

    function clearErrors() {
      document.querySelectorAll('.form-group.error').forEach(g => g.classList.remove('error'));
      document.querySelectorAll('.form-error').forEach(el => el.textContent = '');
    }
  }

  // =============================================================
  // 7. NEWSLETTER FORM
  // =============================================================
  const newsletterForm = document.getElementById('newsletterForm');
  if (newsletterForm) {
    const newsletterIframe = document.getElementById('newsletter_hidden_iframe');
    const newsletterSubmitBtn = document.getElementById('newsletterSubmitBtn');
    let newsletterSubmitted = false;

    newsletterForm.addEventListener('submit', (e) => {
      const input = newsletterForm.querySelector('input[type="email"]');
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!input.value.trim() || !emailPattern.test(input.value.trim())) {
        input.style.borderColor = '#e74c3c';
        e.preventDefault();
        return;
      }

      input.style.borderColor = '';
      newsletterSubmitted = true;
      newsletterSubmitBtn.disabled = true;
      newsletterSubmitBtn.textContent = 'Sending…';
    });

    if (newsletterIframe) {
      newsletterIframe.addEventListener('load', () => {
        if (!newsletterSubmitted) return; // ignore the initial about:blank load
        const input = newsletterForm.querySelector('input[type="email"]');
        newsletterSubmitBtn.disabled = false;
        newsletterSubmitBtn.textContent = 'Subscribed!';
        input.value = '';
        setTimeout(() => { newsletterSubmitBtn.textContent = 'Subscribe'; }, 3000);
        newsletterSubmitted = false;
      });
    }
  }

  // =============================================================
  // 8. FLOATING PARTICLES (Hero)
  // =============================================================
  const particlesContainer = document.createElement('div');
  particlesContainer.className = 'particles';
  hero?.appendChild(particlesContainer);

  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = 2 + Math.random() * 4;
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = 8 + Math.random() * 12 + 's';
    p.style.animationDelay = Math.random() * 10 + 's';
    p.style.opacity = 0.1 + Math.random() * 0.2;
    particlesContainer.appendChild(p);
  }

  // =============================================================
  // 9. SCROLL PROGRESS BAR
  // =============================================================
  const progressBar = document.getElementById('scrollProgress');
  if (progressBar) {
    const updateProgress = () => {
      const h = document.documentElement;
      const scrolled = h.scrollTop / (h.scrollHeight - h.clientHeight);
      progressBar.style.width = (scrolled * 100) + '%';
    };
    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
  }

  // =============================================================
  // 10. SCROLLSPY — highlight active nav link
  // =============================================================
  const spySections = document.querySelectorAll('section[id]');
  const spyLinks = new Map();
  document.querySelectorAll('.nav-links a[href^="#"]').forEach(a => {
    spyLinks.set(a.getAttribute('href').slice(1), a);
  });

  if (spySections.length && spyLinks.size) {
    const spyObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          spyLinks.forEach(a => a.classList.remove('active'));
          const link = spyLinks.get(entry.target.id);
          if (link) link.classList.add('active');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    spySections.forEach(s => spyObserver.observe(s));
  }

  // =============================================================
  // 11. BACK TO TOP
  // =============================================================
  const backToTop = document.getElementById('backToTop');
  if (backToTop) {
    window.addEventListener('scroll', () => {
      backToTop.classList.toggle('show', window.scrollY > 600);
    }, { passive: true });
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // =============================================================
  // 12. GALLERY LIGHTBOX
  // =============================================================
  const galleryImgs = Array.from(document.querySelectorAll('.gallery-item img'));
  if (galleryImgs.length) {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `
      <button class="lightbox-close" aria-label="Close">&times;</button>
      <button class="lightbox-nav lightbox-prev" aria-label="Previous"><i class="fas fa-chevron-left"></i></button>
      <img alt="">
      <button class="lightbox-nav lightbox-next" aria-label="Next"><i class="fas fa-chevron-right"></i></button>
      <p class="lightbox-caption"></p>`;
    document.body.appendChild(lb);

    const lbImg = lb.querySelector('img');
    const lbCaption = lb.querySelector('.lightbox-caption');
    let currentIndex = 0;

    const showAt = (i) => {
      currentIndex = (i + galleryImgs.length) % galleryImgs.length;
      const src = galleryImgs[currentIndex];
      lbImg.src = src.currentSrc || src.src;
      lbImg.alt = src.alt;
      lbCaption.textContent = src.alt;
    };
    const openLb = (i) => { showAt(i); lb.classList.add('open'); document.body.style.overflow = 'hidden'; };
    const closeLb = () => { lb.classList.remove('open'); document.body.style.overflow = ''; };

    galleryImgs.forEach((img, i) => {
      const item = img.closest('.gallery-item');
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.addEventListener('click', () => openLb(i));
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLb(i); }
      });
    });

    lb.querySelector('.lightbox-close').addEventListener('click', closeLb);
    lb.querySelector('.lightbox-prev').addEventListener('click', (e) => { e.stopPropagation(); showAt(currentIndex - 1); });
    lb.querySelector('.lightbox-next').addEventListener('click', (e) => { e.stopPropagation(); showAt(currentIndex + 1); });
    lb.addEventListener('click', (e) => { if (e.target === lb) closeLb(); });
    document.addEventListener('keydown', (e) => {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') closeLb();
      else if (e.key === 'ArrowLeft') showAt(currentIndex - 1);
      else if (e.key === 'ArrowRight') showAt(currentIndex + 1);
    });
  }
});
