-- Fix missing columns in task_activity table
-- The production database is missing new_data column

-- Add new_data column if it doesn't exist
ALTER TABLE task_activity ADD COLUMN IF NOT EXISTS new_data jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Add previous_data column if it doesn't exist
ALTER TABLE task_activity ADD COLUMN IF NOT EXISTS previous_data jsonb NOT NULL DEFAULT '{}'::jsonb;