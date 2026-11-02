const db = require('../config/db');
const { ApiError, ok, asyncHandler } = require('../utils/http');
const { Validator } = require('../utils/validation');
const { logActivity } = require('../utils/audit');

function isAdmin(req) {
  return req.user?.role === 'admin';
}

const list = asyncHandler(async (req, res) => {
  const includeInactive = String(req.query.all) === '1' && isAdmin(req);
  const [rows] = await db.query(
    `SELECT c.id, c.slug, c.name, c.description, c.icon, c.sort_order, c.is_active,
            COUNT(s.id) AS service_count
     FROM service_categories c
     LEFT JOIN city_services s ON s.category = c.slug AND s.is_active = 1
     ${includeInactive ? '' : 'WHERE c.is_active = 1'}
     GROUP BY c.id, c.slug, c.name, c.description, c.icon, c.sort_order, c.is_active
     ORDER BY c.sort_order ASC, c.name ASC`
  );
  return ok(res, {
    categories: rows.map(row => ({
      ...row,
      is_active: Boolean(row.is_active),
      service_count: Number(row.service_count)
    }))
  });
});

const create = asyncHandler(async (req, res) => {
  const v = new Validator();
  const slug = v.string('slug', req.body.slug, { label: 'Category slug', required: true, min: 2, max: 60 });
  v.string('name', req.body.name, { label: 'Category name', required: true, min: 2, max: 120 });
  const description = v.string('description', req.body.description, { label: 'Description', max: 255 });
  const icon = v.string('icon', req.body.icon, { label: 'Icon', max: 40 }) || 'pin';
  const values = v.done();

  if (!/^[a-z][a-z0-9_-]*$/.test(slug || '')) {
    throw new ApiError(422, 'Slug may contain lowercase letters, numbers, hyphens and underscores only.', {
      slug: 'Use lowercase letters, numbers, hyphens or underscores.'
    });
  }

  const [existing] = await db.execute('SELECT id FROM service_categories WHERE slug = ?', [slug]);
  if (existing.length) throw new ApiError(409, 'A service category with that slug already exists.', { slug: 'This slug is already in use.' });

  const sortOrder = Number.parseInt(req.body.sort_order, 10);
  const [result] = await db.execute(
    `INSERT INTO service_categories (slug, name, description, icon, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [slug, values.name, description, icon, Number.isFinite(sortOrder) ? sortOrder : 0, req.body.is_active === false || req.body.is_active === '0' ? 0 : 1]
  );
  await logActivity({
    userId: req.user.id,
    action: 'service_category.created',
    entityType: 'service_category',
    entityId: result.insertId,
    details: { slug, name: values.name },
    req
  });
  return ok(res, { id: result.insertId }, 'Service category created.', 201);
});

const update = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'Invalid category.');
  const [existing] = await db.execute('SELECT * FROM service_categories WHERE id = ?', [id]);
  if (!existing.length) throw new ApiError(404, 'Service category not found.');

  const v = new Validator();
  v.string('name', req.body.name, { label: 'Category name', required: true, min: 2, max: 120 });
  const description = v.string('description', req.body.description, { label: 'Description', max: 255 });
  const icon = v.string('icon', req.body.icon, { label: 'Icon', max: 40 }) || 'pin';
  const values = v.done();

  const sortOrder = Number.parseInt(req.body.sort_order, 10);
  const active = req.body.is_active === false || req.body.is_active === '0' || req.body.is_active === 0 ? 0 : 1;

  await db.execute(
    `UPDATE service_categories
     SET name = ?, description = ?, icon = ?, sort_order = ?, is_active = ?
     WHERE id = ?`,
    [values.name, description, icon, Number.isFinite(sortOrder) ? sortOrder : 0, active, id]
  );
  await logActivity({
    userId: req.user.id,
    action: 'service_category.updated',
    entityType: 'service_category',
    entityId: id,
    details: { name: values.name, is_active: Boolean(active) },
    req
  });
  return ok(res, {}, 'Service category updated.');
});

const remove = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'Invalid category.');
  const [rows] = await db.execute(
    `SELECT c.id, c.slug, c.name, COUNT(s.id) AS service_count
     FROM service_categories c
     LEFT JOIN city_services s ON s.category = c.slug
     WHERE c.id = ? GROUP BY c.id, c.slug, c.name`,
    [id]
  );
  if (!rows.length) throw new ApiError(404, 'Service category not found.');
  if (Number(rows[0].service_count) > 0) {
    throw new ApiError(409, 'This category is used by existing services. Deactivate it instead of deleting it.');
  }
  await db.execute('DELETE FROM service_categories WHERE id = ?', [id]);
  await logActivity({
    userId: req.user.id,
    action: 'service_category.deleted',
    entityType: 'service_category',
    entityId: id,
    details: { name: rows[0].name, slug: rows[0].slug },
    req
  });
  return ok(res, {}, 'Service category deleted.');
});

module.exports = { list, create, update, remove };
