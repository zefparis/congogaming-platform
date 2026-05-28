-- Migration: enregistrer les achats de ticket loto et les gains dans transactions
-- À exécuter sur la base Supabase de production.

-- 1) Créer l'enum s'il n'existe pas, sinon ajouter les valeurs manquantes
do $$
begin
  if not exists (select 1 from pg_type where typname = 'transaction_type') then
    create type public.transaction_type as enum ('deposit', 'withdrawal', 'loto_ticket', 'loto_payout');
  else
    begin
      alter type public.transaction_type add value if not exists 'loto_ticket';
    exception when duplicate_object then null;
    end;
    begin
      alter type public.transaction_type add value if not exists 'loto_payout';
    exception when duplicate_object then null;
    end;
  end if;
end $$;
