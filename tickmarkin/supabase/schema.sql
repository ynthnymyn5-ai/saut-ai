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

-- ---------- Institute office (migration "tickmarkin_office") ----------
create table if not exists public.tm_teachers (
  id text primary key, created_at timestamptz not null default now(), updated_at timestamptz,
  name text not null check (char_length(name) between 2 and 100),
  phone text not null unique check (phone ~ '^\+?[0-9]{8,15}$'),
  email text, subject text, password_hash text not null,
  active boolean not null default true, notes text
);
create table if not exists public.tm_classes (
  id text primary key, created_at timestamptz not null default now(), updated_at timestamptz,
  name text not null check (char_length(name) between 2 and 100),
  teacher_id text references public.tm_teachers(id) on delete set null,
  subject text, grade text, schedule text, room text,
  fee numeric(10,2) check (fee is null or fee >= 0),
  capacity integer check (capacity is null or capacity > 0), notes text
);
create table if not exists public.tm_students (
  id text primary key, created_at timestamptz not null default now(), updated_at timestamptz,
  name text not null check (char_length(name) between 2 and 100),
  phone text, guardian_name text, guardian_phone text, grade text,
  class_ids text[] not null default '{}',
  status text not null default 'active' check (status in ('active','inactive')), notes text
);
create table if not exists public.tm_fees (
  id text primary key, created_at timestamptz not null default now(), updated_at timestamptz,
  student_id text not null references public.tm_students(id) on delete cascade,
  class_id text references public.tm_classes(id) on delete set null,
  description text not null, amount numeric(10,2) not null check (amount > 0), due_date date
);
create table if not exists public.tm_payments (
  id text primary key, created_at timestamptz not null default now(), updated_at timestamptz,
  student_id text not null references public.tm_students(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0), method text not null,
  paid_at date not null default current_date, note text
);
alter table public.tm_teachers enable row level security;
alter table public.tm_classes enable row level security;
alter table public.tm_students enable row level security;
alter table public.tm_fees enable row level security;
alter table public.tm_payments enable row level security;
revoke all on public.tm_teachers, public.tm_classes, public.tm_students, public.tm_fees, public.tm_payments from anon, authenticated;
