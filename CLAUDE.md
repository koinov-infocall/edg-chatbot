# EDG.bg Chatbot Project

## Overview
AI chatbot for EDG.bg (Electronic Diary for Kindergartens in Bulgaria). The bot assists users with FAQ based on their role in the system. It runs inside the EDG.bg admin panel.

## Tech Stack
- **Runtime**: Node.js 20+ with Express.js
- **Database**: PostgreSQL 15+
- **LLM**: Claude Haiku 4.5 via Anthropic API (`claude-haiku-4-5`)
- **Frontend Widget**: Vanilla JS (self-contained, embeddable via `<script>` tag)
- **Admin Panel**: React (or plain HTML/JS for MVP)
- **Auth**: JWT tokens (shared with EDG.bg)

## Project Structure
```
edg-chatbot/
  src/
    server.js              # Express app entry point
    routes/
      chat.js              # POST /api/chat - main chat endpoint
      admin.js             # CRUD for Q&A pairs, logs, stats
    services/
      llm.js               # Claude Haiku API wrapper
      matcher.js           # Q&A matching logic
      context.js           # Role resolver - builds context per user
    middleware/
      auth.js              # JWT verification middleware
    db/
      pool.js              # PostgreSQL connection pool
      schema.sql           # Database schema
      seed.sql             # Initial 50 Q&A pairs
  public/
    widget.js              # Embeddable chat widget
  admin/                   # Admin panel (React or HTML)
  tests/                   # Integration tests
  .env.example
  package.json
  CLAUDE.md
```

## Database Tables
- `qa_pairs` - Questions and answers with role filtering
- `chat_sessions` - User chat sessions with role/institution context
- `chat_messages` - Individual messages in sessions
- `unmatched_questions` - Questions the bot couldn't answer (for review)
- `bot_config` - Bot settings (fallback message, confidence threshold, etc.)

## User Roles
The bot serves users with different roles. Each role sees different Q&A:
- `director` / `admin` - Full access to all Q&A (scheduling, medical notes, access requests, DOD, PLR groups, profiles)
- `teacher` - Scheduling, medical notes, access requests, login issues (redirects to director for advanced tasks)
- `plr` (psychologist/resource teacher/speech therapist) - Same as teacher + PLR-specific Q&A
- `dod_teacher` / `dod_admin` - DOD module (fees, children) + login
- `domakin` / `zas` - DOD fees + login
- `parent` - Registration and login issues only

## Key Behaviors
- Bot is INFORMATIONAL ONLY - never performs actions in the system
- When bot can't answer: "Този въпрос ме затруднява, но го изпращам веднага на Боряна Георгиева. Тя ще ви съдейства в най-кратки срокове."
- When redirecting to another person: "Обърнете се към директора/отговорника, той може да ви съдейства."
- All responses in Bulgarian language
- Professional, friendly, concise tone
- Step-by-step instructions when applicable

## LLM Integration
- Model: `claude-haiku-4-5`
- Max tokens: 500
- Temperature: 0.3
- System prompt includes: user role + institution name + all relevant Q&A pairs
- Use prompt caching (cache_control) for the system prompt to reduce costs
- Parse response for UNMATCHED marker to log unknown questions

## API Endpoints
- `POST /api/chat` - Send message, get bot reply
- `GET /api/chat/history/:sessionId` - Get session history
- `POST /api/admin/qa` - Create Q&A pair
- `PUT /api/admin/qa/:id` - Update Q&A pair
- `DELETE /api/admin/qa/:id` - Delete Q&A pair
- `GET /api/admin/qa` - List Q&A pairs (filterable by role/category)
- `GET /api/admin/logs` - Unmatched questions log
- `POST /api/admin/logs/:id/resolve` - Mark log as resolved
- `GET /api/admin/stats` - Usage statistics

## Commands
- `npm run dev` - Start dev server with nodemon (port 3000)
- `npm run start` - Production start
- `npm test` - Run tests
- `npm run seed` - Seed database with initial Q&A pairs

## Environment Variables (.env)
- `DATABASE_URL` - PostgreSQL connection string
- `ANTHROPIC_API_KEY` - Claude API key
- `JWT_SECRET` - Shared JWT secret with EDG.bg
- `PORT` - Server port (default 3000)
- `CORS_ORIGIN` - Allowed origin (https://edg.bg)

## Conventions
- Use async/await everywhere
- Error handling with try/catch and proper HTTP status codes
- All database queries parameterized (prevent SQL injection)
- Input validation and sanitization on all endpoints
- Rate limiting: 30 requests/minute per user
- Logging: console.log for dev, structured JSON for production
