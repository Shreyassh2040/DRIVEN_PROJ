/* Lightweight, dependency-free SVG charts used across the dashboards */
(function () {
  'use strict';

  const COLORS = ['#284b68', '#5d8d84', '#c58b35', '#7a8fa6', '#b56b6b', '#8a9b6e'];
  let uid = 0;

  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function chartEmpty(message) {
    return `<div class="chart-empty">${esc(message || 'No data recorded for this period yet.')}</div>`;
  }

  function normalise(data) {
    return (data || [])
      .map(function (item, index) {
        return {
          label: item.label === undefined ? String(index + 1) : String(item.label),
          value: Number(item.value) || 0,
          color: item.color || COLORS[index % COLORS.length]
        };
      })
      .filter(function (item) { return item.label !== ''; });
  }

  function niceMax(value) {
    if (value <= 0) return 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const normal = value / magnitude;
    let step;
    if (normal <= 1) step = 1;
    else if (normal <= 2) step = 2;
    else if (normal <= 5) step = 5;
    else step = 10;
    return step * magnitude;
  }

  function truncate(text, max) {
    const value = String(text);
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  }

  function legend(data) {
    const items = normalise(data);
    if (!items.length) return '';
    return `<div class="chart-legend">${items.map(function (item) {
      return `<span class="chart-legend-item"><span class="legend-swatch" style="background:${esc(item.color)}"></span>${esc(item.label)}</span>`;
    }).join('')}</div>`;
  }

  function barChart(data, options) {
    const opts = options || {};
    const items = normalise(data);
    if (!items.length || items.every(function (item) { return item.value === 0; })) {
      return chartEmpty(opts.emptyMessage);
    }
    const width = 640;
    const height = opts.height || 240;
    const left = 42;
    const right = 12;
    const top = 18;
    const bottom = 40;
    const plotW = width - left - right;
    const plotH = height - top - bottom;
    const max = niceMax(Math.max.apply(null, items.map(function (item) { return item.value; })));
    const ticks = 4;
    const slot = plotW / items.length;
    const barWidth = Math.max(10, Math.min(52, slot * 0.56));
    const color = opts.color || '#284b68';
    const showValues = items.length <= 12;

    let grid = '';
    for (let i = 0; i <= ticks; i += 1) {
      const y = top + (plotH / ticks) * i;
      const value = Math.round(max - (max / ticks) * i);
      grid += `<line class="chart-grid" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"/>`;
      grid += `<text x="${left - 8}" y="${y + 3}" text-anchor="end">${value}</text>`;
    }

    const bars = items.map(function (item, index) {
      const barH = max ? (item.value / max) * plotH : 0;
      const x = left + slot * index + (slot - barWidth) / 2;
      const y = top + plotH - barH;
      const fill = opts.color ? color : item.color;
      const value = showValues ? `<text class="chart-value" x="${x + barWidth / 2}" y="${Math.max(y - 6, 10)}" text-anchor="middle">${item.value}</text>` : '';
      return `${value}<rect class="chart-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(barH, 0).toFixed(1)}" rx="4" fill="${esc(fill)}"><title>${esc(item.label)}: ${item.value}</title></rect>
        <text x="${x + barWidth / 2}" y="${height - 14}" text-anchor="middle">${esc(truncate(item.label, Math.max(8, Math.floor(slot / 6.4))))}</text>`;
    }).join('');

    return `<div class="chart" role="img" aria-label="${esc(opts.label || 'Bar chart')}"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      ${grid}${bars}
      <line class="chart-axis" x1="${left}" y1="${top + plotH}" x2="${width - right}" y2="${top + plotH}"/>
    </svg></div>${opts.legend === false ? '' : legend(items)}`;
  }

  function lineChart(data, options) {
    const opts = options || {};
    const items = normalise(data);
    if (!items.length || items.every(function (item) { return item.value === 0; })) {
      return chartEmpty(opts.emptyMessage);
    }
    const width = 640;
    const height = opts.height || 240;
    const left = 42;
    const right = 16;
    const top = 20;
    const bottom = 40;
    const plotW = width - left - right;
    const plotH = height - top - bottom;
    const max = niceMax(Math.max.apply(null, items.map(function (item) { return item.value; })));
    const ticks = 4;
    const stepX = items.length > 1 ? plotW / (items.length - 1) : 0;
    const gradientId = `chart-area-${++uid}`;
    const barColor = opts.color || '#5d8d84';

    const points = items.map(function (item, index) {
      const x = left + (items.length > 1 ? stepX * index : plotW / 2);
      const y = top + plotH - (max ? (item.value / max) * plotH : 0);
      return { x: x, y: y, item: item };
    });

    let grid = '';
    for (let i = 0; i <= ticks; i += 1) {
      const y = top + (plotH / ticks) * i;
      const value = Math.round(max - (max / ticks) * i);
      grid += `<line class="chart-grid" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"/>`;
      grid += `<text x="${left - 8}" y="${y + 3}" text-anchor="end">${value}</text>`;
    }

    const linePath = points.map(function (point, index) {
      return `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    }).join(' ');
    const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${top + plotH} L${points[0].x.toFixed(1)},${top + plotH} Z`;

    const dots = points.map(function (point) {
      return `<circle class="chart-point" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.2"><title>${esc(point.item.label)}: ${point.item.value}</title></circle>`;
    }).join('');

    const labels = points.map(function (point, index) {
      const skip = items.length > 8 && index % 2 !== 0;
      if (skip) return '';
      return `<text x="${point.x.toFixed(1)}" y="${height - 14}" text-anchor="middle">${esc(truncate(point.item.label, 10))}</text>`;
    }).join('');

    return `<div class="chart" role="img" aria-label="${esc(opts.label || 'Line chart')}"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      <defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${esc(barColor)}" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="${esc(barColor)}" stop-opacity="0"/>
      </linearGradient></defs>
      ${grid}
      <path d="${areaPath}" fill="url(#${gradientId})"/>
      <path class="chart-line" d="${linePath}" stroke="${esc(barColor)}"/>
      ${dots}${labels}
      <line class="chart-axis" x1="${left}" y1="${top + plotH}" x2="${width - right}" y2="${top + plotH}"/>
    </svg></div>${opts.legend === false ? '' : legend(items)}`;
  }

  function donutChart(data, options) {
    const opts = options || {};
    const items = normalise(data).filter(function (item) { return item.value > 0; });
    const total = items.reduce(function (sum, item) { return sum + item.value; }, 0);
    if (!items.length || total === 0) {
      return chartEmpty(opts.emptyMessage || 'No breakdown available yet.');
    }
    const size = 160;
    const radius = 58;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    const segments = items.map(function (item) {
      const portion = item.value / total;
      const length = Math.max(portion * circumference - 2, 0);
      const segment = `<circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${esc(item.color)}" stroke-width="16" stroke-dasharray="${length.toFixed(2)} ${(circumference - length).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"><title>${esc(item.label)}: ${item.value}</title></circle>`;
      offset += portion * circumference;
      return segment;
    }).join('');
    return `<div class="donut-wrap" role="img" aria-label="${esc(opts.label || 'Donut chart')}">
      <div class="donut"><svg viewBox="0 0 ${size} ${size}">${segments}</svg>
        <div class="donut-center"><span class="donut-value">${esc(opts.centerValue !== undefined ? opts.centerValue : total)}</span><span class="donut-label">${esc(opts.centerLabel || 'Total')}</span></div>
      </div>
      ${opts.legend === false ? '' : legend(items)}
    </div>`;
  }

  function hbarChart(data, options) {
    const opts = options || {};
    const items = normalise(data);
    if (!items.length) return chartEmpty(opts.emptyMessage);
    const max = Math.max.apply(null, items.map(function (item) { return item.value; }).concat(1));
    return `<div class="hbar-list" role="img" aria-label="${esc(opts.label || 'Horizontal bar chart')}">${items.map(function (item) {
      const width = Math.max((item.value / max) * 100, item.value > 0 ? 2 : 0);
      return `<div class="hbar-row">
        <span class="hbar-label" title="${esc(item.label)}">${esc(item.label)}</span>
        <span class="hbar-track"><span class="hbar-fill" style="width:${width.toFixed(1)}%;background:${esc(opts.color || item.color)}"></span></span>
        <b class="hbar-value">${item.value}</b>
      </div>`;
    }).join('')}</div>`;
  }

  function sparkline(values, options) {
    const opts = options || {};
    const numbers = (values || []).map(function (value) { return Number(value) || 0; });
    if (!numbers.length) return '';
    const width = 120;
    const height = 34;
    const max = Math.max.apply(null, numbers.concat(1));
    const min = Math.min.apply(null, numbers);
    const range = max - min || 1;
    const step = numbers.length > 1 ? width / (numbers.length - 1) : width;
    const points = numbers.map(function (value, index) {
      return `${(index * step).toFixed(1)},${(height - 3 - ((value - min) / range) * (height - 6)).toFixed(1)}`;
    }).join(' ');
    return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="${esc(opts.color || '#6b9991')}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  window.CivicCharts = {
    colors: COLORS,
    bar: barChart,
    line: lineChart,
    donut: donutChart,
    hbar: hbarChart,
    legend: legend,
    sparkline: sparkline,
    empty: chartEmpty
  };
})();
