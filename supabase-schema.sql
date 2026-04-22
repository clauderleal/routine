-- Run this in your Supabase project → SQL Editor

-- 1. Create the key-value store table
create table public.store (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz default now(),
  unique(user_id, key)
);

-- 2. Enable Row Level Security (users only see their own data)
alter table public.store enable row level security;

create policy "Users can read their own data"
  on public.store for select
  using (auth.uid() = user_id);

create policy "Users can insert their own data"
  on public.store for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own data"
  on public.store for update
  using (auth.uid() = user_id);

create policy "Users can delete their own data"
  on public.store for delete
  using (auth.uid() = user_id);

-- 3. Index for fast lookups
create index store_user_key_idx on public.store(user_id, key);
