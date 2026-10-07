import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

function send(res, status, body) {
  res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido.' });

  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  const received = req.headers['asaas-access-token'];

  if (!expected || !received || received !== expected) {
    return send(res, 401, { error: 'Webhook não autorizado.' });
  }

  try {
    const payload = req.body || {};
    const eventId = String(payload.id || '');
    const event = String(payload.event || '');
    const checkout = payload.checkout || {};

    if (!eventId || !event) {
      return send(res, 400, { error: 'Evento inválido.' });
    }

    const supabase = getSupabaseAdmin();

    const { error: eventInsertError } = await supabase
      .from('asaas_webhook_events')
      .insert({ id: eventId, event, payload });

    if (eventInsertError?.code === '23505') {
      return send(res, 200, { received: true, duplicate: true });
    }
    if (eventInsertError) throw eventInsertError;

    let orderId = checkout.externalReference || null;

    if (!orderId && checkout.id) {
      const { data: orderByCheckout } = await supabase
        .from('orders')
        .select('id')
        .eq('asaas_checkout_id', checkout.id)
        .maybeSingle();
      orderId = orderByCheckout?.id || null;
    }

    if (!orderId) {
      console.warn('[asaas:webhook] Pedido não localizado para checkout', checkout.id);
      return send(res, 200, { received: true, orderMatched: false });
    }

    const patch = {};

    if (event === 'CHECKOUT_PAID') {
      patch.status = 'paid';
      patch.paid_at = new Date().toISOString();
    } else if (event === 'CHECKOUT_CANCELED') {
      patch.status = 'cancelled';
    } else if (event === 'CHECKOUT_EXPIRED') {
      patch.status = 'expired';
    } else if (event === 'CHECKOUT_CREATED') {
      patch.status = 'checkout_created';
      if (checkout.id) patch.asaas_checkout_id = checkout.id;
      if (checkout.link) patch.asaas_checkout_url = checkout.link;
    }

    if (Object.keys(patch).length) {
      const { error: updateError } = await supabase
        .from('orders')
        .update(patch)
        .eq('id', orderId);
      if (updateError) throw updateError;
    }

    return send(res, 200, { received: true });
  } catch (error) {
    console.error('[asaas:webhook]', error);
    return send(res, 500, { error: 'Falha ao processar webhook.' });
  }
}
