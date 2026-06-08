create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  google_id text unique,
  name text not null,
  email text not null unique,
  avatar_url text,
  role text not null default 'member',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_set_updated_at
before update on users
for each row execute function set_updated_at();

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

create trigger projects_set_updated_at
before update on projects
for each row execute function set_updated_at();

create table if not exists project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member',
  added_at timestamptz not null default now(),
  added_by uuid references users(id) on delete set null,
  unique(project_id, user_id)
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  creator_id uuid not null references users(id) on delete cascade,
  assignee_id uuid references users(id) on delete set null,
  project_id uuid not null references projects(id) on delete cascade,
  priority text not null default 'medium',
  status text not null default 'todo',
  approval_status text,
  approval_note text,
  approved_by uuid references users(id) on delete set null,
  due_date timestamptz,
  is_subtask boolean not null default false,
  parent_task_id uuid references tasks(id) on delete cascade,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_project_status_idx on tasks (project_id, status);
create index if not exists tasks_assignee_status_idx on tasks (assignee_id, status);
create index if not exists tasks_title_description_idx on tasks using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));

create trigger tasks_set_updated_at
before update on tasks
for each row execute function set_updated_at();

create table if not exists task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  action text not null,
  previous_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_activity_task_idx on task_activity (task_id, created_at desc);
create index if not exists task_activity_user_idx on task_activity (user_id, created_at desc);

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

create trigger notifications_set_updated_at
before update on notifications
for each row execute function set_updated_at();

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid not null references users(id) on delete cascade,
  content text not null,
  mentions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger comments_set_updated_at
before update on comments
for each row execute function set_updated_at();

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
