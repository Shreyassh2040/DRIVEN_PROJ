/* Notification centre: unread filtering, row actions and pagination */
(function () {
  'use strict';

  const UI = window.CivicUI;
  const Api = window.CivicApi;
  const Icons = window.CivicIcons;

  const state = {
    items: [],
    unread: false,
    page: 1,
    unreadCount: 0,
    allTotal: 0,
    pageTotal: 0,
    pages: 1,
    limit: 12,
    loading: false
  };

  function currentRole() {
    const user = window.CivicShell.user && window.CivicShell.user();
    return user ? user.role : 'citizen';
  }

  function iconFor(notification) {
    const type = notification.notification_type || '';
    if (type.indexOf('poll') === 0) return 'vote';
    if (type.indexOf('complaint') === 0) return 'clipboard';
    if (type.indexOf('assignment') === 0) return 'user-check';
    return 'bell';
  }

  function targetFor(notification) {
    const role = currentRole();
    if (notification.related_issue_id) {
      if (role === 'citizen') return `complaint-details.html?id=${Number(notification.related_issue_id)}`;
      if (role === 'officer') return 'officer-dashboard.html#queue';
      return 'admin-dashboard.html#complaints';
    }
    if ((notification.notification_type || '').indexOf('poll') === 0) {
      if (role === 'citizen') return 'polls.html';
      if (role === 'admin') return 'admin-dashboard.html#polls';
      return 'officer-dashboard.html#overview';
    }
    return '';
  }

  function updateChrome() {
    const summary = UI.qs('#notification-summary');
    const unreadCount = UI.qs('#unread-count');
    const allCount = UI.qs('#all-count');
    const markAll = UI.qs('#mark-all-read');
    if (unreadCount) unreadCount.textContent = UI.formatNumber(state.unreadCount);
    if (allCount) allCount.textContent = UI.formatNumber(state.allTotal);
    if (markAll) markAll.disabled = state.unreadCount === 0;
    if (summary) {
      if (!state.pageTotal) {
        summary.textContent = state.unread ? 'No unread notifications.' : 'No notifications have been received yet.';
      } else {
        const from = (state.page - 1) * state.limit + 1;
        const to = Math.min(state.page * state.limit, state.pageTotal);
        summary.textContent = `Showing ${from}–${to} of ${UI.formatNumber(state.pageTotal)} ${state.unread ? 'unread ' : ''}${state.pageTotal === 1 ? 'notification' : 'notifications'}.`;
      }
    }
    UI.qsa('[data-unread]').forEach(function (button) {
      const isUnread = button.dataset.unread === 'true';
      button.classList.toggle('is-active', isUnread === state.unread);
      button.setAttribute('aria-pressed', String(isUnread === state.unread));
    });
  }

  function rowTemplate(notification) {
    const target = targetFor(notification);
    return `<article class="notification-row ${notification.is_read ? '' : 'is-unread'}" data-notification-id="${Number(notification.id)}">
      <span class="icon-tile ${notification.is_read ? 'navy' : ''}">${Icons.icon(iconFor(notification), 16)}</span>
      <div class="notification-row-copy">
        <div class="notification-row-head">
          <strong>${UI.esc(notification.title)}</strong>
          <time datetime="${UI.attr(notification.created_at)}" title="${UI.attr(UI.formatDateTime(notification.created_at))}">${UI.esc(UI.timeAgo(notification.created_at))}</time>
        </div>
        <p>${UI.esc(notification.message)}</p>
        <div class="notification-row-actions">
          ${target ? `<a class="btn btn-secondary btn-sm" href="${UI.attr(target)}">Open${Icons.icon('arrow-right', 13)}</a>` : ''}
          ${notification.is_read ? '' : `<button class="btn btn-ghost btn-sm" type="button" data-mark-read="${Number(notification.id)}">${Icons.icon('check', 13)}Mark as read</button>`}
        </div>
      </div>
    </article>`;
  }

  function emptyMarkup() {
    if (state.unread) {
      return UI.emptyState({
        icon: 'check-circle',
        title: 'You are all caught up',
        message: 'There are no unread notifications. New complaint updates and poll announcements will appear here.',
        action: '<button class="btn btn-secondary btn-sm" type="button" data-show-all-notifications>View all notifications</button>'
      });
    }
    return UI.emptyState({
      icon: 'bell',
      title: 'No notifications yet',
      message: 'When your complaint status changes or the city publishes a community poll, you will be notified here.',
      action: '<a class="btn btn-secondary btn-sm" href="citizen-dashboard.html">Back to dashboard</a>'
    });
  }

  function renderList() {
    const container = UI.qs('#notification-list');
    const pagination = UI.qs('#notification-pagination');
    if (!container) return;
    container.setAttribute('aria-busy', 'false');
    if (!state.items.length) {
      container.innerHTML = emptyMarkup();
      const showAll = UI.qs('[data-show-all-notifications]', container);
      if (showAll) showAll.addEventListener('click', function () {
        state.unread = false;
        state.page = 1;
        load();
      });
      if (pagination) pagination.innerHTML = '';
      updateChrome();
      return;
    }
    container.innerHTML = state.items.map(rowTemplate).join('');
    if (pagination) {
      UI.renderPagination(pagination, {
        page: state.page,
        limit: state.limit,
        total: state.pageTotal,
        pages: state.pages
      }, function (page) {
        state.page = page;
        load();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    updateChrome();
  }

  function showError(error) {
    const container = UI.qs('#notification-list');
    const summary = UI.qs('#notification-summary');
    if (summary) summary.textContent = 'Notifications could not be loaded.';
    if (!container) return;
    container.setAttribute('aria-busy', 'false');
    container.innerHTML = `<div style="padding:18px">${UI.errorState({
      title: 'Notifications could not be loaded',
      message: error.message || 'Check your connection and try again.',
      action: '<button class="btn btn-secondary btn-sm" type="button" data-retry-notifications>Try again</button>'
    })}</div>`;
    const retry = UI.qs('[data-retry-notifications]', container);
    if (retry) retry.addEventListener('click', load);
  }

  async function load() {
    if (state.loading) return;
    state.loading = true;
    const container = UI.qs('#notification-list');
    if (container) {
      container.setAttribute('aria-busy', 'true');
      container.innerHTML = '<div style="padding:18px"><div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div></div>';
    }
    try {
      const payload = await Api.notifications.list({
        page: state.page,
        limit: state.limit,
        unread: state.unread ? '1' : ''
      });
      const data = payload.data || {};
      state.items = data.notifications || [];
      state.unreadCount = Number(data.unread_count) || 0;
      state.pageTotal = Number(data.pagination && data.pagination.total) || 0;
      state.pages = Number(data.pagination && data.pagination.pages) || 1;
      if (!state.unread) state.allTotal = state.pageTotal;
      if (state.page > state.pages && state.pages > 0) {
        state.page = state.pages;
        state.loading = false;
        return load();
      }
      renderList();
    } catch (error) {
      showError(error);
    } finally {
      state.loading = false;
    }
  }

  async function markRead(id, button) {
    UI.setLoading(button, true, 'Saving…');
    try {
      await Api.notifications.markRead(id);
      state.items = state.items.map(function (item) {
        return Number(item.id) === Number(id) ? Object.assign({}, item, { is_read: true }) : item;
      });
      state.unreadCount = Math.max(0, state.unreadCount - 1);
      UI.toast('Notification marked as read.', 'success');
      if (window.CivicShell.refreshNotifications) window.CivicShell.refreshNotifications();
      if (state.unread) load();
      else renderList();
    } catch (error) {
      UI.toast(error.message || 'The notification could not be updated.', 'error');
      UI.setLoading(button, false);
    }
  }

  async function markAllRead(button) {
    UI.setLoading(button, true, 'Saving…');
    try {
      await Api.notifications.markAllRead();
      state.items = state.items.map(function (item) { return Object.assign({}, item, { is_read: true }); });
      state.unreadCount = 0;
      UI.toast('All notifications marked as read.', 'success');
      if (window.CivicShell.refreshNotifications) window.CivicShell.refreshNotifications();
      if (state.unread) load();
      else renderList();
    } catch (error) {
      UI.toast(error.message || 'Notifications could not be updated.', 'error');
    } finally {
      UI.setLoading(button, false);
    }
  }

  function bindEvents() {
    const filters = UI.qs('#notification-filters');
    if (filters) {
      filters.addEventListener('click', function (event) {
        const button = event.target.closest('[data-unread]');
        if (!button) return;
        const next = button.dataset.unread === 'true';
        if (next === state.unread) return;
        state.unread = next;
        state.page = 1;
        load();
      });
    }

    const list = UI.qs('#notification-list');
    if (list) {
      list.addEventListener('click', function (event) {
        const button = event.target.closest('[data-mark-read]');
        if (button) markRead(Number(button.dataset.markRead), button);
      });
    }

    const markAll = UI.qs('#mark-all-read');
    if (markAll) markAll.addEventListener('click', function () { markAllRead(markAll); });

    const refresh = UI.qs('#refresh-notifications');
    if (refresh) {
      refresh.addEventListener('click', function () {
        refresh.disabled = true;
        load().finally(function () { refresh.disabled = false; });
      });
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    Icons.mount(document);
    const user = await window.CivicShell.ready;
    if (!user) return;
    bindEvents();
    load();
  });
})();
