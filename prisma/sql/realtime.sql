-- Run this in the Supabase SQL editor after `npx prisma migrate deploy`.
-- Row level security is also enabled by the Prisma migration.
-- This trigger broadcasts a guest-list refresh. The payload has no visitor details.

alter table public.users enable row level security;
alter table public.accounts enable row level security;
alter table public.sessions enable row level security;
alter table public.verification_tokens enable row level security;
alter table public.floors enable row level security;
alter table public.floor_assignments enable row level security;
alter table public.guests enable row level security;

create or replace function public.notify_guest_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.send(
    jsonb_build_object('refresh', true),
    'guests-changed',
    'reception-board',
    false
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists guests_realtime on public.guests;

create trigger guests_realtime
after insert or update or delete on public.guests
for each row
execute function public.notify_guest_change();
