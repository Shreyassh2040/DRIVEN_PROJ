const db = require('../config/db');

async function createNotification({ userId, title, message, type = 'system', issueId = null, connection = null }) {
  if (!userId) return;
  const runner = connection || db;
  await runner.execute(
    `INSERT INTO notifications (user_id, title, message, notification_type, related_issue_id)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, title, message, type, issueId]
  );
}

async function notifyMany({ userIds, title, message, type = 'system', issueId = null, connection = null }) {
  if (!userIds || userIds.length === 0) return;
  const runner = connection || db;
  const values = userIds.map(userId => [userId, title, message, type, issueId]);
  await runner.query(
    `INSERT INTO notifications (user_id, title, message, notification_type, related_issue_id) VALUES ?`,
    [values]
  );
}

module.exports = { createNotification, notifyMany };
