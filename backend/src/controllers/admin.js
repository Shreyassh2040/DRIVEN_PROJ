const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { ApiError, ok, asyncHandler } = require('../utils/http');
const { Validator, parsePagination } = require('../utils/validation');
const { logActivity } = require('../utils/audit');
const { createNotification } = require('../utils/notifications');
const { toCsv } = require('../utils/formatters');
const { publicUser } = require('./auth');
const { ISSUE_STATUSES, ROLES, PUBLIC_SETTING_KEYS } = require('../config/constants');

const USER_SELECT = `u.id, u.full_name, u.email, u.role, u.is_active, u.phone, u.department,
  u.created_at, u.updated_at, u.last_login_at,
  (SELECT COUNT(*) FROM issues i WHERE i.reporter_id = u.id) AS complaint_count,
  (SELECT COUNT(*) FROM poll_votes v WHERE v.user_id = u.id) AS vote_count,
  (SELECT COUNT(*) FROM issues i WHERE i.assigned_officer_id = u.id) AS assigned_count`;

function buildMonthBuckets(count) {
  const now = new Date();
  const buckets = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    buckets.push({ key, label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }) });
  }
  return buckets;
}

function buildDayBuckets(count) {
  const buckets = [];
  const today = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const key = date.toISOString().slice(0, 10);
    buckets.push({ key, label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) });
  }
  return buckets;
}

const dashboard = asyncHandler(async (_req, res) => {
  const [[userRows], [serviceRows], [issueRows], [pollRows], [resolutionRows], [recentIssues], [activity], [categoryRows], [trendRows]] = await Promise.all([
    db.query(`SELECT role, is_active, COUNT(*) AS count FROM users GROUP BY role, is_active`),
    db.query(`SELECT COUNT(*) AS total, SUM(is_active = 1) AS active FROM city_services`),
    db.query(`SELECT status, COUNT(*) AS count FROM issues GROUP BY status`),
    db.query(`SELECT COUNT(*) AS total, SUM(is_active = 1) AS active FROM polls`),
    db.query(`SELECT ROUND(AVG(TIMESTAMPDIFF(HOUR, created_at, resolved_at)), 1) AS avg_hours
              FROM issues WHERE status = 'resolved' AND resolved_at IS NOT NULL`),
    db.query(
      `SELECT i.id, i.tracking_code, i.title, i.category, i.status, i.priority, i.created_at,
              i.area, i.address, reporter.full_name AS reporter_name
       FROM issues i JOIN users reporter ON reporter.id = i.reporter_id
       ORDER BY i.created_at DESC LIMIT 6`
    ),
    db.query(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.created_at, u.full_name AS actor_name
       FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC LIMIT 8`
    ),
    db.query('SELECT category, COUNT(*) AS count FROM issues GROUP BY category ORDER BY count DESC'),
    db.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS count
       FROM issues
       WHERE created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), '%Y-%m-01')
       GROUP BY month ORDER BY month`
    )
  ]);

  const users = { total: 0, citizen: 0, officer: 0, admin: 0, active: 0, inactive: 0 };
  for (const row of userRows) {
    users[row.role] = (users[row.role] || 0) + Number(row.count);
    users.total += Number(row.count);
    if (row.is_active) users.active += Number(row.count);
    else users.inactive += Number(row.count);
  }
  const issues = { total: 0, submitted: 0, in_progress: 0, resolved: 0, rejected: 0 };
  for (const row of issueRows) {
    issues[row.status] = Number(row.count);
    issues.total += Number(row.count);
  }

  const trend = buildMonthBuckets(6).map(bucket => ({
    ...bucket,
    value: Number(trendRows.find(row => row.month === bucket.key)?.count || 0)
  }));

  return ok(res, {
    users,
    services: { total: Number(serviceRows[0].total), active: Number(serviceRows[0].active) },
    issues,
    polls: { total: Number(pollRows[0].total), active: Number(pollRows[0].active) },
    performance: {
      avg_resolution_hours: resolutionRows[0].avg_hours == null ? null : Number(resolutionRows[0].avg_hours),
      resolution_rate: issues.total ? Math.round((issues.resolved / issues.total) * 1000) / 10 : 0
    },
    categories: categoryRows.map(row => ({ key: row.category, label: row.category.replaceAll('_', ' '), value: Number(row.count) })),
    trend,
    recent_complaints: recentIssues,
    recent_activity: activity
  });
});

