#!/usr/bin/env node
/*
 * CivicFlow API smoke tests.
 *
 * Runs against a disposable MySQL database (default: smart_city_test) so the
 * real smart_city data is never touched. The schema is rebuilt for every run.
 *
 *   cd backend && npm test
 *   KEEP_TEST_DB=1 npm test     # keep the test database for inspection
 *
 * Requires the same DB_* credentials as the application (backend/.env).
 */
'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const TEST_DB = process.env.TEST_DB_NAME || 'smart_city_test';
const ADMIN_EMAIL = 'smoke.admin@civicflow.test';
const ADMIN_PASSWORD = 'SmokeAdmin#2026';
const CITIZEN_PASSWORD = 'Citizen#2026';
const OFFICER_PASSWORD = 'Officer#2026';

process.env.NODE_ENV = 'test';
process.env.DB_NAME = TEST_DB;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'civicflow-smoke-test-secret-key-0123456789';

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

let baseUrl = '';
let server = null;
let db = null;

async function api(pathname, options) {
  const opts = options || {};
  const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body = opts.body;
  if (body !== undefined && body !== null && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: opts.method || 'GET',
    headers,
    body
  });
  const contentType = response.headers.get('content-type') || '';
  let payload = null;
  let text = '';
  if (contentType.includes('application/json')) payload = await response.json();
  else text = await response.text();
  return { status: response.status, body: payload, text, headers: response.headers };
}

function expect(response, status, label) {
  assert.equal(response.status, status, `${label}: expected HTTP ${status}, received ${response.status} ${JSON.stringify(response.body || response.text).slice(0, 240)}`);
  return response.body;
}

function ok(response, label) {
  const body = expect(response, 200, label);
  assert.equal(body.success, true, `${label}: expected success response`);
  return body.data;
}

async function setupDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });
  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
    const schemaPath = path.resolve(__dirname, '..', '..', 'database', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8').replace(/\bsmart_city\b/g, TEST_DB);
    await connection.query(schema);
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await connection.execute(
      `INSERT INTO \`${TEST_DB}\`.users (full_name, email, password_hash, role, is_active)
       VALUES (?, ?, ?, 'admin', 1)`,
      ['Smoke Administrator', ADMIN_EMAIL, hash]
    );
  } finally {
    await connection.end();
  }
}

async function teardownDatabase() {
  if (process.env.KEEP_TEST_DB === '1') {
    console.log(`\nTest database "${TEST_DB}" kept for inspection.`);
    return;
  }
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });
  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  } finally {
    await connection.end();
  }
}

/* ---------------------------------------------------------------- Tests */

let adminToken = '';
let citizenToken = '';
let secondCitizenToken = '';
let officerToken = '';
let adminId = 0;
let officerId = 0;
let issueId = 0;
let trackingCode = '';
let pollId = 0;
let pollOptionId = 0;
let categorySlug = '';
let serviceId = 0;

test('health endpoint reports a database connection', async () => {
  const data = ok(await api('/health'), 'health');
  assert.equal(data.status, 'ok');
  assert.equal(data.database, 'connected');
});

test('public registration forces the citizen role', async () => {
  const data = expect(await api('/auth/register', {
    method: 'POST',
    body: {
      full_name: 'Smoke Citizen',
      email: 'smoke.citizen@civicflow.test',
      password: CITIZEN_PASSWORD,
      role: 'admin'
    }
  }), 201, 'register citizen');
  assert.equal(data.data.user.role, 'citizen');
  assert.ok(data.data.token);
  citizenToken = data.data.token;
});

test('duplicate registration is rejected without leaking password data', async () => {
  const response = await api('/auth/register', {
    method: 'POST',
    body: { full_name: 'Smoke Citizen', email: 'smoke.citizen@civicflow.test', password: CITIZEN_PASSWORD }
  });
  expect(response, 409, 'duplicate registration');
  assert.equal(response.body.success, false);
});

test('login and session identity work for the citizen', async () => {
  const data = expect(await api('/auth/login', {
    method: 'POST',
    body: { email: 'smoke.citizen@civicflow.test', password: CITIZEN_PASSWORD }
  }), 200, 'citizen login');
  citizenToken = data.data.token;
  const me = ok(await api('/auth/me', { token: citizenToken }), 'citizen session');
  assert.equal(me.user.email, 'smoke.citizen@civicflow.test');
  assert.equal(me.user.role, 'citizen');
});

