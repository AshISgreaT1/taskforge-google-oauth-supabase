-- Migration to add missing columns identified during schema audit
-- Run after 001_init.sql and 002_add_missing_tables.sql

-- Add is_edited column to comments table (used by commentController.js update)
ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS notifications_recipient_read_idx ON notifications (recipient_id, is_read);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS comments_task_idx ON comments (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_project_idx ON chat_messages (project_id, created_at DESC);