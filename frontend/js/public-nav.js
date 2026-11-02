/* Public header, mobile navigation and footer shared by every public page */
(function () {
  'use strict';

  const UI = window.CivicUI;
  const Icons = window.CivicIcons;
  const Api = window.CivicApi;

  const LINKS = [
    { href: 'services.html', label: 'Services', page: 'services' },
    { href: 'index.html#how-it-works', label: 'How it works', page: 'how' },
    { href: 'polls.html', label: 'Community polls', page: 'polls' },
    { href: 'index.html#about', label: 'About', page: 'about' }
  ];

  function brandMarkup(light) {
    return `<a class="brand ${light ? 'brand-light' : ''}" href="index.html" aria-label="CivicFlow home">
      <span class="brand-mark">${Icons.icon('shield', 20)}</span>
      <span class="brand-word">
        <span class="brand-name">Civic<span>Flow</span></span>
        <span class="brand-tagline">Smart city services</span>
      </span>
    </a>`;
  }

  function dashboardFor(user) {
    if (!user) return 'login.html';
    return { citizen: 'citizen-dashboard.html', officer: 'officer-dashboard.html', admin: 'admin-dashboard.html' }[user.role] || 'login.html';
  }

  function headerTemplate(user, active) {
    const links = LINKS.map(function (link) {
      return `<a href="${link.href}" class="${link.page === active ? 'is-active' : ''}" ${link.page === active ? 'aria-current="page"' : ''}>${UI.esc(link.label)}</a>`;
    }).join('');

    const actions = user
      ? `<a class="btn btn-secondary btn-sm" href="${dashboardFor(user)}">${Icons.icon('dashboard', 15)}Dashboard</a>
         <a class="btn btn-primary btn-sm" href="report-issue.html">${Icons.icon('plus', 15)}Report an issue</a>`
      : `<a class="btn btn-ghost btn-sm" href="login.html">Sign in</a>
         <a class="btn btn-primary btn-sm" href="register.html">Create account</a>`;

    const mobileAccount = user
      ? `<a class="btn btn-primary" href="${dashboardFor(user)}">${Icons.icon('dashboard', 16)}Go to dashboard</a>`
      : `<a class="btn btn-primary" href="register.html">Create an account</a><a class="btn btn-secondary" href="login.html">Sign in</a>`;

    return `<div class="container">
      <nav class="public-nav" aria-label="Main navigation">
        ${brandMarkup(false)}
        <div class="public-links">${links}</div>
        <div class="public-actions">
          ${actions}
          <button class="nav-toggle" type="button" data-nav-toggle aria-label="Open navigation" aria-expanded="false" aria-controls="mobile-nav">${Icons.icon('menu', 19)}</button>
        </div>
      </nav>
      <div class="mobile-nav" id="mobile-nav" data-mobile-nav>
        ${links}
        <a href="services.html">${Icons.icon('building', 16)}Service directory</a>
        <div class="mobile-account">${mobileAccount}</div>
      </div>
    </div>`;
  }

  function footerTemplate() {
    return `<div class="container">
      <div class="footer-main">
        <div class="footer-brand">
          ${brandMarkup(true)}
          <p>A single, accountable place for residents to find city services, report civic issues and follow what happens next.</p>
        </div>
        <div class="footer-col">
          <h4>For residents</h4>
          <ul>
            <li><a href="services.html">Service directory</a></li>
            <li><a href="report-issue.html">Report an issue</a></li>
            <li><a href="my-complaints.html">Track a complaint</a></li>
            <li><a href="polls.html">Community polls</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Platform</h4>
          <ul>
            <li><a href="index.html#how-it-works">How it works</a></li>
            <li><a href="index.html#about">About CivicFlow</a></li>
            <li><a href="login.html">Citizen sign in</a></li>
            <li><a href="register.html">Create an account</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>City support</h4>
          <div class="footer-contact" data-footer-contact>
            <span>${Icons.icon('building', 14)}<span>Municipal service desk</span></span>
            <span>${Icons.icon('info', 14)}<span data-footer-note>Contact details are published by your city administrator.</span></span>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        <p>© <span data-current-year></span> CivicFlow · Smart City Assistance and Discovery Platform</p>
        <div class="cluster">
          <a href="index.html">Home</a>
          <a href="services.html">Services</a>
          <a href="login.html">Sign in</a>
        </div>
      </div>
    </div>`;
  }

  function applyConfig(settings) {
    if (!settings) return;
    const contact = document.querySelector('[data-footer-contact]');
    if (!contact) return;
    const rows = [];
    if (settings.city_name) rows.push({ icon: 'building', text: settings.city_name });
    if (settings.support_email) rows.push({ icon: 'mail', text: settings.support_email, href: `mailto:${settings.support_email}` });
    if (settings.support_phone) rows.push({ icon: 'phone', text: settings.support_phone, href: `tel:${settings.support_phone.replace(/[^+\d]/g, '')}` });
    if (settings.office_address) rows.push({ icon: 'map-pin', text: settings.office_address });
    if (!rows.length) return;
    contact.innerHTML = rows.map(function (row) {
      const content = `<span>${UI.esc(row.text)}</span>`;
      return `<span>${Icons.icon(row.icon, 14)}${row.href ? `<a href="${UI.attr(row.href)}">${content}</a>` : content}</span>`;
    }).join('');
  }

  function bindHeader(header) {
    const toggle = header.querySelector('[data-nav-toggle]');
    const mobile = header.querySelector('[data-mobile-nav]');
    if (toggle && mobile) {
      toggle.addEventListener('click', function () {
        const open = mobile.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
        toggle.innerHTML = Icons.icon(open ? 'x' : 'menu', 19);
      });
      mobile.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', function () {
          mobile.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.innerHTML = Icons.icon('menu', 19);
        });
      });
    }

    function onScroll() {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function init() {
    const header = document.querySelector('[data-public-header]');
    const footer = document.querySelector('[data-public-footer]');
    const active = document.body.dataset.page || '';
    const user = Api.getUser();
    if (header) {
      header.innerHTML = headerTemplate(user, active);
      bindHeader(header);
    }
    if (footer) {
      footer.innerHTML = footerTemplate();
      const year = footer.querySelector('[data-current-year]');
      if (year) year.textContent = new Date().getFullYear();
      Api.public.config().then(function (payload) { applyConfig(payload.data && payload.data.settings); }).catch(function () {});
    }
    Icons.mount(document);

    window.addEventListener('civicflow:session', function (event) {
      if (!header) return;
      header.innerHTML = headerTemplate(event.detail.user, active);
      bindHeader(header);
      Icons.mount(header);
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  window.CivicPublicNav = { init: init, dashboardFor: dashboardFor };
})();
