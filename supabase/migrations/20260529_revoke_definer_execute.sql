-- Lock down SECURITY DEFINER functions so they can only be invoked by
-- the service role (server). Without this, any anon or authenticated
-- Supabase client could call them and bypass RLS.
--
-- Strategy: revoke EXECUTE from PUBLIC, anon, authenticated on every
-- SECURITY DEFINER function in the `public` schema, then re-grant to
-- service_role.

do $$
declare
  r record;
begin
  for r in
    select
      n.nspname            as schema_name,
      p.proname            as func_name,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated;',
      r.schema_name, r.func_name, r.args
    );
    execute format(
      'grant execute on function %I.%I(%s) to service_role;',
      r.schema_name, r.func_name, r.args
    );
  end loop;
end $$;
