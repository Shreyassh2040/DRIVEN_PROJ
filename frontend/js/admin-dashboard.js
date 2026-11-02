/* City administration console: oversight, accounts, catalogue, polls, analytics, audit */
(function () {
  'use strict';

  const UI = window.CivicUI;
  const Api = window.CivicApi;
  const Icons = window.CivicIcons;
  const Charts = window.CivicCharts;
  const Maps = window.CivicMaps;

  const TABS = ['overview', 'complaints', 'users', 'officers', 'services', 'polls', 'analytics', 'activity', 'settings'];
  const PAGE_LIMIT = 15;
  const ROLE_OPTIONS = ['citizen', 'officer', 'admin'];
  const STATUS_OPTIONS = ['submitted', 'in_progress', 'resolved', 'rejected'];

  const state = {
    tab: 'overview',
    selfId: null,
    overviewLoaded: false,
    complaintsLoaded: false,
    usersLoaded: false,
    officers: [],
    servicesLoaded: false,
    pollsLoaded: false,
    analyticsLoaded: false,
    activityLoaded: false,
    settingsLoaded: false,
    complaintFilters: { q: '', status: '', priority: '', category: '' },
    complaintPage: 1,
    userFilters: { q: '', role: '', status: '' },
    userPage: 1,
    serviceFilters: { q: '', category: '' },
    servicePage: 1,
    serviceTotal: 0,
    activityFilters: { q: '', entity_type: '', from: '', to: '' },
    activityPage: 1,
    analyticsRange: 90,
    categories: [],
    assignableOfficers: [],
    serviceRows: [],
    polls: [],
    drawerId: null,
    complaint: null,
    photoUrl: null,
    editOfficerId: null,
    editServiceId: null,
    editCategoryId: null,
    editPollId: null
  };

  let overviewRequest = 0;
  let complaintsRequest = 0;
  let usersRequest = 0;
  let officersRequest = 0;
  let servicesRequest = 0;
  let pollsRequest = 0;
  let analyticsRequest = 0;
  let activityRequest = 0;
  let drawerRequest = 0;

  /* ------------------------------------------------------------ Utilities */

  function query(params) {
    if (!params) return '';
    const search = new URLSearchParams();
    Object.keys(params).forEach(function (key) {
      const value = params[key];
      if (value !== undefined && value !== null && value !== '') search.append(key, value);
    });
    const text = search.toString();
    return text ? `?${text}` : '';
  }

  function setText(selector, value) {
    const node = UI.qs(selector);
    if (node) node.textContent = value;
  }

  function setHtml(selector, value) {
    const node = UI.qs(selector);
    if (node) node.innerHTML = value;
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

  function pollStatus(poll) {
    if (!poll) return 'closed';
    if (!poll.is_active) return 'closed';
    const now = new Date();
    if (poll.starts_at && UI.toDate(poll.starts_at) > now) return 'scheduled';
    if (poll.ends_at && UI.toDate(poll.ends_at) < now) return 'closed';
    return 'active';
  }

  function pollStatusTiming(poll) {
    const status = pollStatus(poll);
    if (status === 'scheduled' && poll.starts_at) return `Opens ${UI.formatDateTime(poll.starts_at)}`;
    if (status === 'active' && poll.ends_at) return `Closes ${UI.formatDateTime(poll.ends_at)}`;
    if (status === 'active') return 'No closing date';
    if (poll.ends_at) return `Closed ${UI.formatDateTime(poll.ends_at)}`;
    return 'Closed';
  }

  function localInputValue(value) {
    const date = UI.toDate(value);
    if (!date) return '';
    const pad = function (number) { return String(number).padStart(2, '0'); };
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function detailsText(details) {
    if (!details) return '—';
    if (typeof details === 'string') return details;
    const parts = Object.keys(details).map(function (key) {
      const value = details[key];
      if (value === null || value === undefined || value === '') return '';
      if (typeof value === 'object') return `${key}: ${JSON.stringify(value)}`;
      return `${key}: ${value}`;
    }).filter(Boolean);
    return parts.length ? parts.join(' · ') : '—';
  }

  function tableCheck(table) {
    if (!table) return;
    table.classList.add('responsive');
    UI.responsiveTable(table);
  }

  function emptyRow(colspan, options) {
    return `<tr class="empty-row"><td colspan="${colspan}">${UI.emptyState(options)}</td></tr>`;
  }

  function errorRow(colspan, error, title) {
    return `<tr><td colspan="${colspan}">${UI.errorState({
      title: title || 'Data could not be loaded',
      message: (error && error.message) || 'The administration service is unavailable right now.'
    })}</td></tr>`;
  }

  function loadingRow(colspan, message) {
    return `<tr class="empty-row"><td colspan="${colspan}"><span class="spinner dark sm" role="status" aria-label="Loading"></span> ${UI.esc(message || 'Loading…')}</td></tr>`;
  }

  /* ------------------------------------------------------------ Overview */

  function renderOverviewMetrics(data) {
    const container = UI.qs('#admin-metrics');
    if (!container) return;
    const users = data.users || {};
    const issues = data.issues || {};
    const open = Number(issues.submitted || 0) + Number(issues.in_progress || 0);
    const performance = data.performance || {};
    container.innerHTML = [
      UI.metricCard({
        label: 'Complaints recorded',
        value: issues.total || 0,
        meta: Number(issues.submitted || 0) ? `${UI.formatNumber(issues.submitted)} awaiting triage` : 'No complaints awaiting triage',
        icon: 'clipboard',
        tone: 'navy'
      }),
      UI.metricCard({
        label: 'Open cases',
        value: open,
        meta: open ? `${UI.formatNumber(issues.in_progress || 0)} in progress` : 'No open complaints',
        icon: 'clock',
        tone: 'blue'
      }),
      UI.metricCard({
        label: 'Resolution rate',
        value: UI.percent(performance.resolution_rate || 0),
        raw: true,
        meta: `${UI.formatNumber(issues.resolved || 0)} complaints resolved`,
        icon: 'trending-up',
        tone: 'green'
      }),
      UI.metricCard({
        label: 'Registered accounts',
        value: users.total || 0,
        meta: users.total ? `${UI.formatNumber(users.active || 0)} active accounts` : 'No accounts registered yet',
        icon: 'users',
        tone: 'teal'
      })
    ].join('');

    setText('#admin-active-users', UI.formatNumber(users.active || 0));
    setText('#admin-active-services', UI.formatNumber((data.services || {}).active || 0));
    setText('#admin-active-polls', UI.formatNumber((data.polls || {}).active || 0));
    setText('#admin-platform-note', `${UI.formatNumber(users.total || 0)} accounts · ${UI.formatNumber((data.services || {}).total || 0)} services · ${UI.formatNumber((data.polls || {}).total || 0)} polls · ${UI.formatNumber((data.categories || []).length)} categories`);
  }

  function renderOverviewRecent(data) {
    const container = UI.qs('#admin-recent');
    if (!container) return;
    const complaints = data.recent_complaints || [];
    if (!complaints.length) {
      container.innerHTML = `<div style="padding:18px">${UI.emptyState({
        icon: 'inbox',
        title: 'No complaints recorded',
        message: 'New civic reports will appear here as soon as citizens submit them.'
      })}</div>`;
      return;
    }
    container.innerHTML = `<div class="activity-list" style="padding:4px 18px 12px">${complaints.map(function (complaint) {
      const tone = complaint.status === 'resolved' ? 'green' : complaint.status === 'rejected' ? 'red' : complaint.status === 'in_progress' ? 'blue' : 'amber';
      return `<button class="activity-row" type="button" data-open-complaint="${Number(complaint.id)}" style="width:100%;border:0;border-bottom:1px solid var(--border);background:transparent;text-align:left;cursor:pointer">
        <span class="activity-icon ${tone}">${Icons.icon(UI.categoryIcon(complaint.category), 15)}</span>
        <span class="activity-copy">
          <strong>${UI.esc(complaint.title || 'Untitled complaint')}</strong>
          <span>${UI.esc(complaint.tracking_code || '')} · ${UI.esc(UI.categoryLabel(complaint.category))} · ${UI.esc(complaint.reporter_name || 'Unknown reporter')}</span>
          <time datetime="${UI.attr(complaint.created_at)}">${UI.esc(UI.timeAgo(complaint.created_at))} · ${UI.esc(UI.statusLabel(complaint.status))}</time>
        </span>
      </button>`;
    }).join('')}</div>`;
  }

  function renderOverviewPerformance(data) {
    const container = UI.qs('#admin-performance');
    if (!container) return;
    const performance = data.performance || {};
    const issues = data.issues || {};
    const measured = Number(issues.resolved || 0);
    container.innerHTML = `<div class="mini-metrics">
        <div class="mini-metric"><span>Avg resolution</span><strong>${UI.esc(hoursText(performance.avg_resolution_hours))}</strong></div>
        <div class="mini-metric"><span>Resolution rate</span><strong>${UI.esc(UI.percent(performance.resolution_rate || 0))}</strong></div>
        <div class="mini-metric"><span>Resolved</span><strong>${UI.formatNumber(measured)}</strong></div>
      </div>
      <p class="stat-meta mt-12">${performance.avg_resolution_hours === null || performance.avg_resolution_hours === undefined
        ? 'No resolved complaints have recorded resolution timestamps yet.'
        : 'Average time from submission to resolution across resolved complaints.'}</p>`;
  }

  function renderOverviewActivity(data) {
    const container = UI.qs('#admin-activity-preview');
    if (!container) return;
    const logs = data.recent_activity || [];
    if (!logs.length) {
      container.innerHTML = UI.emptyState({
        icon: 'activity',
        title: 'No recorded activity yet',
        message: 'Administrative actions will be recorded here as they happen.'
      });
      return;
    }
    container.innerHTML = `<div class="activity-list">${logs.map(function (log) {
      return `<div class="activity-row">
        <span class="activity-icon ${UI.severityForAction(log.action)}">${Icons.icon(UI.actionIcon(log.action), 14)}</span>
        <span class="activity-copy">
          <strong>${UI.esc(UI.actionLabel(log.action))}</strong>
          <span>${UI.esc(log.actor_name || 'System')}${log.entity_type ? ` · ${UI.esc(UI.titleCase(log.entity_type))}` : ''}</span>
          <time datetime="${UI.attr(log.created_at)}">${UI.esc(UI.timeAgo(log.created_at))}</time>
        </span>
      </div>`;
    }).join('')}</div>`;
  }

  function renderOverview(data) {
    renderOverviewMetrics(data);
    renderOverviewRecent(data);
    renderOverviewPerformance(data);
    renderOverviewActivity(data);
    const trend = UI.qs('#admin-trend');
    if (trend) {
      trend.innerHTML = Charts.line(data.trend || [], {
        height: 230,
        color: '#284b68',
        label: 'Complaints recorded in each of the last six months',
        emptyMessage: 'No complaints have been recorded in the last six months.'
      });
    }
  }

  function renderOverviewError(error) {
    const message = (error && error.message) || 'The administration data could not be loaded.';
    setHtml('#admin-metrics', `<div style="grid-column:1/-1">${UI.errorState({ title: 'Overview unavailable', message: message })}</div>`);
    bindRetry(UI.qs('#admin-metrics'), loadOverview);
    ['#admin-trend', '#admin-performance', '#admin-recent', '#admin-activity-preview'].forEach(function (selector) {
      setHtml(selector, `<div class="chart-empty">${UI.esc(message)}</div>`);
    });
    const activity = UI.qs('#admin-activity-preview');
    if (activity) {
      activity.innerHTML = `<div style="padding:18px">${UI.errorState({ title: 'Recent activity could not be loaded', message: message })}</div>`;
      bindRetry(activity, loadOverview);
    }
  }

  async function loadOverview() {
    const request = ++overviewRequest;
    try {
      const payload = await Api.admin.dashboard();
      if (request !== overviewRequest) return;
      state.overviewLoaded = true;
      renderOverview(payload.data || {});
    } catch (error) {
      if (request !== overviewRequest) return;
      renderOverviewError(error);
    }
  }

  /* ------------------------------------------------------------ Complaints */

  function complaintQuery() {
    const filters = state.complaintFilters;
    return {
      page: state.complaintPage,
      limit: PAGE_LIMIT,
      q: filters.q,
      status: filters.status,
      priority: filters.priority,
      category: filters.category
    };
  }

  function complaintFilterCount() {
    return Object.keys(state.complaintFilters).reduce(function (count, key) {
      return count + (state.complaintFilters[key] ? 1 : 0);
    }, 0);
  }

  function complaintRow(complaint) {
    const reporter = complaint.reporter_name || 'Unknown reporter';
    const place = complaint.area || complaint.address || 'No location recorded';
    return `<tr>
      <td>
        <span class="cell-title">${UI.esc(complaint.title || 'Untitled complaint')}</span>
        <span class="cell-sub">${UI.esc(complaint.tracking_code || `#${complaint.id}`)}</span>
      </td>
      <td><span class="cluster" style="gap:5px;flex-wrap:nowrap">${Icons.icon(UI.categoryIcon(complaint.category), 14)}${UI.esc(complaint.category_label || UI.categoryLabel(complaint.category))}</span></td>
      <td>
        <span class="cell-strong">${UI.esc(reporter)}</span>
        <span class="cell-sub">${UI.esc(place)}</span>
      </td>
      <td>${UI.priorityBadge(complaint.priority)}</td>
      <td>${UI.statusBadge(complaint.status, complaint.status_label)}</td>
      <td>${complaint.assigned_officer_name
        ? `<span class="cell-strong">${UI.esc(complaint.assigned_officer_name)}</span>`
        : '<span class="badge badge-neutral">Unassigned</span>'}</td>
      <td>
        <span class="cell-strong">${UI.esc(UI.formatDate(complaint.created_at))}</span>
        <span class="cell-sub">${UI.esc(UI.timeAgo(complaint.created_at))}</span>
      </td>
      <td class="cell-actions">
        <button class="btn btn-secondary btn-sm" type="button" data-open-complaint="${Number(complaint.id)}">Review</button>
      </td>
    </tr>`;
  }

  function renderComplaints(data) {
    const complaints = data.complaints || [];
    const summary = data.summary || {};
    const pagination = data.pagination || { page: 1, limit: PAGE_LIMIT, total: complaints.length, pages: 1 };
    const body = UI.qs('#admin-complaints-body');
    const table = UI.qs('#admin-complaints-table');
    const filtersActive = complaintFilterCount();

    if (body) {
      body.innerHTML = complaints.length
        ? complaints.map(complaintRow).join('')
        : emptyRow(8, {
          icon: 'inbox',
          title: 'No complaints match these filters',
          message: filtersActive
            ? 'Try clearing one or more filters to widen the search.'
            : 'No citizen complaints have been recorded yet.'
        });
    }
    tableCheck(table);

    const total = Number(pagination.total) || 0;
    setHtml('#admin-complaints-count', `<strong>${UI.formatNumber(total)}</strong> ${total === 1 ? 'complaint' : 'complaints'} matched`);

    const badge = UI.qs('#admin-complaint-filter-badge');
    if (badge) {
      badge.hidden = filtersActive === 0;
      badge.textContent = `${filtersActive} ${filtersActive === 1 ? 'filter' : 'filters'} active`;
    }

    const summaryNode = UI.qs('#admin-complaints-summary');
    if (summaryNode) {
      const cityTotal = Number(summary.total || 0);
      if (!cityTotal) {
        summaryNode.textContent = 'No complaints have been recorded in the city yet.';
      } else {
        const open = Number(summary.submitted || 0) + Number(summary.in_progress || 0);
        summaryNode.textContent = `${UI.formatNumber(cityTotal)} complaints in the city · ${UI.formatNumber(open)} open · ${UI.formatNumber(summary.unassigned || 0)} unassigned`;
      }
    }

    UI.renderPagination(UI.qs('#admin-complaints-pagination'), pagination, function (page) {
      state.complaintPage = page;
      loadComplaints();
      const section = UI.qs('#admin-complaints');
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function renderComplaintsError(error) {
    const body = UI.qs('#admin-complaints-body');
    if (body) body.innerHTML = errorRow(8, error, 'Complaints could not be loaded');
    bindRetry(UI.qs('#admin-complaints-table') || document, loadComplaints);
    UI.renderPagination(UI.qs('#admin-complaints-pagination'), null, function () {});
    setText('#admin-complaints-count', 'Complaints could not be loaded');
    setText('#admin-complaints-summary', 'The complaint register is unavailable right now.');
  }

  async function loadComplaints() {
    const request = ++complaintsRequest;
    const body = UI.qs('#admin-complaints-body');
    if (body) body.innerHTML = loadingRow(8, 'Loading complaints…');
    UI.renderPagination(UI.qs('#admin-complaints-pagination'), null, function () {});
    setText('#admin-complaints-count', 'Loading complaints…');
    try {
      const payload = await Api.admin.complaints(complaintQuery());
      if (request !== complaintsRequest) return;
      state.complaintsLoaded = true;
      renderComplaints(payload.data || {});
    } catch (error) {
      if (request !== complaintsRequest) return;
      renderComplaintsError(error);
    }
  }

  function readComplaintFilters() {
    state.complaintFilters = {
      q: (UI.qs('#admin-complaint-search') || {}).value ? UI.qs('#admin-complaint-search').value.trim() : '',
      status: (UI.qs('#admin-complaint-status') || {}).value || '',
      priority: (UI.qs('#admin-complaint-priority') || {}).value || '',
      category: (UI.qs('#admin-complaint-category') || {}).value || ''
    };
  }

  function applyComplaintFilters() {
    readComplaintFilters();
    state.complaintPage = 1;
    loadComplaints();
  }

  function bindComplaintFilters() {
    const search = UI.qs('#admin-complaint-search');
    if (search) search.addEventListener('input', UI.debounce(applyComplaintFilters, 340));
    ['#admin-complaint-status', '#admin-complaint-priority', '#admin-complaint-category'].forEach(function (selector) {
      const select = UI.qs(selector);
      if (select) select.addEventListener('change', applyComplaintFilters);
    });
    const clear = UI.qs('#clear-complaint-filters');
    if (clear) {
      clear.addEventListener('click', function () {
        ['#admin-complaint-search', '#admin-complaint-status', '#admin-complaint-priority', '#admin-complaint-category'].forEach(function (selector) {
          const input = UI.qs(selector);
          if (input) input.value = '';
        });
        applyComplaintFilters();
      });
    }
    const refresh = UI.qs('#refresh-complaints');
    if (refresh) {
      refresh.addEventListener('click', async function () {
        UI.setLoading(refresh, true, 'Refreshing…');
        await Promise.allSettled([loadComplaints(), loadOverview()]);
        UI.setLoading(refresh, false);
      });
    }
    const exportButton = UI.qs('#export-complaints');
    if (exportButton) exportButton.addEventListener('click', exportComplaints);
  }

  async function exportComplaints() {
    const button = UI.qs('#export-complaints');
    const filters = state.complaintFilters;
    const path = `/admin/reports/complaints.csv${query({ status: filters.status, category: filters.category })}`;
    UI.setLoading(button, true, 'Preparing…');
    try {
      const result = await Api.request(path);
      if (!result || !result.blob || result.success === false) {
        throw new Error('The report could not be generated.');
      }
      const stamp = new Date().toISOString().slice(0, 10);
      UI.download(result.blob, `civicflow-complaints-${stamp}.csv`);
      UI.toast('Complaint report downloaded.', 'success');
    } catch (error) {
      UI.toast(error.message || 'The report could not be downloaded.', 'error');
    } finally {
      if (button && button.isConnected) UI.setLoading(button, false);
    }
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
    const coords = Maps && Maps.hasCoordinates(complaint.latitude, complaint.longitude)
      ? `${Number(complaint.latitude).toFixed(6)}, ${Number(complaint.longitude).toFixed(6)}`
      : '';
    const directions = Maps ? Maps.directionsUrl(complaint.latitude, complaint.longitude) : '';
    const contact = [];
    if (complaint.reporter_email) contact.push(`<a href="mailto:${UI.attr(complaint.reporter_email)}">${UI.esc(complaint.reporter_email)}</a>`);
    if (complaint.reporter_phone) contact.push(`<a href="tel:${UI.attr(complaint.reporter_phone)}">${UI.esc(complaint.reporter_phone)}</a>`);

    const statusOptions = STATUS_OPTIONS.map(function (status) {
      return `<option value="${status}" ${complaint.status === status ? 'selected' : ''}>${UI.esc(UI.statusLabel(status))}</option>`;
    }).join('');

    const officerOptions = state.assignableOfficers.length
      ? state.assignableOfficers.map(function (officer) {
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
            <div id="admin-drawer-map" class="map-canvas" style="min-height:230px"></div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-header with-border">
            <div>
              <h3 class="panel-title">Oversight actions</h3>
              <p class="panel-subtitle">Update the complaint status or allocate a responsible officer.</p>
            </div>
          </div>
          <div class="panel-body">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px">
              <form data-admin-status-form novalidate>
                <div class="field">
                  <label for="admin-drawer-status">Status</label>
                  <select class="select" id="admin-drawer-status" name="status">${statusOptions}</select>
                  <p class="field-help">The reporting citizen is notified when the status changes.</p>
                </div>
                <div class="field mt-12">
                  <label for="admin-drawer-status-note">Update note</label>
                  <textarea class="textarea" id="admin-drawer-status-note" name="note" rows="2" maxlength="500" placeholder="Explain what changed or what happens next."></textarea>
                  <p class="field-help">Optional. Shown to the citizen in the complaint timeline.</p>
                </div>
                <div class="field mt-12" data-resolution-field ${complaint.status === 'resolved' ? '' : 'hidden'}>
                  <label for="admin-drawer-resolution">Resolution details</label>
                  <textarea class="textarea" id="admin-drawer-resolution" name="resolution_summary" rows="3" maxlength="4000" placeholder="Describe the work completed.">${UI.esc(complaint.resolution_summary || '')}</textarea>
                  <p class="field-help">Required when resolving a complaint.</p>
                </div>
                <div class="cluster mt-12" style="justify-content:flex-end">
                  <button class="btn btn-primary btn-sm" type="submit">${Icons.icon('check', 14)}Save status</button>
                </div>
              </form>

              <form data-admin-assign-form novalidate>
                <div class="field">
                  <label for="admin-drawer-officer">Assign officer</label>
                  <select class="select" id="admin-drawer-officer" name="officer_id" ${state.assignableOfficers.length ? '' : 'disabled'}>${officerOptions}</select>
                  <p class="field-help">${state.assignableOfficers.length
                    ? 'The officer and the reporting citizen both receive a notification.'
                    : 'No active officers are available. Provision an officer account first.'}</p>
                </div>
                <div class="field mt-12">
                  <label for="admin-drawer-assign-note">Assignment note</label>
                  <textarea class="textarea" id="admin-drawer-assign-note" name="note" rows="2" maxlength="500" placeholder="Add instructions for the assigned officer."></textarea>
                  <p class="field-help">Optional internal context for the assignment record.</p>
                </div>
                <div class="cluster mt-12" style="justify-content:flex-end">
                  <button class="btn btn-secondary btn-sm" type="submit" ${state.assignableOfficers.length ? '' : 'disabled'}>${Icons.icon('user-check', 14)}${complaint.assigned_officer_id ? 'Reassign' : 'Assign complaint'}</button>
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
            <form class="comment-composer mt-16" data-admin-comment-form novalidate>
              <div class="field">
                <label for="admin-drawer-comment">Add an update</label>
                <textarea class="textarea" id="admin-drawer-comment" name="comment" rows="3" maxlength="2000" placeholder="Share progress with the citizen or leave an internal note."></textarea>
              </div>
              <div class="comment-composer-foot">
                <div class="field">
                  <label for="admin-drawer-visibility">Visibility</label>
                  <select class="select select-sm" id="admin-drawer-visibility" name="visibility">
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
    const body = UI.qs('#admin-drawer-body');
    if (!body) return;
    setText('#admin-drawer-title', complaint.title || 'Complaint');
    setText('#admin-drawer-subtitle', `${complaint.tracking_code || `#${complaint.id}`} · Submitted ${UI.formatDateTime(complaint.created_at)}`);
    body.innerHTML = drawerMarkup(complaint);
    bindDrawerActions(complaint);

    if (complaint.has_photo) loadDrawerPhoto(complaint.id);

    if (Maps) {
      Maps.render(UI.qs('#admin-drawer-map', body), {
        lat: complaint.latitude,
        lng: complaint.longitude,
        address: complaint.address || complaint.area || '',
        label: complaint.title || 'Complaint location',
        emptyMessage: 'No address or coordinates were recorded for this complaint.'
      });
    }
  }

  function bindDrawerActions(complaint) {
    const body = UI.qs('#admin-drawer-body');
    if (!body) return;

    const statusSelect = UI.qs('#admin-drawer-status', body);
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

  async function refreshComplaintViews(id) {
    await Promise.allSettled([
      loadOverview(),
      loadComplaints(),
      state.drawerId === id ? loadDrawer(id, { quiet: true }) : Promise.resolve()
    ]);
  }

  function bindStatusForm(complaint) {
    const form = UI.qs('[data-admin-status-form]');
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
        await refreshComplaintViews(complaint.id);
      } catch (error) {
        if (error.errors) UI.applyServerErrors(form, error.errors);
        UI.toast(error.message || 'The status could not be updated.', 'error');
      } finally {
        if (button && button.isConnected) UI.setLoading(button, false);
      }
    });
  }

  function bindAssignForm(complaint) {
    const form = UI.qs('[data-admin-assign-form]');
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
        await refreshComplaintViews(complaint.id);
      } catch (error) {
        if (error.errors) UI.applyServerErrors(form, error.errors);
        UI.toast(error.message || 'The complaint could not be assigned.', 'error');
      } finally {
        if (button && button.isConnected) UI.setLoading(button, false);
      }
    });
  }

  function bindCommentForm(complaint) {
    const form = UI.qs('[data-admin-comment-form]');
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
        await refreshComplaintViews(complaint.id);
      } catch (error) {
        if (error.errors) UI.applyServerErrors(form, error.errors);
        UI.toast(error.message || 'The update could not be posted.', 'error');
      } finally {
        if (button && button.isConnected) UI.setLoading(button, false);
      }
    });
  }

  async function loadDrawer(id, options) {
    const opts = options || {};
    const body = UI.qs('#admin-drawer-body');
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
      container.innerHTML = UI.errorState({ title: 'Timeline could not be loaded', message: error.message });
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

  async function ensureAssignableOfficers() {
    if (state.assignableOfficers.length) return;
    try {
      const payload = await Api.officer.officers();
      state.assignableOfficers = (payload.data && payload.data.officers) || [];
    } catch { /* drawer still renders with the current assignment */ }
  }

  async function openComplaint(id) {
    const numeric = Number(id);
    if (!Number.isSafeInteger(numeric) || numeric < 1) return;
    state.drawerId = numeric;
    state.complaint = null;
    setText('#admin-drawer-title', 'Complaint');
    setText('#admin-drawer-subtitle', 'Loading complaint…');
    const body = UI.qs('#admin-drawer-body');
    if (body) body.innerHTML = `<div class="empty-state"><span class="spinner dark" role="status" aria-label="Loading complaint"></span></div>`;
    UI.openDialog('admin-complaint-drawer');
    await ensureAssignableOfficers();
    if (state.drawerId === numeric) loadDrawer(numeric);
  }

  function bindDrawer() {
    const drawer = UI.qs('#admin-complaint-drawer');
    if (!drawer) return;

    const close = UI.qs('[data-close-admin-drawer]', drawer);
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

  /* ------------------------------------------------------------ Users */

  function userRow(user) {
    const isSelf = Number(user.id) === Number(state.selfId);
    const roleOptions = ROLE_OPTIONS.map(function (role) {
      return `<option value="${role}" ${user.role === role ? 'selected' : ''} ${isSelf ? 'disabled' : ''}>${UI.esc(UI.titleCase(role === 'admin' ? 'administrator' : role))}</option>`;
    }).join('');
    const status = user.is_active
      ? '<span class="badge badge-resolved">Active</span>'
      : '<span class="badge badge-neutral">Inactive</span>';
    return `<tr>
      <td>
        <div class="table-user">
          <span class="avatar">${UI.esc(UI.initials(user.full_name))}</span>
          <span class="table-user-copy">
            <strong>${UI.esc(user.full_name)}${isSelf ? ' (you)' : ''}</strong>
            <span>${UI.esc(user.email)}</span>
          </span>
        </div>
      </td>
      <td><select class="select select-sm" data-user-role="${Number(user.id)}" aria-label="Role for ${UI.attr(user.full_name)}" ${isSelf ? 'disabled title="You cannot change your own role."' : ''}>${roleOptions}</select></td>
      <td>${status}</td>
      <td class="num">${UI.formatNumber(user.complaint_count || 0)}</td>
      <td class="num">${UI.formatNumber(user.vote_count || 0)}</td>
      <td>
        <span class="cell-strong">${UI.esc(UI.formatDate(user.created_at))}</span>
        <span class="cell-sub">${UI.esc(UI.timeAgo(user.created_at))}</span>
      </td>
      <td class="cell-actions">
        <button class="btn ${user.is_active ? 'btn-ghost' : 'btn-secondary'} btn-sm" type="button" data-user-status="${Number(user.id)}" data-active="${user.is_active ? '1' : '0'}" ${isSelf ? 'disabled' : ''}>
          ${user.is_active ? 'Deactivate' : 'Activate'}
        </button>
      </td>
    </tr>`;
  }

  function renderUsers(data) {
    const users = data.users || [];
    const summary = data.summary || {};
    const pagination = data.pagination || { page: 1, limit: PAGE_LIMIT, total: users.length, pages: 1 };
    const body = UI.qs('#admin-users-body');

    if (body) {
      body.innerHTML = users.length
        ? users.map(userRow).join('')
        : emptyRow(7, {
          icon: 'users',
          title: 'No accounts match these filters',
          message: Object.keys(state.userFilters).some(function (key) { return state.userFilters[key]; })
            ? 'Try clearing a filter to see more accounts.'
            : 'No accounts have been registered yet.'
        });
    }
    tableCheck(UI.qs('#admin-users-table'));

    const total = Number(pagination.total) || 0;
    setHtml('#admin-users-count', `<strong>${UI.formatNumber(total)}</strong> ${total === 1 ? 'account' : 'accounts'} matched`);
    setText('#admin-users-summary', `${UI.formatNumber(summary.total || 0)} accounts · ${UI.formatNumber(summary.citizen || 0)} citizens · ${UI.formatNumber(summary.officer || 0)} officers · ${UI.formatNumber(summary.admin || 0)} administrators`);

    UI.renderPagination(UI.qs('#admin-users-pagination'), pagination, function (page) {
      state.userPage = page;
      loadUsers();
      const section = UI.qs('#admin-users');
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function loadUsers() {
    const request = ++usersRequest;
    const body = UI.qs('#admin-users-body');
    if (body) body.innerHTML = loadingRow(7, 'Loading accounts…');
    setText('#admin-users-count', 'Loading accounts…');
    try {
      const payload = await Api.admin.users({
        page: state.userPage,
        limit: PAGE_LIMIT,
        q: state.userFilters.q,
        role: state.userFilters.role,
        status: state.userFilters.status
      });
      if (request !== usersRequest) return;
      state.usersLoaded = true;
      renderUsers(payload.data || {});
    } catch (error) {
      if (request !== usersRequest) return;
      if (body) body.innerHTML = errorRow(7, error, 'Accounts could not be loaded');
      bindRetry(UI.qs('#admin-users-table') || document, loadUsers);
      UI.renderPagination(UI.qs('#admin-users-pagination'), null, function () {});
      setText('#admin-users-count', 'Accounts could not be loaded');
      setText('#admin-users-summary', 'The account directory is unavailable right now.');
    }
  }

  function readUserFilters() {
    state.userFilters = {
      q: (UI.qs('#admin-user-search') || {}).value ? UI.qs('#admin-user-search').value.trim() : '',
      role: (UI.qs('#admin-user-role') || {}).value || '',
      status: (UI.qs('#admin-user-status') || {}).value || ''
    };
  }

  function applyUserFilters() {
    readUserFilters();
    state.userPage = 1;
    loadUsers();
  }

  async function changeUserStatus(button) {
    const id = Number(button.getAttribute('data-user-status'));
    const active = button.getAttribute('data-active') === '1';
    if (!Number.isSafeInteger(id) || id < 1) return;
    const confirmed = await UI.confirm({
      title: active ? 'Deactivate this account?' : 'Reactivate this account?',
      subtitle: active ? 'The person will not be able to sign in.' : 'The person will be able to sign in again.',
      message: active
        ? 'Existing complaints, votes and assignments are preserved. An inactive account cannot sign in or receive new assignments.'
        : 'The account will regain access to CivicFlow with its existing role.',
      confirmLabel: active ? 'Deactivate account' : 'Activate account',
      danger: active
    });
    if (!confirmed) return;
    UI.setLoading(button, true, active ? 'Deactivating…' : 'Activating…');
    try {
      const response = await Api.admin.setUserStatus(id, !active);
      UI.toast((response && response.message) || 'Account updated.', 'success');
      await Promise.allSettled([loadUsers(), loadOverview(), loadOfficers()]);
    } catch (error) {
      UI.toast(error.message || 'The account could not be updated.', 'error');
      if (button && button.isConnected) UI.setLoading(button, false);
    }
  }

  async function changeUserRole(select) {
    const id = Number(select.getAttribute('data-user-role'));
    const role = select.value;
    if (!Number.isSafeInteger(id) || id < 1 || !ROLE_OPTIONS.includes(role)) return;
    const confirmed = await UI.confirm({
      title: 'Change this account role?',
      subtitle: `The account will become ${role === 'admin' ? 'an administrator' : `a ${role}`}.`,
      message: 'Role changes take effect immediately. Officers with open assignments cannot be demoted until their complaints are reassigned.',
      confirmLabel: 'Change role',
      danger: role === 'admin'
    });
    if (!confirmed) {
      await loadUsers();
      return;
    }
    select.disabled = true;
    try {
      const response = await Api.admin.setUserRole(id, role);
      UI.toast((response && response.message) || 'Account role updated.', 'success');
      state.assignableOfficers = [];
      await Promise.allSettled([loadUsers(), loadOverview(), loadOfficers()]);
    } catch (error) {
      UI.toast(error.message || 'The role could not be changed.', 'error');
      await loadUsers();
    }
  }

  function bindUsers() {
    const search = UI.qs('#admin-user-search');
    if (search) search.addEventListener('input', UI.debounce(applyUserFilters, 340));
    ['#admin-user-role', '#admin-user-status'].forEach(function (selector) {
      const select = UI.qs(selector);
      if (select) select.addEventListener('change', applyUserFilters);
    });
    const clear = UI.qs('#clear-user-filters');
    if (clear) {
      clear.addEventListener('click', function () {
        ['#admin-user-search', '#admin-user-role', '#admin-user-status'].forEach(function (selector) {
          const input = UI.qs(selector);
          if (input) input.value = '';
        });
        applyUserFilters();
      });
    }
    const refresh = UI.qs('#refresh-users');
    if (refresh) {
      refresh.addEventListener('click', async function () {
        UI.setLoading(refresh, true, 'Refreshing…');
        await loadUsers();
        UI.setLoading(refresh, false);
      });
    }

    const body = UI.qs('#admin-users-body');
    if (body) {
      body.addEventListener('click', function (event) {
        const button = event.target.closest('[data-user-status]');
        if (button && !button.disabled) changeUserStatus(button);
      });
      body.addEventListener('change', function (event) {
        const select = event.target.closest('[data-user-role]');
        if (select && !select.disabled) changeUserRole(select);
      });
    }
  }

  /* ------------------------------------------------------------ Officers */

  function officerRow(officer) {
    return `<tr>
      <td>
        <div class="table-user">
          <span class="avatar">${UI.esc(UI.initials(officer.full_name))}</span>
          <span class="table-user-copy">
            <strong>${UI.esc(officer.full_name)}</strong>
            <span>${UI.esc(officer.email)}</span>
          </span>
        </div>
      </td>
      <td>${officer.department ? UI.esc(officer.department) : '<span class="muted">Not set</span>'}</td>
      <td>
        ${officer.phone ? `<a href="tel:${UI.attr(officer.phone)}">${UI.esc(officer.phone)}</a>` : '<span class="muted">Not set</span>'}
      </td>
      <td class="num">${UI.formatNumber(officer.active_workload || 0)}</td>
      <td class="num">${UI.formatNumber(officer.resolved_count || 0)}</td>
      <td>${UI.esc(hoursText(officer.avg_resolution_hours))}</td>
      <td>${officer.is_active ? '<span class="badge badge-resolved">Active</span>' : '<span class="badge badge-neutral">Inactive</span>'}</td>
      <td class="cell-actions">
        <button class="btn btn-secondary btn-sm" type="button" data-edit-officer="${Number(officer.id)}">Edit</button>
      </td>
    </tr>`;
  }

  function renderOfficers(data) {
    const officers = data.officers || [];
    state.officers = officers;
    const body = UI.qs('#admin-officers-body');
    if (body) {
      body.innerHTML = officers.length
        ? officers.map(officerRow).join('')
        : emptyRow(8, {
          icon: 'user-check',
          title: 'No officer accounts',
          message: 'Provision a municipal officer account to start assigning complaints.'
        });
    }
    tableCheck(UI.qs('#admin-officers-table'));
    const active = officers.filter(function (officer) { return officer.is_active; }).length;
    setText('#admin-officers-count', `${UI.formatNumber(officers.length)} ${officers.length === 1 ? 'officer account' : 'officer accounts'} · ${UI.formatNumber(active)} active`);
  }

  async function loadOfficers() {
    const request = ++officersRequest;
    const body = UI.qs('#admin-officers-body');
    if (body) body.innerHTML = loadingRow(8, 'Loading officers…');
    setText('#admin-officers-count', 'Loading officers…');
    try {
      const payload = await Api.admin.officers();
      if (request !== officersRequest) return;
      renderOfficers(payload.data || {});
      state.assignableOfficers = [];
    } catch (error) {
      if (request !== officersRequest) return;
      if (body) body.innerHTML = errorRow(8, error, 'Officers could not be loaded');
      bindRetry(UI.qs('#admin-officers-table') || document, loadOfficers);
      setText('#admin-officers-count', 'Officers could not be loaded');
    }
  }

  function openOfficerModal(officer) {
    const form = UI.qs('#officer-form');
    if (!form) return;
    form.reset();
    UI.clearFormErrors(form);
    const editing = Boolean(officer);
    state.editOfficerId = editing ? officer.id : null;

    setText('#officer-modal-title', editing ? 'Edit officer' : 'Add officer');
    setText('#officer-modal-subtitle', editing
      ? 'Update the officer record, department or account status.'
      : 'Create a municipal officer account and share the temporary password securely.');
    setText('#save-officer', editing ? 'Save officer' : 'Create officer');

    const passwordField = UI.qs('[data-officer-password-field]', form);
    const activeField = UI.qs('[data-officer-active-field]', form);
    if (passwordField) passwordField.hidden = editing;
    if (activeField) activeField.hidden = !editing;

    const password = UI.qs('[name="password"]', form);
    if (password) {
      password.required = !editing;
      password.value = '';
    }

    const email = UI.qs('[name="email"]', form);
    if (email) {
      email.readOnly = editing;
      email.value = editing ? officer.email : '';
    }
    UI.qs('[name="full_name"]', form).value = editing ? officer.full_name : '';
    UI.qs('[name="department"]', form).value = editing ? (officer.department || '') : '';
    UI.qs('[name="phone"]', form).value = editing ? (officer.phone || '') : '';
    const active = UI.qs('[name="is_active"]', form);
    if (active) active.checked = editing ? Boolean(officer.is_active) : true;

    UI.openDialog('officer-modal');
    const first = UI.qs('[name="full_name"]', form);
    if (first) first.focus();
  }

  function bindOfficerModal() {
    const add = UI.qs('#add-officer');
    if (add) add.addEventListener('click', function () { openOfficerModal(null); });

    document.addEventListener('click', function (event) {
      const trigger = event.target.closest('[data-edit-officer]');
      if (!trigger) return;
      const id = Number(trigger.getAttribute('data-edit-officer'));
      const officer = state.officers.find(function (item) { return Number(item.id) === id; });
      if (officer) openOfficerModal(officer);
    });

    const form = UI.qs('#officer-form');
    if (!form) return;
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      UI.clearFormErrors(form);
      const values = UI.formValues(form);
      const editing = Boolean(state.editOfficerId);
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

      if (!values.full_name || values.full_name.trim().length < 2) {
        UI.setFieldError(UI.qs('[name="full_name"]', form), 'Enter the officer’s full name.');
        return;
      }
      if (!editing) {
        if (!values.email || !emailPattern.test(values.email.trim())) {
          UI.setFieldError(UI.qs('[name="email"]', form), 'Enter a valid email address.');
          return;
        }
        if (!values.password || values.password.length < 8) {
          UI.setFieldError(UI.qs('[name="password"]', form), 'Use a temporary password of at least 8 characters.');
          return;
        }
      }
      if (values.phone && !/^[+()\-\s\d]{6,30}$/.test(values.phone.trim())) {
        UI.setFieldError(UI.qs('[name="phone"]', form), 'Enter a valid phone number.');
        return;
      }

      const payload = {
        full_name: values.full_name.trim(),
        department: values.department ? values.department.trim() : '',
        phone: values.phone ? values.phone.trim() : ''
      };
      if (editing) {
        payload.is_active = UI.qs('[name="is_active"]', form).checked;
      } else {
        payload.email = values.email.trim();
        payload.password = values.password;
      }

      const button = UI.qs('#save-officer');
      UI.setLoading(button, true, editing ? 'Saving…' : 'Creating…');
      try {
        const response = editing
          ? await Api.admin.updateOfficer(state.editOfficerId, payload)
          : await Api.admin.createOfficer(payload);
        UI.toast((response && response.message) || 'Officer account saved.', 'success');
        UI.closeDialog('officer-modal');
        state.assignableOfficers = [];
        await Promise.allSettled([loadOfficers(), loadOverview()]);
      } catch (error) {
        if (error.errors) UI.applyServerErrors(form, error.errors);
        UI.toast(error.message || 'The officer account could not be saved.', 'error');
      } finally {
        if (button && button.isConnected) UI.setLoading(button, false);
      }
    });
  }

  /* ------------------------------------------------------------ Services */

  function serviceRow(service) {
    return `<tr>
      <td>
        <span class="cell-title">${UI.esc(service.name)}</span>
        <span class="cell-sub">${UI.esc(service.address || 'Address not recorded')}</span>
      </td>
      <td><span class="cluster" style="gap:5px;flex-wrap:nowrap">${Icons.icon(service.category_icon || 'pin', 14)}${UI.esc(service.category_name || UI.titleCase(service.category))}</span></td>
      <td>${service.area ? UI.esc(service.area) : '<span class="muted">Not set</span>'}</td>
      <td>${service.phone ? `<a href="tel:${UI.attr(service.phone)}">${UI.esc(service.phone)}</a>` : '<span class="muted">Not set</span>'}</td>
      <td>${service.is_active ? '<span class="badge badge-resolved">Published</span>' : '<span class="badge badge-neutral">Inactive</span>'}</td>
      <td>
        <span class="cell-strong">${UI.esc(UI.formatDate(service.updated_at))}</span>
        <span class="cell-sub">${UI.esc(UI.timeAgo(service.updated_at))}</span>
      </td>
      <td class="cell-actions">
        <span class="row-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-edit-service="${Number(service.id)}">Edit</button>
          ${service.is_active ? `<button class="btn btn-ghost btn-sm" type="button" data-deactivate-service="${Number(service.id)}">Deactivate</button>` : ''}
        </span>
      </td>
    </tr>`;
  }

  function updateServicesSummary(total, categoryCount) {
    const count = Number(total) || 0;
    setText('#admin-services-summary', `${UI.formatNumber(count)} ${count === 1 ? 'service' : 'services'} in the directory · ${UI.formatNumber(categoryCount)} categories`);
  }

  function renderServices(data) {
    const services = data.services || [];
    const pagination = data.pagination || { page: 1, limit: PAGE_LIMIT, total: services.length, pages: 1 };
    state.serviceRows = services;
    state.serviceTotal = Number(pagination.total) || 0;
    const body = UI.qs('#admin-services-body');
    if (body) {
      body.innerHTML = services.length
        ? services.map(serviceRow).join('')
        : emptyRow(7, {
          icon: 'building',
          title: 'No services match this view',
          message: Object.keys(state.serviceFilters).some(function (key) { return state.serviceFilters[key]; })
            ? 'Try clearing the search or category filter.'
            : 'Publish the first city service so citizens can find it.'
        });
    }
    tableCheck(UI.qs('#admin-services-table'));

    const total = Number(pagination.total) || 0;
    setHtml('#admin-services-count', `<strong>${UI.formatNumber(total)}</strong> ${total === 1 ? 'service' : 'services'} matched`);
    updateServicesSummary(total, state.categories.length);

    UI.renderPagination(UI.qs('#admin-services-pagination'), pagination, function (page) {
      state.servicePage = page;
      loadServices();
      const section = UI.qs('#admin-services');
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function loadServices() {
    const request = ++servicesRequest;
    const body = UI.qs('#admin-services-body');
    if (body) body.innerHTML = loadingRow(7, 'Loading services…');
    setText('#admin-services-count', 'Loading services…');
    try {
      const payload = await Api.admin.services({
        page: state.servicePage,
        limit: PAGE_LIMIT,
        q: state.serviceFilters.q,
        category: state.serviceFilters.category
      });
      if (request !== servicesRequest) return;
      state.servicesLoaded = true;
      renderServices(payload.data || {});
    } catch (error) {
      if (request !== servicesRequest) return;
      if (body) body.innerHTML = errorRow(7, error, 'Services could not be loaded');
      bindRetry(UI.qs('#admin-services-table') || document, loadServices);
      UI.renderPagination(UI.qs('#admin-services-pagination'), null, function () {});
      setText('#admin-services-count', 'Services could not be loaded');
      setText('#admin-services-summary', 'The service directory is unavailable right now.');
    }
  }

  function readServiceFilters() {
    state.serviceFilters = {
      q: (UI.qs('#admin-service-search') || {}).value ? UI.qs('#admin-service-search').value.trim() : '',
      category: (UI.qs('#admin-service-category') || {}).value || ''
    };
  }

  function applyServiceFilters() {
    readServiceFilters();
    state.servicePage = 1;
    loadServices();
  }

  function categoryOptions(selected, includeInactive) {
    return state.categories
      .filter(function (category) { return includeInactive || category.is_active; })
      .map(function (category) {
        return `<option value="${UI.attr(category.slug)}" ${selected === category.slug ? 'selected' : ''}>${UI.esc(category.name)}${category.is_active ? '' : ' (inactive)'}</option>`;
      }).join('');
  }

  function refreshCategorySelects() {
    const filter = UI.qs('#admin-service-category');
    if (filter) {
      const current = filter.value;
      filter.innerHTML = `<option value="">All categories</option>${categoryOptions(current, true)}`;
      filter.value = current;
    }
    const field = UI.qs('#service-category-field');
    if (field) {
      const current = field.value;
      field.innerHTML = `<option value="">Select a category</option>${categoryOptions(current, true)}`;
      field.value = current;
    }
  }

  function renderCategories(data) {
    const categories = data.categories || [];
    state.categories = categories;
    const container = UI.qs('#admin-categories');
    if (container) {
      container.innerHTML = categories.length
        ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">${categories.map(function (category) {
          return `<article class="admin-service-card">
            <div class="cluster" style="justify-content:space-between">
              <span class="cluster" style="gap:7px">${Icons.icon(category.icon || 'pin', 15)}<h4>${UI.esc(category.name)}</h4></span>
              ${category.is_active ? '<span class="badge badge-resolved">Active</span>' : '<span class="badge badge-neutral">Inactive</span>'}
            </div>
            <p>${UI.esc(category.description || 'No description recorded.')}</p>
            <p class="text-xs muted">Slug: ${UI.esc(category.slug)} · ${UI.formatNumber(category.service_count || 0)} services</p>
            <div class="cluster">
              <button class="btn btn-secondary btn-sm" type="button" data-edit-category="${Number(category.id)}">Edit</button>
              <button class="btn btn-ghost btn-sm" type="button" data-toggle-category="${Number(category.id)}">${category.is_active ? 'Deactivate' : 'Activate'}</button>
              ${Number(category.service_count) === 0 ? `<button class="btn btn-ghost btn-sm" type="button" data-delete-category="${Number(category.id)}">Delete</button>` : ''}
            </div>
          </article>`;
        }).join('')}</div>`
        : UI.emptyState({
          icon: 'tag',
          title: 'No service categories',
          message: 'Add a category before publishing city services.'
        });
    }
    refreshCategorySelects();
    if (state.servicesLoaded) updateServicesSummary(state.serviceTotal, categories.length);
  }

  async function loadCategories() {
    try {
      const payload = await Api.admin.categories(true);
      renderCategories(payload.data || {});
      return true;
    } catch (error) {
      const container = UI.qs('#admin-categories');
      if (container) {
        container.innerHTML = UI.errorState({ title: 'Categories could not be loaded', message: error.message });
        bindRetry(container, loadCategories);
      }
      return false;
    }
  }

  function openServiceModal(service) {
    const form = UI.qs('#service-form');
    if (!form) return;
    form.reset();
    UI.clearFormErrors(form);
    const editing = Boolean(service);
    state.editServiceId = editing ? service.id : null;

    setText('#service-modal-title', editing ? 'Edit service' : 'Add service');
    setText('#service-modal-subtitle', editing
      ? 'Update the published details for this city service.'
      : 'Publish a city service to the public directory.');
    setText('#save-service', editing ? 'Save service' : 'Create service');

    refreshCategorySelects();

    const activeField = UI.qs('[data-service-active-field]', form);
    if (activeField) activeField.hidden = !editing;

    UI.qs('[name="name"]', form).value = editing ? service.name : '';
    UI.qs('[name="category"]', form).value = editing ? service.category : '';
    UI.qs('[name="description"]', form).value = editing ? (service.description || '') : '';
    UI.qs('[name="address"]', form).value = editing ? (service.address || '') : '';
    UI.qs('[name="area"]', form).value = editing ? (service.area || '') : '';
    UI.qs('[name="phone"]', form).value = editing ? (service.phone || '') : '';
    UI.qs('[name="opening_hours"]', form).value = editing ? (service.opening_hours || '') : '';
    UI.qs('[name="latitude"]', form).value = editing && service.latitude !== null ? service.latitude : '';
    UI.qs('[name="longitude"]', form).value = editing && service.longitude !== null ? service.longitude : '';
    const active = UI.qs('[name="is_active"]', form);
    if (active) active.checked = editing ? Boolean(service.is_active) : true;

    UI.openDialog('service-modal');
    const first = UI.qs('[name="name"]', form);
    if (first) first.focus();
  }

  function bindServices() {
    const search = UI.qs('#admin-service-search');
    if (search) search.addEventListener('input', UI.debounce(applyServiceFilters, 340));
    const category = UI.qs('#admin-service-category');
    if (category) category.addEventListener('change', applyServiceFilters);
    const clear = UI.qs('#clear-service-filters');
    if (clear) {
      clear.addEventListener('click', function () {
        ['#admin-service-search', '#admin-service-category'].forEach(function (selector) {
          const input = UI.qs(selector);
          if (input) input.value = '';
        });
        applyServiceFilters();
      });
    }
    const refresh = UI.qs('#refresh-services');
    if (refresh) {
      refresh.addEventListener('click', async function () {
        UI.setLoading(refresh, true, 'Refreshing…');
        await Promise.allSettled([loadServices(), loadCategories()]);
        UI.setLoading(refresh, false);
      });
    }

    const add = UI.qs('#add-service');
    if (add) {
      add.addEventListener('click', async function () {
        if (!state.categories.length) await loadCategories();
        openServiceModal(null);
      });
    }

    document.addEventListener('click', async function (event) {
      const edit = event.target.closest('[data-edit-service]');
      if (edit) {
        const id = Number(edit.getAttribute('data-edit-service'));
        const service = state.serviceRows.find(function (item) { return Number(item.id) === id; });
        if (service) {
          if (!state.categories.length) await loadCategories();
          openServiceModal(service);
        }
        return;
      }
      const deactivate = event.target.closest('[data-deactivate-service]');
      if (deactivate) deactivateService(Number(deactivate.getAttribute('data-deactivate-service')), deactivate);
    });

    const form = UI.qs('#service-form');
    if (!form) return;
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      UI.clearFormErrors(form);
      const values = UI.formValues(form);
      const editing = Boolean(state.editServiceId);
      if (!values.name || values.name.trim().length < 2) {
        UI.setFieldError(UI.qs('[name="name"]', form), 'Enter a service name.');
        return;
      }
      if (!values.category) {
        UI.setFieldError(UI.qs('[name="category"]', form), 'Select a service category.');
        return;
      }
      if (!values.address || values.address.trim().length < 3) {
        UI.setFieldError(UI.qs('[name="address"]', form), 'Enter the service address.');
        return;
      }

      const payload = {
        name: values.name.trim(),
        category: values.category,
        description: values.description ? values.description.trim() : '',
        address: values.address.trim(),
        area: values.area ? values.area.trim() : '',
        phone: values.phone ? values.phone.trim() : '',
        opening_hours: values.opening_hours ? values.opening_hours.trim() : '',
        latitude: values.latitude === '' ? null : values.latitude,
        longitude: values.longitude === '' ? null : values.longitude
      };
      if (editing) payload.is_active = UI.qs('[name="is_active"]', form).checked;

      const button = UI.qs('#save-service');
      UI.setLoading(button, true, editing ? 'Saving…' : 'Creating…');
      try {
        const response = editing
          ? await Api.admin.updateService(state.editServiceId, payload)
          : await Api.admin.createService(payload);
        UI.toast((response && response.message) || 'City service saved.', 'success');
        UI.closeDialog('service-modal');
        await Promise.allSettled([loadServices(), loadCategories(), loadOverview()]);
      } catch (error) {
        if (error.errors) UI.applyServerErrors(form, error.errors);
        UI.toast(error.message || 'The service could not be saved.', 'error');
      } finally {
        if (button && button.isConnected) UI.setLoading(button, false);
      }
    });
  }

  async function deactivateService(id, button) {
    if (!Number.isSafeInteger(id) || id < 1) return;
    const confirmed = await UI.confirm({
      title: 'Deactivate this service?',
      subtitle: 'It will be removed from the public directory.',
      message: 'Existing records are preserved. You can reactivate the service later by editing it.',
      confirmLabel: 'Deactivate service',
      danger: true
    });
    if (!confirmed) return;
    UI.setLoading(button, true, 'Updating…');
    try {
      const response = await Api.admin.deactivateService(id);
      UI.toast((response && response.message) || 'Service deactivated.', 'success');
      await Promise.allSettled([loadServices(), loadCategories(), loadOverview()]);
    } catch (error) {
      UI.toast(error.message || 'The service could not be deactivated.', 'error');
      if (button && button.isConnected) UI.setLoading(button, false);
    }
  }

  /* ------------------------------------------------------------ Categories */

  function openCategoryModal(category) {
    const form = UI.qs('#category-form');
    if (!form) return;
    form.reset();
    UI.clearFormErrors(form);
    const editing = Boolean(category);
    state.editCategoryId = editing ? category.id : null;

    setText('#category-modal-title', editing ? 'Edit category' : 'Add category');
    setText('#category-modal-subtitle', editing
      ? 'Update how this category appears in the public directory.'
      : 'Categories group services in the public directory.');
    setText('#save-category', editing ? 'Save category' : 'Create category');

    const slug = UI.qs('[name="slug"]', form);
    slug.readOnly = editing;
    slug.value = editing ? category.slug : '';
    UI.qs('[name="name"]', form).value = editing ? category.name : '';
    UI.qs('[name="description"]', form).value = editing ? (category.description || '') : '';
    UI.qs('[name="icon"]', form).value = editing ? (category.icon || 'pin') : '';
    UI.qs('[name="sort_order"]', form).value = editing ? category.sort_order : 0;
    const activeField = UI.qs('[data-category-active-field]', form);
    if (activeField) activeField.hidden = !editing;
    const active = UI.qs('[name="is_active"]', form);
    if (active) active.checked = editing ? Boolean(category.is_active) : true;

    UI.openDialog('category-modal');
    const first = UI.qs('[name="name"]', form);
    if (first) first.focus();
  }

  async function toggleCategory(id) {
    const category = state.categories.find(function (item) { return Number(item.id) === id; });
    if (!category) return;
    const nextActive = !category.is_active;
    const confirmed = await UI.confirm({
      title: nextActive ? 'Activate this category?' : 'Deactivate this category?',
      subtitle: nextActive ? 'Services in this category can be published.' : 'Services in this category will be hidden from citizens.',
      message: nextActive
        ? 'The category and its published services will become visible in the public directory.'
        : 'Services that use this category stay in the database but will not appear in the public directory until the category is active again.',
      confirmLabel: nextActive ? 'Activate category' : 'Deactivate category',
      danger: !nextActive
    });
    if (!confirmed) return;
    try {
      const response = await Api.admin.updateCategory(id, {
        name: category.name,
        description: category.description || '',
        icon: category.icon || 'pin',
        sort_order: category.sort_order,
        is_active: nextActive
      });
      UI.toast((response && response.message) || 'Category updated.', 'success');
      await Promise.allSettled([loadCategories(), loadServices(), loadOverview()]);
    } catch (error) {
      UI.toast(error.message || 'The category could not be updated.', 'error');
    }
  }

  async function deleteCategory(id) {
    const category = state.categories.find(function (item) { return Number(item.id) === id; });
    const confirmed = await UI.confirm({
      title: 'Delete this category?',
      subtitle: category ? category.name : 'This category will be removed.',
      message: 'Only unused categories can be deleted. This action cannot be undone.',
      confirmLabel: 'Delete category',
      danger: true
    });
    if (!confirmed) return;
    try {
      const response = await Api.admin.deleteCategory(id);
      UI.toast((response && response.message) || 'Category deleted.', 'success');
      await Promise.allSettled([loadCategories(), loadServices()]);
    } catch (error) {
      UI.toast(error.message || 'The category could not be deleted.', 'error');
    }
  }

  function bindCategories() {
    const add = UI.qs('#add-category');
    if (add) add.addEventListener('click', function () { openCategoryModal(null); });

    const container = UI.qs('#admin-categories');
    if (container) {
      container.addEventListener('click', function (event) {
        const edit = event.target.closest('[data-edit-category]');
        if (edit) {
          const id = Number(edit.getAttribute('data-edit-category'));
          const category = state.categories.find(function (item) { return Number(item.id) === id; });
          if (category) openCategoryModal(category);
          return;
        }
        const toggle = event.target.closest('[data-toggle-category]');
        if (toggle) {
          toggleCategory(Number(toggle.getAttribute('data-toggle-category')));
          return;
        }
        const remove = event.target.closest('[data-delete-category]');
        if (remove) deleteCategory(Number(remove.getAttribute('data-delete-category')));
      });
    }

    const form = UI.qs('#category-form');
    if (!form) return;
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      UI.clearFormErrors(form);
      const values = UI.formValues(form);
      const editing = Boolean(state.editCategoryId);
      if (!values.name || values.name.trim().length < 2) {
        UI.setFieldError(UI.qs('[name="name"]', form), 'Enter a category name.');
        return;
      }
      if (!editing && (!values.slug || !/^[a-z][a-z0-9_-]*$/.test(values.slug.trim()))) {
        UI.setFieldError(UI.qs('[name="slug"]', form), 'Use lowercase letters, numbers, hyphens or underscores.');
        return;
      }

      const payload = {
        name: values.name.trim(),
        description: values.description ? values.description.trim() : '',
        icon: values.icon ? values.icon.trim() : 'pin',
        sort_order: values.sort_order === '' ? 0 : Number(values.sort_order)
      };
      if (editing) {
        payload.is_active = UI.qs('[name="is_active"]', form).checked;
      } else {
        payload.slug = values.slug.trim();
      }

      const button = UI.qs('#save-category');
      UI.setLoading(button, true, editing ? 'Saving…' : 'Creating…');
      try {
        const response = editing
          ? await Api.admin.updateCategory(state.editCategoryId, payload)
          : await Api.admin.createCategory(payload);
        UI.toast((response && response.message) || 'Category saved.', 'success');
        UI.closeDialog('category-modal');
        await Promise.allSettled([loadCategories(), loadServices(), loadOverview()]);
      } catch (error) {
        if (error.errors) UI.applyServerErrors(form, error.errors);
        UI.toast(error.message || 'The category could not be saved.', 'error');
      } finally {
        if (button && button.isConnected) UI.setLoading(button, false);
      }
    });
  }

  /* ------------------------------------------------------------ Polls */

  function pollRow(poll) {
    return `<tr>
      <td>
        <span class="cell-title">${UI.esc(poll.title)}</span>
        <span class="cell-sub">${UI.esc(poll.description || (poll.creator_name ? `Created by ${poll.creator_name}` : 'No description'))}</span>
      </td>
      <td>${UI.pollStatusBadge(pollStatus(poll))}</td>
      <td class="num">${UI.formatNumber((poll.options || []).length)}</td>
      <td class="num">${UI.formatNumber(poll.total_votes || 0)}</td>
      <td>
        <span class="cell-strong">${UI.esc(pollStatusTiming(poll))}</span>
        <span class="cell-sub">Created ${UI.esc(UI.formatDate(poll.created_at))}</span>
      </td>
      <td class="cell-actions">
        <span class="row-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-edit-poll="${Number(poll.id)}">Edit</button>
          ${poll.is_active ? `<button class="btn btn-ghost btn-sm" type="button" data-close-poll="${Number(poll.id)}">Close</button>` : ''}
          ${Number(poll.total_votes) === 0 ? `<button class="btn btn-ghost btn-sm" type="button" data-delete-poll="${Number(poll.id)}">Delete</button>` : ''}
        </span>
      </td>
    </tr>`;
  }

  function renderPolls(data) {
    const polls = data.polls || [];
    state.polls = polls;
    const body = UI.qs('#admin-polls-body');
    if (body) {
      body.innerHTML = polls.length
        ? polls.map(pollRow).join('')
        : emptyRow(6, {
          icon: 'vote',
          title: 'No community polls',
          message: 'Create a poll to invite citizens into a city decision.'
        });
    }
    tableCheck(UI.qs('#admin-polls-table'));
    const active = polls.filter(function (poll) { return pollStatus(poll) === 'active'; }).length;
    const votes = polls.reduce(function (sum, poll) { return sum + Number(poll.total_votes || 0); }, 0);
    setHtml('#admin-polls-count', `<strong>${UI.formatNumber(polls.length)}</strong> ${polls.length === 1 ? 'poll' : 'polls'} recorded`);
    setText('#admin-polls-summary', `${UI.formatNumber(polls.length)} polls · ${UI.formatNumber(active)} open · ${UI.formatNumber(votes)} votes recorded`);
  }

  async function loadPolls() {
    const request = ++pollsRequest;
    const body = UI.qs('#admin-polls-body');
    if (body) body.innerHTML = loadingRow(6, 'Loading polls…');
    setText('#admin-polls-count', 'Loading polls…');
    try {
      const payload = await Api.admin.polls();
      if (request !== pollsRequest) return;
      state.pollsLoaded = true;
      renderPolls(payload.data || {});
    } catch (error) {
      if (request !== pollsRequest) return;
      if (body) body.innerHTML = errorRow(6, error, 'Polls could not be loaded');
      bindRetry(UI.qs('#admin-polls-table') || document, loadPolls);
      setText('#admin-polls-count', 'Polls could not be loaded');
      setText('#admin-polls-summary', 'Community polls are unavailable right now.');
    }
  }

  function openPollModal(poll) {
    const form = UI.qs('#poll-form');
    if (!form) return;
    form.reset();
    UI.clearFormErrors(form);
    const editing = Boolean(poll);
    state.editPollId = editing ? poll.id : null;

    setText('#poll-modal-title', editing ? 'Edit poll' : 'Create poll');
    setText('#poll-modal-subtitle', editing
      ? 'Update the poll details, schedule or publication state.'
      : 'Ask citizens for their priorities and decisions.');
    setText('#save-poll', editing ? 'Save poll' : 'Create poll');

    const optionsField = UI.qs('#poll-options', form);
    const optionsHelp = UI.qs('#poll-options-help');
    const hasVotes = editing && Number(poll.total_votes) > 0;
    optionsField.disabled = hasVotes;
    optionsField.value = editing ? (poll.options || []).map(function (option) { return option.text; }).join('\n') : '';
    if (optionsHelp) {
      optionsHelp.textContent = hasVotes
        ? 'Voting options cannot be changed after votes have been cast. You can still update the title, description, schedule and publication state.'
        : 'Add at least two options, one per line. Up to eight options are supported.';
    }

    UI.qs('[name="title"]', form).value = editing ? poll.title : '';
    UI.qs('[name="description"]', form).value = editing ? (poll.description || '') : '';
    UI.qs('[name="starts_at"]', form).value = editing ? localInputValue(poll.starts_at) : '';
    UI.qs('[name="ends_at"]', form).value = editing ? localInputValue(poll.ends_at) : '';
    const active = UI.qs('[name="is_active"]', form);
    if (active) active.checked = editing ? Boolean(poll.is_active) : true;

    UI.openDialog('poll-modal');
    const first = UI.qs('[name="title"]', form);
    if (first) first.focus();
  }

  async function closePoll(id) {
    const poll = state.polls.find(function (item) { return Number(item.id) === id; });
    const confirmed = await UI.confirm({
      title: 'Close this poll?',
      subtitle: poll ? poll.title : 'Voting will end immediately.',
      message: 'Citizens will no longer be able to vote. Results remain available in the platform.',
      confirmLabel: 'Close poll'
    });
    if (!confirmed) return;
    try {
      const response = await Api.admin.closePoll(id);
      UI.toast((response && response.message) || 'Poll closed.', 'success');
      await Promise.allSettled([loadPolls(), loadOverview(), state.analyticsLoaded ? loadAnalytics() : Promise.resolve()]);
    } catch (error) {
      UI.toast(error.message || 'The poll could not be closed.', 'error');
    }
  }

  async function deletePoll(id) {
    const poll = state.polls.find(function (item) { return Number(item.id) === id; });
    const confirmed = await UI.confirm({
      title: 'Delete this poll?',
      subtitle: poll ? poll.title : 'The poll will be removed.',
      message: 'Only polls without recorded votes can be deleted. This action cannot be undone.',
      confirmLabel: 'Delete poll',
      danger: true
    });
    if (!confirmed) return;
    try {
      const response = await Api.admin.deletePoll(id);
      UI.toast((response && response.message) || 'Poll deleted.', 'success');
      await Promise.allSettled([loadPolls(), loadOverview(), state.analyticsLoaded ? loadAnalytics() : Promise.resolve()]);
    } catch (error) {
      UI.toast(error.message || 'The poll could not be deleted.', 'error');
    }
  }

  function bindPolls() {
    const add = UI.qs('#add-poll');
    if (add) add.addEventListener('click', function () { openPollModal(null); });

    const refresh = UI.qs('#refresh-polls');
    if (refresh) {
      refresh.addEventListener('click', async function () {
        UI.setLoading(refresh, true, 'Refreshing…');
        await loadPolls();
        UI.setLoading(refresh, false);
      });
    }

    const body = UI.qs('#admin-polls-body');
    if (body) {
      body.addEventListener('click', function (event) {
        const edit = event.target.closest('[data-edit-poll]');
        if (edit) {
          const id = Number(edit.getAttribute('data-edit-poll'));
          const poll = state.polls.find(function (item) { return Number(item.id) === id; });
          if (poll) openPollModal(poll);
          return;
        }
        const close = event.target.closest('[data-close-poll]');
        if (close) {
          closePoll(Number(close.getAttribute('data-close-poll')));
          return;
        }
        const remove = event.target.closest('[data-delete-poll]');
        if (remove) deletePoll(Number(remove.getAttribute('data-delete-poll')));
      });
    }

    const form = UI.qs('#poll-form');
    if (!form) return;
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      UI.clearFormErrors(form);
      const values = UI.formValues(form);
      const editing = Boolean(state.editPollId);
      const existing = editing ? state.polls.find(function (poll) { return Number(poll.id) === Number(state.editPollId); }) : null;
      const hasVotes = Boolean(existing && Number(existing.total_votes) > 0);
      const options = String(values.options || '').split('\n').map(function (line) { return line.trim(); }).filter(Boolean);

      if (!values.title || values.title.trim().length < 5) {
        UI.setFieldError(UI.qs('[name="title"]', form), 'Enter a poll title of at least 5 characters.');
        return;
      }
      if (!hasVotes && options.length < 2) {
        UI.setFieldError(UI.qs('[name="options"]', form), 'Add at least two voting options, one per line.');
        return;
      }
      if (options.length > 8) {
        UI.setFieldError(UI.qs('[name="options"]', form), 'Use eight options or fewer.');
        return;
      }

      const payload = {
        title: values.title.trim(),
        description: values.description ? values.description.trim() : '',
        starts_at: values.starts_at || null,
        ends_at: values.ends_at || null,
        is_active: UI.qs('[name="is_active"]', form).checked
      };
      if (!hasVotes) payload.options = options;

      const button = UI.qs('#save-poll');
      UI.setLoading(button, true, editing ? 'Saving…' : 'Creating…');
      try {
        const response = editing
          ? await Api.admin.updatePoll(state.editPollId, payload)
          : await Api.admin.createPoll(payload);
        UI.toast((response && response.message) || 'Poll saved.', 'success');
        UI.closeDialog('poll-modal');
        await Promise.allSettled([loadPolls(), loadOverview()]);
      } catch (error) {
        if (error.errors) UI.applyServerErrors(form, error.errors);
        UI.toast(error.message || 'The poll could not be saved.', 'error');
      } finally {
        if (button && button.isConnected) UI.setLoading(button, false);
      }
    });
  }

  /* ------------------------------------------------------------ Analytics */

  function renderAnalyticsMetrics(data) {
    const container = UI.qs('#analytics-metrics');
    if (!container) return;
    const summary = data.summary || {};
    container.innerHTML = [
      UI.metricCard({
        label: 'Complaints in period',
        value: summary.total || 0,
        meta: `${UI.formatNumber(summary.resolved || 0)} resolved · ${UI.formatNumber(summary.in_progress || 0)} in progress`,
        icon: 'clipboard',
        tone: 'navy'
      }),
      UI.metricCard({
        label: 'Resolution rate',
        value: UI.percent(summary.resolution_rate || 0),
        raw: true,
        meta: summary.total ? `${UI.formatNumber(summary.resolved || 0)} of ${UI.formatNumber(summary.total || 0)} complaints` : 'No complaints in this period',
        icon: 'trending-up',
        tone: 'green'
      }),
      UI.metricCard({
        label: 'Average resolution',
        value: hoursText(summary.avg_resolution_hours),
        raw: true,
        meta: 'From submission to resolution',
        icon: 'clock',
        tone: 'blue'
      }),
      UI.metricCard({
        label: 'Average update time',
        value: hoursText(summary.avg_update_hours),
        raw: true,
        meta: 'From submission to the latest update',
        icon: 'refresh',
        tone: 'teal'
      })
    ].join('');
  }

  function renderAnalytics(data) {
    renderAnalyticsMetrics(data);

    const days = Number(state.analyticsRange);
    const rangeLabel = days === 0 ? 'all recorded time' : `the last ${days} days`;
    setText('#admin-analytics-summary', `${UI.formatNumber((data.summary || {}).total || 0)} complaints recorded across ${rangeLabel}.`);

    const trend = UI.qs('#analytics-trend');
    if (trend) {
      trend.innerHTML = Charts.line(data.trend || [], {
        height: 230,
        color: '#284b68',
        label: 'Complaints recorded in the selected reporting period',
        emptyMessage: 'No complaints were recorded in this period.'
      });
    }

    const categories = UI.qs('#analytics-categories');
    if (categories) {
      const items = (data.categories || []).map(function (row) {
        return { label: UI.categoryLabel(row.key || row.label), value: Number(row.value) || 0 };
      });
      categories.innerHTML = items.length
        ? Charts.hbar(items, { label: 'Complaints grouped by civic category' })
        : Charts.empty('No complaints were recorded in this period.');
    }

    const areas = UI.qs('#analytics-areas');
    if (areas) {
      const items = (data.areas || []).map(function (row) {
        return { label: row.label || 'Unspecified', value: Number(row.value) || 0 };
      });
      areas.innerHTML = items.length
        ? Charts.hbar(items, { label: 'Complaint volume by area' })
        : Charts.empty('No complaint locations were recorded in this period.');
    }

    const priorities = UI.qs('#analytics-priorities');
    if (priorities) {
      const lookup = {};
      (data.priorities || []).forEach(function (row) { lookup[row.key || row.label] = Number(row.value) || 0; });
      const items = [
        { label: 'High', value: lookup.high || 0, color: '#b56b6b' },
        { label: 'Medium', value: lookup.medium || 0, color: '#c58b35' },
        { label: 'Low', value: lookup.low || 0, color: '#5d8d84' }
      ];
      const total = items.reduce(function (sum, item) { return sum + item.value; }, 0);
      priorities.innerHTML = total
        ? Charts.donut(items, {
          label: 'Complaint priority distribution',
          centerValue: UI.formatNumber(total),
          centerLabel: 'Complaints'
        })
        : Charts.empty('No complaints were recorded in this period.');
    }

    const citizens = UI.qs('#analytics-citizens');
    if (citizens) {
      citizens.innerHTML = Charts.line(data.citizens_trend || [], {
        height: 230,
        color: '#5d8d84',
        label: 'Citizen accounts created over the last twelve months',
        emptyMessage: 'No citizen accounts have been created yet.'
      });
    }

    const serviceCategories = UI.qs('#analytics-service-categories');
    if (serviceCategories) {
      const items = (data.service_categories || []).map(function (row) {
        return { label: row.label || 'Uncategorised', value: Number(row.value) || 0 };
      });
      serviceCategories.innerHTML = items.length
        ? Charts.hbar(items, { label: 'Published city services by category' })
        : Charts.empty('No published city services yet.');
    }

    const officersBody = UI.qs('#analytics-officers-body');
    if (officersBody) {
      const officers = data.officers || [];
      officersBody.innerHTML = officers.length
        ? officers.map(function (officer) {
          return `<tr>
            <td><span class="cell-strong">${UI.esc(officer.full_name)}</span></td>
            <td>${officer.department ? UI.esc(officer.department) : '<span class="muted">Not set</span>'}</td>
            <td class="num">${UI.formatNumber(officer.assigned || 0)}</td>
            <td class="num">${UI.formatNumber(officer.resolved || 0)}</td>
            <td class="num">${UI.formatNumber(officer.open || 0)}</td>
            <td>${UI.esc(hoursText(officer.avg_resolution_hours))}</td>
          </tr>`;
        }).join('')
        : emptyRow(6, { icon: 'user-check', title: 'No officer records', message: 'Provision officer accounts to measure performance.' });
      tableCheck(UI.qs('#analytics-officers-table'));
    }

    const pollsBody = UI.qs('#analytics-polls-body');
    if (pollsBody) {
      const polls = (data.polls && data.polls.participation) || [];
      pollsBody.innerHTML = polls.length
        ? polls.map(function (poll) {
          return `<tr>
            <td><span class="cell-strong">${UI.esc(poll.title)}</span></td>
            <td>${UI.pollStatusBadge(pollStatus(poll))}</td>
            <td class="num">${UI.formatNumber(poll.options || 0)}</td>
            <td class="num">${UI.formatNumber(poll.votes || 0)}</td>
          </tr>`;
        }).join('')
        : emptyRow(4, { icon: 'vote', title: 'No poll participation', message: 'Create a community poll to collect citizen votes.' });
      tableCheck(UI.qs('#analytics-polls-table'));
    }
  }

  async function loadAnalytics() {
    const request = ++analyticsRequest;
    try {
      const payload = await Api.admin.analytics({ days: state.analyticsRange });
      if (request !== analyticsRequest) return;
      state.analyticsLoaded = true;
      renderAnalytics(payload.data || {});
    } catch (error) {
      if (request !== analyticsRequest) return;
      setText('#admin-analytics-summary', 'Analytics are unavailable right now.');
      setHtml('#analytics-metrics', `<div style="grid-column:1/-1">${UI.errorState({ title: 'Analytics unavailable', message: error.message })}</div>`);
      bindRetry(UI.qs('#analytics-metrics'), loadAnalytics);
      ['#analytics-trend', '#analytics-categories', '#analytics-areas', '#analytics-priorities', '#analytics-citizens', '#analytics-service-categories'].forEach(function (selector) {
        setHtml(selector, `<div class="chart-empty">${UI.esc(error.message || 'The chart could not be loaded.')}</div>`);
      });
    }
  }

  function bindAnalytics() {
    const range = UI.qs('#analytics-range');
    if (range) {
      range.value = String(state.analyticsRange);
      range.addEventListener('change', function () {
        state.analyticsRange = Number(range.value) || 90;
        loadAnalytics();
      });
    }
  }

  /* ------------------------------------------------------------ Activity */

  function activityRow(log) {
    return `<tr>
      <td>
        <span class="cell-strong">${UI.esc(UI.formatDateTime(log.created_at))}</span>
        <span class="cell-sub">${UI.esc(UI.timeAgo(log.created_at))}</span>
      </td>
      <td>
        <span class="cell-strong">${UI.esc(log.actor_name || 'System')}</span>
        <span class="cell-sub">${UI.esc(log.actor_role ? UI.titleCase(log.actor_role) : 'Automated')}</span>
      </td>
      <td><span class="badge badge-neutral">${UI.esc(UI.actionLabel(log.action))}</span></td>
      <td>
        <span class="cell-strong">${UI.esc(log.entity_type ? UI.titleCase(log.entity_type) : '—')}</span>
        <span class="cell-sub">${log.entity_id ? `#${UI.esc(log.entity_id)}` : 'No record id'}</span>
      </td>
      <td><span class="text-xs muted" style="overflow-wrap:anywhere">${UI.esc(detailsText(log.details))}</span></td>
    </tr>`;
  }

  function renderActivity(data) {
    const logs = data.logs || [];
    const pagination = data.pagination || { page: 1, limit: 25, total: logs.length, pages: 1 };
    const body = UI.qs('#admin-activity-body');
    if (body) {
      body.innerHTML = logs.length
        ? logs.map(activityRow).join('')
        : emptyRow(5, {
          icon: 'activity',
          title: 'No activity recorded',
          message: 'Administrative actions will appear here as they happen.'
        });
    }
    tableCheck(UI.qs('#admin-activity-table'));

    const entitySelect = UI.qs('#admin-activity-entity');
    if (entitySelect) {
      const current = entitySelect.value;
      const types = data.entity_types || [];
      entitySelect.innerHTML = `<option value="">All entities</option>${types.map(function (type) {
        return `<option value="${UI.attr(type)}">${UI.esc(UI.titleCase(type))}</option>`;
      }).join('')}`;
      if (current) entitySelect.value = current;
    }

    const total = Number(pagination.total) || 0;
    setHtml('#admin-activity-count', `<strong>${UI.formatNumber(total)}</strong> ${total === 1 ? 'log entry' : 'log entries'} matched`);
    setText('#admin-activity-summary', `${UI.formatNumber(total)} recorded ${total === 1 ? 'action' : 'actions'} in the platform audit log.`);

    UI.renderPagination(UI.qs('#admin-activity-pagination'), pagination, function (page) {
      state.activityPage = page;
      loadActivity();
      const section = UI.qs('#admin-activity');
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function loadActivity() {
    const request = ++activityRequest;
    const body = UI.qs('#admin-activity-body');
    if (body) body.innerHTML = loadingRow(5, 'Loading activity…');
    setText('#admin-activity-count', 'Loading activity…');
    try {
      const payload = await Api.admin.logs({
        page: state.activityPage,
        limit: 25,
        q: state.activityFilters.q,
        entity_type: state.activityFilters.entity_type,
        from: state.activityFilters.from,
        to: state.activityFilters.to
      });
      if (request !== activityRequest) return;
      state.activityLoaded = true;
      renderActivity(payload.data || {});
    } catch (error) {
      if (request !== activityRequest) return;
      if (body) body.innerHTML = errorRow(5, error, 'Activity could not be loaded');
      bindRetry(UI.qs('#admin-activity-table') || document, loadActivity);
      UI.renderPagination(UI.qs('#admin-activity-pagination'), null, function () {});
      setText('#admin-activity-count', 'Activity could not be loaded');
      setText('#admin-activity-summary', 'The audit log is unavailable right now.');
    }
  }

  function readActivityFilters() {
    state.activityFilters = {
      q: (UI.qs('#admin-activity-search') || {}).value ? UI.qs('#admin-activity-search').value.trim() : '',
      entity_type: (UI.qs('#admin-activity-entity') || {}).value || '',
      from: (UI.qs('#admin-activity-from') || {}).value || '',
      to: (UI.qs('#admin-activity-to') || {}).value || ''
    };
  }

  function applyActivityFilters() {
    readActivityFilters();
    state.activityPage = 1;
    loadActivity();
  }

  function bindActivity() {
    const search = UI.qs('#admin-activity-search');
    if (search) search.addEventListener('input', UI.debounce(applyActivityFilters, 340));
    ['#admin-activity-entity', '#admin-activity-from', '#admin-activity-to'].forEach(function (selector) {
      const input = UI.qs(selector);
      if (input) input.addEventListener('change', applyActivityFilters);
    });
    const clear = UI.qs('#clear-activity-filters');
    if (clear) {
      clear.addEventListener('click', function () {
        ['#admin-activity-search', '#admin-activity-entity', '#admin-activity-from', '#admin-activity-to'].forEach(function (selector) {
          const input = UI.qs(selector);
          if (input) input.value = '';
        });
        applyActivityFilters();
      });
    }
    const refresh = UI.qs('#refresh-activity');
    if (refresh) {
      refresh.addEventListener('click', async function () {
        UI.setLoading(refresh, true, 'Refreshing…');
        await loadActivity();
        UI.setLoading(refresh, false);
      });
    }
  }

  /* ------------------------------------------------------------ Settings */

  function renderMapsStatus(enabled) {
    const node = UI.qs('#settings-maps-status');
    if (!node) return;
    node.innerHTML = enabled
      ? `<span data-icon="check-circle" data-icon-size="16">${Icons.icon('check-circle', 16)}</span>
         <span>Google Maps is configured. Interactive maps are available on complaint and service locations.</span>`
      : `<span data-icon="info" data-icon-size="16">${Icons.icon('info', 16)}</span>
         <span>Google Maps is not configured. CivicFlow shows recorded coordinates and directions instead of an interactive map.</span>`;
  }

  async function loadSettings() {
    const form = UI.qs('#settings-form');
    if (!form) return;
    try {
      const payload = await Api.admin.settings();
      const data = payload.data || {};
      const settings = data.settings || {};
      ['platform_name', 'city_name', 'tagline', 'support_email', 'support_phone', 'office_address'].forEach(function (key) {
        const input = form.elements[key];
        if (input) input.value = settings[key] || '';
      });
      renderMapsStatus(Boolean(data.maps_enabled));
      state.settingsLoaded = true;
    } catch (error) {
      UI.toast(error.message || 'Platform settings could not be loaded.', 'error');
      renderMapsStatus(false);
    }
  }

  function bindSettings() {
    const form = UI.qs('#settings-form');
    if (!form) return;
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      UI.clearFormErrors(form);
      const values = UI.formValues(form);
      const payload = {};
      ['platform_name', 'city_name', 'tagline', 'support_email', 'support_phone', 'office_address'].forEach(function (key) {
        payload[key] = values[key] ? String(values[key]).trim() : '';
      });
      if (payload.support_email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.support_email)) {
        UI.setFieldError(UI.qs('[name="support_email"]', form), 'Enter a valid support email address.');
        return;
      }
      const button = UI.qs('#save-settings');
      UI.setLoading(button, true, 'Saving…');
      try {
        const response = await Api.admin.updateSettings(payload);
        UI.toast((response && response.message) || 'Platform settings updated.', 'success');
        await loadSettings();
      } catch (error) {
        if (error.errors) UI.applyServerErrors(form, error.errors);
        UI.toast(error.message || 'The settings could not be saved.', 'error');
      } finally {
        if (button && button.isConnected) UI.setLoading(button, false);
      }
    });
  }

  /* ------------------------------------------------------------ Tabs */

  function currentTab() {
    const hash = window.location.hash.replace(/^#/, '');
    return TABS.includes(hash) ? hash : 'overview';
  }

  function ensureTab(tab) {
    if (tab === 'overview' && !state.overviewLoaded) loadOverview();
    if (tab === 'complaints' && !state.complaintsLoaded) loadComplaints();
    if (tab === 'users' && !state.usersLoaded) loadUsers();
    if (tab === 'officers' && !state.officers.length) loadOfficers();
    if (tab === 'services' && !state.servicesLoaded) {
      loadCategories();
      loadServices();
    }
    if (tab === 'polls' && !state.pollsLoaded) loadPolls();
    if (tab === 'analytics' && !state.analyticsLoaded) loadAnalytics();
    if (tab === 'activity' && !state.activityLoaded) loadActivity();
    if (tab === 'settings' && !state.settingsLoaded) loadSettings();
  }

  function setTab(tab) {
    const active = TABS.includes(tab) ? tab : 'overview';
    state.tab = active;
    UI.qsa('[data-admin-section]').forEach(function (section) {
      section.hidden = section.getAttribute('data-admin-section') !== active;
    });
    UI.qsa('[data-admin-tab]').forEach(function (link) {
      const isActive = link.getAttribute('data-admin-tab') === active;
      link.classList.toggle('is-active', isActive);
      link.setAttribute('aria-selected', String(isActive));
      link.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    ensureTab(active);
  }

  function bindTabs() {
    const tabs = UI.qsa('[data-admin-tab]');
    tabs.forEach(function (link, index) {
      link.addEventListener('click', function () {
        if (link.getAttribute('href') === window.location.hash) setTab(link.getAttribute('data-admin-tab'));
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

  function reloadActiveTab() {
    const tab = state.tab;
    if (tab === 'overview') return loadOverview();
    if (tab === 'complaints') return loadComplaints();
    if (tab === 'users') return loadUsers();
    if (tab === 'officers') return loadOfficers();
    if (tab === 'services') return Promise.allSettled([loadCategories(), loadServices()]);
    if (tab === 'polls') return loadPolls();
    if (tab === 'analytics') return loadAnalytics();
    if (tab === 'activity') return loadActivity();
    if (tab === 'settings') return loadSettings();
    return Promise.resolve();
  }

  function bindRefresh() {
    const refresh = UI.qs('#refresh-admin');
    if (!refresh) return;
    refresh.addEventListener('click', async function () {
      UI.setLoading(refresh, true, 'Refreshing…');
      await Promise.allSettled([reloadActiveTab()]);
      UI.setLoading(refresh, false);
      UI.toast('Administration data refreshed.', 'success');
    });
  }

  /* ------------------------------------------------------------ Init */

  function bindDialogs() {
    UI.qsa('[data-close-modal]').forEach(function (button) {
      button.addEventListener('click', function () {
        UI.closeDialog(button.getAttribute('data-close-modal'));
      });
    });
    UI.qsa('dialog').forEach(function (dialog) {
      dialog.addEventListener('click', function (event) {
        if (event.target === dialog) dialog.close();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    Icons.mount(document);
    const user = await window.CivicShell.ready;
    if (!user) return;
    state.selfId = user.id;

    bindDialogs();
    bindTabs();
    bindComplaintFilters();
    bindDrawer();
    bindUsers();
    bindOfficerModal();
    bindServices();
    bindCategories();
    bindPolls();
    bindAnalytics();
    bindActivity();
    bindSettings();
    bindRefresh();

    await Promise.allSettled([loadOverview(), loadOfficers()]);
    setTab(currentTab());
  });

  window.addEventListener('pagehide', revokePhoto);
})();
