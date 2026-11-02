/* Report an issue: validation, optional geolocation, photo preview and success state */
(function () {
  'use strict';

  const UI = window.CivicUI;
  const Api = window.CivicApi;
  const Icons = window.CivicIcons;
  const Maps = window.CivicMaps;

  const CATEGORY_LABELS = {
    pothole: 'Pothole',
    garbage: 'Garbage accumulation',
    streetlight: 'Streetlight failure',
    water_supply: 'Water supply',
    drainage: 'Drainage',
    road_damage: 'Road damage',
    other: 'Other civic issue'
  };

  let previewUrl = null;
  let maxUploadMb = 5;
  let mapTimer = null;

  function setStatus(message, tone) {
    const node = UI.qs('#location-status');
    if (!node) return;
    node.className = `location-status${tone ? ` is-${tone}` : ''}`;
    node.innerHTML = `${Icons.icon(tone === 'success' ? 'check-circle' : tone === 'error' ? 'alert-circle' : 'info', 14)}<span>${UI.esc(message)}</span>`;
  }

  function coordinates() {
    const lat = Number(UI.qs('#latitude').value);
    const lng = Number(UI.qs('#longitude').value);
    if (!UI.qs('#latitude').value.trim() || !UI.qs('#longitude').value.trim()) return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat: lat, lng: lng };
  }

  function renderPreview() {
    const host = UI.qs('#location-preview');
    if (!host) return;
    const point = coordinates();
    host.innerHTML = '<div id="report-location-map"></div>';
    Maps.render(UI.qs('#report-location-map'), {
      lat: point ? point.lat : null,
      lng: point ? point.lng : null,
      label: 'Reported issue location',
      emptyHint: 'Add an address above, use your current location, or enter coordinates to preview the location.',
      onPick: function (lat, lng) {
        UI.qs('#latitude').value = Number(lat).toFixed(6);
        UI.qs('#longitude').value = Number(lng).toFixed(6);
        UI.clearFormErrors(UI.qs('#report-form'));
        setStatus('Location selected on the map. Coordinates attached.', 'success');
        renderPreview();
      }
    });
  }

  function applyCoordinates(lat, lng, message) {
    UI.qs('#latitude').value = Number(lat).toFixed(6);
    UI.qs('#longitude').value = Number(lng).toFixed(6);
    setStatus(message || `Coordinates attached: ${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}.`, 'success');
    renderPreview();
  }

  function updateManualCoordinates() {
    window.clearTimeout(mapTimer);
    const latValue = UI.qs('#latitude').value.trim();
    const lngValue = UI.qs('#longitude').value.trim();
    if (!latValue && !lngValue) {
      setStatus('No coordinates attached yet.');
      renderPreview();
      return;
    }
    if (!latValue || !lngValue) {
      setStatus('Enter both latitude and longitude, or clear both fields.');
      renderPreview();
      return;
    }
    const point = coordinates();
    if (!point) {
      setStatus('Coordinates are outside the valid range. Latitude must be −90 to 90 and longitude −180 to 180.', 'error');
      return;
    }
    setStatus(`Coordinates attached: ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}.`, 'success');
    mapTimer = window.setTimeout(renderPreview, 420);
  }

  function useCurrentLocation(button) {
    if (!navigator.geolocation) {
      setStatus('This browser does not support location access. Enter an address or coordinates instead.', 'error');
      return;
    }
    UI.setLoading(button, true, 'Locating…');
    setStatus('Requesting your device location…');
    navigator.geolocation.getCurrentPosition(function (position) {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      applyCoordinates(lat, lng, `Current location attached (accurate to about ${Math.round(position.coords.accuracy)} m).`);
      UI.setLoading(button, false);
      UI.qs('#clear-location').hidden = false;
      UI.toast('Current location attached to the complaint.', 'success');
    }, function (error) {
      UI.setLoading(button, false);
      const messages = {
        1: 'Location permission was denied. Allow access in your browser settings, or enter an address or coordinates.',
        2: 'Your location could not be determined right now. Enter an address or coordinates instead.',
        3: 'The location request timed out. Try again, or enter an address or coordinates.'
      };
      setStatus(messages[error.code] || 'Your location could not be retrieved. Enter an address or coordinates instead.', 'error');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }

  function clearLocation() {
    UI.qs('#latitude').value = '';
    UI.qs('#longitude').value = '';
    UI.qs('#clear-location').hidden = true;
    setStatus('No coordinates attached yet.');
    renderPreview();
    UI.qs('#address').focus();
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function revokePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
  }

  function validatePhoto(file) {
    if (!file) return true;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    const nameOk = /\.(jpe?g|png|webp)$/i.test(file.name || '');
    if (!allowed.includes(file.type) && !nameOk) {
      UI.setFieldError(UI.qs('#photo'), 'Use a JPEG, PNG or WebP image.');
      return false;
    }
    if (file.size > maxUploadMb * 1024 * 1024) {
      UI.setFieldError(UI.qs('#photo'), `The photo must be ${maxUploadMb} MB or smaller.`);
      return false;
    }
    return true;
  }

  function showPhoto(file) {
    const input = UI.qs('#photo');
    UI.clearFormErrors(UI.qs('#report-form'));
    if (!file) {
      removePhoto();
      return;
    }
    if (!validatePhoto(file)) {
      input.value = '';
      removePhoto();
      return;
    }
    revokePreview();
    previewUrl = URL.createObjectURL(file);
    UI.qs('#photo-preview-image').src = previewUrl;
    UI.qs('#photo-name').textContent = file.name;
    UI.qs('#photo-size').textContent = `${formatBytes(file.size)} · ${file.type || 'image'}`;
    UI.qs('#photo-preview').hidden = false;
    UI.qs('#photo-zone').classList.add('has-file');
    UI.qs('#remove-photo').hidden = false;
  }

  function removePhoto() {
    const input = UI.qs('#photo');
    if (input) input.value = '';
    revokePreview();
    const preview = UI.qs('#photo-preview');
    if (preview) preview.hidden = true;
    const image = UI.qs('#photo-preview-image');
    if (image) image.removeAttribute('src');
    const zone = UI.qs('#photo-zone');
    if (zone) zone.classList.remove('has-file');
  }

  function updateCounter(inputId, counterId, max) {
    const input = UI.qs(inputId);
    const counter = UI.qs(counterId);
    if (!input || !counter) return;
    const length = input.value.length;
    counter.textContent = `${UI.formatNumber(length)} / ${UI.formatNumber(max)}`;
    counter.classList.toggle('is-near', length > max * 0.85 && length <= max);
    counter.classList.toggle('is-over', length > max);
  }

  function validateForm(form) {
    UI.clearFormErrors(form);
    let valid = true;
    const title = UI.qs('#title');
    const category = UI.qs('#category');
    const description = UI.qs('#description');
    const address = UI.qs('#address');
    const latitude = UI.qs('#latitude');
    const longitude = UI.qs('#longitude');
    const accuracy = UI.qs('#accuracy');

    if (title.value.trim().length < 4) {
      UI.setFieldError(title, 'Enter a title of at least 4 characters.');
      valid = false;
    }
    if (!category.value) {
      UI.setFieldError(category, 'Choose the category that matches the issue.');
      valid = false;
    }
    if (description.value.trim().length < 10) {
      UI.setFieldError(description, 'Describe the issue in at least 10 characters.');
      valid = false;
    }

    const hasLat = latitude.value.trim() !== '';
    const hasLng = longitude.value.trim() !== '';
    if (hasLat !== hasLng) {
      UI.setFieldError(hasLat ? longitude : latitude, 'Enter both latitude and longitude, or clear both.');
      valid = false;
    } else if (hasLat) {
      const lat = Number(latitude.value);
      const lng = Number(longitude.value);
      if (!Number.isFinite(lat) || Math.abs(lat) > 90) {
        UI.setFieldError(latitude, 'Latitude must be between −90 and 90.');
        valid = false;
      }
      if (!Number.isFinite(lng) || Math.abs(lng) > 180) {
        UI.setFieldError(longitude, 'Longitude must be between −180 and 180.');
        valid = false;
      }
    }

    if (!address.value.trim() && !(hasLat && hasLng)) {
      UI.setFieldError(address, 'Enter an address or attach coordinates for the location.');
      valid = false;
    }

    const file = UI.qs('#photo').files[0];
    if (file && !validatePhoto(file)) valid = false;

    if (!accuracy.checked) {
      UI.setFieldError(accuracy, 'Confirm that the report is accurate before submitting.');
      valid = false;
    }

    if (!valid) {
      const first = UI.qs('.field.has-error input, .field.has-error select, .field.has-error textarea', form);
      if (first) first.focus();
      UI.toast('Please fix the highlighted fields before submitting.', 'error');
    }
    return valid;
  }

  function buildFormData() {
    const data = new FormData();
    data.append('title', UI.qs('#title').value.trim());
    data.append('category', UI.qs('#category').value);
    data.append('description', UI.qs('#description').value.trim());
    data.append('address', UI.qs('#address').value.trim());
    data.append('area', UI.qs('#area').value.trim());
    const point = coordinates();
    if (point) {
      data.append('latitude', String(point.lat));
      data.append('longitude', String(point.lng));
    }
    const file = UI.qs('#photo').files[0];
    if (file) data.append('photo', file, file.name);
    return data;
  }

  function showSuccess(issue) {
    const layout = UI.qs('#report-layout');
    const success = UI.qs('#report-success');
    if (layout) layout.hidden = true;
    if (success) success.hidden = false;

    UI.qs('#tracking-code').value = issue.tracking_code || '';
    UI.qs('#success-title').textContent = issue.title || 'Complaint recorded';
    UI.qs('#success-category').textContent = issue.category_label || CATEGORY_LABELS[issue.category] || 'Complaint';
    UI.qs('#success-status').textContent = issue.status_label || 'Submitted';
    const details = UI.qs('#success-details');
    if (details && issue.id) details.href = `complaint-details.html?id=${Number(issue.id)}`;

    const heading = UI.qs('#report-success h1');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(form) {
    if (!validateForm(form)) return;
    const button = UI.qs('#submit-issue');
    UI.setLoading(button, true, 'Submitting…');
    try {
      const payload = await Api.issues.create(buildFormData());
      UI.toast('Complaint submitted successfully.', 'success');
      removePhoto();
      showSuccess(payload.data.issue || {});
    } catch (error) {
      if (error.errors) UI.applyServerErrors(form, error.errors);
      UI.toast(error.message || 'The complaint could not be submitted.', 'error');
    } finally {
      UI.setLoading(button, false);
    }
  }

  function prefillCategory() {
    const params = new URLSearchParams(window.location.search);
    const category = params.get('category');
    if (category && CATEGORY_LABELS[category]) UI.qs('#category').value = category;
  }

  document.addEventListener('DOMContentLoaded', async function () {
    Icons.mount(document);
    const user = await window.CivicShell.ready;
    if (!user) return;

    const form = UI.qs('#report-form');
    const photoInput = UI.qs('#photo');
    const latInput = UI.qs('#latitude');
    const lngInput = UI.qs('#longitude');

    prefillCategory();
    renderPreview();

    Api.public.config().then(function (payload) {
      const uploads = payload.data.uploads || {};
      if (uploads.maxSizeMb) {
        maxUploadMb = Number(uploads.maxSizeMb) || maxUploadMb;
        UI.qs('#photo-hint').textContent = `JPEG, PNG or WebP · up to ${maxUploadMb} MB`;
      }
    }).catch(function () { /* defaults already shown */ });

    UI.qs('#title').addEventListener('input', function () { updateCounter('#title', '#title-count', 160); });
    UI.qs('#description').addEventListener('input', function () { updateCounter('#description', '#description-count', 5000); });
    updateCounter('#title', '#title-count', 160);
    updateCounter('#description', '#description-count', 5000);

    photoInput.addEventListener('change', function () { showPhoto(photoInput.files[0]); });
    UI.qs('#remove-photo').addEventListener('click', removePhoto);

    const zone = UI.qs('#photo-zone');
    ['dragenter', 'dragover'].forEach(function (type) {
      zone.addEventListener(type, function (event) {
        event.preventDefault();
        zone.classList.add('is-dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (type) {
      zone.addEventListener(type, function (event) {
        event.preventDefault();
        zone.classList.remove('is-dragover');
      });
    });
    zone.addEventListener('drop', function (event) {
      const file = event.dataTransfer && event.dataTransfer.files[0];
      if (!file) return;
      try {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        photoInput.files = transfer.files;
        showPhoto(file);
      } catch {
        showPhoto(file);
      }
    });

    UI.qs('#use-location').addEventListener('click', function () { useCurrentLocation(this); });
    UI.qs('#clear-location').addEventListener('click', clearLocation);
    latInput.addEventListener('input', updateManualCoordinates);
    lngInput.addEventListener('input', updateManualCoordinates);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      submit(form);
    });

    form.addEventListener('input', function (event) {
      const field = event.target.closest('.field');
      if (field && field.classList.contains('has-error')) {
        field.classList.remove('has-error');
        const error = UI.qs('.field-error', field);
        if (error) error.remove();
        event.target.removeAttribute('aria-invalid');
      }
    });

    document.addEventListener('click', function (event) {
      if (event.target.closest('#copy-tracking')) {
        const value = UI.qs('#tracking-code').value;
        if (value) UI.copyText(value).then(function () {
          UI.toast('Tracking ID copied to the clipboard.', 'success');
        }).catch(function () {
          UI.toast('Copy failed. Select the tracking ID and copy it manually.', 'error');
        });
      }
    });
  });
})();
