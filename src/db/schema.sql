-- EDG.bg Chatbot Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Q&A pairs with role-based filtering
CREATE TABLE qa_pairs (
    id SERIAL PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    roles TEXT[] NOT NULL DEFAULT '{}',
    category VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat sessions with user context
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    institution_id VARCHAR(255),
    institution_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Individual messages within sessions
CREATE TABLE chat_messages (
    id SERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    matched_qa_id INTEGER REFERENCES qa_pairs(id) ON DELETE SET NULL,
    flagged_wrong BOOLEAN NOT NULL DEFAULT false,
    flag_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Questions the bot couldn't answer
CREATE TABLE unmatched_questions (
    id SERIAL PRIMARY KEY,
    session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
    question TEXT NOT NULL,
    user_role VARCHAR(50),
    institution_id VARCHAR(255),
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bot configuration settings
CREATE TABLE bot_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_qa_pairs_roles ON qa_pairs USING GIN (roles);
CREATE INDEX idx_qa_pairs_active ON qa_pairs (is_active);
CREATE INDEX idx_chat_sessions_user ON chat_sessions (user_id);
CREATE INDEX idx_chat_messages_session ON chat_messages (session_id);
CREATE INDEX idx_unmatched_resolved ON unmatched_questions (is_resolved);

-- Default bot config
INSERT INTO bot_config (key, value) VALUES
    ('fallback_message', 'Този въпрос ме затруднява, но го изпращам веднага на Боряна Георгиева. Тя ще ви съдейства в най-кратки срокове.'),
    ('confidence_threshold', '0.7'),
    ('max_history_messages', '10');