test('invalid credentials are rejected', async () => {
  expect(await api('/auth/login', {
    method: 'POST',
    body: { email: 'smoke.citizen@civicflow.test', password: 'definitely-wrong' }
  }), 401, 'bad login');
});

test('citizens cannot use administrator endpoints', async () => {
  expect(await api('/admin/dashboard', { token: citizenToken }), 403, 'citizen admin dashboard');
  expect(await api('/admin/users', { token: citizenToken }), 403, 'citizen user directory');
  expect(await api('/officer/complaints', { token: citizenToken }), 403, 'citizen officer queue');
});

test('administrator login provides the admin role', async () => {
  const data = expect(await api('/auth/login', {
    method: 'POST',
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
  }), 200, 'admin login');
  assert.equal(data.data.user.role, 'admin');
  adminToken = data.data.token;
  adminId = data.data.user.id;
});

test('administrator can provision an officer account', async () => {
  const data = expect(await api('/admin/officers', {
    method: 'POST',
    token: adminToken,
    body: {
      full_name: 'Smoke Officer',
      email: 'smoke.officer@civicflow.test',
      password: OFFICER_PASSWORD,
      department: 'Roads and lighting',
      phone: '+1 555 0199'
    }
  }), 201, 'create officer');
  assert.equal(data.data.user.role, 'officer');
  officerId = data.data.user.id;

  const login = expect(await api('/auth/login', {
    method: 'POST',
    body: { email: 'smoke.officer@civicflow.test', password: OFFICER_PASSWORD }
  }), 200, 'officer login');
  officerToken = login.data.token;
});

test('officers cannot use administrator-only endpoints', async () => {
  expect(await api('/admin/dashboard', { token: officerToken }), 403, 'officer admin dashboard');
  expect(await api('/admin/analytics', { token: officerToken }), 403, 'officer analytics');
});

test('citizen can submit a complaint with an honest tracking code', async () => {
  const form = new FormData();
  form.append('title', 'Broken streetlight on Cedar Avenue');
  form.append('category', 'streetlight');
  form.append('description', 'The streetlight outside the community library has been dark for three nights. The pavement is difficult to see after sunset.');
  form.append('address', 'Cedar Avenue, outside the community library');
  form.append('area', 'Cedar Ward');
  const data = expect(await api('/issues', {
    method: 'POST',
    token: citizenToken,
    body: form
  }), 201, 'submit complaint');
  assert.match(data.data.issue.tracking_code, /^SC-\d{4}-[A-Z0-9]+$/);
  assert.equal(data.data.issue.status, 'submitted');
  issueId = data.data.issue.id;
  trackingCode = data.data.issue.tracking_code;
});

test('complaint validation rejects short descriptions', async () => {
  const form = new FormData();
  form.append('title', 'Short report');
  form.append('category', 'other');
  form.append('description', 'Too short');
  form.append('address', 'Somewhere');
  const response = await api('/issues', { method: 'POST', token: citizenToken, body: form });
  expect(response, 422, 'invalid complaint');
  assert.ok(response.body.errors && response.body.errors.description);
});

test('citizen can list and open their own complaint with a timeline', async () => {
  const mine = ok(await api('/issues/my', { token: citizenToken }), 'my complaints');
  assert.ok(mine.complaints.some(complaint => complaint.id === issueId));
  const detail = ok(await api(`/issues/${issueId}`, { token: citizenToken }), 'complaint detail');
  assert.equal(detail.complaint.tracking_code, trackingCode);
  const timeline = ok(await api(`/issues/${issueId}/history`, { token: citizenToken }), 'complaint timeline');
  assert.ok(Array.isArray(timeline.events) && timeline.events.length >= 1);
});

test('another citizen cannot read a complaint they did not submit', async () => {
  expect(await api('/issues', {
    method: 'POST',
    token: adminToken,
    body: {}
  }), 403, 'admin cannot create citizen complaint');

  const registration = expect(await api('/auth/register', {
    method: 'POST',
    body: {
      full_name: 'Second Smoke Citizen',
      email: 'smoke.second@civicflow.test',
      password: CITIZEN_PASSWORD
    }
  }), 201, 'register second citizen');
  secondCitizenToken = registration.data.token;
  expect(await api(`/issues/${issueId}`, { token: secondCitizenToken }), 403, 'foreign complaint detail');
});

