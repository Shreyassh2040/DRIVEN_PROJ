function toInt(value) {
  return value == null ? 0 : Number(value);
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return '';
  const [name, domain] = email.split('@');
  const visible = name.slice(0, 2);
  return `${visible}${'•'.repeat(Math.max(2, name.length - 2))}@${domain}`;
}

function csvEscape(value) {
  if (value == null) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows, columns) {
  const header = columns.map(col => csvEscape(col.label)).join(',');
  const body = rows.map(row => columns.map(col => csvEscape(typeof col.value === 'function' ? col.value(row) : row[col.value])).join(','));
  return [header, ...body].join('\r\n');
}

module.exports = { toInt, maskEmail, toCsv, csvEscape };
