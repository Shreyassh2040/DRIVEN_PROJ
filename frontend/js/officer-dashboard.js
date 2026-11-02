/* Officer operations console: overview, complaint queue, performance, complaint drawer */
(function () {
  'use strict';

  const UI = window.CivicUI;
  const Api = window.CivicApi;
  const Icons = window.CivicIcons;
  const Charts = window.CivicCharts;
  const Maps = window.CivicMaps;

  const TABS = ['overview', 'queue', 'performance'];
  const PAGE_LIMIT = 15;
  const STATUS_OPTIONS = ['submitted', 'in_progress', 'resolved', 'rejected'];

  const state = {
    stats: null,
    officers: [],
    queueLoaded: false,
    queueLoading: false,
    filters: { q: '', status: '', priority: '', category: '', assigned: '' },
    page: 1,
    drawerId: null,
    complaint: null,
    photoUrl: null
  };

  let statsRequest = 0;
  let queueRequest = 0;
  let drawerRequest = 0;

  /* ------------------------------------------------------------ Utilities */

  function emptyStats() {
    return {
      summary: { total: 0, submitted: 0, in_progress: 0, resolved: 0, rejected: 0, unassigned: 0 },
      categories: [],
      areas: [],
      priorities: [],
      trend: [],
      performance: { avg_resolution_hours: null, resolved_with_timestamps: 0, resolution_rate: 0 },
      recent: []
    };
  }

  function bindRetry(scope, handler) {
    UI.qsa('[data-retry]', scope || document).forEach(function (button) {
      button.addEventListener('click', function () {
        button.disabled = true;
        handler();
      });
    });
  }

  function hoursText(hours) {
    if (hours === null || hours === undefined || Number.isNaN(Number(hours))) return 'Not measured';
    const value = Number(hours);
    if (value < 1) return 'Under 1 hr';
    return UI.formatHours(value);
  }

  function priorityData(rows) {
    const lookup = {};
    (rows || []).forEach(function (row) { lookup[row.key || row.label] = Number(row.value) || 0; });
    return [
      { label: 'High', value: lookup.high || 0, color: '#b56b6b' },
      { label: 'Medium', value: lookup.medium || 0, color: '#c58b35' },
      { label: 'Low', value: lookup.low || 0, color: '#5d8d84' }
    ];
  }

  function categoryData(rows) {
    return (rows || []).map(function (row) {
      return {
        label: UI.categoryLabel(row.key || row.label),
        value: Number(row.value) || 0
      };
    });
  }

  function recentTone(status) {
    if (status === 'resolved') return 'green';
    if (status === 'rejected') return 'red';
    if (status === 'in_progress') return 'blue';
    return 'amber';
  }

  /* ------------------------------------------------------------ Overview */

  function renderMetrics(data) {
    const container = UI.qs('#officer-metrics');
    if (!container) return;
    const summary = data.summary || emptyStats().summary;
    const open = Number(summary.submitted || 0) + Number(summary.in_progress || 0);
    const performance = data.performance || {};
    const resolvedCount = Number(summary.resolved || 0);
    container.innerHTML = [
      UI.metricCard({
        label: 'Total complaints',
        value: summary.total,
        meta: summary.total ? `${Number(summary.submitted || 0)} awaiting triage` : 'No complaints recorded yet',
        icon: 'clipboard',
        tone: 'navy'
      }),
      UI.metricCard({
        label: 'Open work',
        value: open,
        meta: open ? `${Number(summary.in_progress || 0)} in progress` : 'Nothing currently open',
        icon: 'clock',
        tone: 'blue'
      }),
      UI.metricCard({
        label: 'Unassigned',
        value: summary.unassigned,
        meta: summary.unassigned ? 'Open complaints without an owner' : 'Every open complaint has an owner',
        icon: 'user-check',
        tone: 'amber'
      }),
      UI.metricCard({
        label: 'Resolved',
        value: resolvedCount,
        meta: resolvedCount ? `${UI.percent(performance.resolution_rate || 0)} resolution rate` : 'No resolutions recorded yet',
        icon: 'check-circle',
        tone: 'green'
      })
    ].join('');

    setText('#mini-open', UI.formatNumber(open));
    setText('#mini-unassigned', UI.formatNumber(summary.unassigned || 0));
    setText('#mini-resolved', UI.formatNumber(resolvedCount));
  }

  function renderPriorityPanel(data) {
    const container = UI.qs('#officer-priorities');
    if (!container) return;
    const items = priorityData(data.priorities || []);
    const total = items.reduce(function (sum, item) { return sum + item.value; }, 0);
    if (!total) {
      container.innerHTML = `<p class="text-sm muted">No complaints have been recorded yet, so there is no priority mix to show.</p>`;
      return;
    }
    container.innerHTML = Charts.hbar(items, { label: 'Complaint priority mix' });
  }

  function renderResponsePanel(data) {
    const container = UI.qs('#officer-response');
    if (!container) return;
    const performance = data.performance || {};
    const measured = Number(performance.resolved_with_timestamps || 0);
    container.innerHTML = `<div class="mini-metrics">
        <div class="mini-metric"><span>Avg resolution</span><strong>${UI.esc(hoursText(performance.avg_resolution_hours))}</strong></div>
        <div class="mini-metric"><span>Resolution rate</span><strong>${UI.esc(UI.percent(performance.resolution_rate || 0))}</strong></div>
        <div class="mini-metric"><span>Measured</span><strong>${UI.formatNumber(measured)}</strong></div>
      </div>
      <p class="stat-meta mt-12">${measured
        ? `Calculated from ${measured} resolved ${measured === 1 ? 'complaint' : 'complaints'} with recorded resolution times.`
        : 'No complaints have been resolved with a recorded timestamp yet.'}</p>`;
  }

  function renderRecent(data) {
    const container = UI.qs('#officer-recent');
    if (!container) return;
    const recent = data.recent || [];
    if (!recent.length) {
      container.innerHTML = `<div style="padding:18px">${UI.emptyState({
        icon: 'inbox',
        title: 'No complaints recorded',
        message: 'New civic reports will appear here as soon as citizens submit them.'
      })}</div>`;
      return;
    }
    container.innerHTML = `<div class="activity-list" style="padding:4px 18px 12px">${recent.map(function (complaint) {
      const place = complaint.area || complaint.address || 'No location recorded';
      return `<button class="activity-row" type="button" data-open-complaint="${Number(complaint.id)}" style="width:100%;border:0;border-bottom:1px solid var(--border);background:transparent;text-align:left;cursor:pointer">
        <span class="activity-icon ${recentTone(complaint.status)}">${Icons.icon(UI.categoryIcon(complaint.category), 15)}</span>
        <span class="activity-copy">
          <strong>${UI.esc(complaint.title || 'Untitled complaint')}</strong>
          <span>${UI.esc(complaint.tracking_code || '')} · ${UI.esc(UI.categoryLabel(complaint.category))} · ${UI.esc(place)}</span>
          <time datetime="${UI.attr(complaint.created_at)}">${UI.esc(UI.timeAgo(complaint.created_at))} · ${UI.esc(UI.statusLabel(complaint.status))}${complaint.assigned_officer_name ? ` · ${UI.esc(complaint.assigned_officer_name)}` : ' · Unassigned'}</time>
        </span>
      </button>`;
    }).join('')}</div>`;
  }

  function renderTrend(target, trend) {
    const container = UI.qs(target);
    if (!container) return;
    container.innerHTML = Charts.line(trend || [], {
      height: 230,
      color: '#284b68',
      label: 'Complaints recorded in each of the last six months',
      emptyMessage: 'No complaints have been recorded in the last six months.'
    });
  }

  function renderPerformance(data) {
    const metrics = UI.qs('#performance-metrics');
    if (metrics) {
      const performance = data.performance || {};
      const summary = data.summary || emptyStats().summary;
      metrics.innerHTML = [
        UI.metricCard({
          label: 'Average resolution',
          value: hoursText(performance.avg_resolution_hours),
          raw: true,
          meta: performance.avg_resolution_hours === null || performance.avg_resolution_hours === undefined
            ? 'No resolved timestamps recorded'
            : 'From complaint submission to resolution',
          icon: 'clock',
          tone: 'blue'
        }),
        UI.metricCard({
          label: 'Resolution rate',
          value: UI.percent(performance.resolution_rate || 0),
          raw: true,
          meta: `${UI.formatNumber(summary.resolved || 0)} of ${UI.formatNumber(summary.total || 0)} complaints resolved`,
          icon: 'trending-up',
          tone: 'green'
        }),
        UI.metricCard({
          label: 'Measured resolutions',
          value: performance.resolved_with_timestamps,
          meta: 'Resolved complaints with recorded timestamps',
          icon: 'check-circle',
          tone: 'teal'
        })
      ].join('');
    }

    renderTrend('#performance-trend', data.trend);

    const categories = UI.qs('#performance-categories');
    if (categories) {
      const items = categoryData(data.categories || []);
      categories.innerHTML = items.length
        ? Charts.hbar(items, { label: 'Complaints grouped by civic category' })
        : Charts.empty('No complaints have been recorded yet.');
    }

    const areas = UI.qs('#performance-areas');
    if (areas) {
      const items = (data.areas || []).map(function (row) {
        return { label: row.label || 'Unspecified', value: Number(row.value) || 0 };
      });
      areas.innerHTML = items.length
        ? Charts.hbar(items, { label: 'Complaint volume by area' })
        : Charts.empty('No complaint locations have been recorded yet.');
    }

    const priorities = UI.qs('#performance-priorities');
    if (priorities) {
      const items = priorityData(data.priorities || []);
      const total = items.reduce(function (sum, item) { return sum + item.value; }, 0);
      priorities.innerHTML = total
        ? Charts.donut(items, {
          label: 'Complaint priority distribution',
          centerValue: UI.formatNumber(total),
          centerLabel: 'Complaints'
        })
        : Charts.empty('No complaints have been recorded yet.');
    }
  }

  function renderStats(data) {
    state.stats = data;
    renderMetrics(data);
    renderPriorityPanel(data);
    renderResponsePanel(data);
    renderRecent(data);
    renderTrend('#officer-trend', data.trend);
    renderPerformance(data);
  }

  function renderStatsError(error) {
    const message = (error && error.message) || 'The operations data could not be loaded.';
    const metrics = UI.qs('#officer-metrics');
    if (metrics) {
      metrics.innerHTML = `<div style="grid-column:1/-1">${UI.errorState({
        title: 'Operations data unavailable',
        message: message
      })}</div>`;
      bindRetry(metrics, loadStats);
    }
    ['#mini-open', '#mini-unassigned', '#mini-resolved'].forEach(function (selector) {
      setText(selector, '—');
    });

    ['#officer-trend', '#officer-priorities', '#officer-response', '#officer-recent', '#performance-metrics', '#performance-trend', '#performance-categories', '#performance-areas', '#performance-priorities'].forEach(function (selector) {
      const node = UI.qs(selector);
      if (!node) return;
      node.innerHTML = `<div class="chart-empty">${UI.esc(message)}</div>`;
    });

    const recent = UI.qs('#officer-recent');
    if (recent) {
      recent.innerHTML = `<div style="padding:18px">${UI.errorState({
        title: 'Latest complaints could not be loaded',
        message: message
      })}</div>`;
      bindRetry(recent, loadStats);
    }
  }

  function setText(selector, value) {
    const node = UI.qs(selector);
    if (node) node.textContent = value;
  }

  async function loadStats() {
    const request = ++statsRequest;
    try {
      const payload = await Api.officer.stats();
      if (request !== statsRequest) return;
      renderStats(payload.data || emptyStats());
    } catch (error) {
      if (request !== statsRequest) return;
      renderStatsError(error);
    }
  }

  /* ------------------------------------------------------------ Queue filters */

  function readFilters() {
    state.filters = {
      q: (UI.qs('#queue-search') || {}).value ? UI.qs('#queue-search').value.trim() : '',
      status: (UI.qs('#queue-status') || {}).value || '',
      priority: (UI.qs('#queue-priority') || {}).value || '',
      category: (UI.qs('#queue-category') || {}).value || '',
      assigned: (UI.qs('#queue-assigned') || {}).value || ''
    };
  }

  function activeFilterCount() {
    return Object.keys(state.filters).reduce(function (count, key) {
      return count + (state.filters[key] ? 1 : 0);
    }, 0);
  }

  function updateFilterBadge() {
    const badge = UI.qs('#queue-active-filter');
    if (!badge) return;
    const count = activeFilterCount();
    badge.hidden = count === 0;
    badge.textContent = `${count} ${count === 1 ? 'filter' : 'filters'} active`;
  }

  function applyFilters() {
    readFilters();
    state.page = 1;
    updateFilterBadge();
    loadQueue();
  }

  function clearFilters() {
    ['#queue-search', '#queue-status', '#queue-priority', '#queue-category', '#queue-assigned'].forEach(function (selector) {
      const input = UI.qs(selector);
      if (input) input.value = '';
    });
    applyFilters();
  }

  function bindFilters() {
    const search = UI.qs('#queue-search');
    if (search) search.addEventListener('input', UI.debounce(applyFilters, 340));

    ['#queue-status', '#queue-priority', '#queue-category', '#queue-assigned'].forEach(function (selector) {
      const select = UI.qs(selector);
      if (select) select.addEventListener('change', applyFilters);
    });

    const clear = UI.qs('#clear-queue-filters');
    if (clear) clear.addEventListener('click', clearFilters);
  }

  async function loadOfficers() {
    try {
      const payload = await Api.officer.officers();
      state.officers = (payload.data && payload.data.officers) || [];
      populateAssignedFilter();
    } catch { /* the queue still works without the officer filter */ }
  }

  function populateAssignedFilter() {
    const select = UI.qs('#queue-assigned');
    if (!select) return;
    const current = select.value;
    const options = state.officers.map(function (officer) {
      return `<option value="${Number(officer.id)}">${UI.esc(officer.full_name)}${Number(officer.active_workload) ? ` · ${Number(officer.active_workload)} active` : ''}</option>`;
    }).join('');
    select.innerHTML = `<option value="">All assignments</option><option value="unassigned">Unassigned</option>${options}`;
    if (current) select.value = current;
  }

  /* ------------------------------------------------------------ Queue table */

  function queueQuery() {
    const query = { page: state.page, limit: PAGE_LIMIT };
    Object.keys(state.filters).forEach(function (key) {
      if (state.filters[key]) query[key] = state.filters[key];
    });
    return query;
  }

  function queueRow(complaint) {
    const reporter = complaint.reporter_name || 'Unknown reporter';
    const place = complaint.area || complaint.address || 'No location recorded';
    const assigned = complaint.assigned_officer_name
      ? `<span class="cell-strong">${UI.esc(complaint.assigned_officer_name)}</span>`
      : '<span class="badge badge-neutral">Unassigned</span>';
    return `<tr>
      <td>
        <span class="cell-title">${UI.esc(complaint.title || 'Untitled complaint')}</span>
        <span class="cell-sub">${UI.esc(complaint.tracking_code || '')}</span>
      </td>
      <td><span class="cluster" style="gap:5px;flex-wrap:nowrap">${Icons.icon(UI.categoryIcon(complaint.category), 14)}${UI.esc(complaint.category_label || UI.categoryLabel(complaint.category))}</span></td>
      <td>
        <span class="cell-strong">${UI.esc(reporter)}</span>
        <span class="cell-sub">${UI.esc(place)}</span>
      </td>
      <td>${UI.priorityBadge(complaint.priority)}</td>
      <td>${UI.statusBadge(complaint.status, complaint.status_label)}</td>
      <td>${assigned}</td>
      <td>
        <span class="cell-strong">${UI.esc(UI.formatDate(complaint.created_at))}</span>
        <span class="cell-sub">${UI.esc(UI.timeAgo(complaint.created_at))}</span>
      </td>
      <td class="cell-actions">
        <button class="btn btn-secondary btn-sm" type="button" data-open-complaint="${Number(complaint.id)}">Review</button>
      </td>
    </tr>`;
  }

  function loadingQueueRow(message) {
    return `<tr class="empty-row"><td colspan="8"><span class="spinner dark sm" role="status" aria-label="Loading"></span> ${UI.esc(message || 'Loading complaints…')}</td></tr>`;
  }

  function errorQueueRow(error) {
    return `<tr><td colspan="8">${UI.errorState({
      title: 'Complaints could not be loaded',
      message: (error && error.message) || 'The complaint queue is unavailable right now.'
    })}</td></tr>`;
  }

  function renderQueue(data) {
    const complaints = data.complaints || [];
    const summary = data.summary || {};
    const pagination = data.pagination || { page: 1, limit: PAGE_LIMIT, total: complaints.length, pages: 1 };
    const body = UI.qs('#queue-body');
    const table = UI.qs('#queue-table');

    if (body) {
      body.innerHTML = complaints.length
        ? complaints.map(queueRow).join('')
        : `<tr class="empty-row"><td colspan="8">${UI.emptyState({
          icon: 'inbox',
          title: 'No complaints match these filters',
          message: activeFilterCount()
            ? 'Try clearing one or more filters to see the rest of the queue.'
            : 'No citizen complaints have been recorded yet.'
        })}</td></tr>`;
    }

    if (table) {
      table.classList.add('responsive');
      UI.responsiveTable(table);
    }

    const count = UI.qs('#queue-count');
    if (count) {
      const total = Number(pagination.total) || 0;
      count.innerHTML = `<strong>${UI.formatNumber(total)}</strong> ${total === 1 ? 'complaint' : 'complaints'} matched`;
    }

    const summaryNode = UI.qs('#queue-summary');
    if (summaryNode) {
      const total = Number(summary.total || 0);
      if (!total) {
        summaryNode.textContent = 'No complaints have been recorded in the city yet.';
      } else {
        const open = Number(summary.submitted || 0) + Number(summary.in_progress || 0);
        summaryNode.textContent = `${UI.formatNumber(total)} complaints in the city · ${UI.formatNumber(open)} open · ${UI.formatNumber(summary.unassigned || 0)} unassigned`;
      }
    }

    UI.renderPagination(UI.qs('#queue-pagination'), pagination, function (page) {
      state.page = page;
      loadQueue();
      const panel = UI.qs('#officer-queue');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    updateFilterBadge();
  }

  async function loadQueue() {
    const request = ++queueRequest;
    const body = UI.qs('#queue-body');
    const pagination = UI.qs('#queue-pagination');
    state.queueLoading = true;
    if (body) body.innerHTML = loadingQueueRow();
    if (pagination) pagination.innerHTML = '';
    const count = UI.qs('#queue-count');
    if (count) count.textContent = 'Loading complaints…';

    try {
      const payload = await Api.officer.complaints(queueQuery());
      if (request !== queueRequest) return;
      state.queueLoaded = true;
      renderQueue(payload.data || {});
    } catch (error) {
      if (request !== queueRequest) return;
      if (body) body.innerHTML = errorQueueRow(error);
      if (pagination) pagination.innerHTML = '';
      if (count) count.textContent = 'Complaints could not be loaded';
      const summaryNode = UI.qs('#queue-summary');
      if (summaryNode) summaryNode.textContent = 'The complaint queue is unavailable right now.';
      bindRetry(UI.qs('#queue-table') || document, loadQueue);
    } finally {
      if (request === queueRequest) state.queueLoading = false;
    }
  }

  /* ------------------------------------------------------------ Tabs */

  function currentTab() {
    const hash = window.location.hash.replace(/^#/, '');
    return TABS.includes(hash) ? hash : 'overview';
  }

  function setTab(tab) {
    const active = TABS.includes(tab) ? tab : 'overview';
    UI.qsa('[data-officer-section]').forEach(function (section) {
      section.hidden = section.getAttribute('data-officer-section') !== active;
    });
    UI.qsa('[data-officer-tab]').forEach(function (link) {
      const isActive = link.getAttribute('data-officer-tab') === active;
      link.classList.toggle('is-active', isActive);
      link.setAttribute('aria-selected', String(isActive));
      link.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    if (active === 'queue' && !state.queueLoaded && !state.queueLoading) loadQueue();
  }

  function bindTabs() {
    const tabs = UI.qsa('[data-officer-tab]');
    tabs.forEach(function (link, index) {
      link.addEventListener('click', function () {
        // The hashchange event handles the actual switch.
        if (link.getAttribute('href') === window.location.hash) setTab(link.getAttribute('data-officer-tab'));
      });
      link.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        const next = tabs[(index + direction + tabs.length) % tabs.length];
        next.focus();
        next.click();
      });
    });
    window.addEventListener('hashchange', function () { setTab(currentTab()); });
    setTab(currentTab());
  }

  /* ------------------------------------------------------------ Complaint drawer */

  function infoItem(label, value, options) {
    const opts = options || {};
    return `<div class="info-item${opts.wide ? ' wide' : ''}">
      <dt>${UI.esc(label)}</dt>
      <dd${opts.muted ? ' class="muted"' : ''}>${value}</dd>
    </div>`;
  }

  function drawerMarkup(complaint) {
    const coords = Maps.hasCoordinates(complaint.latitude, complaint.longitude)
      ? `${Number(complaint.latitude).toFixed(6)}, ${Number(complaint.longitude).toFixed(6)}`
      : '';
    const directions = Maps.directionsUrl(complaint.latitude, complaint.longitude);
    const contact = [];
    if (complaint.reporter_email) contact.push(`<a href="mailto:${UI.attr(complaint.reporter_email)}">${UI.esc(complaint.reporter_email)}</a>`);
    if (complaint.reporter_phone) contact.push(`<a href="tel:${UI.attr(complaint.reporter_phone)}">${UI.esc(complaint.reporter_phone)}</a>`);

    const statusOptions = STATUS_OPTIONS.map(function (status) {
      return `<option value="${status}" ${complaint.status === status ? 'selected' : ''}>${UI.esc(UI.statusLabel(status))}</option>`;
    }).join('');

    const officerOptions = state.officers.length
      ? state.officers.map(function (officer) {
        return `<option value="${Number(officer.id)}" ${Number(complaint.assigned_officer_id) === Number(officer.id) ? 'selected' : ''}>${UI.esc(officer.full_name)}${Number(officer.active_workload) ? ` · ${Number(officer.active_workload)} active` : ''}</option>`;
      }).join('')
      : '<option value="">No active officers available</option>';

    const photoPanel = complaint.has_photo ? `<section class="panel">
      <div class="panel-header with-border">
        <div>
          <h3 class="panel-title">Reported photograph</h3>
          <p class="panel-subtitle">Attached by the citizen when the complaint was filed.</p>
        </div>
      </div>
      <div class="panel-body">
        <div class="photo-frame" data-drawer-photo>
          <div class="empty-state"><span class="spinner dark" role="status" aria-label="Loading photograph"></span></div>
        </div>
      </div>
    </section>` : '';

    return `<div class="cluster" style="gap:8px">
        <span class="track-code lg">${Icons.icon('hash', 11)}${UI.esc(complaint.tracking_code || `#${complaint.id}`)}</span>
        ${UI.statusBadge(complaint.status, complaint.status_label)}
        ${UI.priorityBadge(complaint.priority)}
        <span class="badge badge-neutral">${UI.esc(complaint.category_label || UI.categoryLabel(complaint.category))}</span>
        <button class="btn btn-ghost btn-sm" type="button" data-copy-tracking>${Icons.icon('copy', 13)}Copy reference</button>
      </div>
      <div class="mt-16">${UI.stepProgress(complaint.status)}</div>

      <div class="section-stack mt-24">
        <section class="panel">
          <div class="panel-header with-border">
            <div>
              <h3 class="panel-title">Complaint summary</h3>
              <p class="panel-subtitle">Details recorded by the citizen and the current response state.</p>
            </div>
          </div>
          <div class="panel-body">
            <dl class="info-grid">
              ${infoItem('Reporter', UI.esc(complaint.reporter_name || 'Unknown reporter'))}
              ${infoItem('Contact', contact.length ? contact.join('<br>') : 'No contact details available', { muted: !contact.length })}
              ${infoItem('Area or locality', complaint.area ? UI.esc(complaint.area) : 'Not provided', { muted: !complaint.area })}
              ${infoItem('Assigned officer', complaint.assigned_officer_name
                ? `${UI.esc(complaint.assigned_officer_name)}${complaint.assigned_officer_department ? `<span class="cell-sub">${UI.esc(complaint.assigned_officer_department)}</span>` : ''}`
                : 'Not assigned yet', { muted: !complaint.assigned_officer_name })}
              ${infoItem('Address or landmark', complaint.address ? UI.esc(complaint.address) : 'Not provided', { wide: true, muted: !complaint.address })}
              ${infoItem('Coordinates', coords
                ? `${UI.esc(coords)}${directions ? ` · <a class="text-link" href="${UI.attr(directions)}" target="_blank" rel="noopener noreferrer">Directions</a>` : ''}`
                : 'No coordinates recorded', { wide: true, muted: !coords })}
              ${infoItem('Submitted', UI.esc(UI.formatDateTime(complaint.created_at)))}
              ${infoItem('Last updated', UI.esc(UI.formatDateTime(complaint.updated_at)))}
            </dl>
            <div class="mt-16">
              <p class="info-label">Description</p>
              <p class="description-block mt-8">${UI.esc(complaint.description || 'No description was provided.')}</p>
            </div>
            ${complaint.resolution_summary ? `<div class="resolution-block mt-16">
              <h4>${Icons.icon(complaint.status === 'rejected' ? 'alert-circle' : 'check-circle', 15)}${complaint.status === 'rejected' ? 'Rejection reason' : 'Resolution'}</h4>
              <p>${UI.esc(complaint.resolution_summary)}</p>
            </div>` : ''}
          </div>
        </section>

        ${photoPanel}

        <section class="panel">
          <div class="panel-header with-border">
            <div>
              <h3 class="panel-title">Location</h3>
              <p class="panel-subtitle">${UI.esc(complaint.address || complaint.area || 'No address recorded for this complaint.')}</p>
            </div>
          </div>
          <div class="panel-body">
            <div id="drawer-map" class="map-canvas" style="min-height:230px"></div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-header with-border">
            <div>
              <h3 class="panel-title">Operations</h3>
              <p class="panel-subtitle">Update the complaint status or allocate a responsible officer.</p>
            </div>
          </div>
          <div class="panel-body">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px">
              <form data-officer-status-form novalidate>
                <div class="field">
                  <label for="drawer-status">Status</label>
                  <select class="select" id="drawer-status" name="status">${statusOptions}</select>
                  <p class="field-help">The reporting citizen is notified when the status changes.</p>
                </div>
                <div class="field mt-12">
                  <label for="drawer-status-note">Update note</label>
                  <textarea class="textarea" id="drawer-status-note" name="note" rows="2" maxlength="500" placeholder="Explain what changed or what happens next."></textarea>
                  <p class="field-help">Optional. Shown to the citizen in the complaint timeline.</p>
                </div>
                <div class="field mt-12" data-resolution-field ${complaint.status === 'resolved' ? '' : 'hidden'}>
                  <label for="drawer-resolution">Resolution details</label>
                  <textarea class="textarea" id="drawer-resolution" name="resolution_summary" rows="3" maxlength="4000" placeholder="Describe the work completed.">${UI.esc(complaint.resolution_summary || '')}</textarea>
                  <p class="field-help">Required when resolving a complaint.</p>
                </div>
                <div class="cluster mt-12" style="justify-content:flex-end">
                  <button class="btn btn-primary btn-sm" type="submit">${Icons.icon('check', 14)}Save status</button>
                </div>
              </form>

              <form data-officer-assign-form novalidate>
                <div class="field">
                  <label for="drawer-officer">Assign officer</label>
                  <select class="select" id="drawer-officer" name="officer_id" ${state.officers.length ? '' : 'disabled'}>${officerOptions}</select>
                  <p class="field-help">${state.officers.length
                    ? 'The officer and the reporting citizen both receive a notification.'
                    : 'No active officers are available. Provision an officer account from administration.'}</p>
                </div>
                <div class="field mt-12">
                  <label for="drawer-assign-note">Assignment note</label>
                  <textarea class="textarea" id="drawer-assign-note" name="note" rows="2" maxlength="500" placeholder="Add instructions for the assigned officer."></textarea>
                  <p class="field-help">Optional internal context for the assignment record.</p>
                </div>
                <div class="cluster mt-12" style="justify-content:flex-end">
                  <button class="btn btn-secondary btn-sm" type="submit" ${state.officers.length ? '' : 'disabled'}>${Icons.icon('user-check', 14)}${complaint.assigned_officer_id ? 'Reassign' : 'Assign complaint'}</button>
                </div>
              </form>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-header with-border">
            <div>
              <h3 class="panel-title">Activity timeline</h3>
              <p class="panel-subtitle">Status changes, assignments and updates, including internal notes.</p>
            </div>
          </div>
          <div class="panel-body">
            <div data-drawer-timeline>
              <div class="empty-state"><span class="spinner dark" role="status" aria-label="Loading timeline"></span></div>
            </div>
            <form class="comment-composer mt-16" data-officer-comment-form novalidate>
              <div class="field">
                <label for="drawer-comment">Add an update</label>
                <textarea class="textarea" id="drawer-comment" name="comment" rows="3" maxlength="2000" placeholder="Share progress with the citizen or leave an internal note."></textarea>
              </div>
              <div class="comment-composer-foot">
                <div class="field">
                  <label for="drawer-visibility">Visibility</label>
                  <select class="select select-sm" id="drawer-visibility" name="visibility">
                    <option value="public">Public · notify the citizen</option>
                    <option value="internal">Internal · staff only</option>
                  </select>
                </div>
                <button class="btn btn-primary btn-sm" type="submit">${Icons.icon('send', 14)}Post update</button>
              </div>
            </form>
          </div>
        </section>
      </div>`;
  }

  function renderDrawer(complaint) {
    const drawer = UI.qs('#complaint-drawer');
    const body = UI.qs('#drawer-body');
    if (!drawer || !body) return;
    setText('#drawer-title', complaint.title || 'Complaint');
    setText('#drawer-subtitle', `${complaint.tracking_code || `#${complaint.id}`} · Submitted ${UI.formatDateTime(complaint.created_at)}`);
    body.innerHTML = drawerMarkup(complaint);
    bindDrawerActions(complaint);

    if (complaint.has_photo) loadDrawerPhoto(complaint.id);

    Maps.render(UI.qs('#drawer-map', body), {
      lat: complaint.latitude,
      lng: complaint.longitude,
      address: complaint.address || complaint.area || '',
      label: complaint.title || 'Complaint location',
      emptyMessage: 'No address or coordinates were recorded for this complaint.'
    });
  }

  function bindDrawerActions(complaint) {
    const body = UI.qs('#drawer-body');
    if (!body) return;

    const statusSelect = UI.qs('#drawer-status', body);
    const resolutionField = UI.qs('[data-resolution-field]', body);
    if (statusSelect && resolutionField) {
      const toggleResolution = function () {
        resolutionField.hidden = statusSelect.value !== 'resolved';
      };
      statusSelect.addEventListener('change', toggleResolution);
      toggleResolution();
    }

    const copy = UI.qs('[data-copy-tracking]', body);
    if (copy) {
      copy.addEventListener('click', function () {
        if (!complaint.tracking_code) return;
        UI.copyText(complaint.tracking_code)
          .then(function () { UI.toast('Tracking ID copied to the clipboard.', 'success'); })
          .catch(function () { UI.toast('Copy failed. Select the tracking code and copy it manually.', 'error'); });
      });
    }

    bindStatusForm(complaint);
    bindAssignForm(complaint);
    bindCommentForm(complaint);
  }

  function bindStatusForm(complaint) {
    const form = UI.qs('[data-officer-status-form]');
    if (!form) return;
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      UI.clearFormErrors(form);
      const values = UI.formValues(form);
      if (!values.status) {
        UI.setFieldError(UI.qs('[name="status"]', form), 'Select a status.');
        return;
      }
      if (values.status === complaint.status) {
        UI.toast('Choose a different status. Use the update box to add a note without changing the status.', 'warning');
        UI.qs('[name="status"]', form).focus();
        return;
      }
      if (values.status === 'rejected' && (!values.note || values.note.trim().length < 5)) {
        UI.setFieldError(UI.qs('[name="note"]', form), 'Explain why this complaint is being rejected (at least 5 characters).');
        return;
      }
      if (values.status === 'resolved' && (!values.resolution_summary || values.resolution_summary.trim().length < 10)) {
        UI.setFieldError(UI.qs('[name="resolution_summary"]', form), 'Describe the work completed (at least 10 characters).');
        return;
      }

      const payload = { status: values.status };
      if (values.note) payload.note = values.note.trim();
      if (values.status === 'resolved') payload.resolution_summary = values.resolution_summary.trim();

      const button = UI.qs('button[type="submit"]', form);
      UI.setLoading(button, true, 'Saving…');
      try {
        const response = await Api.officer.updateStatus(complaint.id, payload);
        UI.toast((response && response.message) || 'Complaint status updated.', 'success');
        await refreshAfterAction(complaint.id);
      } catch (error) {
        if (error.errors) UI.applyServerErrors(form, error.errors);
        UI.toast(error.message || 'The status could not be updated.', 'error');
      } finally {
        if (button && button.isConnected) UI.setLoading(button, false);
      }
    });
  }

  function bindAssignForm(complaint) {
    const form = UI.qs('[data-officer-assign-form]');
    if (!form) return;
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      UI.clearFormErrors(form);
      const values = UI.formValues(form);
      const officerId = Number(values.officer_id);
      if (!Number.isSafeInteger(officerId) || officerId < 1) {
        UI.setFieldError(UI.qs('[name="officer_id"]', form), 'Select an active municipal officer.');
        return;
      }
      if (Number(complaint.assigned_officer_id) === officerId) {
        UI.toast('This complaint is already assigned to that officer.', 'warning');
        return;
      }

      const payload = { officer_id: officerId };
      if (values.note) payload.note = values.note.trim();

      const button = UI.qs('button[type="submit"]', form);
      UI.setLoading(button, true, 'Assigning…');
      try {
        const response = await Api.officer.assign(complaint.id, payload);
        UI.toast((response && response.message) || 'Complaint assigned.', 'success');
        await refreshAfterAction(complaint.id);
      } catch (error) {
        if (error.errors) UI.applyServerErrors(form, error.errors);
        UI.toast(error.message || 'The complaint could not be assigned.', 'error');
      } finally {
        if (button && button.isConnected) UI.setLoading(button, false);
      }
    });
  }

  function bindCommentForm(complaint) {
    const form = UI.qs('[data-officer-comment-form]');
    if (!form) return;
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      UI.clearFormErrors(form);
      const values = UI.formValues(form);
      if (!values.comment || values.comment.trim().length < 2) {
        UI.setFieldError(UI.qs('[name="comment"]', form), 'Write an update before posting.');
        return;
      }
      const payload = {
        comment: values.comment.trim(),
        visibility: values.visibility === 'internal' ? 'internal' : 'public'
      };
      const button = UI.qs('button[type="submit"]', form);
      UI.setLoading(button, true, 'Posting…');
      try {
        const response = await Api.officer.comment(complaint.id, payload);
        UI.toast((response && response.message) || 'Update posted.', 'success');
        await refreshAfterAction(complaint.id);
      } catch (error) {
        if (error.errors) UI.applyServerErrors(form, error.errors);
        UI.toast(error.message || 'The update could not be posted.', 'error');
      } finally {
        if (button && button.isConnected) UI.setLoading(button, false);
      }
    });
  }

  async function refreshAfterAction(id) {
    await Promise.allSettled([
      loadStats(),
      state.queueLoaded ? loadQueue() : Promise.resolve(),
      state.drawerId === id ? loadDrawer(id, { quiet: true }) : Promise.resolve()
    ]);
  }

  async function loadDrawer(id, options) {
    const opts = options || {};
    const body = UI.qs('#drawer-body');
    if (!body) return;
    const request = ++drawerRequest;
    const scrollTop = opts.quiet ? body.scrollTop : 0;
    if (!opts.quiet) {
      body.innerHTML = `<div class="empty-state"><span class="spinner dark" role="status" aria-label="Loading complaint"></span></div>`;
    }
    try {
      const payload = await Api.officer.complaint(id);
      if (request !== drawerRequest || state.drawerId !== id) return;
      state.complaint = payload.data.complaint;
      renderDrawer(state.complaint);
      body.scrollTop = scrollTop;
      loadDrawerTimeline(id);
    } catch (error) {
      if (request !== drawerRequest || state.drawerId !== id) return;
      body.innerHTML = `<div style="padding:24px">${UI.errorState({
        title: error.status === 404 ? 'Complaint not found' : 'Complaint could not be loaded',
        message: error.message
      })}</div>`;
      bindRetry(body, function () { loadDrawer(id); });
    }
  }

  async function loadDrawerTimeline(id) {
    const container = UI.qs('[data-drawer-timeline]');
    if (!container) return;
    container.innerHTML = `<div class="empty-state"><span class="spinner dark" role="status" aria-label="Loading timeline"></span></div>`;
    try {
      const payload = await Api.issues.history(id);
      if (state.drawerId !== id) return;
      container.innerHTML = UI.timeline((payload.data && payload.data.events) || []);
    } catch (error) {
      if (state.drawerId !== id) return;
      container.innerHTML = UI.errorState({
        title: 'Timeline could not be loaded',
        message: error.message
      });
      bindRetry(container, function () { loadDrawerTimeline(id); });
    }
  }

  async function loadDrawerPhoto(id) {
    const frame = UI.qs('[data-drawer-photo]');
    if (!frame) return;
    revokePhoto();
    try {
      const url = await Api.issues.photo(id);
      if (state.drawerId !== id) {
        URL.revokeObjectURL(url);
        return;
      }
      state.photoUrl = url;
      frame.innerHTML = `<img src="${UI.attr(url)}" alt="Photograph attached to complaint ${UI.attr(state.complaint ? state.complaint.tracking_code : '')}">
        <div class="photo-frame-cap">
          <span>${Icons.icon('lock', 13)}Visible to authorised city staff only.</span>
          <a class="text-link" href="${UI.attr(url)}" target="_blank" rel="noopener noreferrer">Open full size${Icons.icon('external-link', 13)}</a>
        </div>`;
    } catch (error) {
      frame.innerHTML = `<div class="map-fallback" style="min-height:190px">
        <div class="icon-tile red">${Icons.icon('image', 20)}</div>
        <h3>Photograph unavailable</h3>
        <p>${UI.esc(error.message || 'The attached photograph could not be loaded.')}</p>
      </div>`;
    }
  }

  function revokePhoto() {
    if (state.photoUrl) {
      URL.revokeObjectURL(state.photoUrl);
      state.photoUrl = null;
    }
  }

  async function openComplaint(id) {
    const numeric = Number(id);
    if (!Number.isSafeInteger(numeric) || numeric < 1) return;
    state.drawerId = numeric;
    setText('#drawer-title', 'Complaint');
    setText('#drawer-subtitle', 'Loading complaint…');
    const body = UI.qs('#drawer-body');
    if (body) body.innerHTML = `<div class="empty-state"><span class="spinner dark" role="status" aria-label="Loading complaint"></span></div>`;
    UI.openDialog('complaint-drawer');
    if (!state.officers.length) await loadOfficers();
    if (state.drawerId === numeric) loadDrawer(numeric);
  }

  function bindDrawer() {
    const drawer = UI.qs('#complaint-drawer');
    if (!drawer) return;

    const close = UI.qs('[data-close-drawer]', drawer);
    if (close) close.addEventListener('click', function () { UI.closeDialog(drawer); });

    drawer.addEventListener('click', function (event) {
      if (event.target === drawer) UI.closeDialog(drawer);
    });

    drawer.addEventListener('close', function () {
      state.drawerId = null;
      state.complaint = null;
      drawerRequest += 1;
      revokePhoto();
    });

    document.addEventListener('click', function (event) {
      const trigger = event.target.closest('[data-open-complaint]');
      if (!trigger) return;
      event.preventDefault();
      openComplaint(trigger.getAttribute('data-open-complaint'));
    });
  }

  /* ------------------------------------------------------------ Page init */

  function bindRefresh() {
    const refresh = UI.qs('#refresh-officer');
    if (refresh) {
      refresh.addEventListener('click', async function () {
        UI.setLoading(refresh, true, 'Refreshing…');
        await Promise.allSettled([loadStats(), loadQueue(), loadOfficers()]);
        UI.setLoading(refresh, false);
      });
    }

    const refreshQueue = UI.qs('#refresh-queue');
    if (refreshQueue) {
      refreshQueue.addEventListener('click', async function () {
        UI.setLoading(refreshQueue, true, 'Refreshing…');
        await Promise.allSettled([loadQueue(), loadStats()]);
        UI.setLoading(refreshQueue, false);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    Icons.mount(document);
    const user = await window.CivicShell.ready;
    if (!user) return;

    bindTabs();
    bindFilters();
    bindDrawer();
    bindRefresh();

    await Promise.allSettled([loadStats(), loadQueue(), loadOfficers()]);
    setTab(currentTab());
  });

  window.addEventListener('pagehide', revokePhoto);
})();