test('staff can review the complaint queue and statistics', async () => {
  const queue = ok(await api('/officer/complaints?limit=5', { token: officerToken }), 'officer queue');
  assert.ok(queue.complaints.some(complaint => complaint.id === issueId));
  assert.ok(queue.summary.total >= 1);
  assert.ok(queue.pagination.total >= 1);

  const adminQueue = ok(await api('/admin/complaints?limit=5', { token: adminToken }), 'admin complaints');
  assert.ok(adminQueue.complaints.some(complaint => complaint.id === issueId));

  const stats = ok(await api('/officer/stats', { token: officerToken }), 'officer stats');
  assert.ok(stats.summary.total >= 1);
  assert.ok(Array.isArray(stats.trend));
});

test('officer can assign and progress a complaint', async () => {
  ok(await api(`/officer/complaints/${issueId}/assign`, {
    method: 'POST',
    token: adminToken,
    body: { officer_id: officerId, note: 'Please inspect the light fixture.' }
  }), 'assign complaint');

  const progress = expect(await api(`/officer/complaints/${issueId}/status`, {
    method: 'PATCH',
    token: officerToken,
    body: { status: 'in_progress', note: 'Inspection scheduled for tomorrow morning.' }
  }), 200, 'complaint in progress');
  assert.equal(progress.data.complaint.status, 'in_progress');

  const premature = await api(`/officer/complaints/${issueId}/status`, {
    method: 'PATCH',
    token: officerToken,
    body: { status: 'resolved' }
  });
  expect(premature, 422, 'resolution requires details');

  const resolved = expect(await api(`/officer/complaints/${issueId}/status`, {
    method: 'PATCH',
    token: officerToken,
    body: { status: 'resolved', resolution_summary: 'Replaced the failed luminaire and tested the circuit.' }
  }), 200, 'resolve complaint');
  assert.equal(resolved.data.complaint.status, 'resolved');

  const detail = ok(await api(`/officer/complaints/${issueId}`, { token: officerToken }), 'resolved detail');
  assert.equal(detail.complaint.status, 'resolved');
  assert.ok(detail.complaint.resolved_at);
});

test('the reporting citizen is notified about status changes', async () => {
  const data = ok(await api('/notifications?limit=20', { token: citizenToken }), 'notifications');
  assert.ok(data.notifications.some(notification => notification.related_issue_id === issueId && /updated|resolved/i.test(notification.title)));
  assert.ok(Number(data.unread_count) >= 1);
});

test('administrator can create a poll and citizens can vote once', async () => {
  const created = expect(await api('/polls', {
    method: 'POST',
    token: adminToken,
    body: {
      title: 'Which street should be repaired first?',
      description: 'Help the city prioritise the next repair cycle.',
      options: ['Cedar Avenue', 'Birch Street', 'Maple Lane'],
      is_active: true
    }
  }), 201, 'create poll');
  pollId = created.data.id;

  const publicPolls = ok(await api('/polls', { token: citizenToken }), 'public polls');
  const poll = publicPolls.polls.find(item => item.id === pollId);
  assert.ok(poll, 'created poll should be listed');
  assert.equal(poll.status, 'active');
  assert.equal(poll.options.length, 3);
  pollOptionId = poll.options[0].id;

  const vote = expect(await api(`/polls/${pollId}/vote`, {
    method: 'POST',
    token: citizenToken,
    body: { option_id: pollOptionId }
  }), 201, 'first vote');
  assert.equal(vote.data.poll.total_votes, 1);

  expect(await api(`/polls/${pollId}/vote`, {
    method: 'POST',
    token: citizenToken,
    body: { option_id: poll.options[1].id }
  }), 409, 'duplicate vote');

  expect(await api(`/polls/${pollId}/vote`, {
    method: 'POST',
    token: adminToken,
    body: { option_id: poll.options[1].id }
  }), 403, 'administrator cannot vote');
});

