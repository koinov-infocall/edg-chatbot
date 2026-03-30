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

  // Parse matched Q&A ID from [MATCHED:QA#123] marker
  let matchedQaId = null;
  const matchMarker = response.match(/\[MATCHED:QA#(\d+)\]/);
  if (matchMarker) {
    matchedQaId = parseInt(matchMarker[1]);
  }

  // Remove all markers from the response shown to the user
  const cleanResponse = response
    .replace(/\[UNMATCHED\]/g, '')
    .replace(/\[MATCHED:QA#\d+\]/g, '')
    .trim();

  return {
    response: cleanResponse,
    isUnmatched,
    matchedQaId,
  };
}

module.exports = { matchQuestion };
