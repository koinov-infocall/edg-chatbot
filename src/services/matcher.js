const pool = require('../db/pool');
const { buildSystemPrompt } = require('./context');
const { askClaude } = require('./llm');

async function matchQuestion(question, userRole, institutionId, institutionName, sessionHistory = []) {
  // Load Q&A pairs filtered by user role
  const { rows: qaPairs } = await pool.query(
    `SELECT id, question, answer FROM qa_pairs
     WHERE is_active = true AND $1 = ANY(roles)
     ORDER BY id`,
    [userRole]
  );

  const systemPrompt = buildSystemPrompt(userRole, institutionName, qaPairs);
  const response = await askClaude(systemPrompt, question, sessionHistory);

  const isUnmatched = response.includes('[UNMATCHED]');
  const cleanResponse = response.replace('[UNMATCHED]', '').trim();

  // Try to find which Q&A pair was matched
  let matchedQaId = null;
  if (!isUnmatched) {
    for (const qa of qaPairs) {
      if (response.toLowerCase().includes(qa.answer.substring(0, 50).toLowerCase())) {
        matchedQaId = qa.id;
        break;
      }
    }
  }

  return {
    response: cleanResponse,
    isUnmatched,
    matchedQaId,
  };
}

module.exports = { matchQuestion };
