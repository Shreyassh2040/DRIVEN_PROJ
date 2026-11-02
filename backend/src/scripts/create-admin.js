#!/usr/bin/env node
require('dotenv').config();

const bcrypt = require('bcryptjs');
const db = require('../config/db');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function usage() {
  console.log(`
Create or promote an administrator account.

Usage:
  npm run create-admin -- --email admin@city.gov --name "City Administrator" --password "a-strong-password"

Options:
  --email <email>       Administrator email (required)
  --name <full name>    Full name (required for new accounts)
  --password <value>    Password of at least 8 characters. You can also set ADMIN_PASSWORD.
  --department <text>   Optional department label
  --promote             Promote an existing account instead of failing
  --reset-password      Update the password of an existing administrator

Tip: prefer the ADMIN_PASSWORD environment variable so the password does not
appear in your shell history:
  ADMIN_PASSWORD='strong-password' npm run create-admin -- --email ... --name ...
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  const email = String(args.email || '').trim().toLowerCase();
  const fullName = String(args.name || '').trim();
  const password = String(args.password || process.env.ADMIN_PASSWORD || '');
  const department = String(args.department || 'City Administration').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    console.error('A valid --email is required.');
    return usage();
  }
  if (password.length < 8) {
    console.error('A password of at least 8 characters is required (--password or ADMIN_PASSWORD).');
    return usage();
  }

  const [existing] = await db.execute(
    'SELECT id, full_name, email, role FROM users WHERE email = ? LIMIT 1',
    [email]
  );

  if (existing.length) {
    const user = existing[0];
    if (user.role !== 'admin' && !args.promote) {
      console.error(`An account with this email already exists as "${user.role}". Re-run with --promote to elevate it to admin.`);
      process.exitCode = 1;
      return;
    }
    if (user.role === 'admin' && !args['reset-password']) {
      console.error('An administrator with this email already exists. Use --reset-password to update the password.');
      process.exitCode = 1;
      return;
    }
    const hash = await bcrypt.hash(password, 12);
    await db.execute(
      'UPDATE users SET role = ?, password_hash = ?, is_active = 1, department = ? WHERE id = ?',
      ['admin', hash, department, user.id]
    );
    console.log(`Updated administrator account #${user.id} (${email}). Role: admin.`);
    await db.end();
    return;
  }

  if (!fullName || fullName.length < 2) {
    console.error('A full name is required for a new administrator (--name).');
    return usage();
  }

  const hash = await bcrypt.hash(password, 12);
  const [result] = await db.execute(
    `INSERT INTO users (full_name, email, password_hash, role, is_active, department)
     VALUES (?, ?, ?, 'admin', 1, ?)`,
    [fullName, email, hash, department]
  );
  try {
    await db.execute(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
       VALUES (?, 'admin.bootstrap_created', 'user', ?, ?)`,
      [result.insertId, result.insertId, JSON.stringify({ email })]
    );
  } catch {
    // activity_logs may not exist on an un-migrated database.
  }
  console.log(`Created administrator account #${result.insertId} (${email}).`);
  await db.end();
}

main().catch(async error => {
  console.error('Unable to provision the administrator:', error.message);
  try { await db.end(); } catch { /* ignore */ }
  process.exitCode = 1;
});
