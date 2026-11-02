const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { ApiError, ok, asyncHandler } = require('../utils/http');
const { Validator } = require('../utils/validation');
const { logActivity } = require('../utils/audit');

const USER_FIELDS = 'id, full_name, email, role, is_active, phone, department, created_at, updated_at';
const BCRYPT_ROUNDS = 12;

function tokenFor(user) {
  return jwt.sign(
    { sub: user.id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h', issuer: 'civicflow' }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    is_active: Boolean(user.is_active),
    phone: user.phone || null,
    department: user.department || null,
    created_at: user.created_at
  };
}

const register = asyncHandler(async (req, res) => {
  const v = new Validator();
  v.string('full_name', req.body.full_name, { label: 'Full name', required: true, min: 2, max: 120 });
  v.email('email', req.body.email);
  v.password('password', req.body.password, { min: 8, max: 128 });
  const values = v.done();

  const [existing] = await db.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [values.email]);
  if (existing.length) throw new ApiError(409, 'An account with this email already exists.');

  const hash = await bcrypt.hash(values.password, BCRYPT_ROUNDS);
  const [result] = await db.execute(
    `INSERT INTO users (full_name, email, password_hash, role, is_active)
     VALUES (?, ?, ?, 'citizen', 1)`,
    [values.full_name, values.email, hash]
  );

  const [rows] = await db.execute(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`, [result.insertId]);
  const user = publicUser(rows[0]);
  await logActivity({
    userId: user.id,
    action: 'user.registered',
    entityType: 'user',
    entityId: user.id,
    details: { role: 'citizen' },
    req
  });

  return ok(res, { token: tokenFor(user), user }, 'Your account has been created.', 201);
});

const login = asyncHandler(async (req, res) => {
  const v = new Validator();
  v.email('email', req.body.email);
  v.string('password', req.body.password, { label: 'Password', required: true, max: 128 });
  const values = v.done();

  const [rows] = await db.execute(
    `SELECT ${USER_FIELDS}, password_hash FROM users WHERE email = ? LIMIT 1`,
    [values.email]
  );
  if (!rows.length) throw new ApiError(401, 'Invalid email or password.');
  const user = rows[0];
  const matches = await bcrypt.compare(values.password, user.password_hash);
  if (!matches) throw new ApiError(401, 'Invalid email or password.');
  if (!user.is_active) {
    throw new ApiError(403, 'This account has been deactivated. Contact the city administrator.');
  }

  await db.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  const safeUser = publicUser(user);
  return ok(res, { token: tokenFor(safeUser), user: safeUser }, 'Signed in successfully.');
});

const me = asyncHandler(async (req, res) => {
  const [rows] = await db.execute(`SELECT ${USER_FIELDS} FROM users WHERE id = ? LIMIT 1`, [req.user.id]);
  if (!rows.length) throw new ApiError(404, 'Account not found.');
  return ok(res, { user: publicUser(rows[0]) });
});

const changePassword = asyncHandler(async (req, res) => {
  const v = new Validator();
  v.string('current_password', req.body.current_password, { label: 'Current password', required: true, max: 128 });
  v.password('new_password', req.body.new_password, { min: 8, max: 128 });
  const values = v.done();

  const [rows] = await db.execute('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [req.user.id]);
  if (!rows.length) throw new ApiError(404, 'Account not found.');
  const matches = await bcrypt.compare(values.current_password, rows[0].password_hash);
  if (!matches) {
    throw new ApiError(422, 'Your current password is incorrect.', { current_password: 'Your current password is incorrect.' });
  }
  if (values.current_password === values.new_password) {
    throw new ApiError(422, 'Choose a password different from your current password.', { new_password: 'Choose a different password.' });
  }

  const hash = await bcrypt.hash(values.new_password, BCRYPT_ROUNDS);
  await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
  await logActivity({
    userId: req.user.id,
    action: 'user.password_changed',
    entityType: 'user',
    entityId: req.user.id,
    req
  });
  return ok(res, {}, 'Your password has been updated.');
});

module.exports = { register, login, me, changePassword, publicUser, tokenFor };
