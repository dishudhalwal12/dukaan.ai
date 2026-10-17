-- Email-confirmation status lookup.
--
-- The `email-confirmation-status` Edge Function needs to answer "has this
-- address been confirmed?" for a caller who has no session yet. `auth.users` is
-- not exposed to PostgREST, so a SECURITY DEFINER function is the only
-- supported read path: it runs as its owner and can see the auth schema, while
-- the Edge Function reaches it with the service role.
--
-- Revoking from anon and authenticated is what keeps this from being a public
-- query endpoint: only the service role (held by the Edge Function) may call it.
-- The function returns one boolean and never the row, so a caller cannot mine
-- it for anything else.

create or replace function public.is_email_confirmed(p_email text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where lower(u.email) = lower(p_email)
      and u.email_confirmed_at is not null
  );
$$;

revoke all on function public.is_email_confirmed(text) from public;
revoke all on function public.is_email_confirmed(text) from anon;
revoke all on function public.is_email_confirmed(text) from authenticated;