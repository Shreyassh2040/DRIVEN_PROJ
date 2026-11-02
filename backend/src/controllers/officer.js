const db = require('../config/db');
const { ApiError, ok, asyncHandler } = require('../utils/http');
const { Validator, parsePagination } = require('../utils/validation');
const { createNotification } = require('../utils/notifications');
const { logActivity } = require('../utils/audit');
const {
  ISSUE_SELECT, ISSUE_JOINS, findIssue, withLabels
} = require('./issues');
const {
  ISSUE_STATUSES, ISSUE_CATEGORIES, ISSUE_PRIORITIES, ISSUE_STATUS_LABELS
} = require('../config/constants');

const STATUS_MESSAGES = {
  submitted: 'Your complaint has been reopened for review.',
  in_progress: 'Work has started on your complaint.',
  resolved: 'Your complaint has been resolved.',
  rejected: 'Your complaint was reviewed and could not be actioned.'
};

const listComplaints = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 15, maxLimit: 100 });
  const where = [];
  const params = [];
  const status = String(req.query.status || '').trim();
  const category = String(req.query.category || '').trim();
  const priority = String(req.query.priority || '').trim();
  const area = String(req.query.area || '').trim();
  const q = String(req.query.q || '').trim();
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const assigned = String(req.query.assigned || '').trim();

  if (status && ISSUE_STATUSES.includes(status)) { where.push('i.status = ?'); params.push(status); }
  if (category && ISSUE_CATEGORIES.includes(category)) { where.push('i.category = ?'); params.push(category); }
  if (priority && ISSUE_PRIORITIES.includes(priority)) { where.push('i.priority = ?'); params.push(priority); }
  if (area) { where.push('i.area = ?'); params.push(area); }
  if (q) {
    const like = `%${q}%`;
    where.push('(i.tracking_code LIKE ? OR i.title LIKE ? OR i.address LIKE ? OR reporter.full_name LIKE ?)');
    params.push(like, like, like, like);
  }
  if (from) { where.push('i.created_at >= ?'); params.push(`${from} 00:00:00`); }
  if (to) { where.push('i.created_at <= ?'); params.push(`${to} 23:59:59`); }
  if (assigned === 'unassigned') where.push('i.assigned_officer_id IS NULL');
  else if (assigned && Number.isSafeInteger(Number(assigned)) && Number(assigned) > 0) {
    where.push('i.assigned_officer_id = ?');
    params.push(Number(assigned));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await db.execute(
    `SELECT ${ISSUE_SELECT},
      (SELECT h.note FROM issue_status_history h
        WHERE h.issue_id = i.id AND h.note IS NOT NULL
        ORDER BY h.created_at DESC LIMIT 1) AS latest_update
     ${ISSUE_JOINS}
     ${whereSql}
     ORDER BY
       CASE i.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
       i.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await db.execute(
    `SELECT COUNT(*) AS total FROM issues i JOIN users reporter ON reporter.id = i.reporter_id ${whereSql}`,
    params
  );

  const [summaryRows] = await db.query('SELECT status, COUNT(*) AS count FROM issues GROUP BY status');
  const summary = { total: 0, submitted: 0, in_progress: 0, resolved: 0, rejected: 0, unassigned: 0 };
  for (const row of summaryRows) {
    summary[row.status] = Number(row.count);
    summary.total += Number(row.count);
  }
  const [unassignedRows] = await db.query(
    `SELECT COUNT(*) AS count FROM issues
     WHERE assigned_officer_id IS NULL AND status IN ('submitted','in_progress')`
  );
  summary.unassigned = Number(unassignedRows[0].count);

  const total = Number(countRows[0].total);
  return ok(res, {
    complaints: rows.map(withLabels),
    summary,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  });
});

const getComplaint = asyncHandler(async (req, res) => {
  const issue = await findIssue(req.params.id);
  return ok(res, { complaint: withLabels(issue) });
});

const updateStatus = asyncHandler(async (req, res) => {
  const v = new Validator();
  v.id('id', req.params.id, { label: 'Complaint' });
  v.enum('status', req.body.status, ISSUE_STATUSES, { label: 'Status', required: true });
  const note = v.string('note', req.body.note, { label: 'Update note', max: 500 });
  const resolutionSummary = v.string('resolution_summary', req.body.resolution_summary, { label: 'Resolution details', max: 4000 });
  const values = v.done();

  if (values.status === 'rejected' && (!note || note.length < 5)) {
    throw new ApiError(422, 'A rejection reason is required.', { note: 'Explain why this complaint is being rejected.' });
  }
  if (values.status === 'resolved' && (!resolutionSummary || resolutionSummary.length < 10)) {
    throw new ApiError(422, 'Resolution details are required before closing a complaint.', {
      resolution_summary: 'Describe the work completed (at least 10 characters).'
    });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, tracking_code, reporter_id, status, assigned_officer_id
       FROM issues WHERE id = ? FOR UPDATE`,
      [values.id]
    );
    if (!rows.length) throw new ApiError(404, 'Complaint not found.');
    const issue = rows[0];
    if (issue.status === values.status) {
      throw new ApiError(422, 'The complaint is already in that status. Add an update note instead.');
    }

    await connection.execute(
      `UPDATE issues
       SET status = ?, resolution_summary = ?, resolved_at = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        values.status,
        values.status === 'resolved' ? resolutionSummary : null,
        values.status === 'resolved' ? new Date() : null,
        issue.id
      ]
    );
    await connection.execute(
      `INSERT INTO issue_status_history (issue_id, changed_by, old_status, new_status, note)
       VALUES (?, ?, ?, ?, ?)`,
      [issue.id, req.user.id, issue.status, values.status, note || null]
    );

    const message = values.status === 'rejected' && note
      ? `${STATUS_MESSAGES.rejected} Reason: ${note}`
      : STATUS_MESSAGES[values.status];
    await createNotification({
      userId: issue.reporter_id,
      title: `Complaint ${issue.tracking_code} updated`,
      message,
      type: `complaint_${values.status}`,
      issueId: issue.id,
      connection
    });
    await logActivity({
      userId: req.user.id,
      action: 'complaint.status_changed',
      entityType: 'issue',
      entityId: issue.id,
      details: { tracking_code: issue.tracking_code, old_status: issue.status, new_status: values.status },
      req,
      connection
    });
    await connection.commit();

    return ok(res, {
      complaint: {
        id: issue.id,
        tracking_code: issue.tracking_code,
        status: values.status,
        status_label: ISSUE_STATUS_LABELS[values.status]
      }
    }, 'Complaint status updated.');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

const assignComplaint = asyncHandler(async (req, res) => {
  const v = new Validator();
  v.id('id', req.params.id, { label: 'Complaint' });
  v.id('officer_id', req.body.officer_id, { label: 'Officer' });
  const note = v.string('note', req.body.note, { label: 'Assignment note', max: 500 });
  const values = v.done();

  const [officerRows] = await db.execute(
    `SELECT id, full_name, role, is_active FROM users WHERE id = ? LIMIT 1`,
    [values.officer_id]
  );
  if (!officerRows.length || officerRows[0].role !== 'officer' || !officerRows[0].is_active) {
    throw new ApiError(422, 'Select an active municipal officer.', { officer_id: 'Select an active officer.' });
  }
  const officer = officerRows[0];

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, tracking_code, reporter_id, assigned_officer_id FROM issues WHERE id = ? FOR UPDATE`,
      [values.id]
    );
    if (!rows.length) throw new ApiError(404, 'Complaint not found.');
    const issue = rows[0];
    if (issue.assigned_officer_id === officer.id) {
      throw new ApiError(422, 'This complaint is already assigned to that officer.');
    }

    await connection.execute(
      'UPDATE issue_assignments SET assignment_status = "reassigned" WHERE issue_id = ? AND assignment_status = "assigned"',
      [issue.id]
    );
    await connection.execute('UPDATE issues SET assigned_officer_id = ? WHERE id = ?', [officer.id, issue.id]);
    await connection.execute(
      `INSERT INTO issue_assignments (issue_id, officer_id, assigned_by, assignment_status, note)
       VALUES (?, ?, ?, 'assigned', ?)`,
      [issue.id, officer.id, req.user.id, note || null]
    );

    await createNotification({
      userId: officer.id,
      title: 'New complaint assigned',
      message: `${issue.tracking_code} has been assigned to you. Review the complaint and update its status.`,
      type: 'complaint_assigned',
      issueId: issue.id,
      connection
    });
    await createNotification({
      userId: issue.reporter_id,
      title: `Complaint ${issue.tracking_code} assigned`,
      message: `Your complaint has been assigned to ${officer.full_name}.`,
      type: 'complaint_assigned',
      issueId: issue.id,
      connection
    });
    await logActivity({
      userId: req.user.id,
      action: 'complaint.assigned',
      entityType: 'issue',
      entityId: issue.id,
      details: { tracking_code: issue.tracking_code, officer_id: officer.id, officer_name: officer.full_name },
      req,
      connection
    });
    await connection.commit();

    return ok(res, {
      assignment: {
        issue_id: issue.id,
        officer_id: officer.id,
        officer_name: officer.full_name
      }
    }, `Complaint assigned to ${officer.full_name}.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

const addComment = asyncHandler(async (req, res) => {
  const v = new Validator();
  v.id('id', req.params.id, { label: 'Complaint' });
  v.string('comment', req.body.comment, { label: 'Comment', required: true, min: 2, max: 2000 });
  const visibility = req.body.visibility === 'internal' ? 'internal' : 'public';
  const values = v.done();

  const issue = await findIssue(values.id);
  const [result] = await db.execute(
    `INSERT INTO issue_comments (issue_id, user_id, comment, visibility) VALUES (?, ?, ?, ?)`,
    [issue.id, req.user.id, values.comment, visibility]
  );
  if (visibility === 'public') {
    await createNotification({
      userId: issue.reporter_id,
      title: `New update on ${issue.tracking_code}`,
      message: values.comment.slice(0, 400),
      type: 'complaint_update',
      issueId: issue.id
    });
  }
  await logActivity({
    userId: req.user.id,
    action: visibility === 'internal' ? 'complaint.internal_note_added' : 'complaint.update_added',
    entityType: 'issue',
    entityId: issue.id,
    details: { tracking_code: issue.tracking_code },
    req
  });
  return ok(res, { id: result.insertId, visibility }, 'Update added.', 201);
});

const listOfficers = asyncHandler(async (_req, res) => {
  const [rows] = await db.query(
    `SELECT u.id, u.full_name, u.email, u.department,
            SUM(CASE WHEN i.status IN ('submitted','in_progress') THEN 1 ELSE 0 END) AS active_workload,
            COUNT(i.id) AS total_assigned
     FROM users u
     LEFT JOIN issues i ON i.assigned_officer_id = u.id
     WHERE u.role = 'officer' AND u.is_active = 1
     GROUP BY u.id, u.full_name, u.email, u.department
     ORDER BY active_workload ASC, u.full_name ASC`
  );
  return ok(res, {
    officers: rows.map(row => ({
      ...row,
      active_workload: Number(row.active_workload),
      total_assigned: Number(row.total_assigned)
    }))
  });
});

const stats = asyncHandler(async (_req, res) => {
  const [[summaryRows], [categoryRows], [areaRows], [priorityRows], [trendRows], [resolutionRows], [recentRows]] = await Promise.all([
    db.query('SELECT status, COUNT(*) AS count FROM issues GROUP BY status'),
    db.query('SELECT category, COUNT(*) AS count FROM issues GROUP BY category ORDER BY count DESC'),
    db.query(
      `SELECT COALESCE(NULLIF(TRIM(area), ''), 'Unspecified') AS area, COUNT(*) AS count
       FROM issues GROUP BY COALESCE(NULLIF(TRIM(area), ''), 'Unspecified')
       ORDER BY count DESC LIMIT 8`
    ),
    db.query('SELECT priority, COUNT(*) AS count FROM issues GROUP BY priority'),
    db.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS count
       FROM issues
       WHERE created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), '%Y-%m-01')
       GROUP BY month ORDER BY month`
    ),
    db.query(
      `SELECT ROUND(AVG(TIMESTAMPDIFF(HOUR, created_at, resolved_at)), 1) AS avg_hours,
              COUNT(*) AS resolved_count
       FROM issues WHERE status = 'resolved' AND resolved_at IS NOT NULL`
    ),
    db.query(
      `SELECT i.id, i.tracking_code, i.title, i.category, i.status, i.priority,
              i.created_at, i.area, i.address, reporter.full_name AS reporter_name,
              officer.full_name AS assigned_officer_name
       FROM issues i
       JOIN users reporter ON reporter.id = i.reporter_id
       LEFT JOIN users officer ON officer.id = i.assigned_officer_id
       ORDER BY i.created_at DESC LIMIT 6`
    )
  ]);

  const summary = { total: 0, submitted: 0, in_progress: 0, resolved: 0, rejected: 0, unassigned: 0 };
  for (const row of summaryRows) {
    summary[row.status] = Number(row.count);
    summary.total += Number(row.count);
  }
  const [unassignedRows] = await db.query(
    `SELECT COUNT(*) AS count FROM issues WHERE assigned_officer_id IS NULL AND status IN ('submitted','in_progress')`
  );
  summary.unassigned = Number(unassignedRows[0].count);

  const now = new Date();
  const trend = [];
  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    const found = trendRows.find(row => row.month === key);
    trend.push({ key, label, value: found ? Number(found.count) : 0 });
  }

  return ok(res, {
    summary,
    categories: categoryRows.map(row => ({ key: row.category, label: row.category.replaceAll('_', ' '), value: Number(row.count) })),
    areas: areaRows.map(row => ({ label: row.area, value: Number(row.count) })),
    priorities: priorityRows.map(row => ({ key: row.priority, value: Number(row.count) })),
    trend,
    performance: {
      avg_resolution_hours: resolutionRows[0].avg_hours == null ? null : Number(resolutionRows[0].avg_hours),
      resolved_with_timestamps: Number(resolutionRows[0].resolved_count),
      resolution_rate: summary.total ? Math.round((summary.resolved / summary.total) * 1000) / 10 : 0
    },
    recent: recentRows
  });
});

module.exports = {
  listComplaints,
  getComplaint,
  updateStatus,
  assignComplaint,
  addComment,
  listOfficers,
  stats
};
