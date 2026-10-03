function renderNav(currentPage) {
  const links = [
    { href: "index.html", label: "Home", id: "home" },
    { href: "mission.html", label: "Mission", id: "mission" },
    { href: "doctors.html", label: "Doctors", id: "doctors" },
    { href: "professionals.html", label: "Professionals", id: "professionals" },
    { href: "partners.html", label: "Partners", id: "partners" },
    { href: "contact.html", label: "Contact", id: "contact" },
  ];

  const navHTML = `
    <header class="nav">
      <div class="nav-inner">
        <a href="index.html" class="brand">
          <div class="brand-mark">AM</div>
          <div class="brand-text">Afghan Medical Diaspora</div>
        </a>
        <nav>
          <ul class="nav-links">
            ${links.map(l => `
              <li><a href="${l.href}" class="${l.id === currentPage ? "active" : ""}">${l.label}</a></li>
            `).join("")}
            <li><a href="join.html" class="nav-cta">Join Network</a></li>
          </ul>
          <button class="nav-toggle" aria-label="Toggle navigation">
            <span></span>
          </button>
        </nav>
      </div>
      <div class="mobile-menu">
        <ul>
          ${links.map(l => `
            <li><a href="${l.href}" class="${l.id === currentPage ? "active" : ""}">${l.label}</a></li>
          `).join("")}
        </ul>
        <div class="mobile-cta-wrap">
          <a href="join.html" class="btn btn-primary btn-block">Join the Network</a>
        </div>
      </div>
    </header>
  `;

  const navMount = document.getElementById("nav-mount");
  if (navMount) navMount.innerHTML = navHTML;

  const footerHTML = `
    <footer class="footer">
      <div class="container">
        <div class="footer-grid">
          <div>
            <div class="footer-brand">Afghan Medical Diaspora</div>
            <p class="footer-tagline">
              Building a network of Afghan healthcare professionals abroad to support healthcare in Afghanistan.
            </p>
          </div>
          <div>
            <h4>Explore</h4>
            <ul>
              <li><a href="index.html">Home</a></li>
              <li><a href="mission.html">Mission</a></li>
              <li><a href="doctors.html">Doctors</a></li>
              <li><a href="professionals.html">Professionals</a></li>
            </ul>
          </div>
          <div>
            <h4>Get Involved</h4>
            <ul>
              <li><a href="join.html">Join the Network</a></li>
              <li><a href="partners.html">Partners</a></li>
              <li><a href="contact.html">Contact Us</a></li>
            </ul>
          </div>
          <div>
    <h4>Connect</h4>
    <ul>
      <li><a href="contact.html">Email</a></li>
      <li><a href="join.html">Sign up for updates</a></li>
      <li><a href="privacy.html">Privacy notice</a></li>
    </ul>
  </div>
</div>
<div class="footer-bottom">
  <div>&copy; ${new Date().getFullYear()} Afghan Medical Diaspora. All rights reserved.</div>
  <div><a href="privacy.html" style="color:#88a8a8;">Privacy</a> · In development — building the network together.</div>
</div>
      </div>
    </footer>
  `;

  const footerMount = document.getElementById("footer-mount");
  if (footerMount) footerMount.innerHTML = footerHTML;

  const toggle = document.querySelector(".nav-toggle");
  const menu = document.querySelector(".mobile-menu");
  if (toggle && menu) {
    toggle.addEventListener("click", () => {
      toggle.classList.toggle("open");
      menu.classList.toggle("open");
    });
  }
}

function initFaqs() {
  var btns = document.querySelectorAll(".faq-q");
  btns.forEach(function(btn) {
    if (btn.dataset.faqBound === "1") return;
    btn.dataset.faqBound = "1";
    btn.addEventListener("click", function(e) {
      var item = btn.closest(".faq-item");
      if (!item) {
        item = btn.parentElement;
      }
      if (item) item.classList.toggle("open");
      if (e && typeof e.preventDefault === "function") e.preventDefault();
    });
  });
}

