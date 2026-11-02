/* Citizen dashboard: personal complaint summary, active polls, services and updates */
(function () {
  'use strict';

  const UI = window.CivicUI;
  const Api = window.CivicApi;
  const Icons = window.CivicIcons;

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function firstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || 'there';
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

  function renderMetrics(summary, polls) {
    const container = UI.qs('#citizen-metrics');
    if (!container) return;
    const data = summary || { total: 0, submitted: 0, in_progress: 0, resolved: 0, rejected: 0 };
    const openCount = Number(data.submitted || 0) + Number(data.in_progress || 0);
    const cards = [
      metricCard({
        label: 'My complaints',
        value: data.total,
        meta: data.total ? 'Every report you have filed' : 'No reports filed yet',
        icon: 'clipboard',
        tone: 'navy'
      }),
      metricCard({
        label: 'Awaiting resolution',
        value: openCount,
        meta: openCount ? 'Submitted or in progress' : 'Nothing currently open',
        icon: 'clock',
        tone: 'blue'
      }),
      metricCard({
        label: 'Resolved',
        value: data.resolved,
        meta: data.resolved ? 'Closed with a resolution' : 'No resolved complaints yet',
        icon: 'check-circle',
        tone: 'green'
      }),
      metricCard({
        label: 'Open polls',
        value: (polls || []).length,
        meta: (polls || []).length ? 'Your vote is counted once per poll' : 'No polls open right now',
        icon: 'vote',
        tone: 'amber'
      })
    ];
    container.innerHTML = cards.join('');
  }

  function renderComplaints(complaints) {
    const container = UI.qs('#recent-complaints');
    if (!container) return;
    if (!complaints.length) {
      container.innerHTML = UI.emptyState({
        icon: 'clipboard',
        title: 'No complaints yet',
        message: 'When you report a civic issue, its status and officer updates will appear here.',
        action: '<a class="btn btn-primary btn-sm" href="report-issue.html">Report your first issue</a>'
      });
      return;
    }
    container.innerHTML = complaints.map(function (complaint) {
      return UI.complaintCard(complaint);
    }).join('');
  }

  function pollPreview(poll) {
    const closed = poll.status !== 'active';
    const voted = Boolean(poll.user_vote);
    const showResults = voted || closed;
    const options = (poll.options || []).map(function (option) {
      const chosen = Number(poll.user_vote) === Number(option.id);
      return `<div class="poll-option ${chosen ? 'is-chosen' : ''}">
        <div class="poll-option-main">
          <span class="poll-option-label">${chosen ? Icons.icon('check-circle', 14) : ''}${UI.esc(option.text)}</span>
          ${showResults ? `<span class="poll-option-track"><span class="poll-option-fill" style="width:${Number(option.percentage) || 0}%"></span></span>` : ''}
        </div>
        ${showResults ? `<span class="poll-option-votes">${UI.formatNumber(option.votes)} votes</span>` : ''}
      </div>`;
    }).join('');
    const closing = poll.ends_at
      ? `Closes ${UI.formatDate(poll.ends_at)}`
      : 'No closing date published';
    return `<article class="poll-card">
      <div class="poll-card-head">
        <div>
          <span class="badge ${voted ? 'badge-resolved' : 'badge-active'}"><span class="dot"></span>${voted ? 'Vote recorded' : 'Open for voting'}</span>
          <h3>${UI.esc(poll.title)}</h3>
          ${poll.description ? `<p class="poll-card-desc">${UI.esc(poll.description)}</p>` : ''}
        </div>
      </div>
      <div class="poll-card-meta">
        <span>${Icons.icon('users', 12)}${UI.formatNumber(poll.total_votes)} ${poll.total_votes === 1 ? 'vote' : 'votes'}</span>
        <span>${Icons.icon('calendar', 12)}${UI.esc(closing)}</span>
      </div>
      <div class="poll-options">${options}</div>
      <div class="poll-card-foot">
        <span>${voted ? 'Thank you for taking part.' : 'Results are shown after you vote or when the poll closes.'}</span>
        <a class="btn btn-secondary btn-sm" href="polls.html">${voted ? 'View poll' : 'Cast your vote'}${Icons.icon('arrow-right', 14)}</a>
      </div>
    </article>`;
  }

  function renderPolls(polls) {
    const container = UI.qs('#dashboard-polls');
    if (!container) return;
    if (!polls.length) {
      container.innerHTML = UI.emptyState({
        icon: 'vote',
        title: 'No open consultations',
        message: 'Community polls published by the city will appear here while they are open for voting.',
        action: '<a class="btn btn-secondary btn-sm" href="polls.html">View all polls</a>'
      });
      return;
    }
    container.innerHTML = `<div class="poll-list">${polls.slice(0, 2).map(pollPreview).join('')}</div>`;
  }

  async function loadOverview() {
    const results = await Promise.allSettled([
      Api.issues.mine({ limit: 3 }),
      Api.polls.list({ status: 'active' })
    ]);
    const issuesPayload = results[0].status === 'fulfilled' ? results[0].value.data : null;
    const pollsPayload = results[1].status === 'fulfilled' ? results[1].value.data : null;
    const polls = (pollsPayload && pollsPayload.polls) || [];

    if (issuesPayload) {
      renderComplaints(issuesPayload.complaints || []);
      renderMetrics(issuesPayload.summary, polls);
    } else {
      const recent = UI.qs('#recent-complaints');
      if (recent) {
        recent.innerHTML = UI.errorState({
          title: 'Complaints could not be loaded',
          message: results[0].reason && results[0].reason.message,
          action: '<button class="btn btn-secondary btn-sm" type="button" data-retry="overview">Try again</button>'
        });
      }
      renderMetrics(null, polls);
    }

    if (pollsPayload) {
      renderPolls(polls);
    } else {
      const pollBox = UI.qs('#dashboard-polls');
      if (pollBox) {
        pollBox.innerHTML = UI.errorState({
          title: 'Polls could not be loaded',
          message: results[1].reason && results[1].reason.message,
          action: '<button class="btn btn-secondary btn-sm" type="button" data-retry="overview">Try again</button>'
        });
      }
    }

    UI.qsa('[data-retry="overview"]').forEach(function (button) {
      button.addEventListener('click', function () {
        button.disabled = true;
        loadOverview();
      });
    });
  }

  async function loadServices() {
    const container = UI.qs('#dashboard-services');
    if (!container) return;
    try {
      const payload = await Api.services.meta();
      const categories = (payload.data.categories || []).filter(function (category) {
        return Number(category.service_count) > 0;
      });
      if (!categories.length) {
        container.innerHTML = UI.emptyState({
          icon: 'building',
          title: 'No services published yet',
          message: 'The city administration has not published any service records in the directory yet.'
        });
        return;
      }
      const total = categories.reduce(function (sum, category) { return sum + Number(category.service_count); }, 0);
      container.innerHTML = `<div class="activity-list">${categories.slice(0, 5).map(function (category) {
        return `<a class="activity-row" href="services.html?category=${encodeURIComponent(category.slug)}">
          <span class="activity-icon teal">${Icons.icon(category.icon, 15)}</span>
          <span class="activity-copy">
            <strong>${UI.esc(category.name)}</strong>
            <span>${UI.formatNumber(category.service_count)} ${Number(category.service_count) === 1 ? 'service' : 'services'}</span>
          </span>
        </a>`;
      }).join('')}</div>
      <p class="stat-meta mt-12">${UI.formatNumber(total)} ${total === 1 ? 'service' : 'services'} published across ${categories.length} ${categories.length === 1 ? 'category' : 'categories'}.</p>`;
    } catch (error) {
      container.innerHTML = UI.errorState({
        title: 'Services could not be loaded',
        message: error.message,
        action: '<button class="btn btn-secondary btn-sm" type="button" data-retry="services">Try again</button>'
      });
      const retry = UI.qs('[data-retry="services"]', container);
      if (retry) retry.addEventListener('click', function () { retry.disabled = true; loadServices(); });
    }
  }

  function notificationHref(notification) {
    return notification.related_issue_id
      ? `complaint-details.html?id=${Number(notification.related_issue_id)}`
      : 'notifications.html';
  }

  async function loadNotifications() {
    const container = UI.qs('#dashboard-notifications');
    if (!container) return;
    try {
      const payload = await Api.notifications.list({ limit: 4 });
      const notifications = payload.data.notifications || [];
      if (!notifications.length) {
        container.innerHTML = UI.emptyState({
          icon: 'bell',
          title: 'Nothing new',
          message: 'Updates about your complaints and city polls will appear here.'
        });
        return;
      }
      container.innerHTML = `<div class="activity-list">${notifications.map(function (notification) {
        return `<a class="activity-row" href="${notificationHref(notification)}">
          <span class="activity-icon ${notification.is_read ? '' : 'teal'}">${Icons.icon(notification.is_read ? 'bell' : 'message', 15)}</span>
          <span class="activity-copy">
            <strong>${UI.esc(notification.title)}</strong>
            <span>${UI.esc(notification.message)}</span>
            <time datetime="${UI.attr(notification.created_at)}">${UI.esc(UI.timeAgo(notification.created_at))}</time>
          </span>
        </a>`;
      }).join('')}</div>`;
    } catch (error) {
      container.innerHTML = UI.errorState({
        title: 'Updates could not be loaded',
        message: error.message,
        action: '<button class="btn btn-secondary btn-sm" type="button" data-retry="notifications">Try again</button>'
      });
      const retry = UI.qs('[data-retry="notifications"]', container);
      if (retry) retry.addEventListener('click', function () { retry.disabled = true; loadNotifications(); });
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    Icons.mount(document);
    const user = await window.CivicShell.ready;
    if (!user) return;

    const name = firstName(user.full_name);
    const heading = UI.qs('#dashboard-title');
    const line = UI.qs('#greeting-line');
    if (heading) heading.textContent = `${greeting()}, ${name}`;
    if (line) line.textContent = `${UI.formatDate(new Date())} · Citizen workspace`;

    loadOverview();
    loadServices();
    loadNotifications();
  });
})();
