const db = require('../config/db');
const { ApiError, ok, asyncHandler } = require('../utils/http');
const { Validator } = require('../utils/validation');
const { logActivity } = require('../utils/audit');
const { publicUser } = require('./auth');

const getProfile = asyncHandler(async (req, res) => {
  const [rows] = await db.execute(
    `SELECT id, full_name, email, role, is_active, phone, department, created_at, updated_at
     FROM users WHERE id = ? LIMIT 1`,
    [req.user.id]
  );
  if (!rows.length) throw new ApiError(404, 'Account not found.');
  return ok(res, { user: publicUser(rows[0]) });
});

const updateProfile = asyncHandler(async (req, res) => {
  const v = new Validator();
  v.string('full_name', req.body.full_name, { label: 'Full name', required: true, min: 2, max: 120 });
  const phone = v.string('phone', req.body.phone, { label: 'Phone number', max: 30 });
  const values = v.done();

  if (phone && !/^[+()\-\s\d]{6,30}$/.test(phone)) {
    throw new ApiError(422, 'Enter a valid phone number.', { phone: 'Enter a valid phone number.' });
  }

  await db.execute(
    'UPDATE users SET full_name = ?, phone = ? WHERE id = ?',
    [values.full_name, values.phone, req.user.id]
  );
  const [rows] = await db.execute(
    `SELECT id, full_name, email, role, is_active, phone, department, created_at, updated_at
     FROM users WHERE id = ?`,
    [req.user.id]
  );
  await logActivity({
    userId: req.user.id,
    action: 'user.profile_updated',
    entityType: 'user',
    entityId: req.user.id,
    req
  });
  return ok(res, { user: publicUser(rows[0]) }, 'Your profile has been updated.');
});

module.exports = { getProfile, updateProfile };
