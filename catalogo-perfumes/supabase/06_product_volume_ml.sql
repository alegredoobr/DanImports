-- =====================================================================
-- VOLUME DOS PRODUTOS (ML)
-- Adiciona um campo opcional de volume aos produtos.
-- Seguro para executar novamente.
-- =====================================================================

alter table public.products
  add column if not exists volume_ml integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_volume_ml_check'
  ) then
    alter table public.products
      add constraint products_volume_ml_check
      check (volume_ml is null or (volume_ml > 0 and volume_ml <= 5000));
  end if;
end $$;
