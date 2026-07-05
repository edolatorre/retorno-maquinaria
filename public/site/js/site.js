document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.nav-main');
  if (toggle && nav) {
    toggle.addEventListener('click', () => nav.classList.toggle('open'));
  }

  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });

  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', e => {
      e.preventDefault();
      alert('¡Gracias por tu mensaje! Te contactaremos pronto.');
      contactForm.reset();
    });
  }

  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-main a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPath || (currentPath === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  const appOrigin = (() => {
    const h = window.location.hostname;
    const port = window.location.port ? `:${window.location.port}` : '';
    if (h === 'localhost' || h === '127.0.0.1') {
      return `${window.location.protocol}//app.localhost${port}`;
    }
    const domain = h.replace(/^www\./, '');
    return `${window.location.protocol}//app.${domain}`;
  })();

  document.querySelectorAll('a[href^="/app"]').forEach(a => {
    const href = a.getAttribute('href');
    if (window.location.hostname.includes('onrender.com') || window.location.hostname.includes('koyeb.app')) {
      a.href = href;
    } else {
      a.href = appOrigin + href.replace(/^\/app/, '');
    }
  });
});
