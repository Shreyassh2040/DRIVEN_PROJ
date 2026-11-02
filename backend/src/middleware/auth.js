const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { ApiError } = require('../utils/http');

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/**
 * Verifies the JWT, then reloads the account from MySQL so role changes and
 * deactivations take effect immediately instead of at token expiry.
 */
async function authenticate(req, _res, next) {
  try {
    const token = readToken(req);
    if (!token) throw new ApiError(401, 'Please sign in to continue.');
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'civicflow' });
    } catch {
      throw new ApiError(401, 'Your session has expired. Please sign in again.');
    }
    const [rows] = await db.execute(
      `SELECT id, full_name, email, role, is_active, phone, department, created_at
       FROM users WHERE id = ? LIMIT 1`,
      [payload.sub]
    );
    if (!rows.length) throw new ApiError(401, 'Your account no longer exists.');
    const user = rows[0];
    if (!user.is_active) throw new ApiError(403, 'This account has been deactivated. Contact the city administrator.');
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'civicflow' });
    const [rows] = await db.execute(
      `SELECT id, full_name, email, role, is_active, phone, department, created_at
       FROM users WHERE id = ? LIMIT 1`,
      [payload.sub]
    );
    if (rows.length && rows[0].is_active) req.user = rows[0];
  } catch {
    // A bad token on a public endpoint is treated as anonymous.
  }
  return next();
}

function allowRoles(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'Please sign in to continue.'));
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have permission to perform this action.'));
    }
    return next();
  };
}

module.exports = { authenticate, optionalAuth, allowRoles };
