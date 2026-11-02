const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const { ApiError, ok, asyncHandler } = require('../utils/http');
const { Validator, parsePagination } = require('../utils/validation');
const { generateTrackingCode } = require('../utils/tracking');
const { removeUpload, uploadRoot } = require('../middleware/upload');
const { createNotification } = require('../utils/notifications');
const { logActivity } = require('../utils/audit');
const { ISSUE_CATEGORIES, ISSUE_STATUSES, ISSUE_CATEGORY_LABELS, ISSUE_STATUS_LABELS } = require('../config/constants');

const ISSUE_SELECT = `i.id, i.tracking_code, i.reporter_id, i.title, i.category, i.description,
  i.address, i.area, i.latitude, i.longitude, i.photo_path, i.status, i.priority,
  i.assigned_officer_id, i.resolution_summary, i.resolved_at, i.created_at, i.updated_at,
  reporter.full_name AS reporter_name, reporter.email AS reporter_email, reporter.phone AS reporter_phone,
  officer.full_name AS assigned_officer_name, officer.department AS assigned_officer_department`;

const ISSUE_JOINS = `FROM issues i
  JOIN users reporter ON reporter.id = i.reporter_id
  LEFT JOIN users officer ON officer.id = i.assigned_officer_id`;

function withLabels(issue) {
  return {
    ...issue,
    category_label: ISSUE_CATEGORY_LABELS[issue.category] || issue.category,
    status_label: ISSUE_STATUS_LABELS[issue.status] || issue.status,
    has_photo: Boolean(issue.photo_path)
  };
}

function isStaff(user) {
  return user && (user.role === 'officer' || user.role === 'admin');
}

function assertCanView(req, issue) {
  if (isStaff(req.user)) return;
  if (issue.reporter_id !== req.user.id) {
    throw new ApiError(403, 'You do not have permission to view this complaint.');
  }
}

async function findIssue(id) {
  const numeric = Number(id);
  if (!Number.isSafeInteger(numeric) || numeric < 1) throw new ApiError(400, 'Invalid complaint.');
  const [rows] = await db.execute(`SELECT ${ISSUE_SELECT} ${ISSUE_JOINS} WHERE i.id = ? LIMIT 1`, [numeric]);
  if (!rows.length) throw new ApiError(404, 'Complaint not found.');
  return rows[0];
}

const create = asyncHandler(async (req, res) => {
  const file = req.file;
  try {
    const v = new Validator();
    v.string('title', req.body.title, { label: 'Complaint title', required: true, min: 4, max: 160 });
    v.enum('category', req.body.category, ISSUE_CATEGORIES, { label: 'Complaint category', required: true });
    v.string('description', req.body.description, { label: 'Description', required: true, min: 10, max: 5000 });
    const address = v.string('address', req.body.address, { label: 'Location or address', max: 255 });
    const area = v.string('area', req.body.area, { label: 'Area or locality', max: 120 });
    v.coordinates(req.body.latitude, req.body.longitude);
    const values = v.done();

    if (!address && (values.latitude == null || values.longitude == null)) {
      throw new ApiError(422, 'Add an address or attach your current location.', {
        address: 'Enter a location or use your current location.'
      });
    }

    const photoPath = file ? `issues/${file.filename}` : null;
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      let trackingCode;
      let issueId;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        trackingCode = generateTrackingCode();
        try {
          const [result] = await connection.execute(
            `INSERT INTO issues
              (tracking_code, reporter_id, title, category, description, address, area, latitude, longitude, photo_path, status, priority)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', 'medium')`,
            [trackingCode, req.user.id, values.title, values.category, values.description, address, area, values.latitude, values.longitude, photoPath]
          );
          issueId = result.insertId;
          break;
        } catch (error) {
          if (error.code !== 'ER_DUP_ENTRY' || attempt === 5) throw error;
        }
      }

      await connection.execute(
        `INSERT INTO issue_status_history (issue_id, changed_by, old_status, new_status, note)
         VALUES (?, ?, NULL, 'submitted', ?)`,
        [issueId, req.user.id, 'Complaint submitted by citizen.']
      );
      await createNotification({
        userId: req.user.id,
        title: 'Complaint submitted',
        message: `Your complaint ${trackingCode} has been received and is awaiting review.`,
        type: 'complaint_submitted',
        issueId,
        connection
      });
      await logActivity({
        userId: req.user.id,
        action: 'complaint.created',
        entityType: 'issue',
        entityId: issueId,
        details: { tracking_code: trackingCode, category: values.category },
        req,
        connection
      });
      await connection.commit();

      return ok(res, {
        issue: {
          id: issueId,
          tracking_code: trackingCode,
          title: values.title,
          status: 'submitted',
          status_label: 'Submitted',
          category: values.category,
          category_label: ISSUE_CATEGORY_LABELS[values.category]
        }
      }, 'Complaint submitted successfully.', 201);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (file) removeUpload(file.path);
    throw error;
  }
});

