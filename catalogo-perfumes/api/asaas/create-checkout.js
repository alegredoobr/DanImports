import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';
import { asaasRequest } from './_lib/asaas.js';

const normalizeCoupon = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');

function send(res, status, body) {
  res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido.' });

  try {
    const body = req.body || {};
    const rawItems = Array.isArray(body.items) ? body.items : [];

    if (!rawItems.length || rawItems.length > 20) {
      return send(res, 400, { error: 'Carrinho inválido.' });
    }

    const quantities = new Map();
    for (const item of rawItems) {
      const productId = String(item?.productId || '');
      const quantity = Number(item?.quantity || 1);
      if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
        return send(res, 400, { error: 'Item inválido no carrinho.' });
      }
      quantities.set(productId, Math.min(10, (quantities.get(productId) || 0) + quantity));
    }

    const productIds = [...quantities.keys()];
    const supabase = getSupabaseAdmin();
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, price_cents, volume_ml, visible, available')
      .in('id', productIds);

    if (productsError) throw productsError;
    if (!products || products.length !== productIds.length) {
      return send(res, 400, { error: 'Um ou mais produtos não existem.' });
    }

    if (products.some((p) => !p.visible || !p.available)) {
      return send(res, 400, { error: 'Um ou mais produtos estão indisponíveis.' });
    }

    const couponCode = normalizeCoupon(body.couponCode);
    let coupon = null;
    let influencer = null;
    let discountPercent = 0;

    if (couponCode) {
      const { data: couponRow } = await supabase
        .from('coupons')
        .select('id, code, discount_percent, active, expires_at, influencer_id')
        .eq('code', couponCode)
        .maybeSingle();

      if (!couponRow || !couponRow.active || (couponRow.expires_at && new Date(couponRow.expires_at) <= new Date())) {
        return send(res, 400, { error: 'Cupom inválido ou expirado.' });
      }

      const { data: influencerRow } = await supabase
        .from('influencers')
        .select('id, active')
        .eq('id', couponRow.influencer_id)
        .maybeSingle();

      if (!influencerRow?.active) {
        return send(res, 400, { error: 'Cupom indisponível.' });
      }

      coupon = couponRow;
      influencer = influencerRow;
      discountPercent = Number(couponRow.discount_percent || 0);
    }

    let subtotalCents = 0;
    let totalCents = 0;
    const orderItems = products.map((product) => {
      const quantity = quantities.get(product.id);
      const unitPriceCents = Number(product.price_cents);
      const finalUnitPriceCents = Math.max(
        0,
        Math.round(unitPriceCents * (1 - discountPercent / 100)),
      );

      subtotalCents += unitPriceCents * quantity;
      totalCents += finalUnitPriceCents * quantity;

      return {
        product_id: product.id,
        product_name: product.name,
        volume_ml: product.volume_ml || null,
        unit_price_cents: unitPriceCents,
        final_unit_price_cents: finalUnitPriceCents,
        quantity,
      };
    });

    const discountCents = subtotalCents - totalCents;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        status: 'pending',
        subtotal_cents: subtotalCents,
        discount_cents: discountCents,
        total_cents: totalCents,
        coupon_code: coupon?.code || null,
        coupon_id: coupon?.id || null,
        influencer_id: influencer?.id || null,
      })
      .select('id')
      .single();

    if (orderError) throw orderError;

    const { error: itemError } = await supabase
      .from('order_items')
      .insert(orderItems.map((item) => ({ ...item, order_id: order.id })));

    if (itemError) {
      await supabase.from('orders').delete().eq('id', order.id);
      throw itemError;
    }

    const origin = String(req.headers.origin || `https://${req.headers.host}`).replace(/\/$/, '');
    const checkout = await asaasRequest('/checkouts', {
      method: 'POST',
      body: JSON.stringify({
        billingTypes: ['PIX', 'CREDIT_CARD'],
        chargeTypes: ['DETACHED'],
        minutesToExpire: 60,
        externalReference: order.id,
        callback: {
          successUrl: `${origin}/pedido/${order.id}?retorno=sucesso`,
          cancelUrl: `${origin}/pedido/${order.id}?retorno=cancelado`,
          expiredUrl: `${origin}/pedido/${order.id}?retorno=expirado`,
        },
        items: orderItems.map((item) => ({
          externalReference: item.product_id,
          name: item.volume_ml ? `${item.product_name} - ${item.volume_ml} ml` : item.product_name,
          description: coupon ? `Cupom ${coupon.code} aplicado` : 'Dan Imports',
          quantity: item.quantity,
          value: Number((item.final_unit_price_cents / 100).toFixed(2)),
        })),
      }),
    });

    const checkoutUrl = checkout.link || (
      process.env.ASAAS_ENV === 'production'
        ? `https://asaas.com/checkoutSession/show?id=${checkout.id}`
        : `https://sandbox.asaas.com/checkoutSession/show/${checkout.id}`
    );

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'checkout_created',
        asaas_checkout_id: checkout.id,
        asaas_checkout_url: checkoutUrl,
      })
      .eq('id', order.id);

    if (updateError) throw updateError;

    return send(res, 200, {
      orderId: order.id,
      checkoutId: checkout.id,
      checkoutUrl,
      subtotalCents,
      discountCents,
      totalCents,
    });
  } catch (error) {
    console.error('[asaas:create-checkout]', error);
    return send(res, error?.status === 401 ? 502 : 500, {
      error: 'Não foi possível iniciar o pagamento agora.',
      detail: process.env.ASAAS_ENV === 'sandbox' ? error?.message : undefined,
    });
  }
}