const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 15, maxLimit: 100 });
  const where = [];
  const params = [];
  const q = String(req.query.q || '').trim();
  const role = String(req.query.role || '').trim();
  const status = String(req.query.status || '').trim();
  if (q) {
    where.push('(u.full_name LIKE ? OR u.email LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (ROLES.includes(role)) { where.push('u.role = ?'); params.push(role); }
  if (status === 'active') where.push('u.is_active = 1');
  if (status === 'inactive') where.push('u.is_active = 0');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await db.execute(
    `SELECT ${USER_SELECT} FROM users u ${whereSql} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await db.execute(`SELECT COUNT(*) AS total FROM users u ${whereSql}`, params);
  const [roleRows] = await db.query('SELECT role, COUNT(*) AS count FROM users GROUP BY role');
  const summaries = { total: 0, citizen: 0, officer: 0, admin: 0 };
  for (const row of roleRows) {
    summaries[row.role] = Number(row.count);
    summaries.total += Number(row.count);
  }
  const total = Number(countRows[0].total);
  return ok(res, {
    users: rows.map(row => ({ ...row, is_active: Boolean(row.is_active) })),
    summary: summaries,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  });
});

const getUser = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'Invalid user.');
  const [rows] = await db.execute(`SELECT ${USER_SELECT} FROM users u WHERE u.id = ? LIMIT 1`, [id]);
  if (!rows.length) throw new ApiError(404, 'User not found.');
  const [complaints] = await db.execute(
    `SELECT id, tracking_code, title, status, created_at FROM issues WHERE reporter_id = ? ORDER BY created_at DESC LIMIT 5`,
    [id]
  );
  const [activity] = await db.execute(
    `SELECT action, entity_type, entity_id, created_at FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 8`,
    [id]
  );
  return ok(res, { user: { ...rows[0], is_active: Boolean(rows[0].is_active) }, complaints, activity });
});

const setUserStatus = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'Invalid user.');
  if (id === req.user.id) throw new ApiError(422, 'You cannot deactivate your own administrator account.');
  const active = req.body.is_active === true || req.body.is_active === 1 || req.body.is_active === '1';

  const [rows] = await db.execute('SELECT id, full_name, role, is_active FROM users WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw new ApiError(404, 'User not found.');
  const target = rows[0];
  if (target.role === 'admin' && !active) {
    const [adminRows] = await db.execute(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1`);
    if (Number(adminRows[0].count) <= 1) throw new ApiError(409, 'At least one active administrator account is required.');
  }

  await db.execute('UPDATE users SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
  await logActivity({
    userId: req.user.id,
    action: active ? 'user.activated' : 'user.deactivated',
    entityType: 'user',
    entityId: id,
    details: { target_role: target.role, target_name: target.full_name },
    req
  });
  if (active) {
    await createNotification({
      userId: id,
      title: 'Account reactivated',
      message: 'Your CivicFlow account has been reactivated by the city administrator.',
      type: 'account_status'
    });
  }
  return ok(res, { id, is_active: active }, active ? 'Account activated.' : 'Account deactivated.');
});

