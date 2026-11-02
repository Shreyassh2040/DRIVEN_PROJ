/* Authenticated app shell: role guards, sidebar, topbar, notifications, menus */
(function () {
  'use strict';

  const Api = window.CivicApi;
  const UI = window.CivicUI;
  const Icons = window.CivicIcons;

  const HOME = {
    citizen: 'citizen-dashboard.html',
    officer: 'officer-dashboard.html',
    admin: 'admin-dashboard.html'
  };

  const ROLE_LABEL = { citizen: 'Citizen', officer: 'Officer', admin: 'Administrator' };
  const ROLE_SCOPE = { citizen: 'Citizen workspace', officer: 'Operations console', admin: 'City administration' };

  const NAV = {
    citizen: [
      {
        label: 'Workspace',
        links: [
          { href: 'citizen-dashboard.html', label: 'Dashboard', icon: 'dashboard' },
          { href: 'report-issue.html', label: 'Report an issue', icon: 'plus-circle' },
          { href: 'my-complaints.html', label: 'My complaints', icon: 'clipboard' },
          { href: 'polls.html', label: 'Community polls', icon: 'vote' },
          { href: 'notifications.html', label: 'Notifications', icon: 'bell', badge: 'notifications' }
        ]
      },
      {
        label: 'Account',
        links: [
          { href: 'profile.html', label: 'Profile & security', icon: 'user' },
          { href: 'services.html', label: 'Service directory', icon: 'building' },
          { href: 'index.html', label: 'Public site', icon: 'globe' }
        ]
      }
    ],
    officer: [
      {
        label: 'Operations',
        links: [
          { href: 'officer-dashboard.html#overview', label: 'Overview', icon: 'dashboard' },
          { href: 'officer-dashboard.html#queue', label: 'Complaint queue', icon: 'inbox' },
          { href: 'officer-dashboard.html#performance', label: 'Performance', icon: 'bar-chart' },
          { href: 'notifications.html', label: 'Notifications', icon: 'bell', badge: 'notifications' }
        ]
      },
      {
        label: 'Account',
        links: [
          { href: 'profile.html', label: 'Profile & security', icon: 'user' },
          { href: 'services.html', label: 'Service directory', icon: 'building' },
          { href: 'index.html', label: 'Public site', icon: 'globe' }
        ]
      }
    ],
    admin: [
      {
        label: 'Administration',
        links: [
          { href: 'admin-dashboard.html#overview', label: 'Overview', icon: 'dashboard' },
          { href: 'admin-dashboard.html#complaints', label: 'Complaints', icon: 'clipboard' },
          { href: 'admin-dashboard.html#users', label: 'Users', icon: 'users' },
          { href: 'admin-dashboard.html#officers', label: 'Officers', icon: 'user-check' },
          { href: 'admin-dashboard.html#services', label: 'City services', icon: 'building' },
          { href: 'admin-dashboard.html#polls', label: 'Community polls', icon: 'vote' },
          { href: 'admin-dashboard.html#analytics', label: 'Analytics', icon: 'trending-up' },
          { href: 'admin-dashboard.html#activity', label: 'Activity log', icon: 'activity' },
          { href: 'admin-dashboard.html#settings', label: 'Settings', icon: 'settings' },
          { href: 'notifications.html', label: 'Notifications', icon: 'bell', badge: 'notifications' }
        ]
      },
      {
        label: 'Account',
        links: [
          { href: 'profile.html', label: 'Profile & security', icon: 'user' },
          { href: 'services.html', label: 'Service directory', icon: 'building' },
          { href: 'index.html', label: 'Public site', icon: 'globe' }
        ]
      }
    ]
  };

  let currentUser = null;
  let shellElement = null;
  let notificationsCache = null;
  let pollTimer = null;

  function currentPage() {
    const path = window.location.pathname.split('/').pop();
    return path || 'index.html';
  }

  function isActive(href) {
    if (!href) return false;
    const [file, hash] = href.split('#');
    if (file && file !== currentPage()) return false;
    if (hash) return window.location.hash === `#${hash}`;
    return !window.location.hash || currentPage() !== 'officer-dashboard.html' && currentPage() !== 'admin-dashboard.html';
  }

  function redirectToLogin() {
    Api.rememberNext(window.location.pathname + window.location.search + window.location.hash);
    window.location.replace('login.html');
  }

  function sidebarTemplate(user) {
    const groups = NAV[user.role] || NAV.citizen;
    const groupMarkup = groups.map(function (group) {
      const links = group.links.map(function (link) {
        const active = isActive(link.href);
        const badge = link.badge === 'notifications'
          ? `<span class="count" data-nav-notif-count hidden>0</span>`
          : '';
        return `<a class="sidebar-link ${active ? 'is-active' : ''}" href="${link.href}" ${active ? 'aria-current="page"' : ''}>
          ${Icons.icon(link.icon, 17)}<span>${UI.esc(link.label)}</span>${badge}
        </a>`;
      }).join('');
      return `<div class="sidebar-group"><p class="sidebar-label">${UI.esc(group.label)}</p>${links}</div>`;
    }).join('');

    return `<div class="sidebar-brand">
        <a class="brand" href="${HOME[user.role]}" aria-label="CivicFlow home">
          <span class="brand-mark">${Icons.icon('shield', 18)}</span>
          <span class="brand-word"><span class="brand-name">Civic<span>Flow</span></span><span class="brand-tagline">${UI.esc(ROLE_SCOPE[user.role] || 'City services')}</span></span>
        </a>
      </div>
      <nav class="sidebar-scroll" aria-label="Workspace navigation">
        ${groupMarkup}
        <div class="sidebar-group">
          <p class="sidebar-label">Session</p>
          <a class="sidebar-link" href="index.html">${Icons.icon('globe', 17)}<span>Public website</span></a>
          <button class="sidebar-link" type="button" data-logout style="width:100%;border:0;background:transparent;text-align:left">${Icons.icon('logout', 17)}<span>Sign out</span></button>
        </div>
      </nav>
      <div class="sidebar-foot">
        <a class="sidebar-user" href="profile.html" aria-label="Open your profile">
          <span class="avatar">${UI.esc(UI.initials(user.full_name))}</span>
          <span class="sidebar-user-meta">
            <span class="sidebar-user-name">${UI.esc(user.full_name)}</span>
            <span class="sidebar-user-role">${UI.esc(ROLE_LABEL[user.role] || user.role)}</span>
          </span>
          ${Icons.icon('chevron-right', 15)}
        </a>
      </div>`;
  }

  function topbarTemplate(user) {
    const title = shellElement.dataset.title || document.title.split('·')[0].trim() || 'Dashboard';
    const searchTarget = shellElement.dataset.search;
    const searchPlaceholder = shellElement.dataset.searchPlaceholder || 'Search…';
    const search = searchTarget
      ? `<form class="topbar-search" role="search" data-topbar-search action="${UI.attr(searchTarget)}">
          <div class="input-group">
            ${Icons.icon('search', 15)}
            <input class="input" type="search" name="q" placeholder="${UI.attr(searchPlaceholder)}" aria-label="${UI.attr(searchPlaceholder)}">
          </div>
        </form>`
      : '';

    return `<div class="topbar-left">
        <button class="topbar-toggle" type="button" data-sidebar-toggle aria-label="Open navigation" aria-expanded="false" aria-controls="app-sidebar">${Icons.icon('menu', 19)}</button>
        <div class="topbar-title">
          <p class="topbar-crumb">${UI.esc(ROLE_SCOPE[user.role] || 'Workspace')} ${Icons.icon('chevron-right', 11)} <strong>${UI.esc(title)}</strong></p>
          <p class="topbar-page">${UI.esc(title)}</p>
        </div>
      </div>
      <div class="topbar-right">
        ${search}
        <div class="dropdown" data-notifications-menu>
          <button class="topbar-icon-btn" type="button" data-notifications-toggle aria-label="Notifications" aria-haspopup="true" aria-expanded="false">
            ${Icons.icon('bell', 18)}
            <span class="notif-count" data-notif-count hidden>0</span>
          </button>
          <div class="dropdown-menu" hidden data-notifications-panel>
            <div class="dropdown-head">
              <span class="dropdown-title">Notifications</span>
              <button class="btn btn-ghost btn-sm" type="button" data-mark-all-read>Mark all read</button>
            </div>
            <div class="dropdown-list" data-notifications-list>
              <div class="empty-state" style="padding:26px 16px"><span class="spinner dark sm"></span></div>
            </div>
            <div class="dropdown-head" style="border-top:1px solid var(--border);border-bottom:0">
              <a class="text-link" href="notifications.html">View all${Icons.icon('arrow-right', 14)}</a>
            </div>
          </div>
        </div>
        <span class="topbar-divider" aria-hidden="true"></span>
        <div class="dropdown" data-user-menu>
          <button class="user-menu-button topbar-user" type="button" data-user-toggle aria-label="Account menu" aria-haspopup="true" aria-expanded="false">
            <span class="avatar">${UI.esc(UI.initials(user.full_name))}</span>
            <span class="user-menu-meta">
              <span class="user-menu-name">${UI.esc(user.full_name)}</span>
              <span class="user-menu-role">${UI.esc(ROLE_LABEL[user.role] || user.role)}</span>
            </span>
            ${Icons.icon('chevron-down', 14)}
          </button>
          <div class="dropdown-menu" hidden data-user-panel style="width:230px">
            <div class="dropdown-head" style="display:block">
              <span class="dropdown-title">${UI.esc(user.full_name)}</span>
              <span class="text-xs muted" style="display:block;margin-top:2px">${UI.esc(user.email)}</span>
            </div>
            <div class="dropdown-list">
              <a class="dropdown-link" href="profile.html">${Icons.icon('user', 16)}Profile &amp; security</a>
              ${user.role === 'admin' ? `<a class="dropdown-link" href="admin-dashboard.html#settings">${Icons.icon('settings', 16)}Platform settings</a>` : ''}
              <a class="dropdown-link" href="services.html">${Icons.icon('building', 16)}Service directory</a>
              <a class="dropdown-link" href="notifications.html">${Icons.icon('bell', 16)}Notifications</a>
            </div>
            <div class="dropdown-head" style="border-top:1px solid var(--border);border-bottom:0">
              <button class="dropdown-link" type="button" data-logout style="padding:0;border:0;background:transparent;width:100%">${Icons.icon('logout', 16)}Sign out</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function closeMenus(except) {
    UI.qsa('[data-user-panel], [data-notifications-panel]').forEach(function (panel) {
      if (except && panel === except) return;
      panel.hidden = true;
    });
    UI.qsa('[data-user-toggle], [data-notifications-toggle]').forEach(function (button) {
      button.setAttribute('aria-expanded', 'false');
    });
  }

  function bindMenus() {
    const userToggle = UI.qs('[data-user-toggle]');
    const userPanel = UI.qs('[data-user-panel]');
    if (userToggle && userPanel) {
      userToggle.addEventListener('click', function (event) {
        event.stopPropagation();
        const willOpen = userPanel.hidden;
        closeMenus(willOpen ? userPanel : null);
        userPanel.hidden = !willOpen;
        userToggle.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) loadNotifications();
      });
    }

    const notifToggle = UI.qs('[data-notifications-toggle]');
    const notifPanel = UI.qs('[data-notifications-panel]');
    if (notifToggle && notifPanel) {
      notifToggle.addEventListener('click', function (event) {
        event.stopPropagation();
        const willOpen = notifPanel.hidden;
        closeMenus(willOpen ? notifPanel : null);
        notifPanel.hidden = !willOpen;
        notifToggle.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) loadNotifications();
      });
    }

    document.addEventListener('click', function (event) {
      if (!event.target.closest('[data-user-menu], [data-notifications-menu]')) closeMenus();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeMenus();
        closeSidebar();
      }
    });

    const markAll = UI.qs('[data-mark-all-read]');
    if (markAll) {
      markAll.addEventListener('click', async function () {
        UI.setLoading(markAll, true, 'Saving…');
        try {
          await Api.notifications.markAllRead();
          await loadNotifications(true);
          updateUnreadBadge(0);
          UI.toast('All notifications marked as read.', 'success');
        } catch (error) {
          UI.toast(error.message || 'Could not update notifications.', 'error');
        } finally {
          UI.setLoading(markAll, false);
        }
      });
    }

    const searchForm = UI.qs('[data-topbar-search]');
    if (searchForm) {
      searchForm.addEventListener('submit', function (event) {
        event.preventDefault();
        const query = new FormData(searchForm).get('q');
        const target = new URL(searchForm.getAttribute('action'), window.location.href);
        if (query) target.searchParams.set('q', query);
        window.location.href = target.pathname.split('/').pop() + target.search;
      });
    }
  }

  function updateUnreadBadge(count) {
    const number = Number(count) || 0;
    UI.qsa('[data-notif-count]').forEach(function (node) {
      node.textContent = number > 99 ? '99+' : String(number);
      node.hidden = number <= 0;
    });
    UI.qsa('[data-nav-notif-count]').forEach(function (node) {
      node.textContent = number > 99 ? '99+' : String(number);
      node.hidden = number <= 0;
    });
  }

  async function loadNotifications(force) {
    if (notificationsCache && !force) {
      renderNotifications(notificationsCache);
      return notificationsCache;
    }
    const list = UI.qs('[data-notifications-list]');
    if (list && !notificationsCache) {
      list.innerHTML = `<div class="empty-state" style="padding:26px 16px"><span class="spinner dark sm"></span></div>`;
    }
    try {
      const payload = await Api.notifications.list({ limit: 6 });
      notificationsCache = payload.data || {};
      updateUnreadBadge(notificationsCache.unread_count);
      renderNotifications(notificationsCache);
      return notificationsCache;
    } catch (error) {
      if (list) list.innerHTML = `<div class="empty-state" style="padding:22px 16px"><p>${UI.esc(error.message || 'Notifications could not be loaded.')}</p></div>`;
      return null;
    }
  }

  function notificationTarget(notification) {
    if (!notification.related_issue_id) return 'notifications.html';
    if (currentUser && currentUser.role === 'citizen') return `complaint-details.html?id=${notification.related_issue_id}`;
    if (currentUser && (currentUser.role === 'officer' || currentUser.role === 'admin')) {
      return currentUser.role === 'admin'
        ? `admin-dashboard.html#complaints`
        : `officer-dashboard.html#queue`;
    }
    return 'notifications.html';
  }

  function renderNotifications(data) {
    const list = UI.qs('[data-notifications-list]');
    if (!list) return;
    const notifications = (data && data.notifications) || [];
    if (!notifications.length) {
      list.innerHTML = `<div class="empty-state" style="padding:30px 18px">
        <div class="icon-tile sm">${Icons.icon('bell', 18)}</div>
        <h3 style="font-size:.86rem">No notifications yet</h3>
        <p style="font-size:.72rem">Updates about your complaints and city polls will appear here.</p>
      </div>`;
      return;
    }
    list.innerHTML = notifications.map(function (notification) {
      return `<a class="notification-item ${notification.is_read ? '' : 'is-unread'}" href="${notificationTarget(notification)}" data-notification-id="${notification.id}">
        <span class="notification-dot ${notification.is_read ? 'is-read' : ''}"></span>
        <span class="notification-copy">
          <strong>${UI.esc(notification.title)}</strong>
          <span>${UI.esc(notification.message)}</span>
          <time datetime="${UI.attr(notification.created_at)}">${UI.esc(UI.timeAgo(notification.created_at))}</time>
        </span>
      </a>`;
    }).join('');
  }

  async function refreshUnread() {
    try {
      const payload = await Api.notifications.unreadCount();
      updateUnreadBadge(payload.data && payload.data.unread_count);
    } catch { /* silent background refresh */ }
  }

  function openSidebar() {
    const sidebar = UI.qs('.app-sidebar');
    const overlay = UI.qs('.sidebar-overlay');
    if (!sidebar) return;
    sidebar.classList.add('is-open');
    if (overlay) overlay.classList.add('is-open');
    document.body.classList.add('no-scroll');
    const toggle = UI.qs('[data-sidebar-toggle]');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
  }

  function closeSidebar() {
    const sidebar = UI.qs('.app-sidebar');
    const overlay = UI.qs('.sidebar-overlay');
    if (!sidebar) return;
    sidebar.classList.remove('is-open');
    if (overlay) overlay.classList.remove('is-open');
    document.body.classList.remove('no-scroll');
    const toggle = UI.qs('[data-sidebar-toggle]');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  function bindSidebar() {
    const toggle = UI.qs('[data-sidebar-toggle]');
    const overlay = UI.qs('.sidebar-overlay');
    if (toggle) {
      toggle.addEventListener('click', function () {
        if (UI.qs('.app-sidebar').classList.contains('is-open')) closeSidebar();
        else openSidebar();
      });
    }
    if (overlay) overlay.addEventListener('click', closeSidebar);
    UI.qsa('.sidebar-link').forEach(function (link) {
      link.addEventListener('click', closeSidebar);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 900) closeSidebar();
    });
  }

  function bindLogout() {
    document.addEventListener('click', async function (event) {
      const button = event.target.closest('[data-logout]');
      if (!button) return;
      event.preventDefault();
      const confirmed = await UI.confirm({
        title: 'Sign out of CivicFlow?',
        subtitle: 'Your session will end on this device.',
        message: 'You can sign back in at any time with your email and password.',
        confirmLabel: 'Sign out'
      });
      if (!confirmed) return;
      try { await Api.request('/auth/logout', { method: 'POST', allowUnauthorized: true }).catch(function () {}); } catch { /* no server-side session */ }
      Api.clearSession();
      window.location.replace('login.html');
    });
  }

  function bindGlobalErrors() {
    window.addEventListener('civicflow:unauthorized', function () {
      redirectToLogin();
    });
  }

  function applyRoleClass(user) {
    document.body.classList.add('role-' + user.role);
    UI.qsa('[data-only-role]').forEach(function (node) {
      node.hidden = node.dataset.onlyRole !== user.role;
    });
  }

  async function init() {
    shellElement = UI.qs('[data-shell]');
    if (!shellElement) return null;
    bindGlobalErrors();
    bindLogout();

    const allowed = (shellElement.dataset.roles || '').split(',').map(function (role) { return role.trim(); }).filter(Boolean);

    if (!Api.isAuthed()) {
      redirectToLogin();
      return null;
    }

    let user = Api.getUser();
    if (!allowed.length && user) allowed.push(user.role);

    try {
      const payload = await Api.auth.me();
      user = payload.data.user;
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        redirectToLogin();
        return null;
      }
      if (!user) {
        redirectToLogin();
        return null;
      }
    }

    if (!user) { redirectToLogin(); return null; }

    if (allowed.length && !allowed.includes(user.role)) {
      window.location.replace(HOME[user.role] || 'index.html');
      return null;
    }

    currentUser = user;
    applyRoleClass(user);

    const sidebar = UI.qs('.app-sidebar', shellElement);
    if (sidebar) sidebar.innerHTML = sidebarTemplate(user);
    const topbar = UI.qs('.app-topbar', shellElement);
    if (topbar) topbar.innerHTML = topbarTemplate(user);

    Icons.mount(shellElement);
    bindSidebar();
    bindMenus();
    updateUnreadBadge(user.unread_count || 0);
    refreshUnread();
    loadNotifications();
    window.clearInterval(pollTimer);
    pollTimer = window.setInterval(refreshUnread, 90000);

    window.addEventListener('hashchange', function () {
      UI.qsa('.sidebar-link').forEach(function (link) {
        link.classList.toggle('is-active', isActive(link.getAttribute('href')));
      });
    });

    return user;
  }

  window.CivicShell = {
    init: init,
    ready: null,
    user: function () { return currentUser; },
    refreshNotifications: function () { notificationsCache = null; return loadNotifications(true); },
    setTitle: function (title) {
      if (!shellElement) return;
      document.title = `${title} · CivicFlow`;
      shellElement.dataset.title = title;
      const node = UI.qs('.topbar-page');
      if (node) node.textContent = title;
      const crumb = UI.qs('.topbar-crumb strong');
      if (crumb) crumb.textContent = title;
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    window.CivicShell.ready = init();
  });
})();
