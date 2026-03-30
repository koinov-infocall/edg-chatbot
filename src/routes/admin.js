const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// Admin role check middleware
function requireAdmin(req, res, next) {
  if (!['director', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Нямате права за достъп' });
  }
  next();
}

router.use(requireAdmin);

// GET /api/admin/qa - List Q&A pairs (filterable by role/category, paginated)
router.get('/qa', async (req, res) => {
  try {
    const { role, category, active } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];

    if (role) {
      params.push(role);
      where += ` AND $${params.length} = ANY(roles)`;
    }
    if (category) {
      params.push(category);
      where += ` AND category = $${params.length}`;
    }
    if (active !== undefined) {
      params.push(active === 'true');
      where += ` AND is_active = $${params.length}`;
    }

    const countResult = await pool.query(`SELECT COUNT(*) FROM qa_pairs ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(limit);
    params.push(offset);
    const { rows } = await pool.query(
      `SELECT * FROM qa_pairs ${where} ORDER BY id ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ qa_pairs: rows, total, page, limit });
  } catch (err) {
    console.error('List QA error:', err);
    res.status(500).json({ error: 'Грешка при зареждане на въпросите' });
  }
});

// POST /api/admin/qa - Create Q&A pair
router.post('/qa', async (req, res) => {
  try {
    const { question, answer, roles, category } = req.body;

    if (!question || !answer || !roles || !Array.isArray(roles)) {
      return res.status(400).json({ error: 'Полетата question, answer и roles са задължителни' });
    }

    const { rows } = await pool.query(
      `INSERT INTO qa_pairs (question, answer, roles, category)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [question, answer, roles, category || null]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create QA error:', err);
    res.status(500).json({ error: 'Грешка при създаване' });
  }
});

// PUT /api/admin/qa/:id - Update Q&A pair
router.put('/qa/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, roles, category, is_active } = req.body;

    const { rows } = await pool.query(
      `UPDATE qa_pairs SET
        question = COALESCE($1, question),
        answer = COALESCE($2, answer),
        roles = COALESCE($3, roles),
        category = COALESCE($4, category),
        is_active = COALESCE($5, is_active),
        updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [question, answer, roles, category, is_active, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Въпросът не е намерен' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Update QA error:', err);
    res.status(500).json({ error: 'Грешка при обновяване' });
  }
});

// DELETE /api/admin/qa/:id - Delete Q&A pair
router.delete('/qa/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM qa_pairs WHERE id = $1', [id]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Въпросът не е намерен' });
    }

    res.json({ message: 'Изтрито успешно' });
  } catch (err) {
    console.error('Delete QA error:', err);
    res.status(500).json({ error: 'Грешка при изтриване' });
  }
});

// GET /api/admin/logs - Unmatched questions log (paginated)
router.get('/logs', async (req, res) => {
  try {
    const { resolved } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let where = '';
    const params = [];

    if (resolved !== undefined) {
      params.push(resolved === 'true');
      where = ' WHERE is_resolved = $1';
    }

    const countResult = await pool.query(`SELECT COUNT(*) FROM unmatched_questions${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(limit);
    params.push(offset);
    const { rows } = await pool.query(
      `SELECT * FROM unmatched_questions${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ logs: rows, total, page, limit });
  } catch (err) {
    console.error('Logs error:', err);
    res.status(500).json({ error: 'Грешка при зареждане на логовете' });
  }
});

// POST /api/admin/logs/:id/resolve - Mark log as resolved
router.post('/logs/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `UPDATE unmatched_questions
       SET is_resolved = true, resolved_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Записът не е намерен' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Resolve error:', err);
    res.status(500).json({ error: 'Грешка при маркиране' });
  }
});

// GET /api/admin/sessions - List chat sessions (paginated, filterable)
router.get('/sessions', async (req, res) => {
  try {
    const { role, institution, date_from, date_to } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];

    if (role) {
      params.push(role);
      where += ` AND s.role = $${params.length}`;
    }
    if (institution) {
      params.push('%' + institution + '%');
      where += ` AND s.institution_name ILIKE $${params.length}`;
    }
    if (date_from) {
      params.push(date_from);
      where += ` AND s.created_at >= $${params.length}::date`;
    }
    if (date_to) {
      params.push(date_to);
      where += ` AND s.created_at < ($${params.length}::date + interval '1 day')`;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM chat_sessions s ${where}`, params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(limit);
    params.push(offset);
    const { rows } = await pool.query(
      `SELECT s.*, COUNT(m.id) as message_count
       FROM chat_sessions s
       LEFT JOIN chat_messages m ON m.session_id = s.id
       ${where}
       GROUP BY s.id
       ORDER BY s.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ sessions: rows, total, page, limit });
  } catch (err) {
    console.error('Sessions error:', err);
    res.status(500).json({ error: 'Грешка при зареждане на сесиите' });
  }
});

// GET /api/admin/sessions/:id/messages - Get session messages with matched Q&A info
router.get('/sessions/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT m.id, m.role, m.content, m.matched_qa_id, m.created_at,
              q.question as matched_question, q.answer as matched_answer
       FROM chat_messages m
       LEFT JOIN qa_pairs q ON q.id = m.matched_qa_id
       WHERE m.session_id = $1
       ORDER BY m.created_at ASC`,
      [id]
    );
    res.json({ messages: rows });
  } catch (err) {
    console.error('Session messages error:', err);
    res.status(500).json({ error: 'Грешка при зареждане на съобщенията' });
  }
});

// GET /api/admin/stats - Usage statistics
router.get('/stats', async (req, res) => {
  try {
    const [sessions, messages, unmatched, qaPairs] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM chat_sessions'),
      pool.query('SELECT COUNT(*) as count FROM chat_messages'),
      pool.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_resolved = false) as pending FROM unmatched_questions'),
      pool.query('SELECT COUNT(*) as count FROM qa_pairs WHERE is_active = true'),
    ]);

    res.json({
      total_sessions: parseInt(sessions.rows[0].count),
      total_messages: parseInt(messages.rows[0].count),
      unmatched_total: parseInt(unmatched.rows[0].total),
      unmatched_pending: parseInt(unmatched.rows[0].pending),
      active_qa_pairs: parseInt(qaPairs.rows[0].count),
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Грешка при зареждане на статистиките' });
  }
});

module.exports = router;
