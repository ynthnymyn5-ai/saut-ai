-- Tickmarkin tables (already applied to the Supabase project as migration "tickmarkin_init").
create table if not exists public.tm_registrations (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  status text not null default 'new' check (status in ('new','contacted','confirmed','cancelled')),
  name text not null check (char_length(name) between 3 and 100),
  phone text not null check (phone ~ '^\+?[0-9]{8,15}$'),
  email text check (email is null or char_length(email) <= 120),
  course_id text not null,
  course_title text not null,
  mode text not null check (mode in ('حضوري','عن بُعد')),
  student_type text,
  notes text check (notes is null or char_length(notes) <= 1000)
);
create index if not exists tm_registrations_created_at_idx on public.tm_registrations (created_at desc);

create table if not exists public.tm_messages (
  id text primary key,
  created_at timestamptz not null default now(),
  read boolean not null default false,
  name text not null check (char_length(name) between 2 and 100),
  contact text not null check (char_length(contact) <= 120),
  subject text,
  message text not null check (char_length(message) between 5 and 2000)
);
create index if not exists tm_messages_created_at_idx on public.tm_messages (created_at desc);

-- Only the website server (service role) may read or write.
alter table public.tm_registrations enable row level security;
alter table public.tm_messages enable row level security;
revoke all on public.tm_registrations from anon, authenticated;
revoke all on public.tm_messages from anon, authenticated;
