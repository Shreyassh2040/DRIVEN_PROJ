/* Service directory: filters, search, proximity and pagination */
(function () {
  'use strict';

  const UI = window.CivicUI;
  const Api = window.CivicApi;
  const Icons = window.CivicIcons;

  const state = {
    q: '',
    category: '',
    area: '',
    sort: '',
    page: 1,
    geo: null,
    categories: [],
    areas: []
  };

  let requestId = 0;

  function readUrl() {
    const params = new URLSearchParams(window.location.search);
    state.q = params.get('q') || '';
    state.category = params.get('category') || '';
    state.area = params.get('area') || '';
    state.sort = params.get('sort') || '';
    state.page = Math.max(1, Number(params.get('page')) || 1);
  }

  function writeUrl() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category) params.set('category', state.category);
    if (state.area) params.set('area', state.area);
    if (state.sort) params.set('sort', state.sort);
    if (state.page > 1) params.set('page', String(state.page));
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }

  function categoryName(slug) {
    const category = state.categories.find(function (item) { return item.slug === slug; });
    return category ? category.name : UI.titleCase(slug);
  }

  function renderCategoryFilters() {
    const container = UI.qs('#category-filters');
    if (!container) return;
    const total = state.categories.reduce(function (sum, category) { return sum + Number(category.service_count || 0); }, 0);
    const all = `<button class="filter-option ${state.category ? '' : 'is-active'}" type="button" data-category="">
      <span>All services</span><span class="count">${UI.formatNumber(total)}</span>
    </button>`;
    const items = state.categories.map(function (category) {
      return `<button class="filter-option ${state.category === category.slug ? 'is-active' : ''}" type="button" data-category="${UI.attr(category.slug)}">
        <span>${UI.esc(category.name)}</span><span class="count">${UI.formatNumber(category.service_count)}</span>
      </button>`;
    }).join('');
    container.innerHTML = all + items;
    container.querySelectorAll('[data-category]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.category = button.dataset.category || '';
        state.page = 1;
        renderCategoryFilters();
        load();
      });
    });
  }

  function renderAreaFilter() {
    const select = UI.qs('#area-filter');
    if (!select) return;
    const options = ['<option value="">All areas</option>'].concat(state.areas.map(function (area) {
      return `<option value="${UI.attr(area.area)}">${UI.esc(area.area)} (${UI.formatNumber(area.service_count)})</option>`;
    })).join('');
    select.innerHTML = options;
    select.value = state.area;
  }

  function renderActiveFilters() {
    const container = UI.qs('#active-filters');
    if (!container) return;
    const chips = [];
    if (state.q) chips.push({ key: 'q', label: `Search: “${state.q}”` });
    if (state.category) chips.push({ key: 'category', label: categoryName(state.category) });
    if (state.area) chips.push({ key: 'area', label: state.area });
    if (state.geo) chips.push({ key: 'geo', label: 'Near my location' });
    if (!chips.length) { container.innerHTML = ''; return; }
    container.innerHTML = chips.map(function (chip) {
      return `<button class="chip" type="button" data-remove-filter="${chip.key}">${UI.esc(chip.label)}${Icons.icon('x', 12)}</button>`;
    }).join('');
    container.querySelectorAll('[data-remove-filter]').forEach(function (button) {
      button.addEventListener('click', function () {
        const key = button.dataset.removeFilter;
        if (key === 'q') {
          state.q = '';
          UI.qs('#service-search').value = '';
        } else if (key === 'geo') {
          state.geo = null;
          if (state.sort === 'distance') state.sort = '';
        } else {
          state[key] = '';
          if (key === 'area') UI.qs('#area-filter').value = '';
          if (key === 'category') renderCategoryFilters();
        }
        state.page = 1;
        load();
      });
    });
  }

  function serviceCard(service) {
    const address = service.address || service.area || '';
    const meta = [];
    if (address) meta.push(`<span>${Icons.icon('map-pin', 14)}${UI.esc(address)}</span>`);
    if (service.opening_hours) meta.push(`<span>${Icons.icon('clock', 14)}${UI.esc(service.opening_hours)}</span>`);
    if (service.phone) meta.push(`<span>${Icons.icon('phone', 14)}${UI.esc(service.phone)}</span>`);
    const directions = window.CivicMaps.hasCoordinates(service.latitude, service.longitude)
      ? window.CivicMaps.directionsUrl(service.latitude, service.longitude)
      : '';
    const distance = service.distance_km !== null && service.distance_km !== undefined
      ? `<span class="distance">${Number(service.distance_km).toFixed(1)} km away</span>`
      : `<span class="text-xs muted">${UI.esc(service.area || 'Location in directory')}</span>`;
    return `<article class="service-card">
      <div class="service-card-head">
        <div class="icon-tile">${Icons.icon(service.category_icon || 'building', 21)}</div>
        <span class="badge badge-teal">${UI.esc(service.category_name || UI.titleCase(service.category))}</span>
      </div>
      <div>
        <h3><a href="service-details.html?id=${Number(service.id)}">${UI.esc(service.name)}</a></h3>
        <p class="service-card-description">${UI.esc(service.description || 'Open this record for full service details.')}</p>
      </div>
      <div class="service-card-meta">${meta.join('') || `<span>${Icons.icon('info', 14)}Contact details are not published for this service.</span>`}</div>
      <div class="service-card-foot">
        ${distance}
        <div class="service-card-actions">
          ${directions ? `<a class="btn btn-ghost btn-sm btn-icon" href="${UI.attr(directions)}" target="_blank" rel="noopener noreferrer" aria-label="Open directions for ${UI.attr(service.name)}" title="Directions">${Icons.icon('navigation', 15)}</a>` : ''}
          <a class="btn btn-secondary btn-sm" href="service-details.html?id=${Number(service.id)}">Details${Icons.icon('arrow-right', 14)}</a>
        </div>
      </div>
    </article>`;
  }

  async function load() {
    const grid = UI.qs('#service-results');
    const summary = UI.qs('#results-summary');
    const pager = UI.qs('#service-pagination');
    if (!grid) return;

    writeUrl();
    renderActiveFilters();
    const current = ++requestId;
    grid.setAttribute('aria-busy', 'true');
    grid.innerHTML = `<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>`;
    if (pager) pager.innerHTML = '';
    if (summary) summary.textContent = 'Loading city services…';

    const params = { page: state.page, limit: 12 };
    if (state.q) params.q = state.q;
    if (state.category) params.category = state.category;
    if (state.area) params.area = state.area;
    if (state.sort) params.sort = state.sort;
    if (state.geo) {
      params.lat = state.geo.lat;
      params.lng = state.geo.lng;
      params.sort = state.sort || 'distance';
    }

    try {
      const payload = await Api.services.list(params);
      if (current !== requestId) return;
      const services = payload.data.services || [];
      const pagination = payload.data.pagination || {};

      if (!services.length) {
        grid.innerHTML = `<div class="section-empty" style="grid-column:1/-1;padding:48px 24px">
          <p style="font-weight:600;color:var(--navy-900);margin-bottom:4px">No services match these filters</p>
          <p style="margin-bottom:14px">Try a different search term, category or area.</p>
          <button class="btn btn-secondary btn-sm" type="button" data-reset>Clear filters</button>
        </div>`;
        const reset = grid.querySelector('[data-reset]');
        if (reset) reset.addEventListener('click', clearAll);
        if (summary) summary.textContent = 'No services match your filters.';
        return;
      }

      grid.innerHTML = services.map(serviceCard).join('');
      if (summary) {
        const from = (pagination.page - 1) * pagination.limit + 1;
        const to = Math.min(pagination.page * pagination.limit, pagination.total);
        summary.textContent = `Showing ${from}–${to} of ${pagination.total} service${pagination.total === 1 ? '' : 's'}`;
      }
      if (pager) {
        UI.renderPagination(pager, pagination, function (page) {
          state.page = page;
          load();
          const directory = UI.qs('#directory');
          if (directory) directory.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      Icons.mount(grid);
    } catch (error) {
      if (current !== requestId) return;
      grid.innerHTML = UI.errorState({ message: error.message || 'The service directory could not be loaded.' });
      const retry = grid.querySelector('[data-retry]');
      if (retry) retry.addEventListener('click', load);
      if (summary) summary.textContent = 'Service directory unavailable.';
    } finally {
      if (current === requestId) grid.setAttribute('aria-busy', 'false');
    }
  }

  function clearAll() {
    state.q = '';
    state.category = '';
    state.area = '';
    state.sort = '';
    state.page = 1;
    state.geo = null;
    const search = UI.qs('#service-search');
    if (search) search.value = '';
    const area = UI.qs('#area-filter');
    if (area) area.value = '';
    const sort = UI.qs('#sort-select');
    if (sort) sort.value = '';
    renderCategoryFilters();
    load();
  }

  async function loadMeta() {
    try {
      const payload = await Api.services.meta();
      state.categories = payload.data.categories || [];
      state.areas = payload.data.areas || [];
      renderCategoryFilters();
      renderAreaFilter();
    } catch {
      state.categories = [];
      state.areas = [];
      renderCategoryFilters();
      renderAreaFilter();
    }
  }

  function bindControls() {
    const search = UI.qs('#service-search');
    if (search) {
      search.value = state.q;
      const onSearch = UI.debounce(function () {
        state.q = search.value.trim();
        state.page = 1;
        load();
      }, 340);
      search.addEventListener('input', onSearch);
      search.addEventListener('search', function () {
        state.q = search.value.trim();
        state.page = 1;
        load();
      });
    }

    const area = UI.qs('#area-filter');
    if (area) {
      area.value = state.area;
      area.addEventListener('change', function () {
        state.area = area.value;
        state.page = 1;
        load();
      });
    }

    const sort = UI.qs('#sort-select');
    if (sort) {
      sort.value = state.sort;
      sort.addEventListener('change', function () {
        state.sort = sort.value;
        state.page = 1;
        if (state.sort === 'distance' && !state.geo) {
          requestLocation();
          return;
        }
        load();
      });
    }

    const near = UI.qs('#near-me');
    if (near) near.addEventListener('click', requestLocation);

    const clear = UI.qs('#clear-filters');
    if (clear) clear.addEventListener('click', clearAll);
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      UI.toast('This browser does not support location access. You can still search by area.', 'warning');
      return;
    }
    const button = UI.qs('#near-me');
    UI.setLoading(button, true, 'Locating…');
    navigator.geolocation.getCurrentPosition(function (position) {
      state.geo = { lat: position.coords.latitude, lng: position.coords.longitude };
      state.sort = 'distance';
      state.page = 1;
      const sort = UI.qs('#sort-select');
      if (sort) sort.value = 'distance';
      UI.setLoading(button, false);
      UI.toast('Showing services nearest to your current location.', 'success');
      load();
    }, function () {
      UI.setLoading(button, false);
      UI.toast('Location permission was not granted. Search by area instead.', 'warning');
    }, { enableHighAccuracy: false, timeout: 9000, maximumAge: 300000 });
  }

  function init() {
    readUrl();
    Icons.mount(document);
    bindControls();
    loadMeta();
    load();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