const mine = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 50 });
  const status = String(req.query.status || '').trim();
  const q = String(req.query.q || '').trim();
  const where = ['i.reporter_id = ?'];
  const params = [req.user.id];
  if (status && ISSUE_STATUSES.includes(status)) {
    where.push('i.status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(i.tracking_code LIKE ? OR i.title LIKE ? OR i.address LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [rows] = await db.execute(
    `SELECT ${ISSUE_SELECT},
      (SELECT h.note FROM issue_status_history h
        WHERE h.issue_id = i.id AND h.note IS NOT NULL
        ORDER BY h.created_at DESC LIMIT 1) AS latest_update
     ${ISSUE_JOINS}
     ${whereSql}
     ORDER BY i.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [[countRows], [summaryRows]] = await Promise.all([
    db.execute(`SELECT COUNT(*) AS total FROM issues i ${whereSql}`, params),
    db.execute(
      `SELECT status, COUNT(*) AS count FROM issues WHERE reporter_id = ? GROUP BY status`,
      [req.user.id]
    )
  ]);
  const total = Number(countRows[0].total);
  const summary = { total: 0, submitted: 0, in_progress: 0, resolved: 0, rejected: 0 };
  for (const row of summaryRows) {
    summary[row.status] = Number(row.count);
    summary.total += Number(row.count);
  }

  return ok(res, {
    complaints: rows.map(withLabels),
    summary,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  });
});

const getById = asyncHandler(async (req, res) => {
  const issue = await findIssue(req.params.id);
  assertCanView(req, issue);
  const payload = withLabels(issue);
  if (!isStaff(req.user)) {
    delete payload.reporter_email;
    delete payload.reporter_phone;
  }
  return ok(res, { complaint: payload });
});

const photo = asyncHandler(async (req, res) => {
  const issue = await findIssue(req.params.id);
  assertCanView(req, issue);
  if (!issue.photo_path) throw new ApiError(404, 'No photograph was attached to this complaint.');
  const resolved = path.resolve(uploadRoot, issue.photo_path);
  if (!resolved.startsWith(path.resolve(uploadRoot))) throw new ApiError(403, 'Invalid photograph path.');
  if (!fs.existsSync(resolved)) throw new ApiError(404, 'The photograph file is missing.');
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.sendFile(resolved);
});

const timeline = asyncHandler(async (req, res) => {
  const issue = await findIssue(req.params.id);
  assertCanView(req, issue);
  const staff = isStaff(req.user);
  const visibilityClause = staff ? '' : "AND c.visibility = 'public'";

  const [[history], [comments], [assignments]] = await Promise.all([
    db.execute(
      `SELECT h.id, h.old_status, h.new_status, h.note, h.created_at,
              u.full_name AS actor_name, u.role AS actor_role
       FROM issue_status_history h
       JOIN users u ON u.id = h.changed_by
       WHERE h.issue_id = ?
       ORDER BY h.created_at ASC, h.id ASC`,
      [issue.id]
    ),
    db.execute(
      `SELECT c.id, c.comment, c.visibility, c.created_at,
              u.full_name AS actor_name, u.role AS actor_role
       FROM issue_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.issue_id = ? ${visibilityClause}
       ORDER BY c.created_at ASC, c.id ASC`,
      [issue.id]
    ),
    db.execute(
      `SELECT a.id, a.assigned_at, a.assignment_status, a.note,
              o.full_name AS officer_name, ab.full_name AS assigned_by_name
       FROM issue_assignments a
       JOIN users o ON o.id = a.officer_id
       JOIN users ab ON ab.id = a.assigned_by
       WHERE a.issue_id = ?
       ORDER BY a.assigned_at ASC, a.id ASC`,
      [issue.id]
    )
  ]);

  const events = [];
  for (const item of history) {
    events.push({
      id: `status-${item.id}`,
      type: 'status',
      title: item.old_status
        ? `Status changed to ${ISSUE_STATUS_LABELS[item.new_status] || item.new_status}`
        : 'Complaint submitted',
      description: item.note || '',
      actor: item.actor_name,
      actor_role: item.actor_role,
      old_status: item.old_status,
      new_status: item.new_status,
      created_at: item.created_at
    });
  }
  for (const item of assignments) {
    events.push({
      id: `assignment-${item.id}`,
      type: 'assignment',
      title: `Assigned to ${item.officer_name}`,
      description: item.note || `Assigned by ${item.assigned_by_name}.`,
      actor: item.assigned_by_name,
      created_at: item.assigned_at
    });
  }
  for (const item of comments) {
    events.push({
      id: `comment-${item.id}`,
      type: item.visibility === 'internal' ? 'internal_note' : 'comment',
      title: item.visibility === 'internal' ? 'Internal officer note' : 'Citizen-visible update',
      description: item.comment,
      actor: item.actor_name,
      actor_role: item.actor_role,
      visibility: item.visibility,
      created_at: item.created_at
    });
  }
  events.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  return ok(res, {
    events,
    history,
    comments,
    assignments,
    current_status: issue.status
  });
});

module.exports = {
  create,
  mine,
  getById,
  photo,
  timeline,
  findIssue,
  assertCanView,
  isStaff,
  withLabels,
  ISSUE_SELECT,
  ISSUE_JOINS
};
