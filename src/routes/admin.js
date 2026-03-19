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

// GET /api/admin/qa - List Q&A pairs (filterable by role/category)
router.get('/qa', async (req, res) => {
  try {
    const { role, category, active } = req.query;
    let query = 'SELECT * FROM qa_pairs WHERE 1=1';
    const params = [];

    if (role) {
      params.push(role);
      query += ` AND $${params.length} = ANY(roles)`;
    }
    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }
    if (active !== undefined) {
      params.push(active === 'true');
      query += ` AND is_active = $${params.length}`;
    }

    query += ' ORDER BY id ASC';
    const { rows } = await pool.query(query, params);
    res.json({ qa_pairs: rows });
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

// GET /api/admin/logs - Unmatched questions log
router.get('/logs', async (req, res) => {
  try {
    const { resolved } = req.query;
    let query = 'SELECT * FROM unmatched_questions';
    const params = [];

    if (resolved !== undefined) {
      params.push(resolved === 'true');
      query += ' WHERE is_resolved = $1';
    }

    query += ' ORDER BY created_at DESC LIMIT 100';
    const { rows } = await pool.query(query, params);
    res.json({ logs: rows });
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
