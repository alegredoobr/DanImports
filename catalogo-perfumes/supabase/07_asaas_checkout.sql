-- =====================================================================
-- PEDIDOS + CHECKOUT ASAAS
-- Execute depois das migrations anteriores.
-- Seguro para executar novamente.
-- =====================================================================

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending'
    check (status in ('pending','checkout_created','paid','cancelled','expired','failed')),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  coupon_code text,
  influencer_id uuid references public.influencers(id),
  coupon_id uuid references public.coupons(id),
  asaas_checkout_id text unique,
  asaas_checkout_url text,
  customer_name text,
  customer_email text,
  customer_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists orders_status_created_idx
  on public.orders (status, created_at desc);

create index if not exists orders_influencer_idx
  on public.orders (influencer_id, created_at desc);

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  volume_ml integer,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  final_unit_price_cents integer not null check (final_unit_price_cents >= 0),
  quantity integer not null check (quantity between 1 and 10),
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx
  on public.order_items (order_id);

create table if not exists public.asaas_webhook_events (
  id text primary key,
  event text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.asaas_webhook_events enable row level security;

drop policy if exists "orders_admin_select" on public.orders;
create policy "orders_admin_select" on public.orders
  for select using (public.is_admin());

drop policy if exists "orders_admin_update" on public.orders;
create policy "orders_admin_update" on public.orders
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "order_items_admin_select" on public.order_items;
create policy "order_items_admin_select" on public.order_items
  for select using (public.is_admin());

drop policy if exists "asaas_webhook_events_admin_select" on public.asaas_webhook_events;
create policy "asaas_webhook_events_admin_select" on public.asaas_webhook_events
  for select using (public.is_admin());
