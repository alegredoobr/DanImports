import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });

  const id = String(req.query?.id || '');
  if (!id) return res.status(400).json({ error: 'Pedido inválido.' });

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('orders')
      .select('id, status, total_cents, created_at, paid_at, order_items(product_name, volume_ml, quantity)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Pedido não encontrado.' });

    return res.status(200).json({
      id: data.id,
      status: data.status,
      totalCents: data.total_cents,
      createdAt: data.created_at,
      paidAt: data.paid_at,
      items: data.order_items || [],
    });
  } catch (error) {
    console.error('[orders:status]', error);
    return res.status(500).json({ error: 'Não foi possível consultar o pedido.' });
  }
}
