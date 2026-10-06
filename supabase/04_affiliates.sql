-- =====================================================================
-- PROGRAMA DE INFLUENCIADORES E CUPONS
-- Execute este arquivo no SQL Editor do Supabase depois do 01_schema.sql.
-- Seguro para executar novamente.
-- =====================================================================

create table if not exists public.influencers (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(btrim(name)) between 1 and 120),
  instagram           text,
  whatsapp            text,
  commission_percent  numeric(5,2) not null default 10 check (commission_percent >= 0 and commission_percent <= 100),
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists influencers_touch_updated_at on public.influencers;
create trigger influencers_touch_updated_at
  before update on public.influencers
  for each row execute function public.touch_updated_at();

create table if not exists public.coupons (
  id                uuid primary key default gen_random_uuid(),
  influencer_id     uuid not null references public.influencers(id) on delete cascade,
  code              text not null check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,30}$'),
  discount_percent  numeric(5,2) not null check (discount_percent > 0 and discount_percent <= 100),
  active            boolean not null default true,
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists coupons_code_unique_idx on public.coupons (upper(code));
create index if not exists coupons_influencer_idx on public.coupons (influencer_id);

drop trigger if exists coupons_touch_updated_at on public.coupons;
create trigger coupons_touch_updated_at
  before update on public.coupons
  for each row execute function public.touch_updated_at();

create table if not exists public.affiliate_orders (
  id                     uuid primary key default gen_random_uuid(),
  influencer_id          uuid not null references public.influencers(id),
  coupon_id              uuid not null references public.coupons(id),
  product_id             uuid not null references public.products(id),
  original_amount_cents  integer not null check (original_amount_cents >= 0),
  discount_amount_cents  integer not null check (discount_amount_cents >= 0),
  final_amount_cents     integer not null check (final_amount_cents >= 0),
  commission_percent     numeric(5,2) not null check (commission_percent >= 0 and commission_percent <= 100),
  commission_amount_cents integer not null check (commission_amount_cents >= 0),
  status                 text not null default 'pending' check (status in ('pending', 'approved', 'cancelled')),
  created_at             timestamptz not null default now(),
  approved_at            timestamptz
);

create index if not exists affiliate_orders_influencer_idx
  on public.affiliate_orders (influencer_id, created_at desc);
create index if not exists affiliate_orders_coupon_idx
  on public.affiliate_orders (coupon_id, created_at desc);
create index if not exists affiliate_orders_status_idx
  on public.affiliate_orders (status, created_at desc);

alter table public.influencers enable row level security;
alter table public.coupons enable row level security;
alter table public.affiliate_orders enable row level security;

-- Influenciadores: somente administrador.
drop policy if exists "influencers_admin_select" on public.influencers;
create policy "influencers_admin_select" on public.influencers
  for select using (public.is_admin());
drop policy if exists "influencers_admin_insert" on public.influencers;
create policy "influencers_admin_insert" on public.influencers
  for insert with check (public.is_admin());
drop policy if exists "influencers_admin_update" on public.influencers;
create policy "influencers_admin_update" on public.influencers
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "influencers_admin_delete" on public.influencers;
create policy "influencers_admin_delete" on public.influencers
  for delete using (public.is_admin());

-- Cupons: admin gerencia. A vitrine NÃO lê a tabela diretamente; usa RPC abaixo.
drop policy if exists "coupons_admin_select" on public.coupons;
create policy "coupons_admin_select" on public.coupons
  for select using (public.is_admin());
drop policy if exists "coupons_admin_insert" on public.coupons;
create policy "coupons_admin_insert" on public.coupons
  for insert with check (public.is_admin());
drop policy if exists "coupons_admin_update" on public.coupons;
create policy "coupons_admin_update" on public.coupons
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "coupons_admin_delete" on public.coupons;
create policy "coupons_admin_delete" on public.coupons
  for delete using (public.is_admin());

-- Pedidos de afiliados: leitura/alteração somente pelo admin.
-- Visitantes só conseguem criar pedidos pela função segura create_affiliate_order.
drop policy if exists "affiliate_orders_admin_select" on public.affiliate_orders;
create policy "affiliate_orders_admin_select" on public.affiliate_orders
  for select using (public.is_admin());
drop policy if exists "affiliate_orders_admin_update" on public.affiliate_orders;
create policy "affiliate_orders_admin_update" on public.affiliate_orders
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "affiliate_orders_admin_delete" on public.affiliate_orders;
create policy "affiliate_orders_admin_delete" on public.affiliate_orders
  for delete using (public.is_admin());

-- Valida um cupom sem expor dados do influenciador.
create or replace function public.get_affiliate_coupon(p_code text)
returns table (
  code text,
  discount_percent numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select c.code, c.discount_percent
  from public.coupons c
  join public.influencers i on i.id = c.influencer_id
  where c.code = upper(btrim(p_code))
    and c.active = true
    and i.active = true
    and (c.expires_at is null or c.expires_at > now())
  limit 1;
$$;

revoke all on function public.get_affiliate_coupon(text) from public;
grant execute on function public.get_affiliate_coupon(text) to anon, authenticated;

-- Cria um pedido de afiliado calculando desconto e comissão no servidor.
-- O navegador não consegue escolher valores nem comissão.
create or replace function public.create_affiliate_order(p_product_id uuid, p_coupon_code text)
returns table (
  order_id uuid,
  coupon_code text,
  original_amount_cents integer,
  discount_amount_cents integer,
  final_amount_cents integer,
  commission_amount_cents integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_coupon public.coupons%rowtype;
  v_influencer public.influencers%rowtype;
  v_discount integer;
  v_final integer;
  v_commission integer;
  v_order_id uuid;
begin
  select * into v_product
  from public.products
  where id = p_product_id and visible = true and available = true;

  if not found then
    raise exception 'Produto indisponível';
  end if;

  select c.* into v_coupon
  from public.coupons c
  where c.code = upper(btrim(p_coupon_code))
    and c.active = true
    and (c.expires_at is null or c.expires_at > now())
  limit 1;

  if not found then
    raise exception 'Cupom inválido ou expirado';
  end if;

  select * into v_influencer
  from public.influencers
  where id = v_coupon.influencer_id and active = true;

  if not found then
    raise exception 'Cupom indisponível';
  end if;

  v_discount := round(v_product.price_cents * (v_coupon.discount_percent / 100.0));
  v_final := greatest(0, v_product.price_cents - v_discount);
  v_commission := round(v_final * (v_influencer.commission_percent / 100.0));

  insert into public.affiliate_orders (
    influencer_id, coupon_id, product_id,
    original_amount_cents, discount_amount_cents, final_amount_cents,
    commission_percent, commission_amount_cents
  ) values (
    v_influencer.id, v_coupon.id, v_product.id,
    v_product.price_cents, v_discount, v_final,
    v_influencer.commission_percent, v_commission
  )
  returning id into v_order_id;

  return query
  select v_order_id, v_coupon.code, v_product.price_cents, v_discount, v_final, v_commission;
end;
$$;

revoke all on function public.create_affiliate_order(uuid, text) from public;
grant execute on function public.create_affiliate_order(uuid, text) to anon, authenticated;
