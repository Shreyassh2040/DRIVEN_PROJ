/* My complaints: search, status filters, summary metrics and pagination */
(function () {
  'use strict';

  const UI = window.CivicUI;
  const Api = window.CivicApi;
  const Icons = window.CivicIcons;

  const STATUSES = [
    { value: '', label: 'All', icon: 'list' },
    { value: 'submitted', label: 'Submitted', icon: 'send' },
    { value: 'in_progress', label: 'In progress', icon: 'sliders' },
    { value: 'resolved', label: 'Resolved', icon: 'check-circle' },
    { value: 'rejected', label: 'Rejected', icon: 'x-circle' }
  ];

  const state = {
    q: '',
    status: '',
    page: 1,
    summary: null
  };

  let requestId = 0;

  function readUrl() {
    const params = new URLSearchParams(window.location.search);
    state.q = params.get('q') || '';
    state.status = params.get('status') || '';
    state.page = Math.max(1, Number(params.get('page')) || 1);
    if (!STATUSES.some(function (item) { return item.value === state.status; })) state.status = '';
  }

  function writeUrl() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.status) params.set('status', state.status);
    if (state.page > 1) params.set('page', String(state.page));
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }

  function metricCard(options) {
    const tone = options.tone ? ` ${options.tone}` : '';
    return `<article class="stat-card">
      <span class="stat-icon${tone}">${Icons.icon(options.icon, 18)}</span>
      <span class="stat-label">${UI.esc(options.label)}</span>
      <strong class="stat-value">${UI.formatNumber(options.value)}</strong>
      <span class="stat-meta">${UI.esc(options.meta)}</span>
    </article>`;
  }

  function renderSummary(summary) {
    const container = UI.qs('#complaint-summary');
    if (!container || !summary) return;
    const total = Number(summary.total) || 0;
    const awaiting = Number(summary.submitted) || 0;
    const progress = Number(summary.in_progress) || 0;
    const resolved = Number(summary.resolved) || 0;
    container.innerHTML = [
      metricCard({
        label: 'Total complaints',
        value: total,
        meta: total ? 'All reports you have submitted' : 'Nothing submitted yet',
        icon: 'clipboard',
        tone: 'navy'
      }),
      metricCard({
        label: 'Awaiting review',
        value: awaiting,
        meta: awaiting ? 'Submitted and not yet triaged' : 'No reports awaiting review',
        icon: 'inbox',
        tone: 'amber'
      }),
      metricCard({
        label: 'In progress',
        value: progress,
        meta: progress ? 'Assigned and being worked on' : 'No work in progress',
        icon: 'sliders',
        tone: 'blue'
      }),
      metricCard({
        label: 'Resolved',
        value: resolved,
        meta: resolved ? 'Closed with a resolution' : 'No resolutions yet',
        icon: 'check-circle',
        tone: 'green'
      })
    ].join('');
  }

  function renderFilters() {
    const container = UI.qs('#status-filters');
    if (!container) return;
    const summary = state.summary || {};
    const counts = {
      '': Number(summary.total) || 0,
      submitted: Number(summary.submitted) || 0,
      in_progress: Number(summary.in_progress) || 0,
      resolved: Number(summary.resolved) || 0,
      rejected: Number(summary.rejected) || 0
    };
    container.innerHTML = STATUSES.map(function (item) {
      const active = state.status === item.value;
      return `<button class="filter-chip ${active ? 'is-active' : ''}" type="button" data-status="${item.value}" aria-pressed="${active}">
        ${Icons.icon(item.icon, 13)}<span>${item.label}</span><span class="count">${UI.formatNumber(counts[item.value])}</span>
      </button>`;
    }).join('');
  }

  function skeleton() {
    return '<div class="skeleton skeleton-row" style="height:104px"></div><div class="skeleton skeleton-row" style="height:104px"></div><div class="skeleton skeleton-row" style="height:104px"></div>';
  }

  function updateSearchChrome() {
    const input = UI.qs('#complaint-search');
    const clear = UI.qs('#clear-search');
    if (input.value !== state.q) input.value = state.q;
    if (clear) clear.hidden = !input.value;
  }

  function renderResults(payload) {
    const list = UI.qs('#complaint-list');
    const summaryLine = UI.qs('#results-summary');
    const pagination = UI.qs('#list-pagination');
    if (!list) return;
    const complaints = payload.complaints || [];
    const paginationData = payload.pagination || {};
    state.summary = payload.summary || state.summary;
    const total = Number(paginationData.total) || 0;

    renderSummary(state.summary);
    renderFilters();

    list.setAttribute('aria-busy', 'false');
    if (!complaints.length) {
      const filtered = Boolean(state.q || state.status);
      list.innerHTML = UI.emptyState({
        icon: filtered ? 'search' : 'clipboard',
        title: filtered ? 'No complaints match these filters' : 'No complaints yet',
        message: filtered
          ? 'Try a different status, clear the search, or check the tracking ID you entered.'
          : 'When you report a civic issue, it will appear here with a permanent tracking ID.',
        action: filtered
          ? '<button class="btn btn-secondary btn-sm" type="button" data-empty-clear>Clear filters</button>'
          : '<a class="btn btn-primary btn-sm" href="report-issue.html">Report your first issue</a>'
      });
      const clear = UI.qs('[data-empty-clear]', list);
      if (clear) clear.addEventListener('click', clearFilters);
    } else {
      list.innerHTML = complaints.map(function (complaint) {
        return UI.complaintCard(complaint);
      }).join('');
    }

    if (summaryLine) {
      if (total === 0) summaryLine.textContent = 'No complaints to display.';
      else {
        const filterText = [state.status ? UI.statusLabel(state.status) : '', state.q ? `matching “${state.q}”` : '']
          .filter(Boolean).join(' · ');
        summaryLine.textContent = `${UI.formatNumber(total)} ${total === 1 ? 'complaint' : 'complaints'}${filterText ? ` · ${filterText}` : ''}`;
      }
    }

    if (pagination) {
      UI.renderPagination(pagination, paginationData, function (page) {
        state.page = page;
        writeUrl();
        load();
      });
    }
  }

  function showError(error) {
    const list = UI.qs('#complaint-list');
    if (!list) return;
    list.setAttribute('aria-busy', 'false');
    list.innerHTML = UI.errorState({
      title: 'Complaints could not be loaded',
      message: error.message || 'Check your connection and try again.',
      action: '<button class="btn btn-secondary btn-sm" type="button" data-retry-list>Try again</button>'
    });
    const retry = UI.qs('[data-retry-list]', list);
    if (retry) retry.addEventListener('click', load);
  }

  async function load() {
    const list = UI.qs('#complaint-list');
    if (!list) return;
    const current = ++requestId;
    list.setAttribute('aria-busy', 'true');
    list.innerHTML = skeleton();
    const pagination = UI.qs('#list-pagination');
    if (pagination) pagination.innerHTML = '';
    updateSearchChrome();

    try {
      const payload = await Api.issues.mine({
        q: state.q,
        status: state.status,
        page: state.page,
        limit: 10
      });
      if (current !== requestId) return;
      const data = payload.data || {};
      if (data.pagination && data.pagination.pages && state.page > data.pagination.pages) {
        state.page = data.pagination.pages;
        writeUrl();
        return load();
      }
      renderResults(data);
    } catch (error) {
      if (current !== requestId) return;
      showError(error);
    }
  }

  function clearFilters() {
    state.q = '';
    state.status = '';
    state.page = 1;
    writeUrl();
    load();
  }

  function bindEvents() {
    const search = UI.qs('#complaint-search');
    const clearSearch = UI.qs('#clear-search');
    const clearButton = UI.qs('#clear-filters');
    const refresh = UI.qs('#refresh-list');
    const filters = UI.qs('#status-filters');

    const runSearch = UI.debounce(function () {
      state.q = search.value.trim();
      state.page = 1;
      writeUrl();
      load();
    }, 320);

    search.addEventListener('input', function () {
      clearSearch.hidden = !search.value;
      runSearch();
    });
    search.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        state.q = search.value.trim();
        state.page = 1;
        writeUrl();
        load();
      }
    });
    clearSearch.addEventListener('click', function () {
      search.value = '';
      clearSearch.hidden = true;
      state.q = '';
      state.page = 1;
      writeUrl();
      load();
      search.focus();
    });

    clearButton.addEventListener('click', clearFilters);
    refresh.addEventListener('click', function () {
      refresh.disabled = true;
      load().finally(function () { refresh.disabled = false; });
    });

    filters.addEventListener('click', function (event) {
      const button = event.target.closest('[data-status]');
      if (!button) return;
      const next = button.dataset.status;
      if (next === state.status) return;
      state.status = next;
      state.page = 1;
      writeUrl();
      load();
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    Icons.mount(document);
    const user = await window.CivicShell.ready;
    if (!user) return;

    readUrl();
    updateSearchChrome();
    bindEvents();
    load();
  });
})();
