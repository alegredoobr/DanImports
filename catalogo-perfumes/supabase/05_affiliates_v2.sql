-- =====================================================================
-- AFILIADOS V2 — edição, validade, comissão paga e painel do parceiro
-- Execute no SQL Editor depois do 04_affiliates.sql.
-- Seguro para executar novamente.
-- =====================================================================

alter table public.influencers
  add column if not exists portal_token uuid default gen_random_uuid();

create unique index if not exists influencers_portal_token_unique_idx
  on public.influencers (portal_token);

update public.influencers
set portal_token = gen_random_uuid()
where portal_token is null;

alter table public.affiliate_orders
  add column if not exists paid_at timestamptz;

create index if not exists affiliate_orders_paid_idx
  on public.affiliate_orders (paid_at, approved_at);

create or replace function public.get_partner_dashboard(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_influencer public.influencers%rowtype;
  v_result jsonb;
begin
  select *
  into v_influencer
  from public.influencers
  where portal_token = p_token
    and active = true
  limit 1;

  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'influencer', jsonb_build_object(
      'name', v_influencer.name,
      'instagram', v_influencer.instagram,
      'commission_percent', v_influencer.commission_percent
    ),
    'coupons', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'code', c.code,
          'discount_percent', c.discount_percent,
          'active', c.active,
          'expires_at', c.expires_at
        )
        order by c.created_at desc
      )
      from public.coupons c
      where c.influencer_id = v_influencer.id
    ), '[]'::jsonb),
    'stats', jsonb_build_object(
      'approved_sales', (
        select count(*)
        from public.affiliate_orders ao
        where ao.influencer_id = v_influencer.id
          and ao.status = 'approved'
      ),
      'revenue_cents', coalesce((
        select sum(ao.final_amount_cents)
        from public.affiliate_orders ao
        where ao.influencer_id = v_influencer.id
          and ao.status = 'approved'
      ), 0),
      'commission_total_cents', coalesce((
        select sum(ao.commission_amount_cents)
        from public.affiliate_orders ao
        where ao.influencer_id = v_influencer.id
          and ao.status = 'approved'
      ), 0),
      'commission_paid_cents', coalesce((
        select sum(ao.commission_amount_cents)
        from public.affiliate_orders ao
        where ao.influencer_id = v_influencer.id
          and ao.status = 'approved'
          and ao.paid_at is not null
      ), 0),
      'commission_pending_cents', coalesce((
        select sum(ao.commission_amount_cents)
        from public.affiliate_orders ao
        where ao.influencer_id = v_influencer.id
          and ao.status = 'approved'
          and ao.paid_at is null
      ), 0)
    ),
    'orders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'product_name', x.product_name,
          'coupon_code', x.coupon_code,
          'final_amount_cents', x.final_amount_cents,
          'commission_amount_cents', x.commission_amount_cents,
          'created_at', x.created_at,
          'paid_at', x.paid_at
        )
        order by x.created_at desc
      )
      from (
        select
          ao.id,
          p.name as product_name,
          c.code as coupon_code,
          ao.final_amount_cents,
          ao.commission_amount_cents,
          ao.created_at,
          ao.paid_at
        from public.affiliate_orders ao
        join public.products p on p.id = ao.product_id
        join public.coupons c on c.id = ao.coupon_id
        where ao.influencer_id = v_influencer.id
          and ao.status = 'approved'
        order by ao.created_at desc
        limit 100
      ) x
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_partner_dashboard(uuid) from public;
grant execute on function public.get_partner_dashboard(uuid) to anon, authenticated;
