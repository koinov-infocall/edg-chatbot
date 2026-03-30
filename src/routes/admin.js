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

// GET /api/admin/logs/export - Export unmatched questions as CSV
router.get('/logs/export', async (req, res) => {
  try {
    const { resolved } = req.query;
    let where = '';
    const params = [];

    if (resolved !== undefined) {
      params.push(resolved === 'true');
      where = ' WHERE is_resolved = $1';
    }

    const { rows } = await pool.query(
      `SELECT id, question, user_role, institution_id, is_resolved, created_at
       FROM unmatched_questions${where}
       ORDER BY created_at DESC`,
      params
    );

    // Build CSV with BOM for Excel UTF-8 support
    const header = 'question\tanswer\troles\tcategory';
    const csvRows = rows.map(r => {
      const q = r.question.replace(/\t/g, ' ').replace(/\n/g, ' ');
      return `${q}\t\t${r.user_role}\t`;
    });
    const csv = '\uFEFF' + header + '\n' + csvRows.join('\n');

    res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="unmatched_questions.tsv"');
    res.send(csv);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Грешка при експорт' });
  }
});

// POST /api/admin/qa/import - Bulk import Q&A pairs from TSV
router.post('/qa/import', async (req, res) => {
  try {
    const { pairs } = req.body;

    if (!pairs || !Array.isArray(pairs) || pairs.length === 0) {
      return res.status(400).json({ error: 'Няма данни за импорт' });
    }

    let imported = 0;
    let skipped = 0;

    for (const pair of pairs) {
      if (!pair.question || !pair.answer || !pair.roles || pair.roles.length === 0) {
        skipped++;
        continue;
      }

      await pool.query(
        `INSERT INTO qa_pairs (question, answer, roles, category)
         VALUES ($1, $2, $3, $4)`,
        [pair.question.trim(), pair.answer.trim(), pair.roles, pair.category || null]
      );
      imported++;
    }

    res.json({ imported, skipped, total: pairs.length });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Грешка при импорт' });
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
      `SELECT m.id, m.role, m.content, m.matched_qa_id, m.flagged_wrong, m.flag_note, m.created_at,
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

// POST /api/admin/messages/:id/flag - Flag a message as wrong
router.post('/messages/:id/flag', async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const { rows } = await pool.query(
      `UPDATE chat_messages SET flagged_wrong = true, flag_note = $1
       WHERE id = $2 AND role = 'assistant'
       RETURNING id, flagged_wrong, flag_note`,
      [note || null, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Съобщението не е намерено' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Flag error:', err);
    res.status(500).json({ error: 'Грешка при маркиране' });
  }
});

// POST /api/admin/messages/:id/unflag - Remove flag from message
router.post('/messages/:id/unflag', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `UPDATE chat_messages SET flagged_wrong = false, flag_note = NULL
       WHERE id = $1
       RETURNING id, flagged_wrong`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Съобщението не е намерено' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Unflag error:', err);
    res.status(500).json({ error: 'Грешка при премахване на флаг' });
  }
});

// GET /api/admin/flagged/export - Export flagged messages as TSV
router.get('/flagged/export', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT m.content as bot_answer, m.flag_note,
              s.role as user_role,
              prev.content as user_question
       FROM chat_messages m
       LEFT JOIN chat_sessions s ON s.id = m.session_id
       LEFT JOIN LATERAL (
         SELECT content FROM chat_messages
         WHERE session_id = m.session_id AND id < m.id AND role = 'user'
         ORDER BY id DESC LIMIT 1
       ) prev ON true
       WHERE m.flagged_wrong = true AND m.role = 'assistant'
       ORDER BY m.created_at DESC`
    );

    const header = 'question\tanswer\troles\tcategory\twrong_answer\tnote';
    const csvRows = rows.map(r => {
      const q = (r.user_question || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
      const wrong = (r.bot_answer || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
      const note = (r.flag_note || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
      return `${q}\t\t${r.user_role}\t\t${wrong}\t${note}`;
    });
    const csv = '\uFEFF' + header + '\n' + csvRows.join('\n');

    res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="flagged_answers.tsv"');
    res.send(csv);
  } catch (err) {
    console.error('Flagged export error:', err);
    res.status(500).json({ error: 'Грешка при експорт' });
  }
});

// GET /api/admin/flagged - List flagged messages with context (paginated)
router.get('/flagged', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM chat_messages WHERE flagged_wrong = true`
    );
    const total = parseInt(countResult.rows[0].count);

    const { rows } = await pool.query(
      `SELECT m.id, m.session_id, m.content as bot_answer, m.matched_qa_id, m.flag_note, m.created_at,
              q.question as matched_question, q.answer as matched_answer,
              s.role as user_role, s.institution_name,
              prev.content as user_question
       FROM chat_messages m
       LEFT JOIN qa_pairs q ON q.id = m.matched_qa_id
       LEFT JOIN chat_sessions s ON s.id = m.session_id
       LEFT JOIN LATERAL (
         SELECT content FROM chat_messages
         WHERE session_id = m.session_id AND id < m.id AND role = 'user'
         ORDER BY id DESC LIMIT 1
       ) prev ON true
       WHERE m.flagged_wrong = true AND m.role = 'assistant'
       ORDER BY m.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({ flagged: rows, total, page, limit });
  } catch (err) {
    console.error('Flagged error:', err);
    res.status(500).json({ error: 'Грешка при зареждане на грешните отговори' });
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
