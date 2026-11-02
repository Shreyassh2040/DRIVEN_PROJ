/* CivicFlow icon set — inline SVG, no external dependency */
(function () {
  'use strict';

  const PATHS = {
    shield: '<path d="M12 3 4.5 6v5.4c0 4.4 3.1 8.2 7.5 9.6 4.4-1.4 7.5-5.2 7.5-9.6V6L12 3Z"/><path d="m9 12 2 2 4-4"/>',
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    dashboard: '<rect x="3" y="3" width="8" height="10" rx="2"/><rect x="15" y="3" width="6" height="6" rx="2"/><rect x="15" y="13" width="6" height="8" rx="2"/><rect x="3" y="17" width="8" height="4" rx="2"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    'plus-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 8v8"/><path d="M8 12h8"/>',
    'file-text': '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/>',
    'map-pin': '<path d="M20 10c0 5.2-8 11-8 11S4 15.2 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.6"/>',
    map: '<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14"/><path d="M15 6v14"/>',
    'bar-chart': '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
    'pie-chart': '<path d="M21.2 15.9A9 9 0 1 1 8.1 2.8"/><path d="M12 3v9h9a9 9 0 0 0-9-9Z"/>',
    'trending-up': '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    activity: '<path d="M3 12h4l2.5-7 5 14 2.5-7h4"/>',
    bell: '<path d="M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5a3.5 3.5 0 0 1 0 6.6"/><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    'user-check': '<circle cx="9" cy="8" r="4"/><path d="M2.5 21a6.5 6.5 0 0 1 13 0"/><path d="m16 11 2 2 4-4"/>',
    'user-plus': '<circle cx="9" cy="8" r="4"/><path d="M2.5 21a6.5 6.5 0 0 1 13 0"/><path d="M19 8v6"/><path d="M16 11h6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
    x: '<path d="m6 6 12 12"/><path d="M18 6 6 18"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-up': '<path d="m6 15 6-6 6 6"/>',
    'chevron-right': '<path d="m9 6 6 6-6 6"/>',
    'chevron-left': '<path d="m15 6-6 6 6 6"/>',
    'arrow-right': '<path d="M4 12h16"/><path d="m15 7 5 5-5 5"/>',
    'arrow-left': '<path d="M20 12H4"/><path d="m9 7-5 5 5 5"/>',
    'arrow-up-right': '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',
    download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M3 10h18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16 9"/>',
    'check-square': '<path d="M9 11.5 11.5 14 15.5 9.5"/><path d="M21 12v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h9"/>',
    'alert-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5"/><path d="M12 16h.01"/>',
    'alert-triangle': '<path d="M10.3 4.1 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    'x-circle': '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6"/><path d="m15 9-6 6"/>',
    camera: '<path d="M14.5 5 16 8h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h3l1.5-3Z"/><circle cx="12" cy="13" r="3.2"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 15-5-5L5 20"/>',
    upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 20h16"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    edit: '<path d="M12 20H4v-8L15 1l7 7-10 12Z"/><path d="m13 3 7 7"/>',
    'edit-3': '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h1"/><path d="M14 8h1"/><path d="M9 12h1"/><path d="M14 12h1"/><path d="M9 16h1"/><path d="M14 16h1"/><path d="M10 21v-3h4v3"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2"/><path d="M9 10h6"/><path d="M9 14h4"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    inbox: '<path d="M4 4h16l2 11v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4Z"/><path d="M2 15h5l1.5 2.5h7L17 15h5"/>',
    send: '<path d="m21 3-9.5 9.5"/><path d="M21 3 14 21l-3-8-8-3 18-7Z"/>',
    message: '<path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-6a8 8 0 0 1 8-8h2a8 8 0 0 1 8 3Z"/>',
    'message-square': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
    'thumbs-up': '<path d="M7 22V11l4-8a2.5 2.5 0 0 1 2.5 2.5V10h5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.3 21H7Z"/><path d="M7 11H3v11h4"/>',
    vote: '<path d="M9 12.5 11.5 15 16 10"/><path d="M4 21h16"/><path d="M6 17V4h12v13"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    phone: '<path d="M21 16.5v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 1.1 3.7 2 2 0 0 1 3.1 1.5h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L7 9.5a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2.1Z"/>',
    navigation: '<path d="m3 11 19-8-8 19-2.5-8.5L3 11Z"/>',
    crosshair: '<circle cx="12" cy="12" r="8"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/>',
    'external-link': '<path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="m3 3 18 18"/><path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.2 4M6.3 6.3A18 18 0 0 0 2 12s3.5 7 10 7a10.5 10.5 0 0 0 4-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-4L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14.9 4L21 15"/><path d="M21 20v-5h-5"/>',
    sliders: '<path d="M4 6h10"/><path d="M18 6h2"/><path d="M4 12h4"/><path d="M12 12h8"/><path d="M4 18h10"/><path d="M18 18h2"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
    sparkles: '<path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/><path d="M5 15l.6 1.4L7 17l-1.4.6L5 19l-.6-1.4L3 17l1.4-.6Z"/>',
    loader: '<path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="m5.6 5.6 2.8 2.8"/><path d="m15.6 15.6 2.8 2.8"/><path d="m18.4 5.6-2.8 2.8"/><path d="m8.4 15.6-2.8 2.8"/>',
    'more-horizontal': '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    hash: '<path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="M16 3l-2 18"/>',
    tag: '<path d="m20 13-7 7a2 2 0 0 1-2.8 0L3 12.8V4h8.8L20 12a2 2 0 0 1 0 1Z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
    flag: '<path d="M4 21V4"/><path d="M4 5c4-2 8 2 12 0v8c-4 2-8-2-12 0"/>',
    star: '<path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5L3.6 9.8l6.5-.9Z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18"/><path d="M12 3a15 15 0 0 0 0 18"/>',
    'wifi-off': '<path d="m2 2 20 20"/><path d="M8.5 8.5A11 11 0 0 1 21 9"/><path d="M5 12.5a11 11 0 0 1 3.5-2"/><path d="M8.5 16a6 6 0 0 1 6.5.5"/><path d="M12 20h.01"/><path d="M2 9a15 15 0 0 1 4-2.5"/>',
    droplet: '<path d="M12 3s6 6.3 6 10.5a6 6 0 0 1-12 0C6 9.3 12 3 12 3Z"/>',
    trash2: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    lightbulb: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.5 1 2.5h6c0-1 .4-1.9 1-2.5A6 6 0 0 0 12 3Z"/>',
    road: '<path d="M4 21 7 3"/><path d="M20 21 17 3"/><path d="M12 6v3"/><path d="M12 13v3"/>',
    recycle: '<path d="m7 19-3-5 2-1"/><path d="m5 13 3-5 3 1"/><path d="M10 4h6l2 4"/><path d="m18 8 2 4-3 2"/><path d="M17 21h-5l-1-2"/><path d="m12 19 3-5 3 1"/><path d="m9 19-3 2-2-4"/>',
    droplet2: '<path d="M12 2.7 6.3 8.4a7.5 7.5 0 1 0 11.4 0L12 2.7Z"/>',
    waves: '<path d="M2 8c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 14c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/>',
    traffic: '<rect x="7" y="2" width="10" height="20" rx="3"/><circle cx="12" cy="7" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="17" r="1.6"/>',
    trees: '<path d="M12 22v-5"/><path d="m12 3-5 7h3l-4 6h12l-4-6h3Z"/><path d="M5 22h14"/>',
    hospital: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M12 8v6"/><path d="M9 11h6"/><path d="M9 21v-3h6v3"/>',
    'heart-pulse': '<path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8Z"/><path d="M3 12h4l2-3 3 6 2-3h4"/>',
    bus: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16"/><path d="M8 21v-3"/><path d="M16 21v-3"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/>',
    'shopping-bag': '<path d="M6 8h12l1 13H5L6 8Z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>',
    landmark: '<path d="m3 9 9-6 9 6"/><path d="M5 9v9"/><path d="M9 9v9"/><path d="M15 9v9"/><path d="M19 9v9"/><path d="M3 21h18"/>',
    'graduation-cap': '<path d="m2 9 10-5 10 5-10 5Z"/><path d="M6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/>',
    droplets: '<path d="M8 2.7 4.5 6.2a5 5 0 1 0 7 0L8 2.7Z"/><path d="M16 10.7 13.5 13.2a4 4 0 1 0 5.6 0L16 10.7Z"/>'
  };

  const ALIASES = {
    'file': 'file-text',
    'list-checks': 'check-square',
    'map-pinned': 'map-pin',
    'pin': 'map-pin',
    'help': 'alert-circle',
    'error': 'alert-circle',
    'success': 'check-circle',
    'warning': 'alert-triangle'
  };

  function icon(name, size, className) {
    const key = ALIASES[name] || name;
    const body = PATHS[key] || PATHS.info;
    const dimension = Number(size) || 18;
    return `<svg class="icon ${className || ''}" width="${dimension}" height="${dimension}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  }

  function mountIcons(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-icon]').forEach(function (node) {
      const name = node.getAttribute('data-icon');
      const size = Number(node.getAttribute('data-icon-size')) || 18;
      node.innerHTML = icon(name, size);
      node.removeAttribute('data-icon');
    });
  }

  const CATEGORY_ICONS = {
    pothole: 'road',
    garbage: 'trash2',
    streetlight: 'lightbulb',
    water_supply: 'droplet2',
    drainage: 'waves',
    road_damage: 'traffic',
    other: 'map-pin'
  };

  const CATEGORY_LABELS = {
    pothole: 'Pothole',
    garbage: 'Garbage accumulation',
    streetlight: 'Streetlight failure',
    water_supply: 'Water supply',
    drainage: 'Drainage',
    road_damage: 'Road damage',
    other: 'Other civic issue'
  };

  const STATUS_LABELS = {
    submitted: 'Submitted',
    in_progress: 'In progress',
    resolved: 'Resolved',
    rejected: 'Rejected'
  };

  const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };

  window.CivicIcons = {
    icon: icon,
    mount: mountIcons,
    paths: PATHS,
    categories: CATEGORY_ICONS,
    categoryLabels: CATEGORY_LABELS,
    statusLabels: STATUS_LABELS,
    priorityLabels: PRIORITY_LABELS
  };
})();