const setUserRole = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'Invalid user.');
  if (id === req.user.id) throw new ApiError(422, 'You cannot change your own role.');
  const role = String(req.body.role || '');
  if (!ROLES.includes(role)) throw new ApiError(422, 'Select a valid role.');

  const [rows] = await db.execute('SELECT id, full_name, role FROM users WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw new ApiError(404, 'User not found.');
  const target = rows[0];
  if (target.role === role) return ok(res, { id, role }, 'Role is unchanged.');

  if (target.role === 'admin' && role !== 'admin') {
    const [adminRows] = await db.execute(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1`);
    if (Number(adminRows[0].count) <= 1) throw new ApiError(409, 'At least one active administrator account is required.');
  }
  if (target.role === 'officer' && role !== 'officer') {
    const [workRows] = await db.execute(
      `SELECT COUNT(*) AS count FROM issues WHERE assigned_officer_id = ? AND status IN ('submitted','in_progress')`,
      [id]
    );
    if (Number(workRows[0].count) > 0) {
      throw new ApiError(409, 'Reassign this officer’s active complaints before changing their role.');
    }
  }

  await db.execute('UPDATE users SET role = ? WHERE id = ?', [role, id]);
  await logActivity({
    userId: req.user.id,
    action: 'user.role_changed',
    entityType: 'user',
    entityId: id,
    details: { previous_role: target.role, new_role: role, target_name: target.full_name },
    req
  });
  await createNotification({
    userId: id,
    title: 'Account role updated',
    message: `Your account role has been changed to ${role}.`,
    type: 'account_role'
  });
  return ok(res, { id, role }, 'User role updated.');
});

const createOfficer = asyncHandler(async (req, res) => {
  const v = new Validator();
  v.string('full_name', req.body.full_name, { label: 'Full name', required: true, min: 2, max: 120 });
  v.email('email', req.body.email);
  v.password('password', req.body.password, { min: 8, max: 128 });
  const department = v.string('department', req.body.department, { label: 'Department or service area', max: 120 });
  const phone = v.string('phone', req.body.phone, { label: 'Phone number', max: 30 });
  const values = v.done();
  if (phone && !/^[+()\-\s\d]{6,30}$/.test(phone)) {
    throw new ApiError(422, 'Enter a valid phone number.', { phone: 'Enter a valid phone number.' });
  }

  const [existing] = await db.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [values.email]);
  if (existing.length) throw new ApiError(409, 'An account with this email already exists.', { email: 'This email is already registered.' });

  const hash = await bcrypt.hash(values.password, 12);
  const [result] = await db.execute(
    `INSERT INTO users (full_name, email, password_hash, role, is_active, phone, department)
     VALUES (?, ?, ?, 'officer', 1, ?, ?)`,
    [values.full_name, values.email, hash, phone, department]
  );
  await createNotification({
    userId: result.insertId,
    title: 'Officer account created',
    message: 'Your municipal officer account is ready. Use your email and password to sign in to the operations console.',
    type: 'account_created'
  });
  await logActivity({
    userId: req.user.id,
    action: 'officer.created',
    entityType: 'user',
    entityId: result.insertId,
    details: { full_name: values.full_name, department },
    req
  });
  const [rows] = await db.execute('SELECT id, full_name, email, role, is_active, phone, department, created_at FROM users WHERE id = ?', [result.insertId]);
  return ok(res, { user: publicUser(rows[0]) }, 'Officer account created.', 201);
});

const updateOfficer = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'Invalid officer.');
  const [rows] = await db.execute('SELECT id, role, full_name FROM users WHERE id = ? LIMIT 1', [id]);
  if (!rows.length || rows[0].role !== 'officer') throw new ApiError(404, 'Officer not found.');

  const v = new Validator();
  v.string('full_name', req.body.full_name, { label: 'Full name', required: true, min: 2, max: 120 });
  const department = v.string('department', req.body.department, { label: 'Department or service area', max: 120 });
  const phone = v.string('phone', req.body.phone, { label: 'Phone number', max: 30 });
  const values = v.done();
  if (phone && !/^[+()\-\s\d]{6,30}$/.test(phone)) {
    throw new ApiError(422, 'Enter a valid phone number.', { phone: 'Enter a valid phone number.' });
  }
  const active = req.body.is_active === false || req.body.is_active === '0' || req.body.is_active === 0 ? 0 : 1;
  if (!active) {
    const [workRows] = await db.execute(
      `SELECT COUNT(*) AS count FROM issues WHERE assigned_officer_id = ? AND status IN ('submitted','in_progress')`,
      [id]
    );
    if (Number(workRows[0].count) > 0) {
      throw new ApiError(409, 'Reassign this officer’s active complaints before deactivating the account.');
    }
  }

  await db.execute(
    'UPDATE users SET full_name = ?, department = ?, phone = ?, is_active = ? WHERE id = ?',
    [values.full_name, department, phone, active, id]
  );
  await logActivity({
    userId: req.user.id,
    action: 'officer.updated',
    entityType: 'user',
    entityId: id,
    details: { full_name: values.full_name, department, is_active: Boolean(active) },
    req
  });
  return ok(res, {}, 'Officer account updated.');
});

const listOfficers = asyncHandler(async (_req, res) => {
  const [rows] = await db.query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.department, u.is_active, u.created_at, u.last_login_at,
            COUNT(i.id) AS total_assigned,
            SUM(CASE WHEN i.status = 'resolved' THEN 1 ELSE 0 END) AS resolved_count,
            SUM(CASE WHEN i.status IN ('submitted','in_progress') THEN 1 ELSE 0 END) AS active_workload,
            ROUND(AVG(CASE WHEN i.status = 'resolved' AND i.resolved_at IS NOT NULL
              THEN TIMESTAMPDIFF(HOUR, i.created_at, i.resolved_at) END), 1) AS avg_resolution_hours
     FROM users u
     LEFT JOIN issues i ON i.assigned_officer_id = u.id
     WHERE u.role = 'officer'
     GROUP BY u.id, u.full_name, u.email, u.phone, u.department, u.is_active, u.created_at, u.last_login_at
     ORDER BY u.is_active DESC, active_workload DESC, u.full_name ASC`
  );
  return ok(res, {
    officers: rows.map(row => ({
      ...row,
      is_active: Boolean(row.is_active),
      total_assigned: Number(row.total_assigned),
      resolved_count: Number(row.resolved_count),
      active_workload: Number(row.active_workload),
      avg_resolution_hours: row.avg_resolution_hours == null ? null : Number(row.avg_resolution_hours)
    }))
  });
});

