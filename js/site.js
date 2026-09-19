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

function runBootstrap() {
  initFaqs();
  initCarousel();
}

document.addEventListener("DOMContentLoaded", runBootstrap);
if (document.readyState === "interactive" || document.readyState === "complete") {
  runBootstrap();
}
