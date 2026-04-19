-- ============================================
-- POLLS — Additional tables for Custom Polls
-- ============================================
-- Run this in Supabase SQL Editor AFTER the main schema

create table polls (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  question text not null,
  description text,
  allow_multiple boolean default false,
  allow_custom boolean default false,
  active boolean default true,
  created_at timestamptz default now()
);

create table poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references polls(id) on delete cascade,
  label text not null,
  sort_order integer default 0
);

create table poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references polls(id) on delete cascade,
  option_id uuid references poll_options(id) on delete cascade,
  voter_name text not null,
  created_at timestamptz default now(),
  unique(option_id, voter_name)
);

alter table polls enable row level security;
alter table poll_options enable row level security;
alter table poll_votes enable row level security;

create policy "Allow all" on polls for all using (true) with check (true);
create policy "Allow all" on poll_options for all using (true) with check (true);
create policy "Allow all" on poll_votes for all using (true) with check (true);

alter publication supabase_realtime add table polls;
alter publication supabase_realtime add table poll_options;
alter publication supabase_realtime add table poll_votes;