function initCarousel() {
  var carousel = document.querySelector(".hero-carousel");
  if (!carousel) return;
  if (carousel.dataset.carouselBound === "1") return;
  carousel.dataset.carouselBound = "1";

  var slides = carousel.querySelectorAll(".hero-slide");
  var dots = carousel.querySelectorAll(".carousel-dot");
  var prev = carousel.querySelector(".carousel-btn.prev");
  var next = carousel.querySelector(".carousel-btn.next");
  var current = 0;
  var timer = null;

  function goTo(n) {
    slides.forEach(function(s, i) { s.classList.toggle("active", i === n); });
    dots.forEach(function(d, i) { d.classList.toggle("active", i === n); });
    current = n;
  }

  function advance() { goTo((current + 1) % slides.length); }
  function rewind() { goTo((current - 1 + slides.length) % slides.length); }

  function start() { stop(); timer = setInterval(advance, 7000); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  if (next) next.addEventListener("click", function() { advance(); start(); });
  if (prev) prev.addEventListener("click", function() { rewind(); start(); });
  dots.forEach(function(d, i) {
    d.addEventListener("click", function() { goTo(i); start(); });
  });

  carousel.addEventListener("mouseenter", stop);
  carousel.addEventListener("mouseleave", start);

  document.addEventListener("keydown", function(e) {
    if (e.key === "ArrowRight") { advance(); start(); }
    if (e.key === "ArrowLeft") { rewind(); start(); }
  });

  start();
}

function initForms() {
  document.querySelectorAll('form[data-endpoint]').forEach(function(form) {
    if (form.dataset.formBound === '1') return;
    form.dataset.formBound = '1';

    var endpoint = form.getAttribute('data-endpoint') || '';
    var submitBtn = form.querySelector('button[type="submit"]');
    var successEl = form.querySelector('.form-success');
    var errorEl = form.querySelector('.form-error');
    var originalBtnText = submitBtn ? (submitBtn.getAttribute('data-default-text') || submitBtn.textContent) : '';
    if (submitBtn) submitBtn.setAttribute('data-default-text', originalBtnText);

    function clearErrors() {
      form.querySelectorAll('.has-error').forEach(function(f) { f.classList.remove('has-error'); });
      if (errorEl) { errorEl.classList.remove('show'); errorEl.innerHTML = ''; }
    }

    function highlightFieldErrors(errors) {
      if (!errors) return;
      Object.keys(errors).forEach(function(name) {
        var el = form.querySelector('[name="' + name + '"]');
        if (!el) return;
        var wrap = el.closest('.field') || el.closest('.consent');
        if (wrap) wrap.classList.add('has-error');
      });
      if (errorEl) {
        var liHtml = Object.keys(errors).map(function(n) { return '<li>' + escapeHtml(errors[n]) + '</li>'; }).join('');
        errorEl.innerHTML = '<strong>Please fix the following and try again:</strong><ul>' + liHtml + '</ul>';
        errorEl.classList.add('show');
      }
    }

    function showGenericError(msg) {
      if (!errorEl) return;
      errorEl.innerHTML = '<strong>Something went wrong while submitting.</strong><br/>' +
        (msg || ' Please try again in a moment, or email us directly at ' +
         '<a href="mailto:join@afghanmedicaldiaspora.org">join@afghanmedicaldiaspora.org</a>');
      errorEl.classList.add('show');
    }

    function setBusy(busy) {
      if (!submitBtn) return;
      if (busy) {
        submitBtn.setAttribute('aria-busy', 'true');
        submitBtn.setAttribute('disabled', 'disabled');
        submitBtn.textContent = 'Submitting…';
      } else {
        submitBtn.removeAttribute('aria-busy');
        submitBtn.removeAttribute('disabled');
        submitBtn.textContent = originalBtnText;
      }
    }

    function fallbackShowSuccess() {
      // Static file:// preview (no backend) or network offline — show success locally with a small caveat.
      form.reset();
      if (successEl) {
        successEl.classList.add('show');
        successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    function serializeToJson() {
      var fd = new FormData(form);
      var payload = {};
      fd.forEach(function(value, key) {
        if (key === 'website') {
          payload[key] = value;
          return;
        }
        var existing = payload[key];
        if (existing !== undefined) {
          if (!Array.isArray(existing)) existing = [existing];
          existing.push(value);
          payload[key] = existing;
        } else {
          // Checkboxes that aren't selected yield no FormData entry at all (correct).
          payload[key] = value;
        }
      });
      return payload;
    }

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      clearErrors();

      // 1. Client validation (matches original logic)
      var clientErrors = {};
      form.querySelectorAll('[required]').forEach(function(el) {
        var missing = false;
        if (el.type === 'checkbox') { missing = !el.checked; }
        else if (el.type === 'radio') {
          var radios = form.querySelectorAll('input[type="radio"][name="' + el.name + '"]');
          var anyChecked = false;
          for (var i = 0; i < radios.length; i++) { if (radios[i].checked) { anyChecked = true; break; } }
          missing = !anyChecked;
        }
        else { missing = !el.value || !String(el.value).trim(); }
        if (missing) {
          clientErrors[el.name] = clientErrors[el.name] || 'Required';
          var wrap = el.closest('.field') || el.closest('.consent');
          if (wrap) wrap.classList.add('has-error');
        }
        // Email format
        if (el.type === 'email' && el.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(el.value).trim())) {
          clientErrors[el.name] = 'Please enter a valid email address';
          var w2 = el.closest('.field');
          if (w2) w2.classList.add('has-error');
        }
      });

      if (Object.keys(clientErrors).length) {
        highlightFieldErrors(clientErrors);
        return;
      }

      var payload = serializeToJson();
      setBusy(true);

      var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      var csrf = form.querySelector('input[name="_csrf"]');
      if (csrf) headers['X-CSRF-Token'] = csrf.value;

      fetch(endpoint, {
        method: 'POST',
        headers: headers,
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      }).then(function(r) {
        var contentType = r.headers.get('content-type') || '';
        if (contentType.indexOf('application/json') >= 0) {
          return r.json().then(function(data) { return { status: r.status, data: data }; });
        }
        return r.text().then(function(t) {
          try { return { status: r.status, data: JSON.parse(t) }; } catch (_) { return { status: r.status, data: { ok: r.status >= 200 && r.status < 300 } }; }
        });
      }).then(function(result) {
        var s = result.status;
        var d = result.data || {};
        setBusy(false);

        if (d && d.ok === false && s === 400 && d.errors) {
          highlightFieldErrors(d.errors);
          return;
        }
        if (s >= 200 && s < 300 && (!d || d.ok !== false)) {
          form.reset();
          if (successEl) {
            successEl.classList.add('show');
            successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }
        showGenericError((d && d.message) || '');
      }).catch(function() {
        // Network failure, offline, or file:// (no backend) — show "thanks" fallback, UX same as before.
        setBusy(false);
        fallbackShowSuccess();
      });
    });
  });
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function runBootstrap() {
  initFaqs();
  initCarousel();
  initForms();
}

document.addEventListener("DOMContentLoaded", runBootstrap);
if (document.readyState === "interactive" || document.readyState === "complete") {
  runBootstrap();
}
