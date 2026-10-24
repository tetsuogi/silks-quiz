-- 勝負服暗記帳：ユーザーごとの進捗（ダービー馬暗記帳と同じアカウント・別テーブル）
create table if not exists public.silks_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.silks_progress enable row level security;

create policy "read own silks progress" on public.silks_progress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own silks progress" on public.silks_progress
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own silks progress" on public.silks_progress
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
