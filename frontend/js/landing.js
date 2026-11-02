/* Landing page: live totals, category discovery, recent services and open polls */
(function () {
  'use strict';

  const UI = window.CivicUI;
  const Api = window.CivicApi;
  const Icons = window.CivicIcons;

  function setStat(key, value) {
    UI.qsa(`[data-stat="${key}"]`).forEach(function (node) { node.textContent = value; });
  }

  async function loadStats() {
    const label = UI.qs('[data-live-label]');
    try {
      const payload = await Api.public.stats();
      const stats = payload.data.stats || {};
      setStat('citizens', UI.formatNumber(stats.citizens));
      setStat('services', UI.formatNumber(stats.services));
      setStat('complaints', UI.formatNumber(stats.complaints));
      setStat('resolved', UI.formatNumber(stats.resolved));
      setStat('active_polls', UI.formatNumber(stats.active_polls));
      setStat('average', stats.avg_resolution_hours == null ? 'Not measured' : UI.formatHours(stats.avg_resolution_hours));
      const note = UI.qs('[data-stat-note="resolution"]');
      if (note) note.textContent = `${UI.percent(stats.resolution_rate)} resolution rate`;
      if (label) label.textContent = 'Live';
    } catch (error) {
      if (label) label.textContent = 'Unavailable';
      const note = UI.qs('[data-stat-note="resolution"]');
      if (note) note.textContent = 'Live figures unavailable';
      UI.qsa('[data-stat]').forEach(function (node) {
        if (node.textContent === '—') node.textContent = '—';
      });
    }
  }

  function categoryCard(category) {
    return `<a class="category-card" href="services.html?category=${encodeURIComponent(category.slug)}">
      <div class="category-card-top">
        <div class="icon-tile">${Icons.icon(category.icon || 'map-pin', 21)}</div>
        <span class="category-count">${UI.formatNumber(category.service_count)} service${Number(category.service_count) === 1 ? '' : 's'}</span>
      </div>
      <div>
        <h3>${UI.esc(category.name)}</h3>
        <p>${UI.esc(category.description || 'Browse services published in this category by the city.')}</p>
      </div>
      <div class="category-card-foot"><span>Browse services</span>${Icons.icon('arrow-up-right', 15)}</div>
    </a>`;
  }

  async function loadCategories() {
    const grid = UI.qs('#category-grid');
    if (!grid) return;
    try {
      const payload = await Api.request('/service-categories');
      const categories = (payload.data.categories || []).filter(function (category) {
        return category.is_active !== false && Number(category.service_count) >= 0;
      });
      if (!categories.length) {
        grid.innerHTML = `<div class="section-empty" style="grid-column:1/-1">No service categories are published yet. The city administration manages this directory.</div>`;
        return;
      }
      grid.innerHTML = categories.slice(0, 6).map(categoryCard).join('');
      Icons.mount(grid);
    } catch (error) {
      grid.innerHTML = `<div class="section-empty" style="grid-column:1/-1">City service categories could not be loaded right now.</div>`;
    }
  }

  async function loadRecentServices() {
    const container = UI.qs('#recent-services');
    if (!container) return;
    try {
      const payload = await Api.services.list({ limit: 3, sort: 'newest' });
      const services = payload.data.services || [];
      if (!services.length) {
        container.innerHTML = `<div class="section-empty" style="grid-column:1/-1">No city services have been published yet.</div>`;
        return;
      }
      container.innerHTML = services.map(function (service) {
        return `<article class="service-mini">
          <div class="service-mini-head">
            <div class="icon-tile sm">${Icons.icon(service.category_icon || 'building', 17)}</div>
            <span class="badge badge-teal">${UI.esc(service.category_name || UI.titleCase(service.category))}</span>
          </div>
          <div>
            <h3><a href="service-details.html?id=${Number(service.id)}">${UI.esc(service.name)}</a></h3>
            <p>${UI.esc(service.description || 'Open the service record for contact details and location information.')}</p>
          </div>
          <div class="service-mini-meta">
            <span>${Icons.icon('map-pin', 13)}${UI.esc(service.address || service.area || 'Address published in directory')}</span>
            <span>${Icons.icon('clock', 13)}${UI.esc(service.opening_hours || 'Opening hours available on the service record')}</span>
          </div>
        </article>`;
      }).join('');
      Icons.mount(container);
    } catch (error) {
      container.innerHTML = `<div class="section-empty" style="grid-column:1/-1">Recent services could not be loaded right now.</div>`;
    }
  }

  function pollPreview(poll) {
    const options = (poll.options || []).slice(0, 3);
    const meta = [
      `<span>${Icons.icon('users', 12)}${UI.formatNumber(poll.total_votes)} vote${Number(poll.total_votes) === 1 ? '' : 's'}</span>`,
      poll.ends_at ? `<span>${Icons.icon('calendar', 12)}Closes ${UI.esc(UI.formatDate(poll.ends_at))}</span>` : `<span>${Icons.icon('clock', 12)}Open until closed by the city</span>`
    ].join('');
    return `<article class="poll-preview">
      <div>
        <div class="status-line" style="margin-bottom:6px">${UI.pollStatusBadge(poll.status)}</div>
        <h3>${UI.esc(poll.title)}</h3>
        <p>${UI.esc(poll.description || 'Share your view on this city priority.')}</p>
        <div class="poll-preview-meta">${meta}</div>
        <div class="poll-results-mini">
          ${options.map(function (option) {
            return `<div class="poll-mini-row"><span title="${UI.attr(option.text)}">${UI.esc(option.text)}</span><span class="poll-mini-track"><span class="poll-mini-fill" style="width:${Math.max(Number(option.percentage) || 0, 0)}%"></span></span><b>${UI.esc(option.percentage)}%</b></div>`;
          }).join('')}
        </div>
      </div>
      <a class="btn btn-secondary" href="polls.html">${poll.total_votes ? 'View results' : 'Vote now'}${Icons.icon('arrow-right', 14)}</a>
    </article>`;
  }

  async function loadPolls() {
    const container = UI.qs('#poll-preview');
    if (!container) return;
    try {
      const payload = await Api.polls.list({ status: 'active' });
      const polls = payload.data.polls || [];
      if (!polls.length) {
        container.innerHTML = `<div class="section-empty">No community polls are open right now. Published polls will appear here.</div>`;
        return;
      }
      container.innerHTML = polls.slice(0, 2).map(pollPreview).join('');
    } catch (error) {
      container.innerHTML = `<div class="section-empty">Community polls could not be loaded right now.</div>`;
    }
  }

  function init() {
    const year = new Date().getFullYear();
    document.documentElement.dataset.year = year;
    loadStats();
    loadCategories();
    loadRecentServices();
    loadPolls();
    Icons.mount(document);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
