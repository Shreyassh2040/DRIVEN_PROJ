const db = require('../config/db');
const { ApiError, ok, asyncHandler } = require('../utils/http');
const { Validator } = require('../utils/validation');
const { logActivity } = require('../utils/audit');

function deriveStatus(poll) {
  const now = new Date();
  if (!poll.is_active) return 'closed';
  if (poll.starts_at && new Date(poll.starts_at) > now) return 'scheduled';
  if (poll.ends_at && new Date(poll.ends_at) < now) return 'closed';
  return 'active';
}

async function loadPolls({ includeInactive, userId, statusFilter }) {
  const where = [];
  const params = [];
  if (!includeInactive) where.push('p.is_active = 1');
  const [polls] = await db.execute(
    `SELECT p.id, p.title, p.description, p.created_by, p.starts_at, p.ends_at,
            p.is_active, p.created_at, p.updated_at, u.full_name AS creator_name
     FROM polls p
     LEFT JOIN users u ON u.id = p.created_by
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY p.created_at DESC`,
    params
  );
  if (!polls.length) return [];

  const ids = polls.map(p => p.id);
  const placeholders = ids.map(() => '?').join(',');
  const [optionRows] = await db.execute(
    `SELECT o.id, o.poll_id, o.option_text, COUNT(v.id) AS votes
     FROM poll_options o
     LEFT JOIN poll_votes v ON v.option_id = o.id
     WHERE o.poll_id IN (${placeholders})
     GROUP BY o.id, o.poll_id, o.option_text
     ORDER BY o.id ASC`,
    ids
  );

  let userVotes = new Map();
  if (userId) {
    const [voteRows] = await db.execute(
      `SELECT poll_id, option_id FROM poll_votes WHERE user_id = ? AND poll_id IN (${placeholders})`,
      [userId, ...ids]
    );
    userVotes = new Map(voteRows.map(row => [row.poll_id, row.option_id]));
  }

  const result = polls.map(poll => {
    const options = optionRows
      .filter(option => option.poll_id === poll.id)
      .map(option => ({ id: option.id, text: option.option_text, votes: Number(option.votes) }));
    const totalVotes = options.reduce((sum, option) => sum + option.votes, 0);
    const withPercentages = options.map(option => ({
      ...option,
      percentage: totalVotes ? Math.round((option.votes / totalVotes) * 1000) / 10 : 0
    }));
    return {
      id: poll.id,
      title: poll.title,
      description: poll.description,
      created_by: poll.created_by,
      creator_name: poll.creator_name,
      starts_at: poll.starts_at,
      ends_at: poll.ends_at,
      is_active: Boolean(poll.is_active),
      status: deriveStatus(poll),
      created_at: poll.created_at,
      updated_at: poll.updated_at,
      options: withPercentages,
      total_votes: totalVotes,
      user_vote: userVotes.get(poll.id) || null
    };
  });

  if (!statusFilter || statusFilter === 'all') return result;
  return result.filter(poll => poll.status === statusFilter);
}

const list = asyncHandler(async (req, res) => {
  const includeInactive = String(req.query.all) === '1' && req.user?.role === 'admin';
  const statusFilter = ['active', 'closed', 'scheduled'].includes(String(req.query.status)) ? String(req.query.status) : 'all';
  const polls = await loadPolls({ includeInactive, userId: req.user?.id, statusFilter });
  return ok(res, { polls });
});

const getById = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'Invalid poll.');
  const polls = await loadPolls({ includeInactive: true, userId: req.user?.id, statusFilter: 'all' });
  const poll = polls.find(item => item.id === id);
  if (!poll) throw new ApiError(404, 'Poll not found.');
  if (!poll.is_active && req.user?.role !== 'admin') throw new ApiError(404, 'Poll not found.');
  return ok(res, { poll });
});

