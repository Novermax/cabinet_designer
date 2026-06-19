// ============================================================
// Cabinet Designer — Landing Page Scripts
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

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
        animateCounter(el, target);
        counterObserver.unobserve(el);
      }
    });
  }, { threshold: 0.4 });

  statNumbers.forEach(el => counterObserver.observe(el));

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animateCounter(el, target) {
    const duration = 2200;
    const start = performance.now();

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);
      const current = Math.round(easedProgress * target);

      el.textContent = target >= 1000
        ? current.toLocaleString()
        : current + (target < 100 ? '%' : '');

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        el.textContent = target >= 1000
          ? target.toLocaleString()
          : target + (target < 100 ? '%' : '');
      }
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
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
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

      if (valid) {
        formSuccess.classList.add('visible');
        contactForm.reset();
        setTimeout(() => formSuccess.classList.remove('visible'), 5000);
      }
    });

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
    newsletterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = newsletterForm.querySelector('input');
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!input.value.trim() || !emailPattern.test(input.value.trim())) {
        input.style.borderColor = '#e74c3c';
        return;
      }

      input.style.borderColor = '';
      const originalBtn = newsletterForm.querySelector('.btn');
      originalBtn.textContent = 'Subscribed!';
      originalBtn.style.pointerEvents = 'none';
      setTimeout(() => {
        originalBtn.textContent = 'Subscribe';
        originalBtn.style.pointerEvents = '';
      }, 3000);
      input.value = '';
    });
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
});
