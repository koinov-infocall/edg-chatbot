-- Migration: Add flagged_wrong columns to chat_messages
-- Run this on existing databases to add the flag functionality

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS flagged_wrong BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS flag_note TEXT;

CREATE INDEX IF NOT EXISTS idx_chat_messages_flagged ON chat_messages (flagged_wrong) WHERE flagged_wrong = true;
