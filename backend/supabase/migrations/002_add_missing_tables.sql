-- Recovery migration for partially applied Supabase schemas.
-- Safe to run after 001_init.sql; each table is created only if it does not already exist.

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  created_by uuid not null references users(id) on delete cascade,
  progress integer not null default 0,
  status text not null default 'active',
  start_date timestamptz not null default now(),
  end_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member',
  added_at timestamptz not null default now(),
  added_by uuid references users(id) on delete set null,
  unique(project_id, user_id)
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references users(id) on delete cascade,
  sender_id uuid references users(id) on delete set null,
  type text not null,
  title text not null,
  message text not null,
  project_id uuid references projects(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid not null references users(id) on delete cascade,
  content text not null,
  mentions jsonb not null default '[]'::jsonb,
  is_edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  uploaded_by uuid references users(id) on delete set null,
  original_name text not null,
  file_name text not null,
  file_url text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  sender_id uuid not null references users(id) on delete cascade,
  content text not null,
  message_type text not null default 'text',
  media_url text,
  created_at timestamptz not null default now()
);
