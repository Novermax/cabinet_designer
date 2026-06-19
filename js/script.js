// ============================================================
// Cabinet Designer — Landing Page Scripts
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

  // =============================================================
  // 1. NAVBAR — Scroll effect & mobile toggle
  // =============================================================
  const navbar = document.getElementById('navbar');
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  // Scroll: add/remove .scrolled class
  const handleScroll = () => {
    if (window.scrollY > 60) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  };
  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  // Mobile toggle: open/close
  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    const icon = navToggle.querySelector('i');
    icon.classList.toggle('fa-bars');
    icon.classList.toggle('fa-times');
  });

  // Close mobile nav on link click
  navLinks.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      const icon = navToggle.querySelector('i');
      icon.classList.add('fa-bars');
      icon.classList.remove('fa-times');
    });
  });

  // =============================================================
  // 2. FADE-IN ON SCROLL (Intersection Observer)
  // =============================================================
  const fadeElements = document.querySelectorAll('.fade-section');

  const observerOptions = {
    threshold: 0.15,
    rootMargin: '0px 0px -40px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  fadeElements.forEach(el => observer.observe(el));

  // =============================================================
  // 3. STAT COUNTER ANIMATION
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
  }, { threshold: 0.5 });

  statNumbers.forEach(el => counterObserver.observe(el));

  function animateCounter(el, target) {
    const duration = 2000;
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current = Math.min(Math.round(increment * step), target);
      el.textContent = target >= 1000
        ? current.toLocaleString()
        : current + (target < 100 ? '%' : '');
      if (current >= target) clearInterval(timer);
    }, duration / steps);
  }

  // =============================================================
  // 4. CONTACT FORM VALIDATION
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

      // Reset errors
      clearErrors();

      // Validate name
      if (!nameInput.value.trim()) {
        showError(nameInput, 'Name is required.');
        valid = false;
      }

      // Validate email
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailInput.value.trim()) {
        showError(emailInput, 'Email is required.');
        valid = false;
      } else if (!emailPattern.test(emailInput.value.trim())) {
        showError(emailInput, 'Please enter a valid email address.');
        valid = false;
      }

      // Validate message
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
  // 5. NEWSLETTER FORM
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
});
