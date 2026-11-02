/* Community polls: one vote per citizen, results after voting, scheduled and closed states */
(function () {
  'use strict';

  const UI = window.CivicUI;
  const Api = window.CivicApi;
  const Icons = window.CivicIcons;

  const FILTERS = [
    { value: '', label: 'All polls', icon: 'vote' },
    { value: 'active', label: 'Open', icon: 'check-circle' },
    { value: 'scheduled', label: 'Scheduled', icon: 'calendar' },
    { value: 'closed', label: 'Closed', icon: 'lock' }
  ];

  const state = {
    polls: [],
    filter: '',
    selected: {},
    loading: false
  };

  function statusBadge(status) {
    const map = {
      active: { className: 'badge-active', label: 'Open for voting' },
      scheduled: { className: 'badge-scheduled', label: 'Scheduled' },
      closed: { className: 'badge-closed', label: 'Closed' }
    };
    const item = map[status] || { className: 'badge-neutral', label: UI.titleCase(status) };
    return `<span class="badge ${item.className}"><span class="dot"></span>${item.label}</span>`;
  }

  function chosenOption(poll) {
    return (poll.options || []).find(function (option) {
      return Number(option.id) === Number(poll.user_vote);
    });
  }

  function pollOptions(poll) {
    const voted = Boolean(poll.user_vote);
    const showResults = voted || poll.status === 'closed';
    const selection = state.selected[poll.id];
    return (poll.options || []).map(function (option) {
      const chosen = Number(poll.user_vote) === Number(option.id);
      const selected = Number(selection) === Number(option.id);
      if (showResults) {
        return `<div class="poll-option ${chosen ? 'is-chosen' : ''}">
          <div class="poll-option-main">
            <span class="poll-option-label">${chosen ? Icons.icon('check-circle', 14) : ''}${UI.esc(option.text)}</span>
            <span class="poll-option-track"><span class="poll-option-fill" style="width:${Number(option.percentage) || 0}%"></span></span>
          </div>
          <span class="poll-option-votes">${UI.formatNumber(option.votes)} ${option.votes === 1 ? 'vote' : 'votes'} · ${Number(option.percentage) || 0}%</span>
        </div>`;
      }
      if (poll.status === 'scheduled') {
        return `<div class="poll-option" aria-disabled="true">
          <div class="poll-option-main">
            <span class="poll-option-label">${Icons.icon('lock', 14)}${UI.esc(option.text)}</span>
          </div>
          <span class="poll-option-votes">Hidden until voting opens</span>
        </div>`;
      }
      return `<button class="poll-option ${selected ? 'is-chosen' : ''}" type="button" data-poll-id="${Number(poll.id)}" data-option-id="${Number(option.id)}" aria-pressed="${selected}">
        <div class="poll-option-main">
          <span class="poll-option-label">${Icons.icon(selected ? 'check-circle' : 'vote', 14)}${UI.esc(option.text)}</span>
        </div>
      </button>`;
    }).join('');
  }

  function pollFoot(poll) {
    const voted = chosenOption(poll);
    if (poll.status === 'active' && !poll.user_vote) {
      const hasSelection = Boolean(state.selected[poll.id]);
      return `<span id="poll-hint-${Number(poll.id)}">${hasSelection ? 'Ready to submit. Your vote cannot be changed.' : 'Select one option, then submit your vote.'}</span>
        <button class="btn btn-primary btn-sm" type="button" data-vote-poll="${Number(poll.id)}" ${hasSelection ? '' : 'disabled'}>
          <span data-icon="vote" data-icon-size="14"></span><span class="btn-label">Submit vote</span>
        </button>`;
    }
    if (poll.status === 'scheduled') {
      return `<span>${Icons.icon('calendar', 13)}Voting opens ${UI.esc(UI.formatDateTime(poll.starts_at))}.</span>`;
    }
    if (poll.status === 'closed') {
      return `<span>${Icons.icon('lock', 13)}Voting closed${poll.ends_at ? ` on ${UI.esc(UI.formatDate(poll.ends_at))}` : ''}.</span>
        <span class="text-xs muted">${UI.formatNumber(poll.total_votes)} total ${poll.total_votes === 1 ? 'vote' : 'votes'}</span>`;
    }
    return `<span>${Icons.icon('check-circle', 13)}Your vote: <strong>${UI.esc(voted ? voted.text : 'recorded')}</strong></span>
      <span class="text-xs muted">${UI.formatNumber(poll.total_votes)} total ${poll.total_votes === 1 ? 'vote' : 'votes'}</span>`;
  }

  function pollMeta(poll) {
    const parts = [];
    parts.push(`<span>${Icons.icon('users', 12)}${UI.formatNumber(poll.total_votes)} ${poll.total_votes === 1 ? 'vote' : 'votes'}</span>`);
    if (poll.starts_at) parts.push(`<span>${Icons.icon('calendar', 12)}Started ${UI.esc(UI.formatDate(poll.starts_at))}</span>`);
    if (poll.ends_at) parts.push(`<span>${Icons.icon('clock', 12)}${poll.status === 'scheduled' ? 'Closes' : poll.status === 'closed' ? 'Closed' : 'Closes'} ${UI.esc(UI.formatDate(poll.ends_at))}</span>`);
    if (poll.creator_name) parts.push(`<span>${Icons.icon('building', 12)}Published by ${UI.esc(poll.creator_name)}</span>`);
    return parts.join('');
  }

  function pollCard(poll) {
    return `<article class="poll-card" id="poll-card-${Number(poll.id)}">
      <div class="poll-card-head">
        <div class="grow">
          ${statusBadge(poll.status)}
          <h3>${UI.esc(poll.title)}</h3>
          ${poll.description ? `<p class="poll-card-desc">${UI.esc(poll.description)}</p>` : ''}
        </div>
      </div>
      <div class="poll-card-meta">${pollMeta(poll)}</div>
      <div class="poll-options">${pollOptions(poll)}</div>
      <div class="poll-card-foot">${pollFoot(poll)}</div>
    </article>`;
  }

  function visiblePolls() {
    if (!state.filter) return state.polls;
    return state.polls.filter(function (poll) { return poll.status === state.filter; });
  }

  function renderFilters() {
    const container = UI.qs('#poll-filters');
    if (!container) return;
    const counts = { '': state.polls.length, active: 0, scheduled: 0, closed: 0 };
    state.polls.forEach(function (poll) { counts[poll.status] = (counts[poll.status] || 0) + 1; });
    container.innerHTML = FILTERS.map(function (filter) {
      const active = state.filter === filter.value;
      return `<button class="filter-chip ${active ? 'is-active' : ''}" type="button" data-poll-filter="${filter.value}" aria-pressed="${active}">
        ${Icons.icon(filter.icon, 13)}<span>${filter.label}</span><span class="count">${UI.formatNumber(counts[filter.value] || 0)}</span>
      </button>`;
    }).join('');
  }

  function emptyState() {
    if (!state.polls.length) {
      return UI.emptyState({
        icon: 'vote',
        title: 'No community polls yet',
        message: 'Consultations published by the city administration will appear here. Check back soon or explore city services in the meantime.',
        action: '<a class="btn btn-secondary btn-sm" href="services.html">Browse city services</a>'
      });
    }
    const labels = { active: 'open', scheduled: 'scheduled', closed: 'closed' };
    return UI.emptyState({
      icon: 'vote',
      title: `No ${labels[state.filter] || 'matching'} polls`,
      message: 'There are no polls in this category right now. Switch to another filter to see other consultations.',
      action: '<button class="btn btn-secondary btn-sm" type="button" data-show-all-polls>Show all polls</button>'
    });
  }

  function renderList() {
    const container = UI.qs('#poll-list');
    const summary = UI.qs('#poll-results-summary');
    if (!container) return;
    const polls = visiblePolls();
    container.setAttribute('aria-busy', 'false');
    if (summary) {
      summary.textContent = !state.polls.length
        ? 'No polls have been published.'
        : `${UI.formatNumber(polls.length)} of ${UI.formatNumber(state.polls.length)} ${state.polls.length === 1 ? 'poll' : 'polls'} shown`;
    }
    if (!polls.length) {
      container.innerHTML = emptyState();
      const all = UI.qs('[data-show-all-polls]', container);
      if (all) all.addEventListener('click', function () {
        state.filter = '';
        renderFilters();
        renderList();
      });
      return;
    }
    container.innerHTML = `<div class="poll-list">${polls.map(pollCard).join('')}</div>`;
    Icons.mount(container);
  }

  function sortPolls(polls) {
    const rank = { active: 0, scheduled: 1, closed: 2 };
    return polls.slice().sort(function (a, b) {
      const diff = (rank[a.status] === undefined ? 3 : rank[a.status]) - (rank[b.status] === undefined ? 3 : rank[b.status]);
      if (diff !== 0) return diff;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }

  function showError(error) {
    const container = UI.qs('#poll-list');
    const summary = UI.qs('#poll-results-summary');
    if (summary) summary.textContent = 'Community polls could not be loaded.';
    if (!container) return;
    container.setAttribute('aria-busy', 'false');
    container.innerHTML = UI.errorState({
      title: 'Community polls could not be loaded',
      message: error.message || 'Check your connection and try again.',
      action: '<button class="btn btn-secondary btn-sm" type="button" data-retry-polls>Try again</button>'
    });
    const retry = UI.qs('[data-retry-polls]', container);
    if (retry) retry.addEventListener('click', load);
  }

  async function load() {
    const container = UI.qs('#poll-list');
    if (state.loading) return;
    state.loading = true;
    if (container) {
      container.setAttribute('aria-busy', 'true');
      container.innerHTML = '<div class="poll-list"><div class="skeleton skeleton-card" style="height:240px"></div><div class="skeleton skeleton-card" style="height:240px"></div></div>';
    }
    try {
      const payload = await Api.polls.list();
      state.polls = sortPolls(payload.data.polls || []);
      state.selected = {};
      renderFilters();
      renderList();
    } catch (error) {
      showError(error);
    } finally {
      state.loading = false;
    }
  }

  function updateCardSelection(pollId, optionId) {
    const card = document.getElementById(`poll-card-${pollId}`);
    if (!card) return;
    card.querySelectorAll('[data-option-id]').forEach(function (button) {
      const selected = Number(button.dataset.optionId) === Number(optionId);
      button.classList.toggle('is-chosen', selected);
      button.setAttribute('aria-pressed', String(selected));
      const icon = UI.qs('.poll-option-label .icon', button);
      if (icon) icon.outerHTML = Icons.icon(selected ? 'check-circle' : 'vote', 14);
    });
    const vote = UI.qs('[data-vote-poll]', card);
    if (vote) vote.disabled = !optionId;
    const hint = document.getElementById(`poll-hint-${pollId}`);
    if (hint) {
      hint.textContent = optionId
        ? 'Ready to submit. Your vote cannot be changed.'
        : 'Select one option, then submit your vote.';
    }
  }

  async function vote(pollId, button) {
    const optionId = state.selected[pollId];
    if (!optionId) return;
    UI.setLoading(button, true, 'Submitting…');
    try {
      const payload = await Api.polls.vote(pollId, optionId);
      const updated = payload.data.poll;
      state.polls = sortPolls(state.polls.map(function (poll) {
        return Number(poll.id) === Number(pollId) && updated ? updated : poll;
      }));
      delete state.selected[pollId];
      UI.toast('Your vote has been recorded.', 'success');
      renderFilters();
      renderList();
      const card = document.getElementById(`poll-card-${pollId}`);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      UI.toast(error.message || 'Your vote could not be recorded.', 'error');
      if (error.status === 409) load();
    } finally {
      UI.setLoading(button, false);
    }
  }

  function bindEvents() {
    const filters = UI.qs('#poll-filters');
    if (filters) {
      filters.addEventListener('click', function (event) {
        const button = event.target.closest('[data-poll-filter]');
        if (!button) return;
        state.filter = button.dataset.pollFilter || '';
        renderFilters();
        renderList();
      });
    }

    const list = UI.qs('#poll-list');
    if (list) {
      list.addEventListener('click', function (event) {
        const option = event.target.closest('[data-option-id]');
        if (option) {
          const pollId = Number(option.dataset.pollId);
          const optionId = Number(option.dataset.optionId);
          state.selected[pollId] = optionId;
          updateCardSelection(pollId, optionId);
          return;
        }
        const voteButton = event.target.closest('[data-vote-poll]');
        if (voteButton) vote(Number(voteButton.dataset.votePoll), voteButton);
      });
    }

    const refresh = UI.qs('#refresh-polls');
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
