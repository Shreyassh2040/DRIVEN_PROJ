const crypto = require('crypto');

function generateTrackingCode() {
  const year = new Date().getUTCFullYear();
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `SC-${year}-${suffix}`;
}

module.exports = { generateTrackingCode };
