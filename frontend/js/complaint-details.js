/* Complaint details: protected photo, status progress, map and public timeline */
(function () {
  'use strict';

  const UI = window.CivicUI;
  const Api = window.CivicApi;
  const Icons = window.CivicIcons;
  const Maps = window.CivicMaps;

  let complaint = null;
  let photoUrl = null;

  function complaintId() {
    const raw = new URLSearchParams(window.location.search).get('id');
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }

  function infoItem(label, value, options) {
    const opts = options || {};
    return `<div class="info-item${opts.wide ? ' wide' : ''}">
      <dt>${UI.esc(label)}</dt>
      <dd${opts.muted ? ' class="muted"' : ''}>${value}</dd>
    </div>`;
  }

  function showError(title, message, action) {
    const loading = UI.qs('#detail-loading');
    const content = UI.qs('#detail-content');
    const errorBox = UI.qs('#detail-error');
    if (loading) loading.hidden = true;
    if (content) content.hidden = true;
    if (!errorBox) return;
    errorBox.hidden = false;
    errorBox.innerHTML = UI.errorState({
      icon: 'alert-circle',
      title: title,
      message: message,
      action: action || '<a class="btn btn-primary btn-sm" href="my-complaints.html">Back to my complaints</a>'
    });
  }

  function renderHead(data) {
    UI.qs('#head-tracking').innerHTML = `${Icons.icon('hash', 11)}${UI.esc(data.tracking_code || `#${data.id}`)}`;
    UI.qs('#head-crumb').textContent = data.tracking_code || 'Complaint';
    UI.qs('#head-status').innerHTML = UI.statusBadge(data.status, data.status_label);
    UI.qs('#head-priority').innerHTML = UI.priorityBadge(data.priority);
    UI.qs('#head-category').textContent = data.category_label || UI.categoryLabel(data.category);
    UI.qs('#head-title').textContent = data.title || 'Untitled complaint';

    UI.qs('#head-submitted').innerHTML = `${Icons.icon('calendar', 13)}Submitted ${UI.esc(UI.formatDateTime(data.created_at))}`;
    UI.qs('#head-updated').innerHTML = `${Icons.icon('refresh', 13)}Updated ${UI.esc(UI.timeAgo(data.updated_at))}`;
    const officer = UI.qs('#head-officer');
    officer.innerHTML = data.assigned_officer_name
      ? `${Icons.icon('user-check', 13)}${UI.esc(data.assigned_officer_name)}${data.assigned_officer_department ? ` · ${UI.esc(data.assigned_officer_department)}` : ''}`
      : `${Icons.icon('user-check', 13)}Awaiting officer assignment`;

    UI.qs('#status-progress').innerHTML = `<div class="cluster" style="justify-content:space-between;gap:24px">
      <div class="grow">${UI.stepProgress(data.status)}</div>
      <div class="cluster" style="gap:8px">
        <span class="text-xs muted">Current status</span>
        ${UI.statusBadge(data.status, data.status_label)}
      </div>
    </div>`;

    UI.qs('#reference-code').value = data.tracking_code || '';
    document.title = `${data.tracking_code || 'Complaint'} · CivicFlow`;
    if (window.CivicShell.setTitle) window.CivicShell.setTitle('Complaint details');
  }

  function renderDetails(data) {
    UI.qs('#complaint-description').textContent = data.description || 'No description was provided.';

    const coords = Maps.hasCoordinates(data.latitude, data.longitude)
      ? `${Number(data.latitude).toFixed(6)}, ${Number(data.longitude).toFixed(6)}`
      : 'No coordinates recorded';
    UI.qs('#detail-info').innerHTML = [
      infoItem('Category', `${Icons.icon(UI.categoryIcon(data.category), 14)}${UI.esc(data.category_label || UI.categoryLabel(data.category))}`),
      infoItem('Area or locality', data.area ? UI.esc(data.area) : 'Not provided', { muted: !data.area }),
      infoItem('Address or landmark', data.address ? UI.esc(data.address) : 'Not provided', { wide: true, muted: !data.address }),
      infoItem('Coordinates', UI.esc(coords), { wide: true, muted: !coords.startsWith('No') })
    ].join('');

    UI.qs('#side-info').innerHTML = [
      infoItem('Status', UI.statusBadge(data.status, data.status_label)),
      infoItem('Priority', UI.priorityBadge(data.priority)),
      infoItem('Assigned officer', data.assigned_officer_name ? UI.esc(data.assigned_officer_name) : 'Not assigned yet', { muted: !data.assigned_officer_name }),
      infoItem('Department', data.assigned_officer_department ? UI.esc(data.assigned_officer_department) : 'Not available', { muted: !data.assigned_officer_department }),
      infoItem('Submitted', UI.esc(UI.formatDate(data.created_at))),
      infoItem('Last updated', UI.esc(UI.formatDateTime(data.updated_at)))
    ].join('');

    const resolutionPanel = UI.qs('#resolution-panel');
    if ((data.status === 'resolved' || data.status === 'rejected') && data.resolution_summary) {
      resolutionPanel.hidden = false;
      UI.qs('#resolution-summary').textContent = data.resolution_summary;
      const heading = UI.qs('#resolution-title');
      if (heading) heading.textContent = data.status === 'resolved' ? 'Resolution' : 'Rejection reason';
      if (data.status === 'rejected') {
        const block = UI.qs('.resolution-block', resolutionPanel);
        if (block) {
          block.style.borderColor = 'var(--error-border)';
          block.style.background = 'var(--error-bg)';
        }
      }
    } else {
      resolutionPanel.hidden = true;
    }

    const subtitle = UI.qs('#map-subtitle');
    if (subtitle) {
      subtitle.textContent = data.address
        ? data.address
        : Maps.hasCoordinates(data.latitude, data.longitude)
          ? 'Coordinates recorded with the complaint.'
          : 'No address or coordinates were recorded for this complaint.';
    }
    const directions = UI.qs('#map-directions');
    const url = Maps.directionsUrl(data.latitude, data.longitude);
    if (url && directions) {
      directions.href = url;
      directions.hidden = false;
    }

    Maps.render(UI.qs('#complaint-map'), {
      lat: data.latitude,
      lng: data.longitude,
      address: data.address || data.area || '',
      label: data.title || 'Complaint location',
      emptyMessage: 'No address or coordinates were recorded for this complaint.'
    });
  }

  async function loadPhoto(id) {
    const section = UI.qs('#photo-section');
    const frame = UI.qs('#photo-frame');
    if (!section || !frame) return;
    section.hidden = false;
    try {
      photoUrl = await Api.issues.photo(id);
      frame.innerHTML = `<img src="${UI.attr(photoUrl)}" alt="Photograph attached to complaint ${UI.attr(complaint.tracking_code || '')}">
        <div class="photo-frame-cap">
          <span>${Icons.icon('lock', 13)}Only you and authorised city staff can view this photograph.</span>
          <a class="text-link" href="${UI.attr(photoUrl)}" target="_blank" rel="noopener noreferrer">Open full size${Icons.icon('external-link', 13)}</a>
        </div>`;
    } catch (error) {
      frame.innerHTML = `<div class="map-fallback" style="min-height:200px">
        <div class="icon-tile red">${Icons.icon('image', 20)}</div>
        <h3>Photograph unavailable</h3>
        <p>${UI.esc(error.message || 'The attached photograph could not be loaded.')}</p>
      </div>`;
    }
  }

  async function loadTimeline(id) {
    const container = UI.qs('#complaint-timeline');
    if (!container) return;
    try {
      const payload = await Api.issues.history(id);
      const events = payload.data.events || [];
      container.innerHTML = UI.timeline(events);
    } catch (error) {
      container.innerHTML = UI.errorState({
        title: 'Timeline could not be loaded',
        message: error.message,
        action: '<button class="btn btn-secondary btn-sm" type="button" data-retry-timeline>Try again</button>'
      });
      const retry = UI.qs('[data-retry-timeline]', container);
      if (retry) retry.addEventListener('click', function () {
        retry.disabled = true;
        loadTimeline(id);
      });
    }
  }

  function bindCopy() {
    const copy = function () {
      if (!complaint || !complaint.tracking_code) return;
      UI.copyText(complaint.tracking_code).then(function () {
        UI.toast('Tracking ID copied to the clipboard.', 'success');
      }).catch(function () {
        UI.toast('Copy failed. Select the tracking ID and copy it manually.', 'error');
      });
    };
    ['#copy-reference', '#copy-reference-2'].forEach(function (selector) {
      const button = UI.qs(selector);
      if (button) button.addEventListener('click', copy);
    });
  }

  async function load() {
    const id = complaintId();
    if (!id) {
      showError('Complaint not found', 'The complaint link is missing a valid reference.');
      return;
    }
    try {
      const payload = await Api.issues.get(id);
      complaint = payload.data.complaint;
      UI.qs('#detail-loading').hidden = true;
      UI.qs('#detail-content').hidden = false;
      renderHead(complaint);
      renderDetails(complaint);
      if (complaint.has_photo) loadPhoto(id);
      loadTimeline(id);
      bindCopy();
    } catch (error) {
      const title = error.status === 403 ? 'You cannot view this complaint' : error.status === 404 ? 'Complaint not found' : 'Complaint could not be loaded';
      const action = error.status === 403 || error.status === 404
        ? '<a class="btn btn-primary btn-sm" href="my-complaints.html">Back to my complaints</a>'
        : '<button class="btn btn-secondary btn-sm" type="button" id="retry-detail">Try again</button>';
      showError(title, error.message, action);
      const retry = UI.qs('#retry-detail');
      if (retry) retry.addEventListener('click', function () {
        UI.qs('#detail-error').hidden = true;
        UI.qs('#detail-loading').hidden = false;
        load();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    Icons.mount(document);
    const user = await window.CivicShell.ready;
    if (!user) return;
    load();
  });

  window.addEventListener('pagehide', function () {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  });
})();
