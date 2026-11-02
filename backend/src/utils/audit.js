const db = require('../config/db');

/**
 * Writes an audit record. Audit failures are logged, never allowed to break the
 * user-facing action that triggered them.
 */
async function logActivity({ userId = null, action, entityType = null, entityId = null, details = null, req = null, connection = null }) {
  try {
    const payload = details == null ? null : typeof details === 'string' ? details : JSON.stringify(details);
    const ip = req ? (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim() : null;
    const runner = connection || db;
    await runner.execute(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, action, entityType, entityId, payload, ip || null]
    );
  } catch (error) {
    console.error('Audit log failed:', error.message);
  }
}

module.exports = { logActivity };
