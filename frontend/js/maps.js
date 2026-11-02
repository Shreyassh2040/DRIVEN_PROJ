/* Optional Google Maps integration with an honest coordinate fallback */
(function () {
  'use strict';

  let configPromise = null;
  let googlePromise = null;
  let failed = false;

  function getConfig() {
    if (!configPromise) {
      configPromise = window.CivicApi.public.config()
        .then(function (payload) { return (payload && payload.data) || {}; })
        .catch(function () { return { maps: { enabled: false, apiKey: null } }; });
    }
    return configPromise;
  }

  function loadGoogle(apiKey) {
    if (window.google && window.google.maps) return Promise.resolve(window.google.maps);
    if (failed) return Promise.reject(new Error('Maps unavailable'));
    if (googlePromise) return googlePromise;
    googlePromise = new Promise(function (resolve, reject) {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&v=weekly`;
      script.async = true;
      script.defer = true;
      script.onload = function () {
        if (window.google && window.google.maps) resolve(window.google.maps);
        else { failed = true; reject(new Error('Maps failed to initialise')); }
      };
      script.onerror = function () { failed = true; reject(new Error('Maps failed to load')); };
      document.head.appendChild(script);
    });
    return googlePromise;
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function hasCoordinates(lat, lng) {
    return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;
  }

  function directionsUrl(lat, lng) {
    if (!hasCoordinates(lat, lng)) return '';
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
  }

  function coordinateMarkup(lat, lng) {
    if (!hasCoordinates(lat, lng)) return '';
    const latText = Number(lat).toFixed(6);
    const lngText = Number(lng).toFixed(6);
    const link = directionsUrl(lat, lng);
    return `<div class="map-coordinates">
      <span class="coordinate-pill">${escapeHtml(latText)}, ${escapeHtml(lngText)}</span>
      ${link ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${window.CivicIcons.icon('navigation', 14)}Directions</a>` : ''}
    </div>`;
  }

  function fallback(container, options) {
    const opts = options || {};
    const lat = opts.lat;
    const lng = opts.lng;
    const has = hasCoordinates(lat, lng);
    const reason = opts.reason || (has
      ? 'Interactive maps are not configured for this deployment. The recorded coordinates and directions remain available.'
      : 'No coordinates were recorded for this location.');
    container.innerHTML = `
      <div class="map-fallback">
        <div class="icon-tile">${window.CivicIcons.icon('map-pin', 22)}</div>
        <h3>${escapeHtml(opts.title || (has ? 'Location recorded' : 'Location not mapped'))}</h3>
        <p>${escapeHtml(opts.address || reason)}</p>
        ${has ? coordinateMarkup(lat, lng) : `<p class="text-xs muted">${escapeHtml(opts.emptyHint || 'Add an address or coordinates to help the response team find this location.')}</p>`}
      </div>`;
  }

  function render(container, options) {
    if (!container) return Promise.resolve(null);
    const opts = options || {};
    const lat = Number(opts.lat);
    const lng = Number(opts.lng);
    container.classList.add('map-canvas');
    container.innerHTML = `<div class="map-fallback"><span class="spinner dark" role="status" aria-label="Loading map"></span><p class="text-xs muted">Preparing location…</p></div>`;

    if (!hasCoordinates(lat, lng)) {
      fallback(container, Object.assign({}, opts, { reason: opts.emptyMessage }));
      return Promise.resolve(null);
    }

    return getConfig().then(function (config) {
      const maps = config.maps || {};
      if (!maps.enabled || !maps.apiKey) {
        fallback(container, opts);
        return null;
      }
      return loadGoogle(maps.apiKey).then(function (googleMaps) {
        container.innerHTML = '';
        const position = { lat: lat, lng: lng };
        const map = new googleMaps.Map(container, {
          center: position,
          zoom: opts.zoom || 16,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          gestureHandling: opts.interactive === false ? 'none' : 'cooperative',
          styles: [
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] },
            { featureType: 'all', elementType: 'labels.text.fill', stylers: [{ color: '#4b5a68' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dbe7ec' }] },
            { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] }
          ]
        });
        const marker = new googleMaps.Marker({
          position: position,
          map: map,
          title: opts.label || 'Reported location'
        });
        if (opts.interactive !== false && typeof opts.onPick === 'function') {
          map.addListener('click', function (event) {
            const next = event.latLng.toJSON();
            marker.setPosition(next);
            opts.onPick(next.lat, next.lng);
          });
        }
        return { map: map, marker: marker, google: googleMaps };
      }).catch(function () {
        fallback(container, Object.assign({}, opts, {
          reason: 'The interactive map could not load. The recorded coordinates and directions remain available.'
        }));
        return null;
      });
    });
  }

  function renderStaticMini(container, options) {
    if (!container) return;
    const opts = options || {};
    const has = hasCoordinates(opts.lat, opts.lng);
    container.innerHTML = `<div class="map-fallback" style="min-height:0;padding:16px">
      <div class="icon-tile">${window.CivicIcons.icon(has ? 'map-pin' : 'map', 20)}</div>
      <p class="text-xs muted">${escapeHtml(has ? 'Coordinates available' : 'No coordinates recorded')}</p>
      ${has ? coordinateMarkup(opts.lat, opts.lng) : ''}
    </div>`;
  }

  window.CivicMaps = {
    getConfig: getConfig,
    hasCoordinates: hasCoordinates,
    directionsUrl: directionsUrl,
    render: render,
    renderStaticMini: renderStaticMini,
    fallback: fallback
  };
})();