const analytics = asyncHandler(async (req, res) => {
  const days = Math.max(0, Math.min(730, Number.parseInt(req.query.days, 10) || 90));
  const from = days > 0 ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
  const dateWhere = from ? 'WHERE created_at >= ?' : '';
  const dateParams = from ? [from] : [];

  const granularity = days > 0 && days <= 31 ? 'day' : 'month';
  const bucketCount = granularity === 'day' ? Math.max(days, 1) : days > 0 ? Math.min(12, Math.max(3, Math.ceil(days / 30))) : 12;
  const buckets = granularity === 'day' ? buildDayBuckets(bucketCount) : buildMonthBuckets(bucketCount);
  const trendExpression = granularity === 'day' ? "DATE_FORMAT(created_at, '%Y-%m-%d')" : "DATE_FORMAT(created_at, '%Y-%m')";

  const [[statusRows], [categoryRows], [areaRows], [priorityRows], [trendRows], [resolutionRows], [serviceCategoryRows], [serviceAreaRows], [pollSummaryRows], [pollRows], [officerRows], [userTrendRows], [issueTotalRows]] = await Promise.all([
    db.query(`SELECT status, COUNT(*) AS count FROM issues ${dateWhere} GROUP BY status`, dateParams),
    db.query(`SELECT category, COUNT(*) AS count FROM issues ${dateWhere} GROUP BY category ORDER BY count DESC`, dateParams),
    db.query(
      `SELECT COALESCE(NULLIF(TRIM(area), ''), 'Unspecified') AS area, COUNT(*) AS count
       FROM issues ${dateWhere} GROUP BY COALESCE(NULLIF(TRIM(area), ''), 'Unspecified')
       ORDER BY count DESC LIMIT 10`,
      dateParams
    ),
    db.query(`SELECT priority, COUNT(*) AS count FROM issues ${dateWhere} GROUP BY priority`, dateParams),
    db.query(
      `SELECT ${trendExpression} AS bucket, COUNT(*) AS count
       FROM issues ${from ? 'WHERE created_at >= ?' : ''}
       GROUP BY bucket ORDER BY bucket`,
      dateParams
    ),
    db.query(
      `SELECT ROUND(AVG(TIMESTAMPDIFF(HOUR, created_at, resolved_at)), 1) AS avg_hours,
              COUNT(*) AS resolved_count,
              ROUND(AVG(TIMESTAMPDIFF(HOUR, created_at, updated_at)), 1) AS avg_update_hours
       FROM issues WHERE status = 'resolved' AND resolved_at IS NOT NULL ${from ? 'AND created_at >= ?' : ''}`,
      dateParams
    ),
    db.query(
      `SELECT c.name AS label, COUNT(s.id) AS count
       FROM service_categories c
       LEFT JOIN city_services s ON s.category = c.slug AND s.is_active = 1
       GROUP BY c.id, c.name ORDER BY count DESC`
    ),
    db.query(
      `SELECT COALESCE(NULLIF(TRIM(area), ''), 'Unspecified') AS label, COUNT(*) AS count
       FROM city_services WHERE is_active = 1
       GROUP BY COALESCE(NULLIF(TRIM(area), ''), 'Unspecified')
       ORDER BY count DESC LIMIT 10`
    ),
    db.query(
      `SELECT COUNT(*) AS total_polls,
              SUM(is_active = 1) AS active_polls,
              (SELECT COUNT(*) FROM poll_votes ${from ? 'WHERE created_at >= ?' : ''}) AS votes
       FROM polls`,
      dateParams
    ),
    db.query(
      `SELECT p.id, p.title, p.is_active, p.starts_at, p.ends_at, COUNT(v.id) AS votes,
              (SELECT COUNT(*) FROM poll_options o WHERE o.poll_id = p.id) AS option_count
       FROM polls p LEFT JOIN poll_votes v ON v.poll_id = p.id ${from ? 'AND v.created_at >= ?' : ''}
       GROUP BY p.id, p.title, p.is_active, p.starts_at, p.ends_at
       ORDER BY p.created_at DESC LIMIT 10`,
      dateParams
    ),
    db.query(
      `SELECT u.id, u.full_name, u.department,
              COUNT(i.id) AS assigned,
              SUM(CASE WHEN i.status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
              SUM(CASE WHEN i.status IN ('submitted','in_progress') THEN 1 ELSE 0 END) AS open,
              ROUND(AVG(CASE WHEN i.status = 'resolved' AND i.resolved_at IS NOT NULL
                THEN TIMESTAMPDIFF(HOUR, i.created_at, i.resolved_at) END), 1) AS avg_resolution_hours
       FROM users u
       LEFT JOIN issues i ON i.assigned_officer_id = u.id
       WHERE u.role = 'officer'
       GROUP BY u.id, u.full_name, u.department
       ORDER BY resolved DESC, assigned DESC`
    ),
    db.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS count
       FROM users WHERE role = 'citizen'
       ${from ? 'AND created_at >= ?' : ''}
       GROUP BY month ORDER BY month`,
      dateParams
    ),
    db.query(`SELECT COUNT(*) AS total FROM issues ${dateWhere}`, dateParams)
  ]);

  const status = { submitted: 0, in_progress: 0, resolved: 0, rejected: 0, total: Number(issueTotalRows[0].total) };
  for (const row of statusRows) status[row.status] = Number(row.count);

  const trend = buckets.map(bucket => ({
    label: bucket.label,
    value: Number(trendRows.find(row => row.bucket === bucket.key)?.count || 0)
  }));

  const userTrend = buildMonthBuckets(12).map(bucket => ({
    label: bucket.label,
    value: Number(userTrendRows.find(row => row.month === bucket.key)?.count || 0)
  }));

  return ok(res, {
    range_days: days || 'all',
    summary: {
      ...status,
      resolution_rate: status.total ? Math.round((status.resolved / status.total) * 1000) / 10 : 0,
      avg_resolution_hours: resolutionRows[0].avg_hours == null ? null : Number(resolutionRows[0].avg_hours),
      avg_update_hours: resolutionRows[0].avg_update_hours == null ? null : Number(resolutionRows[0].avg_update_hours)
    },
    trend,
    trend_granularity: granularity,
    categories: categoryRows.map(row => ({ label: row.category.replaceAll('_', ' '), key: row.category, value: Number(row.count) })),
    areas: areaRows.map(row => ({ label: row.area, value: Number(row.count) })),
    priorities: priorityRows.map(row => ({ key: row.priority, value: Number(row.count) })),
    service_categories: serviceCategoryRows.map(row => ({ label: row.label, value: Number(row.count) })),
    service_areas: serviceAreaRows.map(row => ({ label: row.label, value: Number(row.count) })),
    polls: {
      total: Number(pollSummaryRows[0].total_polls),
      active: Number(pollSummaryRows[0].active_polls),
      votes: Number(pollSummaryRows[0].votes),
      participation: pollRows.map(row => ({
        id: row.id,
        title: row.title,
        votes: Number(row.votes),
        options: Number(row.option_count),
        is_active: Boolean(row.is_active),
        starts_at: row.starts_at,
        ends_at: row.ends_at
      }))
    },
    officers: officerRows.map(row => ({
      ...row,
      assigned: Number(row.assigned),
      resolved: Number(row.resolved),
      open: Number(row.open),
      avg_resolution_hours: row.avg_resolution_hours == null ? null : Number(row.avg_resolution_hours)
    })),
    citizens_trend: userTrend
  });
});

const activityLogs = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 25, maxLimit: 100 });
  const where = [];
  const params = [];
  const q = String(req.query.q || '').trim();
  const entityType = String(req.query.entity_type || '').trim();
  const action = String(req.query.action || '').trim();
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  if (q) { where.push('(a.action LIKE ? OR u.full_name LIKE ? OR a.details LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (entityType) { where.push('a.entity_type = ?'); params.push(entityType); }
  if (action) { where.push('a.action LIKE ?'); params.push(`${action}%`); }
  if (from) { where.push('a.created_at >= ?'); params.push(`${from} 00:00:00`); }
  if (to) { where.push('a.created_at <= ?'); params.push(`${to} 23:59:59`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await db.execute(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.ip_address, a.created_at,
            u.full_name AS actor_name, u.role AS actor_role
     FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
     ${whereSql}
     ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await db.execute(
    `SELECT COUNT(*) AS total FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id ${whereSql}`,
    params
  );
  const [entityRows] = await db.query('SELECT DISTINCT entity_type FROM activity_logs WHERE entity_type IS NOT NULL ORDER BY entity_type');
  const total = Number(countRows[0].total);
  return ok(res, {
    logs: rows.map(row => {
      let details = null;
      try { details = row.details ? JSON.parse(row.details) : null; } catch { details = row.details; }
      return { ...row, details };
    }),
    entity_types: entityRows.map(row => row.entity_type),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  });
});

const getSettings = asyncHandler(async (_req, res) => {
  const [rows] = await db.query('SELECT setting_key, setting_value, updated_at FROM platform_settings ORDER BY setting_key');
  const settings = {};
  for (const row of rows) settings[row.setting_key] = row.setting_value || '';
  return ok(res, {
    settings,
    public_keys: PUBLIC_SETTING_KEYS,
    maps_enabled: Boolean(process.env.GOOGLE_MAPS_API_KEY)
  });
});

const updateSettings = asyncHandler(async (req, res) => {
  const updates = {};
  for (const key of PUBLIC_SETTING_KEYS) {
    if (Object.hasOwn(req.body, key)) updates[key] = String(req.body[key] ?? '').trim();
  }
  if (Object.keys(updates).length === 0) throw new ApiError(422, 'No supported settings were provided.');
  if (updates.support_email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(updates.support_email)) {
    throw new ApiError(422, 'Enter a valid support email address.', { support_email: 'Enter a valid email address.' });
  }
  for (const [key, value] of Object.entries(updates)) {
    if (value.length > 500) throw new ApiError(422, `${key} is too long.`);
    await db.execute(
      `INSERT INTO platform_settings (setting_key, setting_value, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
      [key, value, req.user.id]
    );
  }
  await logActivity({
    userId: req.user.id,
    action: 'settings.updated',
    entityType: 'settings',
    details: { keys: Object.keys(updates) },
    req
  });
  return ok(res, { settings: updates }, 'Platform settings updated.');
});

const exportComplaints = asyncHandler(async (req, res) => {
  const where = [];
  const params = [];
  const status = String(req.query.status || '').trim();
  const category = String(req.query.category || '').trim();
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  if (ISSUE_STATUSES.includes(status)) { where.push('i.status = ?'); params.push(status); }
  if (category) { where.push('i.category = ?'); params.push(category); }
  if (from) { where.push('i.created_at >= ?'); params.push(`${from} 00:00:00`); }
  if (to) { where.push('i.created_at <= ?'); params.push(`${to} 23:59:59`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await db.execute(
    `SELECT i.id, i.tracking_code, i.title, i.category, i.status, i.priority, i.area, i.address,
            i.created_at, i.resolved_at, i.resolution_summary,
            reporter.full_name AS reporter_name, reporter.email AS reporter_email,
            officer.full_name AS assigned_officer
     FROM issues i
     JOIN users reporter ON reporter.id = i.reporter_id
     LEFT JOIN users officer ON officer.id = i.assigned_officer_id
     ${whereSql}
     ORDER BY i.created_at DESC`,
    params
  );
  const csv = toCsv(rows, [
    { label: 'Tracking ID', value: 'tracking_code' },
    { label: 'Title', value: 'title' },
    { label: 'Category', value: 'category' },
    { label: 'Status', value: 'status' },
    { label: 'Priority', value: 'priority' },
    { label: 'Area', value: 'area' },
    { label: 'Address', value: 'address' },
    { label: 'Reporter', value: 'reporter_name' },
    { label: 'Reporter email', value: 'reporter_email' },
    { label: 'Assigned officer', value: 'assigned_officer' },
    { label: 'Submitted at', value: row => row.created_at?.toISOString?.() || row.created_at },
    { label: 'Resolved at', value: row => row.resolved_at?.toISOString?.() || row.resolved_at || '' },
    { label: 'Resolution summary', value: 'resolution_summary' }
  ]);
  await logActivity({
    userId: req.user.id,
    action: 'report.exported',
    entityType: 'report',
    details: { type: 'complaints_csv', rows: rows.length, status: status || 'all' },
    req
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="civicflow-complaints-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(`\uFEFF${csv}`);
});

module.exports = {
  dashboard,
  listUsers,
  getUser,
  setUserStatus,
  setUserRole,
  createOfficer,
  updateOfficer,
  listOfficers,
  analytics,
  activityLogs,
  getSettings,
  updateSettings,
  exportComplaints
};
