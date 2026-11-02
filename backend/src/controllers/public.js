const db = require('../config/db');
const { ok, asyncHandler } = require('../utils/http');
const { PUBLIC_SETTING_KEYS, SETTING_DEFAULTS } = require('../config/constants');

const stats = asyncHandler(async (_req, res) => {
  const [[counts], [resolution]] = await Promise.all([
    db.query(
      `SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'citizen' AND is_active = 1) AS citizens,
        (SELECT COUNT(*) FROM city_services WHERE is_active = 1) AS services,
        (SELECT COUNT(*) FROM issues) AS complaints,
        (SELECT COUNT(*) FROM issues WHERE status = 'resolved') AS resolved,
        (SELECT COUNT(*) FROM issues WHERE status = 'in_progress') AS in_progress,
        (SELECT COUNT(*) FROM issues WHERE status = 'submitted') AS submitted,
        (SELECT COUNT(*) FROM polls WHERE is_active = 1 AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at >= NOW())) AS active_polls`
    ),
    db.query(
      `SELECT ROUND(AVG(TIMESTAMPDIFF(HOUR, created_at, resolved_at)), 1) AS avg_resolution_hours
       FROM issues WHERE status = 'resolved' AND resolved_at IS NOT NULL`
    )
  ]);
  const row = counts[0];
  const total = Number(row.complaints);
  return ok(res, {
    stats: {
      citizens: Number(row.citizens),
      services: Number(row.services),
      complaints: total,
      resolved: Number(row.resolved),
      in_progress: Number(row.in_progress),
      submitted: Number(row.submitted),
      active_polls: Number(row.active_polls),
      resolution_rate: total ? Math.round((Number(row.resolved) / total) * 1000) / 10 : 0,
      avg_resolution_hours: resolution[0].avg_resolution_hours == null ? null : Number(resolution[0].avg_resolution_hours)
    }
  });
});

async function readPublicSettings() {
  const [rows] = await db.execute(
    `SELECT setting_key, setting_value FROM platform_settings WHERE setting_key IN (${PUBLIC_SETTING_KEYS.map(() => '?').join(',')})`,
    PUBLIC_SETTING_KEYS
  );
  const settings = { ...SETTING_DEFAULTS };
  for (const row of rows) {
    if (PUBLIC_SETTING_KEYS.includes(row.setting_key)) settings[row.setting_key] = row.setting_value || '';
  }
  return settings;
}

const config = asyncHandler(async (_req, res) => {
  const settings = await readPublicSettings();
  return ok(res, {
    settings,
    maps: {
      enabled: Boolean(process.env.GOOGLE_MAPS_API_KEY),
      apiKey: process.env.GOOGLE_MAPS_API_KEY || null
    },
    uploads: { maxSizeMb: Number(process.env.MAX_UPLOAD_MB) || 5 }
  });
});

module.exports = { stats, config, readPublicSettings };
