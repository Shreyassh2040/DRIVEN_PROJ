/* CivicFlow API client — token handling, JSON/FormData requests, blob photos */
(function () {
  'use strict';

  const TOKEN_KEY = 'civicflow_token';
  const USER_KEY = 'civicflow_user';
  const NEXT_KEY = 'civicflow_after_login';

  function resolveBase() {
    const { protocol, hostname, port } = window.location;
    if (port === '3000' || port === '80' || port === '' || port === '443') return '/api';
    if (protocol === 'file:') return 'http://localhost:3000/api';
    return `${protocol}//${hostname}:3000/api`;
  }

  const BASE = resolveBase();

  class ApiError extends Error {
    constructor(message, status, errors, payload) {
      super(message);
      this.name = 'ApiError';
      this.status = status || 0;
      this.errors = errors || null;
      this.payload = payload || null;
    }
  }

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }

  function parseUser(raw) {
    if (!raw) return null;
    try {
      const user = JSON.parse(raw);
      return user && typeof user === 'object' ? user : null;
    } catch {
      return null;
    }
  }

  function getUser() {
    try { return parseUser(localStorage.getItem(USER_KEY)); } catch { return null; }
  }

  function setSession(token, user) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch { /* storage may be unavailable in private mode */ }
    window.dispatchEvent(new CustomEvent('civicflow:session', { detail: { user: user || null } }));
  }

  function setUser(user) {
    try {
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
      else localStorage.removeItem(USER_KEY);
    } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('civicflow:session', { detail: { user: user || null } }));
  }

  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('civicflow:session', { detail: { user: null } }));
  }

  function isAuthed() {
    return Boolean(getToken());
  }

  function rememberNext(path) {
    try { sessionStorage.setItem(NEXT_KEY, path); } catch { /* ignore */ }
  }

  function consumeNext(fallback) {
    try {
      const next = sessionStorage.getItem(NEXT_KEY);
      sessionStorage.removeItem(NEXT_KEY);
      if (next && !/^https?:/i.test(next)) return next;
    } catch { /* ignore */ }
    return fallback;
  }

  async function request(path, options) {
    const opts = options || {};
    const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    const token = getToken();
    if (token && !opts.skipAuth) headers.Authorization = `Bearer ${token}`;

    let body = opts.body;
    if (body !== undefined && body !== null && !(body instanceof FormData) && typeof body !== 'string') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(`${BASE}${path}`, {
        method: opts.method || 'GET',
        headers,
        body,
        signal: opts.signal,
        cache: 'no-store'
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new ApiError('Cannot reach the CivicFlow service. Check your connection and try again.', 0);
    }

    let payload = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try { payload = await response.json(); } catch { payload = null; }
    } else if (contentType.includes('text/csv')) {
      return { success: response.ok, blob: await response.blob(), response };
    } else if (response.status !== 204) {
      try { payload = { message: await response.text() }; } catch { payload = null; }
    }

    if (!response.ok || (payload && payload.success === false)) {
      if (response.status === 401 && !opts.allowUnauthorized) {
        clearSession();
        window.dispatchEvent(new CustomEvent('civicflow:unauthorized'));
      }
      const message = (payload && payload.message) || defaultMessage(response.status);
      throw new ApiError(message, response.status, payload && payload.errors, payload);
    }
    return payload || { success: true, data: {} };
  }

  function defaultMessage(status) {
    if (status === 403) return 'You do not have permission to perform this action.';
    if (status === 404) return 'The requested record could not be found.';
    if (status === 429) return 'Too many requests. Please wait a moment and try again.';
    if (status >= 500) return 'The service ran into a problem. Please try again.';
    return 'The request could not be completed.';
  }

  async function fetchBlob(path) {
    const headers = { Accept: 'image/*' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${BASE}${path}`, { headers, cache: 'no-store' });
    if (!response.ok) {
      let message = 'The photograph could not be loaded.';
      try {
        const payload = await response.json();
        if (payload && payload.message) message = payload.message;
      } catch { /* non-JSON error */ }
      throw new ApiError(message, response.status);
    }
    return URL.createObjectURL(await response.blob());
  }

  const api = {
    base: BASE,
    ApiError,
    request,
    fetchBlob,
    getToken,
    getUser,
    setUser,
    setSession,
    clearSession,
    isAuthed,
    rememberNext,
    consumeNext,
    get(path, options) { return request(path, Object.assign({ method: 'GET' }, options)); },
    post(path, body, options) { return request(path, Object.assign({ method: 'POST', body }, options)); },
    put(path, body, options) { return request(path, Object.assign({ method: 'PUT', body }, options)); },
    patch(path, body, options) { return request(path, Object.assign({ method: 'PATCH', body }, options)); },
    del(path, options) { return request(path, Object.assign({ method: 'DELETE' }, options)); },

    auth: {
      async login(email, password) {
        const payload = await request('/auth/login', { method: 'POST', body: { email, password }, skipAuth: true });
        if (payload && payload.data && payload.data.token) {
          setSession(payload.data.token, payload.data.user);
        }
        return payload;
      },
      async register(fullName, email, password) {
        const payload = await request('/auth/register', {
          method: 'POST',
          body: { full_name: fullName, email, password },
          skipAuth: true
        });
        if (payload && payload.data && payload.data.token) {
          setSession(payload.data.token, payload.data.user);
        }
        return payload;
      },
      async me() {
        const payload = await request('/auth/me');
        if (payload && payload.data && payload.data.user) setUser(payload.data.user);
        return payload;
      },
      logout() {
        clearSession();
      }
    },

    issues: {
      mine(params) { return request(`/issues/my${query(params)}`); },
      get(id) { return request(`/issues/${id}`); },
      history(id) { return request(`/issues/${id}/history`); },
      photo(id) { return fetchBlob(`/issues/${id}/photo`); },
      create(formData) { return request('/issues', { method: 'POST', body: formData }); }
    },

    services: {
      list(params) { return request(`/services${query(params)}`); },
      meta() { return request('/services/meta'); },
      get(id) { return request(`/services/${id}`); }
    },

    polls: {
      list(params) { return request(`/polls${query(params)}`); },
      get(id) { return request(`/polls/${id}`); },
      vote(id, optionId) { return request(`/polls/${id}/vote`, { method: 'POST', body: { option_id: optionId } }); }
    },

    notifications: {
      list(params) { return request(`/notifications${query(params)}`); },
      unreadCount() { return request('/notifications/unread-count'); },
      markRead(id) { return request(`/notifications/${id}/read`, { method: 'PATCH' }); },
      markAllRead() { return request('/notifications/read-all', { method: 'PATCH' }); }
    },

    officer: {
      complaints(params) { return request(`/officer/complaints${query(params)}`); },
      complaint(id) { return request(`/officer/complaints/${id}`); },
      stats() { return request('/officer/stats'); },
      officers() { return request('/officer/officers'); },
      updateStatus(id, body) { return request(`/officer/complaints/${id}/status`, { method: 'PATCH', body }); },
      assign(id, body) { return request(`/officer/complaints/${id}/assign`, { method: 'POST', body }); },
      comment(id, body) { return request(`/officer/complaints/${id}/comments`, { method: 'POST', body }); }
    },

    admin: {
      dashboard() { return request('/admin/dashboard'); },
      analytics(params) { return request(`/admin/analytics${query(params)}`); },
      users(params) { return request(`/admin/users${query(params)}`); },
      user(id) { return request(`/admin/users/${id}`); },
      setUserStatus(id, isActive) { return request(`/admin/users/${id}/status`, { method: 'PATCH', body: { is_active: isActive } }); },
      setUserRole(id, role) { return request(`/admin/users/${id}/role`, { method: 'PATCH', body: { role } }); },
      officers() { return request('/admin/officers'); },
      createOfficer(body) { return request('/admin/officers', { method: 'POST', body }); },
      updateOfficer(id, body) { return request(`/admin/officers/${id}`, { method: 'PUT', body }); },
      complaints(params) { return request(`/admin/complaints${query(params)}`); },
      logs(params) { return request(`/admin/activity-logs${query(params)}`); },
      settings() { return request('/admin/settings'); },
      updateSettings(body) { return request('/admin/settings', { method: 'PUT', body }); },
      services(params) { return request(`/services${query(Object.assign({ include_inactive: '1' }, params))}`); },
      createService(body) { return request('/services', { method: 'POST', body }); },
      updateService(id, body) { return request(`/services/${id}`, { method: 'PUT', body }); },
      deactivateService(id) { return request(`/services/${id}`, { method: 'DELETE' }); },
      categories(all) { return request(`/service-categories${all ? '?all=1' : ''}`); },
      createCategory(body) { return request('/service-categories', { method: 'POST', body }); },
      updateCategory(id, body) { return request(`/service-categories/${id}`, { method: 'PUT', body }); },
      deleteCategory(id) { return request(`/service-categories/${id}`, { method: 'DELETE' }); },
      polls(params) { return request(`/polls${query(Object.assign({ all: '1' }, params))}`); },
      createPoll(body) { return request('/polls', { method: 'POST', body }); },
      updatePoll(id, body) { return request(`/polls/${id}`, { method: 'PUT', body }); },
      closePoll(id) { return request(`/polls/${id}/close`, { method: 'POST' }); },
      deletePoll(id) { return request(`/polls/${id}`, { method: 'DELETE' }); },
      exportUrl(params) { return `${BASE}/admin/reports/complaints.csv${query(params)}`; }
    },

    public: {
      stats() { return request('/stats'); },
      config() { return request('/config'); }
    },

    profile: {
      get() { return request('/users/profile'); },
      update(body) { return request('/users/profile', { method: 'PUT', body }); },
      changePassword(body) { return request('/auth/change-password', { method: 'POST', body }); }
    }
  };

  function query(params) {
    if (!params) return '';
    const search = new URLSearchParams();
    Object.keys(params).forEach(function (key) {
      const value = params[key];
      if (value !== undefined && value !== null && value !== '') search.append(key, value);
    });
    const string = search.toString();
    return string ? `?${string}` : '';
  }

  window.CivicApi = api;
  window.ApiError = ApiError;
})();
