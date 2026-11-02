/* City service detail record */
(function () {
  'use strict';

  const UI = window.CivicUI;
  const Api = window.CivicApi;
  const Icons = window.CivicIcons;
  const Maps = window.CivicMaps;

  function renderError(message) {
    const hero = UI.qs('#service-hero');
    const detail = UI.qs('#service-detail');
    const crumb = UI.qs('#crumb-service');
    if (crumb) crumb.textContent = 'Service unavailable';
    if (hero) hero.innerHTML = `<h1 style="margin-top:12px;font-size:clamp(1.8rem,3.4vw,2.5rem)">Service unavailable</h1><p style="margin-top:10px">${UI.esc(message)}</p>`;
    if (detail) {
      detail.setAttribute('aria-busy', 'false');
      detail.innerHTML = `<div class="card card-pad" style="max-width:640px">
        ${UI.emptyState({
          icon: 'alert-circle',
          title: 'This service record could not be opened',
          message: message,
          action: { label: 'Back to the service directory', href: 'services.html', icon: 'arrow-left', variant: 'btn-primary' }
        })}
      </div>`;
    }
    Icons.mount(document);
  }

  function fact(icon, label, value) {
    return `<div class="detail-fact">${Icons.icon(icon, 16)}<div><span>${UI.esc(label)}</span><strong>${value}</strong></div></div>`;
  }

  function render(service, related) {
    const crumb = UI.qs('#crumb-service');
    if (crumb) crumb.textContent = service.name;
    document.title = `${service.name} · CivicFlow`;

    const hasCoords = Maps.hasCoordinates(service.latitude, service.longitude);
    const directions = hasCoords ? Maps.directionsUrl(service.latitude, service.longitude) : '';
    const phoneHref = service.phone ? `tel:${String(service.phone).replace(/[^+\d]/g, '')}` : '';

    const hero = UI.qs('#service-hero');
    if (hero) {
      hero.innerHTML = `<div style="margin-top:10px">
        <div class="status-line">
          <span class="badge badge-teal">${Icons.icon(service.category_icon || 'building', 12)}${UI.esc(service.category_name || UI.titleCase(service.category))}</span>
          ${service.area ? `<span class="badge badge-neutral">${UI.esc(service.area)}</span>` : ''}
        </div>
        <h1 style="margin-top:12px">${UI.esc(service.name)}</h1>
        <div class="meta-list" style="margin-top:12px">
          ${service.address ? `<span>${Icons.icon('map-pin', 14)}${UI.esc(service.address)}</span>` : ''}
          ${service.opening_hours ? `<span>${Icons.icon('clock', 14)}${UI.esc(service.opening_hours)}</span>` : ''}
          ${service.phone ? `<span>${Icons.icon('phone', 14)}${UI.esc(service.phone)}</span>` : ''}
        </div>
      </div>`;
    }

    const facts = [
      fact('tag', 'Category', UI.esc(service.category_name || UI.titleCase(service.category))),
      fact('map', 'Service area', UI.esc(service.area || 'Not specified')),
      fact('phone', 'Telephone', service.phone ? `<a class="link" href="${UI.attr(phoneHref)}">${UI.esc(service.phone)}</a>` : '<span class="muted">Not published</span>'),
      fact('clock', 'Opening hours', UI.esc(service.opening_hours || 'Not published')),
      fact('map-pin', 'Address', UI.esc(service.address || 'Not published')),
      fact('calendar', 'Record updated', UI.esc(UI.formatDate(service.updated_at)))
    ].join('');

    const relatedMarkup = related && related.length
      ? `<div class="related-list">${related.map(function (item) {
          return `<a class="related-item" href="service-details.html?id=${Number(item.id)}">
            <span><strong>${UI.esc(item.name)}</strong><small>${UI.esc(item.address || item.area || 'Location in directory')}</small></span>
            ${Icons.icon('chevron-right', 14)}
          </a>`;
        }).join('')}</div>`
      : `<p class="form-note" style="margin-top:10px">No other services are published in this category.</p>`;

    const detail = UI.qs('#service-detail');
    detail.setAttribute('aria-busy', 'false');
    detail.innerHTML = `<div class="detail-layout">
      <div class="detail-panel">
        <div class="detail-title-row">
          <div>
            <h2 style="font-size:1.15rem">About this service</h2>
            <p class="text-xs muted" style="margin-top:3px">Published by the city administration</p>
          </div>
          <div class="cluster">
            ${directions ? `<a class="btn btn-secondary btn-sm" href="${UI.attr(directions)}" target="_blank" rel="noopener noreferrer">${Icons.icon('navigation', 14)}Directions</a>` : ''}
            <button class="btn btn-ghost btn-sm" type="button" data-copy-address ${service.address ? '' : 'disabled'}>${Icons.icon('copy', 14)}Copy address</button>
          </div>
        </div>
        <div class="detail-description">${UI.esc(service.description || 'The city has not published a description for this service yet.')}</div>
        <div class="detail-facts">${facts}</div>
        <div style="margin-top:26px">
          <div class="section-title-row"><h2 style="font-size:1.05rem">Location</h2>${hasCoords ? `<span class="text-xs muted">Coordinates ${Number(service.latitude).toFixed(5)}, ${Number(service.longitude).toFixed(5)}</span>` : ''}</div>
          <div class="map-frame"><div id="service-map" class="map-canvas"></div></div>
        </div>
      </div>

      <aside class="detail-sidebar">
        <div class="card card-pad">
          <div class="cluster" style="justify-content:space-between"><h3>Contact &amp; visit</h3><div class="icon-tile sm">${Icons.icon('building', 16)}</div></div>
          <div class="profile-facts" style="margin-top:14px">
            <div class="profile-fact">${Icons.icon('map-pin', 15)}<div><span>Address</span><strong>${UI.esc(service.address || 'Not published')}</strong></div></div>
            <div class="profile-fact">${Icons.icon('phone', 15)}<div><span>Telephone</span><strong>${service.phone ? `<a class="link" href="${UI.attr(phoneHref)}">${UI.esc(service.phone)}</a>` : 'Not published'}</strong></div></div>
            <div class="profile-fact">${Icons.icon('clock', 15)}<div><span>Opening hours</span><strong>${UI.esc(service.opening_hours || 'Not published')}</strong></div></div>
          </div>
          ${service.phone ? `<a class="btn btn-primary btn-block" href="${UI.attr(phoneHref)}">${Icons.icon('phone', 15)}Call this service</a>` : ''}
          ${directions ? `<a class="btn btn-secondary btn-block" href="${UI.attr(directions)}" target="_blank" rel="noopener noreferrer">${Icons.icon('navigation', 15)}Open directions</a>` : ''}
        </div>

        <div class="card card-pad">
          <h3>Something needs attention?</h3>
          <p>If a city service location has a civic issue — a pothole, blocked drain or broken streetlight — report it with a precise location so the response team can act.</p>
          <a class="btn btn-teal btn-block" href="report-issue.html">${Icons.icon('plus-circle', 15)}Report an issue</a>
        </div>

        <div class="card card-pad">
          <h3>Related services</h3>
          ${relatedMarkup}
        </div>
      </aside>
    </div>`;

    const copyButton = UI.qs('[data-copy-address]', detail);
    if (copyButton && service.address) {
      copyButton.addEventListener('click', async function () {
        try {
          await UI.copyText(service.address);
          UI.toast('Address copied to clipboard.', 'success');
        } catch {
          UI.toast('The address could not be copied. Select it manually instead.', 'error');
        }
      });
    }

    const mapNode = UI.qs('#service-map');
    if (mapNode) {
      Maps.render(mapNode, {
        lat: service.latitude,
        lng: service.longitude,
        label: service.name,
        address: service.address,
        zoom: 16,
        interactive: true,
        emptyMessage: 'The city has not recorded coordinates for this service. Use the published address to find it.'
      }).then(function () { Icons.mount(mapNode); });
    }

    Icons.mount(detail);
  }

  async function init() {
    Icons.mount(document);
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get('id'));
    if (!Number.isSafeInteger(id) || id < 1) {
      renderError('No service was selected. Choose a service from the directory to view its details.');
      return;
    }
    try {
      const payload = await Api.services.get(id);
      render(payload.data.service, payload.data.related || []);
    } catch (error) {
      renderError(error.status === 404
        ? 'This service record does not exist or is no longer published.'
        : error.message || 'The service record could not be loaded.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
