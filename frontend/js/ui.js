/* Shared UI helpers: formatting, feedback, dialogs, tables, pagination, forms */
(function () {
  'use strict';

  const Icons = window.CivicIcons;

  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function attr(value) {
    return esc(value).replace(/\n/g, ' ');
  }

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }

  function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const text = String(value);
    const normalised = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text) ? text.replace(' ', 'T') : text;
    const date = new Date(normalised);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const DATE_SHORT_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  const TIME_FMT = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
  const DATE_TIME_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  function formatDate(value) {
    const date = toDate(value);
    return date ? DATE_FMT.format(date) : '—';
  }

  function formatDateShort(value) {
    const date = toDate(value);
    return date ? DATE_SHORT_FMT.format(date) : '—';
  }

  function formatTime(value) {
    const date = toDate(value);
    return date ? TIME_FMT.format(date) : '—';
  }

  function formatDateTime(value) {
    const date = toDate(value);
    return date ? DATE_TIME_FMT.format(date) : '—';
  }

  function timeAgo(value) {
    const date = toDate(value);
    if (!date) return '—';
    const seconds = Math.round((Date.now() - date.getTime()) / 1000);
    if (seconds < 45) return 'Just now';
    if (seconds < 90) return '1 minute ago';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    const weeks = Math.round(days / 7);
    if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    return formatDate(date);
  }

  function formatHours(hours) {
    if (hours === null || hours === undefined || Number.isNaN(Number(hours))) return 'Not yet measured';
    const value = Number(hours);
    if (value < 1) return 'Under an hour';
    if (value < 24) return `${value.toFixed(value < 10 ? 1 : 0).replace(/\.0$/, '')} hrs`;
    const days = value / 24;
    return `${days.toFixed(days < 10 ? 1 : 0).replace(/\.0$/, '')} days`;
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    return new Intl.NumberFormat('en-US').format(number);
  }

  function percent(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${Math.round(number * 10) / 10}%` : '0%';
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  function titleCase(value) {
    return String(value || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
  }

  function statusLabel(status) {
    return (Icons.statusLabels && Icons.statusLabels[status]) || titleCase(status);
  }

  function statusBadge(status, label) {
    return `<span class="badge badge-${attr(status)}">${esc(label || statusLabel(status))}</span>`;
  }

  function priorityBadge(priority) {
    const label = (Icons.priorityLabels && Icons.priorityLabels[priority]) || titleCase(priority);
    return `<span class="badge badge-${attr(priority || 'low')}">${esc(label)}</span>`;
  }

  function roleBadge(role) {
    const labels = { citizen: 'Citizen', officer: 'Officer', admin: 'Administrator' };
    return `<span class="badge badge-role role-${attr(role)}">${esc(labels[role] || titleCase(role))}</span>`;
  }

  function pollStatusBadge(status) {
    const labels = { active: 'Open for voting', scheduled: 'Scheduled', closed: 'Closed' };
    return `<span class="badge badge-${attr(status)}">${esc(labels[status] || titleCase(status))}</span>`;
  }

  function categoryLabel(category) {
    return (Icons.categoryLabels && Icons.categoryLabels[category]) || titleCase(category);
  }

  function categoryIcon(category) {
    return (Icons.categories && Icons.categories[category]) || 'map-pin';
  }

  function icon(name, size, className) {
    return Icons.icon(name, size, className);
  }

  function emptyState(options) {
    const opts = options || {};
    const action = opts.action
      ? `<a class="btn ${opts.action.variant || 'btn-primary'} btn-sm" href="${attr(opts.action.href || '#')}">${opts.action.icon ? icon(opts.action.icon, 14) : ''}${esc(opts.action.label)}</a>`
      : '';
    return `<div class="empty-state">
      <div class="icon-tile ${opts.tone || ''}">${icon(opts.icon || 'inbox', 22)}</div>
      <h3>${esc(opts.title || 'Nothing here yet')}</h3>
      <p>${esc(opts.message || '')}</p>
      ${action}
    </div>`;
  }

  function errorState(options) {
    const opts = options || {};
    return `<div class="empty-state">
      <div class="icon-tile red">${icon('alert-triangle', 22)}</div>
      <h3>${esc(opts.title || 'Something went wrong')}</h3>
      <p>${esc(opts.message || 'The data could not be loaded. Try again in a moment.')}</p>
      <button class="btn btn-secondary btn-sm" type="button" data-retry>${icon('refresh', 14)}Try again</button>
    </div>`;
  }

  function skeletonRows(count) {
    return Array.from({ length: count || 4 }).map(function () {
      return '<div class="skeleton skeleton-row"></div>';
    }).join('');
  }

  function skeletonCards(count, className) {
    return Array.from({ length: count || 3 }).map(function () {
      return `<div class="skeleton ${className || 'skeleton-card'}"></div>`;
    }).join('');
  }

  function spinner(size, dark) {
    return `<span class="spinner ${size === 'sm' ? 'sm' : ''} ${dark ? 'dark' : ''}" role="status" aria-label="Loading"></span>`;
  }

  function setLoading(button, loading, loadingLabel) {
    if (!button) return;
    if (loading) {
      if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.classList.add('is-loading');
      button.innerHTML = `${spinner('sm')}<span class="btn-label">${esc(loadingLabel || 'Please wait…')}</span>`;
    } else {
      button.disabled = false;
      button.classList.remove('is-loading');
      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
      }
    }
  }

  function toast(message, type, timeout) {
    if (!message) return;
    let root = qs('.toast-root');
    if (!root) {
      root = document.createElement('div');
      root.className = 'toast-root';
      root.setAttribute('aria-live', 'polite');
      document.body.appendChild(root);
    }
    const tone = type || 'info';
    const iconName = { success: 'check-circle', error: 'alert-circle', warning: 'alert-triangle', info: 'info' }[tone] || 'info';
    const element = document.createElement('div');
    element.className = `toast toast-${tone}`;
    element.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    element.innerHTML = `${icon(iconName, 17)}<span>${esc(message)}</span>`;
    root.appendChild(element);
    window.setTimeout(function () {
      element.classList.add('is-leaving');
      window.setTimeout(function () { element.remove(); }, 220);
    }, timeout || 4200);
    return element;
  }

  let confirmDialog = null;

  function confirmDialogBox(options) {
    const opts = options || {};
    if (!confirmDialog) {
      confirmDialog = document.createElement('dialog');
      confirmDialog.className = 'modal';
      document.body.appendChild(confirmDialog);
    }
    confirmDialog.innerHTML = `
      <div class="modal-head">
        <div>
          <h2 class="modal-title">${esc(opts.title || 'Please confirm')}</h2>
          <p class="modal-subtitle">${esc(opts.subtitle || 'This action needs your confirmation.')}</p>
        </div>
        <button class="modal-close" type="button" data-confirm-cancel aria-label="Close">${icon('x', 18)}</button>
      </div>
      <div class="modal-body"><p class="text-secondary" style="font-size:.85rem;line-height:1.65">${esc(opts.message || '')}</p></div>
      <div class="modal-foot">
        <button class="btn btn-secondary" type="button" data-confirm-cancel>${esc(opts.cancelLabel || 'Cancel')}</button>
        <button class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'}" type="button" data-confirm-ok>${esc(opts.confirmLabel || 'Confirm')}</button>
      </div>`;

    return new Promise(function (resolve) {
      function finish(result) {
        qsa('[data-confirm-ok], [data-confirm-cancel]', confirmDialog).forEach(function (node) { node.blur(); });
        if (confirmDialog.open) confirmDialog.close();
        confirmDialog.removeEventListener('cancel', onCancel);
        resolve(result);
      }
      function onCancel(event) { event.preventDefault(); finish(false); }
      confirmDialog.addEventListener('cancel', onCancel);
      qsa('[data-confirm-cancel]', confirmDialog).forEach(function (node) {
        node.addEventListener('click', function () { finish(false); }, { once: true });
      });
      qs('[data-confirm-ok]', confirmDialog).addEventListener('click', function () { finish(true); }, { once: true });
      confirmDialog.showModal();
    });
  }

  function openDialog(id) {
    const dialog = typeof id === 'string' ? document.getElementById(id) : id;
    if (dialog && !dialog.open) dialog.showModal();
    return dialog;
  }

  function closeDialog(id) {
    const dialog = typeof id === 'string' ? document.getElementById(id) : id;
    if (dialog && dialog.open) dialog.close();
  }

  function clearFormErrors(form) {
    qsa('.field.has-error', form).forEach(function (field) { field.classList.remove('has-error'); });
    qsa('.field-error', form).forEach(function (node) { node.remove(); });
    const summary = qs('.form-error-summary', form);
    if (summary) summary.remove();
  }

  function setFieldError(input, message) {
    if (!input) return;
    const field = input.closest('.field') || input.parentElement;
    if (!field) return;
    field.classList.add('has-error');
    let node = qs('.field-error', field);
    if (!node) {
      node = document.createElement('p');
      node.className = 'field-error';
      field.appendChild(node);
    }
    node.textContent = message;
    input.setAttribute('aria-invalid', 'true');
  }

  function applyServerErrors(form, errors) {
    if (!form || !errors) return;
    clearFormErrors(form);
    const list = [];
    Object.keys(errors).forEach(function (key) {
      const input = form.querySelector(`[name="${key}"]`) || form.querySelector(`[name="${key}[]"]`);
      if (input) setFieldError(input, errors[key]);
      list.push(errors[key]);
    });
    if (list.length) {
      const summary = document.createElement('div');
      summary.className = 'form-error-summary';
      summary.setAttribute('role', 'alert');
      summary.innerHTML = `${icon('alert-triangle', 16)}<div><strong>Please check the following</strong><ul>${list.map(function (item) { return `<li>${esc(item)}</li>`; }).join('')}</ul></div>`;
      form.insertBefore(summary, form.firstChild);
      const first = qs('.field.has-error input, .field.has-error select, .field.has-error textarea', form);
      if (first) first.focus({ preventScroll: false });
    }
  }

  function formValues(form) {
    const values = {};
    new FormData(form).forEach(function (value, key) {
      if (key.endsWith('[]')) {
        const clean = key.slice(0, -2);
        if (!values[clean]) values[clean] = [];
        values[clean].push(value);
      } else if (Object.prototype.hasOwnProperty.call(values, key)) {
        if (!Array.isArray(values[key])) values[key] = [values[key]];
        values[key].push(value);
      } else {
        values[key] = value;
      }
    });
    return values;
  }

  function debounce(fn, delay) {
    let timer = null;
    return function () {
      const args = arguments;
      const context = this;
      window.clearTimeout(timer);
      timer = window.setTimeout(function () { fn.apply(context, args); }, delay || 320);
    };
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        textarea.remove();
      }
    });
  }

  function metricCard(options) {
    const opts = options || {};
    const tone = opts.tone ? ` ${opts.tone}` : '';
    const value = opts.value === undefined || opts.value === null || opts.value === ''
      ? '—'
      : (opts.raw ? String(opts.value) : formatNumber(opts.value));
    return `<article class="stat-card">
      ${opts.icon ? `<span class="stat-icon${tone}">${icon(opts.icon, 18)}</span>` : ''}
      <span class="stat-label">${esc(opts.label || '')}</span>
      <strong class="stat-value">${esc(value)}</strong>
      ${opts.meta ? `<span class="stat-meta">${esc(opts.meta)}</span>` : ''}
    </article>`;
  }

  function complaintCard(complaint, options) {
    const opts = options || {};
    const href = `${opts.hrefBase || 'complaint-details.html'}?id=${Number(complaint.id)}`;
    const location = complaint.address || complaint.area || 'Location recorded';
    const description = complaint.description || complaint.latest_update || 'Open the complaint to review its full history.';
    const priority = complaint.priority && complaint.priority !== 'medium'
      ? priorityBadge(complaint.priority)
      : '';
    return `<article class="complaint-card ${complaint.priority === 'high' ? 'is-priority-high' : ''}">
      <div class="complaint-card-main">
        <div class="complaint-card-head">
          <span class="track-code">${icon('hash', 10)}${esc(complaint.tracking_code || `#${complaint.id}`)}</span>
          ${statusBadge(complaint.status, complaint.status_label)}
          ${priority}
          <span class="badge badge-neutral">${esc(complaint.category_label || categoryLabel(complaint.category))}</span>
        </div>
        <h3 class="complaint-title"><a href="${attr(href)}">${esc(complaint.title || 'Untitled complaint')}</a></h3>
        <p class="complaint-excerpt">${esc(description)}</p>
        <div class="complaint-meta">
          <span>${icon('map-pin', 12)}${esc(location)}</span>
          <span>${icon('clock', 12)}Submitted ${esc(timeAgo(complaint.created_at))}</span>
          ${complaint.assigned_officer_name ? `<span>${icon('user-check', 12)}<strong>${esc(complaint.assigned_officer_name)}</strong></span>` : `<span>${icon('user-check', 12)}Awaiting assignment</span>`}
        </div>
        ${complaint.latest_update ? `<p class="form-note" style="margin-top:7px">Latest update: ${esc(complaint.latest_update)}</p>` : ''}
      </div>
      <div class="complaint-side">
        <span class="relative-time">${esc(formatDate(complaint.created_at))}</span>
        <a class="btn btn-secondary btn-sm" href="${attr(href)}">View details${icon('arrow-right', 13)}</a>
      </div>
    </article>`;
  }

  function pagination(paginationData, onPage) {
    const data = paginationData || {};
    const page = Number(data.page) || 1;
    const pages = Number(data.pages) || 1;
    const total = Number(data.total) || 0;
    const limit = Number(data.limit) || 10;
    if (total === 0) return '';
    const from = (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);
    const pagesToShow = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(pages, start + 4);
    for (let i = start; i <= end; i += 1) pagesToShow.push(i);

    const buttons = pagesToShow.map(function (number) {
      return `<button class="page-btn ${number === page ? 'is-active' : ''}" type="button" data-page="${number}" ${number === page ? 'aria-current="page"' : ''}>${number}</button>`;
    }).join('');

    const wrapper = document.createElement('div');
    wrapper.className = 'pagination';
    wrapper.innerHTML = `
      <p class="pagination-info">Showing ${from}–${to} of ${formatNumber(total)}</p>
      <div class="pagination-controls">
        <button class="page-btn" type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Previous page">${icon('chevron-left', 15)}</button>
        ${buttons}
        <button class="page-btn" type="button" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="Next page">${icon('chevron-right', 15)}</button>
      </div>`;
    wrapper.addEventListener('click', function (event) {
      const button = event.target.closest('[data-page]');
      if (!button || button.disabled) return;
      const target = Number(button.dataset.page);
      if (!target || target === page) return;
      onPage(target);
    });
    return wrapper;
  }

  function renderPagination(container, paginationData, onPage) {
    if (!container) return;
    container.innerHTML = '';
    const node = pagination(paginationData, onPage);
    if (node) container.appendChild(node);
  }

  function responsiveTable(table) {
    if (!table) return;
    const headers = qsa('thead th', table).map(function (th) { return th.textContent.trim(); });
    qsa('tbody tr', table).forEach(function (row) {
      qsa('td', row).forEach(function (cell, index) {
        if (!cell.hasAttribute('data-label') && headers[index]) cell.setAttribute('data-label', headers[index]);
      });
    });
  }

  function stepProgress(status) {
    const steps = [
      { key: 'submitted', label: 'Submitted', icon: 'send' },
      { key: 'in_progress', label: 'In progress', icon: 'sliders' },
      { key: 'resolved', label: 'Resolved', icon: 'check' }
    ];
    if (status === 'rejected') {
      return `<div class="steps is-rejected">
        <div class="step is-done"><span class="step-dot">${icon('check', 10)}</span><span class="step-label">Submitted</span></div>
        <div class="step is-done"><span class="step-dot">${icon('x', 10)}</span><span class="step-label">Rejected</span></div>
      </div>`;
    }
    const order = { submitted: 0, in_progress: 1, resolved: 2 };
    const current = order[status] === undefined ? 0 : order[status];
    return `<div class="steps">${steps.map(function (step, index) {
      const state = index < current ? 'is-done' : index === current ? 'is-active' : '';
      return `<div class="step ${state}"><span class="step-dot">${icon(index < current ? 'check' : step.icon, 10)}</span><span class="step-label">${step.label}</span></div>`;
    }).join('')}</div>`;
  }

  function eventIcon(event) {
    if (event.type === 'status') {
      if (event.new_status === 'resolved') return 'check';
      if (event.new_status === 'rejected') return 'x';
      return 'refresh';
    }
    if (event.type === 'assignment') return 'user-check';
    if (event.type === 'internal_note') return 'lock';
    return 'message';
  }

  function eventTone(event) {
    if (event.type === 'status') {
      if (event.new_status === 'resolved') return 'is-resolved';
      if (event.new_status === 'rejected') return 'is-rejected';
      return 'is-status';
    }
    if (event.type === 'internal_note') return 'is-internal';
    return '';
  }

  function timeline(events) {
    if (!events || !events.length) return emptyState({ icon: 'clock', title: 'No activity yet', message: 'Updates to this complaint will appear here.' });
    return `<div class="timeline">${events.map(function (event) {
      return `<div class="timeline-item">
        <div class="timeline-rail"><span class="timeline-dot ${eventTone(event)}">${icon(eventIcon(event), 12)}</span></div>
        <div class="timeline-content ${event.type === 'internal_note' ? 'is-internal' : ''}">
          <p class="timeline-title">${esc(event.title || 'Update')}</p>
          ${event.description ? `<p class="timeline-description">${esc(event.description)}</p>` : ''}
          <p class="timeline-meta">${esc(event.actor || 'System')}${event.actor_role ? ` · ${esc(titleCase(event.actor_role))}` : ''} · ${esc(formatDateTime(event.created_at))}</p>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  function severityForAction(action) {
    if (!action) return '';
    if (action.includes('rejected') || action.includes('deactivated') || action.includes('deleted')) return 'red';
    if (action.includes('resolved') || action.includes('created') || action.includes('registered')) return 'green';
    if (action.includes('assigned') || action.includes('updated') || action.includes('status')) return 'blue';
    if (action.includes('settings') || action.includes('role')) return 'amber';
    return 'teal';
  }

  function actionIcon(action) {
    if (!action) return 'activity';
    if (action.startsWith('complaint')) return 'clipboard';
    if (action.startsWith('poll')) return 'vote';
    if (action.startsWith('service_category')) return 'tag';
    if (action.startsWith('service')) return 'building';
    if (action.startsWith('user')) return 'user';
    if (action.startsWith('officer')) return 'user-check';
    if (action.startsWith('settings')) return 'settings';
    if (action.startsWith('report')) return 'download';
    return 'activity';
  }

  function actionLabel(action) {
    if (!action) return 'Activity';
    return titleCase(action.replace(/^.*?\./, ''));
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function safeUrl(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url, window.location.origin);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch { return ''; }
  }

  function tr(status) {
    if (status === 'active') return 'Open';
    if (status === 'closed') return 'Closed';
    if (status === 'scheduled') return 'Scheduled';
    return titleCase(status);
  }

  function ensureToastRoot() {
    if (!qs('.toast-root')) {
      const root = document.createElement('div');
      root.className = 'toast-root';
      root.setAttribute('aria-live', 'polite');
      document.body.appendChild(root);
    }
  }

  window.CivicUI = {
    esc: esc,
    attr: attr,
    qs: qs,
    qsa: qsa,
    toDate: toDate,
    formatDate: formatDate,
    formatDateShort: formatDateShort,
    formatTime: formatTime,
    formatDateTime: formatDateTime,
    timeAgo: timeAgo,
    formatHours: formatHours,
    formatNumber: formatNumber,
    percent: percent,
    initials: initials,
    titleCase: titleCase,
    statusLabel: statusLabel,
    statusBadge: statusBadge,
    priorityBadge: priorityBadge,
    roleBadge: roleBadge,
    pollStatusBadge: pollStatusBadge,
    categoryLabel: categoryLabel,
    categoryIcon: categoryIcon,
    icon: icon,
    emptyState: emptyState,
    errorState: errorState,
    skeletonRows: skeletonRows,
    skeletonCards: skeletonCards,
    spinner: spinner,
    setLoading: setLoading,
    toast: toast,
    ensureToastRoot: ensureToastRoot,
    confirm: confirmDialogBox,
    openDialog: openDialog,
    closeDialog: closeDialog,
    clearFormErrors: clearFormErrors,
    setFieldError: setFieldError,
    applyServerErrors: applyServerErrors,
    formValues: formValues,
    debounce: debounce,
    copyText: copyText,
    pagination: pagination,
    renderPagination: renderPagination,
    responsiveTable: responsiveTable,
    stepProgress: stepProgress,
    timeline: timeline,
    severityForAction: severityForAction,
    actionIcon: actionIcon,
    actionLabel: actionLabel,
    metricCard: metricCard,
    complaintCard: complaintCard,
    download: download,
    safeUrl: safeUrl,
    pollStatusText: tr
  };
})();
