const db = require('../config/db');
const { ApiError, ok, asyncHandler } = require('../utils/http');
const { Validator, parsePagination } = require('../utils/validation');
const { logActivity } = require('../utils/audit');

const SERVICE_FIELDS = `s.id, s.name, s.category, c.name AS category_name, c.icon AS category_icon,
  s.description, s.address, s.area, s.phone, s.opening_hours, s.latitude, s.longitude,
  s.is_active, s.created_at, s.updated_at`;

function distanceExpression() {
  return `ROUND(6371 * ACOS(GREATEST(-1, LEAST(1,
    COS(RADIANS(?)) * COS(RADIANS(s.latitude)) * COS(RADIANS(s.longitude) - RADIANS(?)) +
    SIN(RADIANS(?)) * SIN(RADIANS(s.latitude))
  ))), 1)`;
}

const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 12, maxLimit: 60 });
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '').trim();
  const area = String(req.query.area || '').trim();
  const sort = String(req.query.sort || '').trim();
  const includeInactive = String(req.query.include_inactive) === '1' && req.user?.role === 'admin';

  const lat = req.query.lat === undefined || req.query.lat === '' ? null : Number(req.query.lat);
  const lng = req.query.lng === undefined || req.query.lng === '' ? null : Number(req.query.lng);
  const radius = req.query.radius === undefined || req.query.radius === '' ? null : Number(req.query.radius);
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng);

  const where = [];
  const whereParams = [];
  if (!includeInactive) {
    where.push('s.is_active = 1', 'c.is_active = 1');
  }
  if (q) {
    const like = `%${q}%`;
    where.push('(s.name LIKE ? OR s.description LIKE ? OR s.address LIKE ? OR s.area LIKE ?)');
    whereParams.push(like, like, like, like);
  }
  if (category) {
    where.push('s.category = ?');
    whereParams.push(category);
  }
  if (area) {
    where.push('s.area = ?');
    whereParams.push(area);
  }

  const selectParams = [];
  let distanceSelect = 'NULL AS distance_km';
  if (hasGeo) {
    distanceSelect = `${distanceExpression()} AS distance_km`;
    selectParams.push(lat, lng, lat);
    where.push('s.latitude IS NOT NULL AND s.longitude IS NOT NULL');
  }

  const inner = `SELECT ${SERVICE_FIELDS}, ${distanceSelect}
    FROM city_services s
    JOIN service_categories c ON c.slug = s.category
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;

  let listSql = `SELECT * FROM (${inner}) t`;
  let countSql = `SELECT COUNT(*) AS total FROM (${inner}) t`;
  const listParams = [...selectParams, ...whereParams];
  const countParams = [...selectParams, ...whereParams];

  if (hasGeo && Number.isFinite(radius) && radius > 0) {
    listSql += ' WHERE t.distance_km <= ?';
    countSql += ' WHERE t.distance_km <= ?';
    listParams.push(radius);
    countParams.push(radius);
  }

  const order = sort === 'newest'
    ? 't.created_at DESC'
    : hasGeo && (sort === 'distance' || sort === 'nearby' || !sort)
      ? 't.distance_km ASC'
      : 't.name ASC';
  listSql += ` ORDER BY ${order} LIMIT ? OFFSET ?`;
  listParams.push(limit, offset);

  const [[rows], [countRows]] = await Promise.all([
    db.execute(listSql, listParams),
    db.execute(countSql, countParams)
  ]);
  const total = Number(countRows[0].total);
  return ok(res, {
    services: rows.map(row => ({ ...row, is_active: Boolean(row.is_active) })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  });
});

const meta = asyncHandler(async (_req, res) => {
  const [areas] = await db.query(
    `SELECT area, COUNT(*) AS service_count
     FROM city_services
     WHERE is_active = 1 AND area IS NOT NULL AND area <> ''
     GROUP BY area ORDER BY area ASC`
  );
  const [categories] = await db.query(
    `SELECT c.slug, c.name, c.icon, COUNT(s.id) AS service_count
     FROM service_categories c
     LEFT JOIN city_services s ON s.category = c.slug AND s.is_active = 1
     WHERE c.is_active = 1
     GROUP BY c.slug, c.name, c.icon
     ORDER BY c.sort_order ASC, c.name ASC`
  );
  return ok(res, {
    areas: areas.map(row => ({ ...row, service_count: Number(row.service_count) })),
    categories: categories.map(row => ({ ...row, service_count: Number(row.service_count) }))
  });
});

const getById = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'Invalid service.');
  const [rows] = await db.execute(
    `SELECT ${SERVICE_FIELDS}
     FROM city_services s
     JOIN service_categories c ON c.slug = s.category
     WHERE s.id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length) throw new ApiError(404, 'Service not found.');
  const service = rows[0];
  if (!service.is_active && req.user?.role !== 'admin') throw new ApiError(404, 'Service not found.');

  const [related] = await db.execute(
    `SELECT s.id, s.name, s.address, s.area, s.phone
     FROM city_services s
     WHERE s.category = ? AND s.id <> ? AND s.is_active = 1
     ORDER BY s.name ASC LIMIT 4`,
    [service.category, id]
  );
  return ok(res, { service: { ...service, is_active: Boolean(service.is_active) }, related });
});

