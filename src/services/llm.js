const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function askClaude(systemPrompt, userMessage, conversationHistory = []) {
  const messages = [
    ...conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: 'user', content: userMessage },
  ];

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    temperature: 0.3,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages,
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return text;
}

module.exports = { askClaude };
