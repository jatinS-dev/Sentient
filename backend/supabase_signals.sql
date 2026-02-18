create table if not exists public.signals (
  id text primary key,
  source text not null,
  title text not null,
  summary text not null,
  occurred_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists signals_source_occurred_at_idx
  on public.signals (source, occurred_at desc);

create or replace function public.set_signals_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_signals_updated_at on public.signals;
create trigger trg_signals_updated_at
before update on public.signals
for each row execute function public.set_signals_updated_at();
