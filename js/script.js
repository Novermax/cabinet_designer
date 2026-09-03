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
  // 11b. GALLERY CAROUSEL — manual (arrows / dots / drag) + autoplay
  // =============================================================
  // Autoplay is the default, but any manual gesture wins: it stops the timer
  // and only lets it back after RESUME_MS of quiet. The timer is also idle
  // while the section is off-screen or the tab is hidden.
  (() => {
    const track = document.getElementById('galleryCarousel');
    if (!track) return;
    const slides = Array.from(track.querySelectorAll('.gallery-slide'));
    if (slides.length < 2) return;

    const section = track.closest('.gallery');
    const dotsBox = document.getElementById('galleryDots');
    const label = document.querySelector('.gallery-slide-title');
    const prevBtn = document.querySelector('.gallery-prev');
    const nextBtn = document.querySelector('.gallery-next');

    const AUTO_MS = 5000;      // time on screen per slide
    const RESUME_MS = 7000;    // quiet time before autoplay takes over again
    const DRAG_MIN = 50;       // px of horizontal travel that counts as a swipe

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let index = slides.findIndex(s => s.classList.contains('is-active'));
    if (index < 0) index = 0;
    let timer = null, resumeTimer = null, hovering = false, onScreen = true;

    // Dots
    const dots = slides.map((slide, i) => {
      if (!dotsBox) return null;
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'gallery-dot';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', slide.dataset.title || `Screenshot ${i + 1}`);
      dot.addEventListener('click', () => { show(i); interacted(); });
      dotsBox.appendChild(dot);
      return dot;
    });

    function show(i) {
      index = (i + slides.length) % slides.length;
      slides.forEach((s, k) => {
        const on = k === index;
        s.classList.toggle('is-active', on);
        s.setAttribute('aria-hidden', on ? 'false' : 'true');
      });
      dots.forEach((d, k) => {
        if (!d) return;
        d.classList.toggle('is-active', k === index);
        d.setAttribute('aria-selected', k === index ? 'true' : 'false');
      });
      if (label) label.textContent = slides[index].dataset.title || '';
      // A document slide is white: tell the CSS to darken the caption scrim.
      if (section) section.classList.toggle('is-doc-active', slides[index].classList.contains('is-doc'));
    }
    const next = () => show(index + 1);
    const prev = () => show(index - 1);

    function play() {
      stop();
      if (reduceMotion || hovering || !onScreen || document.hidden) return;
      timer = setInterval(next, AUTO_MS);
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }

    // A manual gesture: freeze autoplay, restart the quiet countdown.
    function interacted() {
      stop();
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => { resumeTimer = null; play(); }, RESUME_MS);
    }

    if (prevBtn) prevBtn.addEventListener('click', () => { prev(); interacted(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { next(); interacted(); });

    // Hover pause — the pointer is on the picture, the user is looking at it.
    track.addEventListener('mouseenter', () => { hovering = true; stop(); });
    // Pointer gone and nothing was actually clicked/dragged: no quiet time owed.
    track.addEventListener('mouseleave', () => { hovering = false; if (!resumeTimer) play(); });

    // Drag / swipe. Pointer events cover mouse, touch and pen in one path.
    let dragX = null, dragY = null, dragging = false;
    track.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      dragX = e.clientX; dragY = e.clientY; dragging = false;
      stop();
    });
    track.addEventListener('pointermove', (e) => {
      if (dragX === null) return;
      const dx = e.clientX - dragX;
      if (!dragging && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - dragY)) {
        dragging = true;
        track.classList.add('is-dragging');
      }
    });
    const endDrag = (e) => {
      if (dragX === null) return;
      const dx = (e.clientX ?? dragX) - dragX;
      dragX = dragY = null;
      track.classList.remove('is-dragging');
      if (dragging && Math.abs(dx) >= DRAG_MIN) (dx < 0 ? next : prev)();
      dragging = false;
      interacted();
    };
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    track.addEventListener('pointerleave', endDrag);
    track.addEventListener('dragstart', (e) => e.preventDefault());

    // Arrow keys while the gallery is the section on screen (and no lightbox).
    document.addEventListener('keydown', (e) => {
      if (!onScreen) return;
      if (document.querySelector('.lightbox.open')) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { prev(); interacted(); }
      else if (e.key === 'ArrowRight') { next(); interacted(); }
    });

    // Don't cycle what nobody is watching.
    if (section && 'IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        onScreen = entries[0].isIntersecting;
        onScreen ? play() : stop();
      }, { threshold: 0.25 }).observe(section);
    }
    document.addEventListener('visibilitychange', () => {
      document.hidden ? stop() : play();
    });

    show(index);
    play();
  })();

  // =============================================================
  // 11c. PRICE DEADLINE — sticky bar height + live countdowns
  // =============================================================
  // One deadline, declared once in the markup (#priceBar[data-deadline], ISO
  // with an explicit offset so it means the same instant in every timezone).
  // Every clock on the page is driven from it, and when it passes the page
  // switches to the after-deadline price by itself: the .js-before elements
  // go, the .js-after ones appear and every .js-price-now becomes PRICE_AFTER.
  // The Stripe link is NOT self-updating — the amount must be changed there.
  (() => {
    const bar = document.getElementById('priceBar');
    if (!bar) return;

    const PRICE_AFTER = '$2,099';
    const deadline = Date.parse(bar.dataset.deadline || '');
    if (Number.isNaN(deadline)) { bar.remove(); return; }

    // --- the fixed bar must not cover the navbar: publish its real height ---
    const publishHeight = () => {
      document.documentElement.style.setProperty('--pb-h', bar.offsetHeight + 'px');
    };
    publishHeight();
    window.addEventListener('load', publishHeight);
    if ('ResizeObserver' in window) new ResizeObserver(publishHeight).observe(bar);
    else window.addEventListener('resize', publishHeight);

    // --- clocks ---
    const clocks = Array.from(document.querySelectorAll('[data-countdown]'));
    clocks.forEach(c => { c.classList.add('countdown'); });

    const UNITS = [['days', 86400000], ['hrs', 3600000], ['min', 60000], ['sec', 1000]];
    const pad = n => String(n).padStart(2, '0');

    function paint(left) {
      let rest = left;
      const html = UNITS.map(([label, ms]) => {
        const value = Math.floor(rest / ms);
        rest -= value * ms;
        return `<span class="cd-unit"><b>${pad(value)}</b><i>${label}</i></span>`;
      }).join('');
      clocks.forEach(c => { c.innerHTML = html; });
    }

    let expired = false;
    function expire() {
      if (expired) return;
      expired = true;
      document.querySelectorAll('.js-before').forEach(el => { el.hidden = true; });
      document.querySelectorAll('.js-after').forEach(el => { el.hidden = false; });
      document.querySelectorAll('.js-price-now').forEach(el => { el.textContent = PRICE_AFTER; });
      publishHeight();
    }

    function tick() {
      const left = deadline - Date.now();
      if (left <= 0) { expire(); return; }
      paint(left);
      setTimeout(tick, 1000 - (Date.now() % 1000));
    }
    tick();
  })();

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