test('poll option rules are enforced', async () => {
  const invalid = await api('/polls', {
    method: 'POST',
    token: adminToken,
    body: { title: 'Invalid poll', options: ['Only one option'], is_active: true }
  });
  expect(invalid, 422, 'poll needs two options');

  expect(await api(`/polls/${pollId}`, {
    method: 'PUT',
    token: adminToken,
    body: {
      title: 'Which street should be repaired first?',
      description: 'Updated description only.',
      options: ['Cedar Avenue', 'Birch Street'],
      is_active: true
    }
  }), 409, 'poll options locked after votes');

  const updated = expect(await api(`/polls/${pollId}`, {
    method: 'PUT',
    token: adminToken,
    body: {
      title: 'Which street should be repaired first?',
      description: 'Updated description only.',
      is_active: true
    }
  }), 200, 'poll description update');
  assert.equal(updated.success, true);
});

test('closed polls reject new votes', async () => {
  const vote = expect(await api(`/polls/${pollId}/vote`, {
    method: 'POST',
    token: secondCitizenToken,
    body: { option_id: pollOptionId }
  }), 201, 'second citizen vote');
  assert.equal(vote.data.poll.total_votes, 2);

  expect(await api(`/polls/${pollId}/close`, { method: 'POST', token: adminToken }), 200, 'close poll');

  const third = expect(await api('/auth/register', {
    method: 'POST',
    body: {
      full_name: 'Third Smoke Citizen',
      email: 'smoke.third@civicflow.test',
      password: CITIZEN_PASSWORD
    }
  }), 201, 'register third citizen');

  expect(await api(`/polls/${pollId}/vote`, {
    method: 'POST',
    token: third.data.token,
    body: { option_id: pollOptionId }
  }), 409, 'vote on closed poll');
});

test('administrator can manage service categories and city services', async () => {
  categorySlug = `smoke-parks-${Date.now().toString().slice(-5)}`;
  const category = expect(await api('/service-categories', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Smoke Test Parks',
      slug: categorySlug,
      description: 'Temporary category created by the smoke suite.',
      icon: 'pin',
      sort_order: 99
    }
  }), 201, 'create category');
  assert.ok(category.data.id);

  const created = expect(await api('/services', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Smoke Test Community Garden',
      category: categorySlug,
      description: 'A test service record used only by the automated smoke suite.',
      address: '1 Test Garden Way',
      area: 'Smoke Ward',
      phone: '+1 555 0111',
      opening_hours: 'Mon-Fri, 9:00-17:00',
      latitude: 12.9716,
      longitude: 77.5946
    }
  }), 201, 'create service');
  serviceId = created.data.id;

  const publicList = ok(await api(`/services?q=${encodeURIComponent('Smoke Test Community Garden')}`), 'public service list');
  assert.ok(publicList.services.some(service => service.id === serviceId));

  const detail = ok(await api(`/services/${serviceId}`), 'service detail');
  assert.equal(detail.service.category, categorySlug);

  expect(await api(`/services/${serviceId}`, {
    method: 'PUT',
    token: adminToken,
    body: {
      name: 'Smoke Test Community Garden',
      category: categorySlug,
      address: '2 Test Garden Way',
      area: 'Smoke Ward',
      description: 'Updated by the smoke suite.',
      latitude: 12.9716,
      longitude: 77.5946,
      is_active: true
    }
  }), 200, 'update service');

  expect(await api('/services', {
    method: 'POST',
    token: adminToken,
    body: { name: 'Broken category service', category: 'does-not-exist', address: 'Nowhere' }
  }), 422, 'invalid service category');

  const adminList = ok(await api('/services?include_inactive=1&category=' + encodeURIComponent(categorySlug), { token: adminToken }), 'admin service list');
  assert.ok(adminList.services.some(service => service.id === serviceId));

  expect(await api(`/services/${serviceId}`, { method: 'DELETE', token: adminToken }), 200, 'deactivate service');

  const hidden = ok(await api('/services?q=' + encodeURIComponent('Smoke Test Community Garden')), 'hidden service list');
  assert.ok(!hidden.services.some(service => service.id === serviceId));

  expect(await api(`/service-categories/${category.data.id}`, {
    method: 'DELETE',
    token: adminToken
  }), 409, 'category with services cannot be deleted');
});

