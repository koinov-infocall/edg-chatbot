const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { matchQuestion } = require('../services/matcher');

const router = express.Router();

// POST /api/chat - Send message, get bot reply
router.post('/', async (req, res) => {
  try {
    const { message, session_id } = req.body;
    const { user_id, role, institution_id, institution_name } = req.user;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Съобщението е задължително' });
    }

    const trimmedMessage = message.trim().substring(0, 2000);

    // Get or create session
    let sessionId = session_id;
    if (!sessionId) {
      sessionId = uuidv4();
      await pool.query(
        `INSERT INTO chat_sessions (id, user_id, role, institution_id, institution_name)
         VALUES ($1, $2, $3, $4, $5)`,
        [sessionId, user_id, role, institution_id, institution_name]
      );
    }

    // Load conversation history
    const { rows: history } = await pool.query(
      `SELECT role, content FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC
       LIMIT 10`,
      [sessionId]
    );

    // Match question using LLM
    const result = await matchQuestion(
      trimmedMessage,
      role,
      institution_id,
      institution_name,
      history
    );

    // Save user message
    await pool.query(
      `INSERT INTO chat_messages (session_id, role, content)
       VALUES ($1, 'user', $2)`,
      [sessionId, trimmedMessage]
    );

    // Save bot response
    await pool.query(
      `INSERT INTO chat_messages (session_id, role, content, matched_qa_id)
       VALUES ($1, 'assistant', $2, $3)`,
      [sessionId, result.response, result.matchedQaId]
    );

    // Log unmatched question
    if (result.isUnmatched) {
      await pool.query(
        `INSERT INTO unmatched_questions (session_id, question, user_role, institution_id)
         VALUES ($1, $2, $3, $4)`,
        [sessionId, trimmedMessage, role, institution_id]
      );
    }

    res.json({
      session_id: sessionId,
      response: result.response,
      is_unmatched: result.isUnmatched,
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Възникна грешка при обработката на съобщението' });
  }
});

// GET /api/chat/history/:sessionId - Get session history
router.get('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { rows: messages } = await pool.query(
      `SELECT id, role, content, created_at FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );

    res.json({ session_id: sessionId, messages });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Грешка при зареждане на историята' });
  }
});

module.exports = router;
