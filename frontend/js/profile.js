/* Profile and security: personal details, password change and session controls */
(function () {
  'use strict';

  const UI = window.CivicUI;
  const Api = window.CivicApi;
  const Icons = window.CivicIcons;

  const ROLE_LABELS = { citizen: 'Citizen', officer: 'City officer', admin: 'City administrator' };
  let profile = null;

  function fact(icon, label, value, muted) {
    return `<div class="profile-fact">
      ${Icons.icon(icon, 15)}
      <div>
        <span>${UI.esc(label)}</span>
        <strong${muted ? ' style="color:var(--muted)"' : ''}>${UI.esc(value)}</strong>
      </div>
    </div>`;
  }

  function renderProfile(user) {
    profile = user;
    UI.qs('#profile-avatar').textContent = UI.initials(user.full_name);
    UI.qs('#profile-name').textContent = user.full_name;
    UI.qs('#profile-role').textContent = ROLE_LABELS[user.role] || UI.titleCase(user.role);
    UI.qs('#profile-badge').innerHTML = `${UI.roleBadge(user.role)} ${user.is_active
      ? '<span class="badge badge-active"><span class="dot"></span>Active</span>'
      : '<span class="badge badge-rejected"><span class="dot"></span>Inactive</span>'}`;

    UI.qs('#profile-facts').innerHTML = [
      fact('mail', 'Email address', user.email),
      fact('phone', 'Phone number', user.phone || 'Not provided', !user.phone),
      user.department ? fact('briefcase', 'Department', user.department) : '',
      fact('calendar', 'Member since', UI.formatDate(user.created_at))
    ].join('');

    UI.qs('#full-name').value = user.full_name || '';
    UI.qs('#email').value = user.email || '';
    UI.qs('#phone').value = user.phone || '';

    const departmentField = UI.qs('#department-field');
    if (user.department) {
      departmentField.hidden = false;
      UI.qs('#department').value = user.department;
    } else {
      departmentField.hidden = true;
    }
  }

  function updateShellIdentity(user) {
    UI.qsa('.user-menu-name, .sidebar-user-name').forEach(function (node) {
      node.textContent = user.full_name;
    });
    const initials = UI.initials(user.full_name);
    UI.qsa('.topbar-user .avatar, .sidebar-user .avatar').forEach(function (node) {
      node.textContent = initials;
    });
  }

  function validateProfile(form) {
    UI.clearFormErrors(form);
    const name = UI.qs('#full-name');
    const phone = UI.qs('#phone');
    let valid = true;
    if (name.value.trim().length < 2) {
      UI.setFieldError(name, 'Enter your full name (at least 2 characters).');
      valid = false;
    }
    const phoneValue = phone.value.trim();
    if (phoneValue && !/^[+()\-\s\d]{6,30}$/.test(phoneValue)) {
      UI.setFieldError(phone, 'Enter a valid phone number using digits, spaces, +, ( ) or hyphens.');
      valid = false;
    }
    if (!valid) UI.toast('Please fix the highlighted fields.', 'error');
    return valid;
  }

  async function saveProfile(event) {
    event.preventDefault();
    const form = UI.qs('#profile-form');
    if (!validateProfile(form)) return;
    const button = UI.qs('#save-profile');
    UI.setLoading(button, true, 'Saving…');
    try {
      const payload = await Api.profile.update({
        full_name: UI.qs('#full-name').value.trim(),
        phone: UI.qs('#phone').value.trim()
      });
      const user = payload.data.user;
      renderProfile(user);
      const cached = Api.getUser() || {};
      Api.setUser(Object.assign({}, cached, user));
      updateShellIdentity(user);
      UI.toast('Your profile has been updated.', 'success');
    } catch (error) {
      if (error.errors) UI.applyServerErrors(form, error.errors);
      UI.toast(error.message || 'Your profile could not be updated.', 'error');
    } finally {
      UI.setLoading(button, false);
    }
  }

  function validatePassword(form) {
    UI.clearFormErrors(form);
    const current = UI.qs('#current-password');
    const next = UI.qs('#new-password');
    const confirm = UI.qs('#confirm-password');
    let valid = true;
    if (!current.value) {
      UI.setFieldError(current, 'Enter your current password.');
      valid = false;
    }
    if (next.value.length < 8) {
      UI.setFieldError(next, 'Choose a password of at least 8 characters.');
      valid = false;
    }
    if (confirm.value !== next.value) {
      UI.setFieldError(confirm, 'The confirmation does not match the new password.');
      valid = false;
    }
    if (current.value && next.value && current.value === next.value) {
      UI.setFieldError(next, 'Choose a password different from your current password.');
      valid = false;
    }
    if (!valid) UI.toast('Please fix the highlighted fields.', 'error');
    return valid;
  }

  async function changePassword(event) {
    event.preventDefault();
    const form = UI.qs('#password-form');
    if (!validatePassword(form)) return;
    const button = UI.qs('#save-password');
    UI.setLoading(button, true, 'Updating…');
    try {
      await Api.profile.changePassword({
        current_password: UI.qs('#current-password').value,
        new_password: UI.qs('#new-password').value
      });
      form.reset();
      UI.qsa('[data-toggle-password]', form).forEach(function (toggle) {
        const input = document.getElementById(toggle.dataset.for);
        if (input) input.type = 'password';
        toggle.setAttribute('aria-pressed', 'false');
        toggle.setAttribute('aria-label', 'Show password');
      });
      UI.toast('Your password has been updated.', 'success');
    } catch (error) {
      if (error.errors) UI.applyServerErrors(form, error.errors);
      UI.toast(error.message || 'Your password could not be updated.', 'error');
    } finally {
      UI.setLoading(button, false);
    }
  }

  function bindPasswordToggles() {
    UI.qsa('[data-toggle-password]').forEach(function (button) {
      button.addEventListener('click', function () {
        const input = document.getElementById(button.dataset.for);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.setAttribute('aria-pressed', String(show));
        button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        const icon = UI.qs('.icon', button);
        if (icon) icon.outerHTML = Icons.icon(show ? 'eye-off' : 'eye', 17);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    Icons.mount(document);
    const user = await window.CivicShell.ready;
    if (!user) return;

    try {
      const payload = await Api.profile.get();
      renderProfile(payload.data.user);
    } catch (error) {
      UI.toast(error.message || 'Your profile could not be loaded.', 'error');
      return;
    }

    UI.qs('#profile-form').addEventListener('submit', saveProfile);
    UI.qs('#password-form').addEventListener('submit', changePassword);
    bindPasswordToggles();

    UI.qsa('form').forEach(function (form) {
      form.addEventListener('input', function (event) {
        const holder = event.target.closest('.has-error');
        if (!holder) return;
        holder.classList.remove('has-error');
        const error = UI.qs('.field-error', holder);
        if (error) error.remove();
        event.target.removeAttribute('aria-invalid');
      });
    });
  });
})();