test('administrator dashboard, analytics, activity and CSV export work', async () => {
  const dashboard = ok(await api('/admin/dashboard', { token: adminToken }), 'admin dashboard');
  assert.ok(dashboard.issues.total >= 1);
  assert.ok(Array.isArray(dashboard.trend) && dashboard.trend.length === 6);
  assert.ok(Array.isArray(dashboard.recent_complaints));

  const analytics = ok(await api('/admin/analytics?days=30', { token: adminToken }), 'analytics');
  assert.equal(analytics.range_days, 30);
  assert.ok(analytics.summary.total >= 1);
  assert.ok(Array.isArray(analytics.trend));
  assert.ok(Array.isArray(analytics.officers));

  const activity = ok(await api('/admin/activity-logs?limit=10', { token: adminToken }), 'activity log');
  assert.ok(activity.logs.length >= 1);
  assert.ok(Array.isArray(activity.entity_types));

  const csv = await api('/admin/reports/complaints.csv', { token: adminToken });
  assert.equal(csv.status, 200, 'CSV export should succeed');
  assert.match(csv.headers.get('content-type') || '', /text\/csv/);
  assert.ok(csv.text.includes('Tracking ID'));
  assert.ok(csv.text.includes(trackingCode));
});

test('administrator can update public settings with validation', async () => {
  const current = ok(await api('/admin/settings', { token: adminToken }), 'read settings');
  assert.ok(current.settings && Object.prototype.hasOwnProperty.call(current.settings, 'platform_name'));
  assert.equal(typeof current.maps_enabled, 'boolean');

  const updated = expect(await api('/admin/settings', {
    method: 'PUT',
    token: adminToken,
    body: {
      platform_name: 'CivicFlow Smoke',
      city_name: 'Test City',
      tagline: 'Services for testing.',
      support_email: 'support@civicflow.test',
      support_phone: '+1 555 0100',
      office_address: '1 Test Plaza'
    }
  }), 200, 'update settings');
  assert.equal(updated.success, true);

  const refreshed = ok(await api('/admin/settings', { token: adminToken }), 'settings after update');
  assert.equal(refreshed.settings.platform_name, 'CivicFlow Smoke');

  expect(await api('/admin/settings', {
    method: 'PUT',
    token: adminToken,
    body: { support_email: 'not-an-email' }
  }), 422, 'invalid support email');
});

test('user administration protects the last active administrator', async () => {
  const self = await api(`/admin/users/${adminId}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { is_active: false }
  });
  expect(self, 422, 'administrator cannot deactivate self');

  const directory = ok(await api('/admin/users?limit=50', { token: adminToken }), 'user directory');
  const citizen = directory.users.find(user => user.email === 'smoke.third@civicflow.test');
  assert.ok(citizen, 'third citizen should be listed');

  expect(await api(`/admin/users/${citizen.id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { is_active: false }
  }), 200, 'deactivate citizen');

  expect(await api('/auth/login', {
    method: 'POST',
    body: { email: 'smoke.third@civicflow.test', password: CITIZEN_PASSWORD }
  }), 403, 'deactivated login');

  expect(await api(`/admin/users/${citizen.id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { is_active: true }
  }), 200, 'reactivate citizen');
});

test('unknown API routes return a JSON 404', async () => {
  const response = await api('/definitely-not-a-route');
  assert.equal(response.status, 404);
  assert.equal(response.body.success, false);
});

/* ---------------------------------------------------------------- Runner */

async function main() {
  console.log('Preparing disposable test database…');
  await setupDatabase();

  const app = require('../src/server');
  db = require('../src/config/db');

  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', resolve);
    server.on('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  let passed = 0;
  let failed = 0;
  for (const item of tests) {
    try {
      await item.fn();
      passed += 1;
      console.log(`  ✓ ${item.name}`);
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${item.name}`);
      console.error(`    ${error && error.stack ? error.stack.split('\n').slice(0, 4).join('\n    ') : error}`);
    }
  }

  if (server) await new Promise(resolve => server.close(resolve));
  if (db) await db.end().catch(() => {});
  await teardownDatabase();

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch(async error => {
  console.error('\nSmoke suite crashed:', error);
  try { if (server) await new Promise(resolve => server.close(resolve)); } catch { /* ignore */ }
  try { if (db) await db.end(); } catch { /* ignore */ }
  try { await teardownDatabase(); } catch { /* ignore */ }
  process.exitCode = 1;
});