function validateServicePayload(body) {
  const v = new Validator();
  v.string('name', body.name, { label: 'Service name', required: true, min: 2, max: 150 });
  v.string('category', body.category, { label: 'Category', required: true, max: 60 });
  const description = v.string('description', body.description, { label: 'Description', max: 4000 });
  v.string('address', body.address, { label: 'Address', required: true, max: 255 });
  const area = v.string('area', body.area, { label: 'Area', max: 120 });
  const phone = v.string('phone', body.phone, { label: 'Phone number', max: 40 });
  const openingHours = v.string('opening_hours', body.opening_hours, { label: 'Opening hours', max: 120 });
  v.coordinates(body.latitude, body.longitude);
  const values = v.done();
  return { ...values, description, area, phone, openingHours };
}

async function assertCategory(category) {
  const [rows] = await db.execute('SELECT slug, is_active FROM service_categories WHERE slug = ? LIMIT 1', [category]);
  if (!rows.length) {
    throw new ApiError(422, 'Select a valid service category.', { category: 'Select a valid category.' });
  }
  if (!rows[0].is_active) {
    throw new ApiError(422, 'That service category is currently inactive.', { category: 'Choose an active category.' });
  }
}

const create = asyncHandler(async (req, res) => {
  const values = validateServicePayload(req.body);
  await assertCategory(values.category);
  const [result] = await db.execute(
    `INSERT INTO city_services
      (name, category, description, address, area, phone, opening_hours, latitude, longitude, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [values.name, values.category, values.description, values.address, values.area, values.phone, values.openingHours, values.latitude, values.longitude]
  );
  await logActivity({
    userId: req.user.id,
    action: 'service.created',
    entityType: 'service',
    entityId: result.insertId,
    details: { name: values.name, category: values.category },
    req
  });
  return ok(res, { id: result.insertId }, 'City service created.', 201);
});

const update = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'Invalid service.');
  const [existing] = await db.execute('SELECT id FROM city_services WHERE id = ?', [id]);
  if (!existing.length) throw new ApiError(404, 'Service not found.');

  const values = validateServicePayload(req.body);
  await assertCategory(values.category);
  const active = req.body.is_active === false || req.body.is_active === '0' || req.body.is_active === 0 ? 0 : 1;

  await db.execute(
    `UPDATE city_services SET
      name = ?, category = ?, description = ?, address = ?, area = ?, phone = ?,
      opening_hours = ?, latitude = ?, longitude = ?, is_active = ?
     WHERE id = ?`,
    [values.name, values.category, values.description, values.address, values.area, values.phone, values.openingHours, values.latitude, values.longitude, active, id]
  );
  await logActivity({
    userId: req.user.id,
    action: 'service.updated',
    entityType: 'service',
    entityId: id,
    details: { name: values.name, is_active: Boolean(active) },
    req
  });
  return ok(res, {}, 'City service updated.');
});

const remove = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'Invalid service.');
  const [rows] = await db.execute('SELECT id, name FROM city_services WHERE id = ?', [id]);
  if (!rows.length) throw new ApiError(404, 'Service not found.');
  await db.execute('UPDATE city_services SET is_active = 0 WHERE id = ?', [id]);
  await logActivity({
    userId: req.user.id,
    action: 'service.deactivated',
    entityType: 'service',
    entityId: id,
    details: { name: rows[0].name },
    req
  });
  return ok(res, {}, 'City service deactivated. Existing records are preserved.');
});

module.exports = { list, meta, getById, create, update, remove };
