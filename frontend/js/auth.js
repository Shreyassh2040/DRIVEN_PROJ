/* Login and registration flows */
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

  function setMessage(node, message, tone) {
    if (!node) return;
    node.textContent = message || '';
    node.classList.toggle('is-error', tone === 'error');
    node.classList.toggle('is-success', tone === 'success');
  }

  function bindPasswordToggles() {
    UI.qsa('[data-toggle-password]').forEach(function (button) {
      button.addEventListener('click', function () {
        const field = button.closest('.input-group');
        const input = field && field.querySelector('input');
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.setAttribute('aria-pressed', String(show));
        button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        button.innerHTML = Icons.icon(show ? 'eye-off' : 'eye', 17);
      });
    });
  }

  function bindPasswordMeter(input, meter) {
    if (!input || !meter) return;
    const bars = Array.from(meter.children);
    input.addEventListener('input', function () {
      const value = input.value;
      let score = 0;
      if (value.length >= 8) score += 1;
      if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
      if (/\d/.test(value)) score += 1;
      if (/[^A-Za-z0-9]/.test(value) || value.length >= 12) score += 1;
      if (!value) score = 0;
      bars.forEach(function (bar, index) {
        bar.className = '';
        if (index < score) {
          bar.classList.add(score <= 1 ? 'is-weak' : score <= 2 ? 'is-fair' : 'is-strong');
        }
      });
      meter.setAttribute('aria-label', score <= 1 ? 'Weak password' : score <= 2 ? 'Fair password' : 'Strong password');
    });
  }

  async function detectSession(continueLink, alertBox) {
    if (!Api.isAuthed()) return;
    try {
      const payload = await Api.auth.me();
      const user = payload.data.user;
      if (continueLink) {
        continueLink.href = HOME[user.role] || 'citizen-dashboard.html';
        continueLink.textContent = `Continue as ${user.full_name.split(' ')[0]}`;
      }
      if (alertBox) alertBox.hidden = false;
    } catch { /* not signed in */ }
  }

  function clientValidate(fields) {
    const problem = fields.find(function (field) { return field.message; });
    if (!problem) return true;
    const input = document.getElementById(problem.id);
    if (input) {
      UI.setFieldError(input, problem.message);
      input.focus();
    }
    return false;
  }

  function initLogin() {
    const form = document.getElementById('login-form');
    if (!form) return;
    const message = document.getElementById('login-message');
    const submit = document.getElementById('login-submit');
    const alertBox = document.getElementById('already-signed-in');
    const continueLink = document.getElementById('continue-link');
    detectSession(continueLink, alertBox);

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      UI.clearFormErrors(form);
      setMessage(message, '');

      const email = form.email.value.trim();
      const password = form.password.value;
      const valid = clientValidate([
        { id: 'email', message: email ? '' : 'Enter the email address linked to your account.' },
        { id: 'password', message: password ? '' : 'Enter your password.' }
      ]);
      if (!valid) return;

      UI.setLoading(submit, true, 'Signing in…');
      try {
        const payload = await Api.auth.login(email, password);
        const user = payload.data.user;
        setMessage(message, 'Signed in. Redirecting…', 'success');
        const fallback = HOME[user.role] || 'citizen-dashboard.html';
        const next = Api.consumeNext(fallback);
        window.location.replace(next);
      } catch (error) {
        if (error.status === 429) {
          setMessage(message, 'Too many sign-in attempts. Please wait 15 minutes before trying again.', 'error');
        } else if (error.status === 403) {
          setMessage(message, error.message, 'error');
        } else if (error.status === 401) {
          setMessage(message, 'The email or password did not match an active account.', 'error');
          UI.setFieldError(form.email, 'Check your email address.');
          UI.setFieldError(form.password, 'Check your password.');
        } else if (error.errors) {
          UI.applyServerErrors(form, error.errors);
        } else {
          setMessage(message, error.message, 'error');
        }
      } finally {
        UI.setLoading(submit, false);
      }
    });
  }

  function initRegister() {
    const form = document.getElementById('register-form');
    if (!form) return;
    const message = document.getElementById('register-message');
    const submit = document.getElementById('register-submit');
    bindPasswordMeter(form.password, document.getElementById('password-meter'));

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      UI.clearFormErrors(form);
      setMessage(message, '');

      const fullName = form.full_name.value.trim();
      const email = form.email.value.trim();
      const password = form.password.value;
      const confirm = form.confirm_password.value;
      const acknowledged = form.acknowledge.checked;

      const valid = clientValidate([
        { id: 'full_name', message: fullName.length >= 2 ? '' : 'Enter your full name (at least 2 characters).' },
        { id: 'email', message: email ? '' : 'Enter your email address.' },
        { id: 'password', message: password.length >= 8 ? '' : 'Use a password of at least 8 characters.' },
        { id: 'confirm_password', message: password === confirm ? '' : 'The passwords do not match.' },
        { id: 'acknowledge', message: acknowledged ? '' : 'Please confirm how your report information is used.' }
      ]);
      if (!valid) return;

      UI.setLoading(submit, true, 'Creating account…');
      try {
        const payload = await Api.auth.register(fullName, email, password);
        setMessage(message, payload.message || 'Account created. Redirecting…', 'success');
        window.location.replace('citizen-dashboard.html');
      } catch (error) {
        if (error.status === 429) {
          setMessage(message, 'Too many attempts. Please wait a few minutes and try again.', 'error');
        } else if (error.status === 409) {
          setMessage(message, error.message, 'error');
          UI.setFieldError(form.email, 'An account already uses this email address.');
        } else if (error.errors) {
          UI.applyServerErrors(form, error.errors);
        } else {
          setMessage(message, error.message, 'error');
        }
      } finally {
        UI.setLoading(submit, false);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    Icons.mount(document);
    UI.qsa('[data-current-year]').forEach(function (node) { node.textContent = new Date().getFullYear(); });
    bindPasswordToggles();
    initLogin();
    initRegister();
  });
})();
