const db = require('../config/db');
const { ApiError, ok, asyncHandler } = require('../utils/http');
const { parsePagination } = require('../utils/validation');

const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });
  const unreadOnly = String(req.query.unread) === '1';
  const where = ['user_id = ?'];
  if (unreadOnly) where.push('is_read = 0');
  const [rows] = await db.execute(
    `SELECT id, title, message, notification_type, related_issue_id, is_read, created_at
     FROM notifications
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [req.user.id, limit, offset]
  );
  const [[countRows], [unreadRows]] = await Promise.all([
    db.execute(`SELECT COUNT(*) AS total FROM notifications WHERE ${where.join(' AND ')}`, [req.user.id]),
    db.execute('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id])
  ]);
  const total = Number(countRows[0].total);
  return ok(res, {
    notifications: rows.map(row => ({ ...row, is_read: Boolean(row.is_read) })),
    unread_count: Number(unreadRows[0].count),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  });
});

const unreadCount = asyncHandler(async (req, res) => {
  const [rows] = await db.execute(
    'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
    [req.user.id]
  );
  return ok(res, { unread_count: Number(rows[0].count) });
});

const markRead = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'Invalid notification.');
  const [result] = await db.execute(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
    [id, req.user.id]
  );
  if (!result.affectedRows) throw new ApiError(404, 'Notification not found.');
  return ok(res, {}, 'Notification marked as read.');
});

const markAllRead = asyncHandler(async (req, res) => {
  const [result] = await db.execute(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
    [req.user.id]
  );
  return ok(res, { updated: result.affectedRows }, 'All notifications marked as read.');
});

module.exports = { list, unreadCount, markRead, markAllRead };