function parseOptions(raw) {
  let options = raw;
  if (typeof options === 'string') {
    try { options = JSON.parse(options); } catch { options = null; }
  }
  if (!Array.isArray(options)) {
    throw new ApiError(422, 'Add at least two voting options.', { options: 'Add at least two voting options.' });
  }
  const cleaned = options
    .map(option => String(typeof option === 'string' ? option : option?.text ?? '').trim())
    .filter(Boolean);
  if (cleaned.length < 2) {
    throw new ApiError(422, 'Add at least two voting options.', { options: 'Add at least two voting options.' });
  }
  if (cleaned.length > 8) {
    throw new ApiError(422, 'A poll can have at most 8 options.', { options: 'Use 8 options or fewer.' });
  }
  if (new Set(cleaned.map(value => value.toLowerCase())).size !== cleaned.length) {
    throw new ApiError(422, 'Poll options must be unique.', { options: 'Remove duplicate options.' });
  }
  if (cleaned.some(value => value.length > 180)) {
    throw new ApiError(422, 'Each option must be 180 characters or fewer.', { options: 'Shorten the options.' });
  }
  return cleaned;
}

const create = asyncHandler(async (req, res) => {
  const v = new Validator();
  v.string('title', req.body.title, { label: 'Poll title', required: true, min: 5, max: 180 });
  const description = v.string('description', req.body.description, { label: 'Description', max: 2000 });
  const startsAt = v.date('starts_at', req.body.starts_at, { label: 'Start date' });
  const endsAt = v.date('ends_at', req.body.ends_at, { label: 'End date' });
  const values = v.done();
  const options = parseOptions(req.body.options);

  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new ApiError(422, 'The end date must be after the start date.', { ends_at: 'End date must be after the start date.' });
  }
  const publish = req.body.is_active !== false && req.body.is_active !== '0' && req.body.is_active !== 0;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `INSERT INTO polls (title, description, created_by, starts_at, ends_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [values.title, description, req.user.id, startsAt, endsAt, publish ? 1 : 0]
    );
    const pollId = result.insertId;
    for (const option of options) {
      await connection.execute('INSERT INTO poll_options (poll_id, option_text) VALUES (?, ?)', [pollId, option]);
    }
    if (publish) {
      await connection.execute(
        `INSERT INTO notifications (user_id, title, message, notification_type)
         SELECT id, 'New community poll', ?, 'poll_published'
         FROM users WHERE role = 'citizen' AND is_active = 1`,
        [`${values.title} is now open for voting. Share your priorities for the city.`]
      );
    }
    await logActivity({
      userId: req.user.id,
      action: publish ? 'poll.published' : 'poll.created',
      entityType: 'poll',
      entityId: pollId,
      details: { title: values.title, options: options.length },
      req,
      connection
    });
    await connection.commit();
    return ok(res, { id: pollId }, publish ? 'Poll published.' : 'Poll saved as inactive.', 201);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

const update = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'Invalid poll.');
  const [existingRows] = await db.execute('SELECT * FROM polls WHERE id = ? LIMIT 1', [id]);
  if (!existingRows.length) throw new ApiError(404, 'Poll not found.');

  const v = new Validator();
  v.string('title', req.body.title, { label: 'Poll title', required: true, min: 5, max: 180 });
  const description = v.string('description', req.body.description, { label: 'Description', max: 2000 });
  const startsAt = v.date('starts_at', req.body.starts_at, { label: 'Start date' });
  const endsAt = v.date('ends_at', req.body.ends_at, { label: 'End date' });
  const values = v.done();
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new ApiError(422, 'The end date must be after the start date.', { ends_at: 'End date must be after the start date.' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [voteRows] = await connection.execute('SELECT COUNT(*) AS count FROM poll_votes WHERE poll_id = ?', [id]);
    const hasVotes = Number(voteRows[0].count) > 0;
    let options = null;
    if (req.body.options !== undefined) {
      options = parseOptions(req.body.options);
      if (hasVotes) {
        throw new ApiError(409, 'Voting options cannot be changed after votes have been cast. You can still update the title, description and dates.');
      }
    }

    const active = req.body.is_active === false || req.body.is_active === '0' || req.body.is_active === 0 ? 0 : 1;
    await connection.execute(
      `UPDATE polls SET title = ?, description = ?, starts_at = ?, ends_at = ?, is_active = ?, updated_at = NOW() WHERE id = ?`,
      [values.title, description, startsAt, endsAt, active, id]
    );
    if (options) {
      await connection.execute('DELETE FROM poll_options WHERE poll_id = ?', [id]);
      for (const option of options) {
        await connection.execute('INSERT INTO poll_options (poll_id, option_text) VALUES (?, ?)', [id, option]);
      }
    }
    await logActivity({
      userId: req.user.id,
      action: 'poll.updated',
      entityType: 'poll',
      entityId: id,
      details: { title: values.title, is_active: Boolean(active) },
      req,
      connection
    });
    await connection.commit();
    return ok(res, {}, 'Poll updated.');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

const close = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'Invalid poll.');
  const [rows] = await db.execute('SELECT id, title, is_active FROM polls WHERE id = ?', [id]);
  if (!rows.length) throw new ApiError(404, 'Poll not found.');
  if (!rows[0].is_active) throw new ApiError(422, 'This poll is already closed.');
  await db.execute('UPDATE polls SET is_active = 0, ends_at = NOW(), updated_at = NOW() WHERE id = ?', [id]);
  await logActivity({
    userId: req.user.id,
    action: 'poll.closed',
    entityType: 'poll',
    entityId: id,
    details: { title: rows[0].title },
    req
  });
  return ok(res, {}, 'Poll closed. Results remain available.');
});

const remove = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'Invalid poll.');
  const [rows] = await db.execute('SELECT id, title FROM polls WHERE id = ?', [id]);
  if (!rows.length) throw new ApiError(404, 'Poll not found.');
  const [voteRows] = await db.execute('SELECT COUNT(*) AS count FROM poll_votes WHERE poll_id = ?', [id]);
  if (Number(voteRows[0].count) > 0) {
    throw new ApiError(409, 'This poll has recorded votes and cannot be deleted. Close it instead.');
  }
  await db.execute('DELETE FROM polls WHERE id = ?', [id]);
  await logActivity({
    userId: req.user.id,
    action: 'poll.deleted',
    entityType: 'poll',
    entityId: id,
    details: { title: rows[0].title },
    req
  });
  return ok(res, {}, 'Poll deleted.');
});

const vote = asyncHandler(async (req, res) => {
  const v = new Validator();
  v.id('option_id', req.body.option_id, { label: 'Vote option' });
  const values = v.done();

  const [rows] = await db.execute(
    `SELECT o.id, o.poll_id, p.title, p.is_active, p.starts_at, p.ends_at
     FROM poll_options o JOIN polls p ON p.id = o.poll_id
     WHERE o.id = ? LIMIT 1`,
    [values.option_id]
  );
  if (!rows.length) throw new ApiError(404, 'Poll option not found.');
  const option = rows[0];
  const status = deriveStatus(option);
  if (status !== 'active') {
    throw new ApiError(409, status === 'scheduled' ? 'This poll has not started yet.' : 'This poll is closed.');
  }

  try {
    await db.execute(
      `INSERT INTO poll_votes (poll_id, option_id, user_id) VALUES (?, ?, ?)`,
      [option.poll_id, option.id, req.user.id]
    );
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'You have already voted in this poll.');
    throw error;
  }

  await logActivity({
    userId: req.user.id,
    action: 'poll.voted',
    entityType: 'poll',
    entityId: option.poll_id,
    details: { poll_title: option.title, option_id: option.id },
    req
  });

  const polls = await loadPolls({ includeInactive: true, userId: req.user.id, statusFilter: 'all' });
  const poll = polls.find(item => item.id === option.poll_id);
  return ok(res, { poll }, 'Your vote has been recorded.', 201);
});

module.exports = { list, getById, create, update, close, remove, vote };
