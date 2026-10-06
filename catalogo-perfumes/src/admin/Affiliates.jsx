import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { formatBRL, normalizeWhatsapp } from '../lib/format.js';
import { normalizeCouponCode } from '../lib/coupons.js';
import { useToast } from '../components/Toast.jsx';

const num = (value) => Number(String(value || '').replace(',', '.'));

export default function Affiliates() {
  const toast = useToast();
  const [influencers, setInfluencers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    instagram: '',
    whatsapp: '',
    commission: '10',
    code: '',
    discount: '10',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [infRes, orderRes] = await Promise.all([
      supabase
        .from('influencers')
        .select('id, name, instagram, whatsapp, commission_percent, active, created_at, coupons(id, code, discount_percent, active, expires_at)')
        .order('created_at', { ascending: false }),
      supabase
        .from('affiliate_orders')
        .select('id, original_amount_cents, discount_amount_cents, final_amount_cents, commission_percent, commission_amount_cents, status, created_at, approved_at, products(name), influencers(name), coupons(code)')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (infRes.error || orderRes.error) {
      const error = infRes.error || orderRes.error;
      toast(/influencers|affiliate_orders|schema cache/i.test(error.message || '')
        ? 'Execute o arquivo supabase/04_affiliates.sql no Supabase para ativar esta área.'
        : 'Não foi possível carregar influenciadores e vendas.', 'error');
    }

    setInfluencers(infRes.data || []);
    setOrders(orderRes.data || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function createPartner(e) {
    e.preventDefault();
    const name = form.name.trim();
    const code = normalizeCouponCode(form.code);
    const commission = num(form.commission);
    const discount = num(form.discount);
    const whatsapp = form.whatsapp.trim() ? normalizeWhatsapp(form.whatsapp) : '';

    if (!name) return toast('Informe o nome do influenciador.', 'error');
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return toast('Cupom: use de 3 a 30 letras, números, _ ou -.', 'error');
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) return toast('Comissão inválida.', 'error');
    if (!Number.isFinite(discount) || discount <= 0 || discount > 100) return toast('Desconto inválido.', 'error');
    if (whatsapp === null) return toast('WhatsApp inválido.', 'error');

    setSaving(true);
    const { data: influencer, error: infError } = await supabase
      .from('influencers')
      .insert({
        name,
        instagram: form.instagram.trim() || null,
        whatsapp: whatsapp || null,
        commission_percent: commission,
      })
      .select('id')
      .single();

    if (infError) {
      setSaving(false);
      return toast('Não foi possível criar o influenciador.', 'error');
    }

    const { error: couponError } = await supabase.from('coupons').insert({
      influencer_id: influencer.id,
      code,
      discount_percent: discount,
    });

    if (couponError) {
      await supabase.from('influencers').delete().eq('id', influencer.id);
      setSaving(false);
      return toast(couponError.code === '23505' ? 'Esse cupom já existe.' : 'Não foi possível criar o cupom.', 'error');
    }

    setForm({ name: '', instagram: '', whatsapp: '', commission: '10', code: '', discount: '10' });
    setSaving(false);
    toast('Influenciador e cupom criados.');
    load();
  }

  async function toggleInfluencer(item) {
    const { error } = await supabase.from('influencers').update({ active: !item.active }).eq('id', item.id);
    if (error) return toast('Não foi possível alterar o status.', 'error');
    load();
  }

  async function toggleCoupon(coupon) {
    const { error } = await supabase.from('coupons').update({ active: !coupon.active }).eq('id', coupon.id);
    if (error) return toast('Não foi possível alterar o cupom.', 'error');
    load();
  }

  async function setOrderStatus(order, status) {
    const patch = { status, approved_at: status === 'approved' ? new Date().toISOString() : null };
    const { error } = await supabase.from('affiliate_orders').update(patch).eq('id', order.id);
    if (error) return toast('Não foi possível atualizar a venda.', 'error');
    toast(status === 'approved' ? 'Venda aprovada e comissão contabilizada.' : 'Pedido cancelado.');
    load();
  }

  async function copyLink(code) {
    const url = `${window.location.origin}/?cupom=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link de divulgação copiado.');
    } catch {
      window.prompt('Copie o link:', url);
    }
  }

  const totals = useMemo(() => {
    const approved = orders.filter((o) => o.status === 'approved');
    return {
      sales: approved.length,
      revenue: approved.reduce((sum, o) => sum + o.final_amount_cents, 0),
      commissions: approved.reduce((sum, o) => sum + o.commission_amount_cents, 0),
    };
  }, [orders]);

  return (
    <div>
      <div className="affiliate-head">
        <div>
          <h1 className="serif" style={{ marginBottom: 4 }}>Influenciadores & cupons</h1>
          <p className="muted" style={{ marginTop: 0 }}>Crie códigos, acompanhe pedidos e aprove somente as vendas realmente pagas.</p>
        </div>
      </div>

      <div className="affiliate-stats">
        <div className="stat-card"><span>Vendas aprovadas</span><strong>{totals.sales}</strong></div>
        <div className="stat-card"><span>Valor vendido</span><strong>{formatBRL(totals.revenue)}</strong></div>
        <div className="stat-card"><span>Comissões a pagar</span><strong>{formatBRL(totals.commissions)}</strong></div>
      </div>

      <form className="panel" onSubmit={createPartner}>
        <h2>Novo influenciador</h2>
        <div className="two-col">
          <div className="field">
            <label>Nome</label>
            <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex.: Ana Souza" />
          </div>
          <div className="field">
            <label>Instagram</label>
            <input type="text" value={form.instagram} onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))} placeholder="@anasouza" />
          </div>
          <div className="field">
            <label>WhatsApp do influenciador (opcional)</label>
            <input type="tel" value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} placeholder="(62) 99999-9999" />
          </div>
          <div className="field">
            <label>Comissão (%)</label>
            <input type="text" inputMode="decimal" value={form.commission} onChange={(e) => setForm((f) => ({ ...f, commission: e.target.value }))} />
          </div>
          <div className="field">
            <label>Cupom</label>
            <input type="text" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: normalizeCouponCode(e.target.value) }))} placeholder="ANA10" maxLength={30} />
          </div>
          <div className="field">
            <label>Desconto para o cliente (%)</label>
            <input type="text" inputMode="decimal" value={form.discount} onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))} />
          </div>
        </div>
        <button className="btn" disabled={saving}>{saving ? 'Criando…' : 'Criar influenciador e cupom'}</button>
      </form>

      <section className="panel">
        <h2>Parceiros</h2>
        {loading && <p className="muted">Carregando…</p>}
        {!loading && influencers.length === 0 && <p className="muted">Nenhum influenciador cadastrado.</p>}
        <div className="affiliate-list">
          {influencers.map((item) => (
            <article className={`affiliate-card ${item.active ? '' : 'disabled'}`} key={item.id}>
              <div className="affiliate-card-top">
                <div>
                  <strong>{item.name}</strong>
                  <div className="muted">{item.instagram || 'Sem Instagram'} · comissão {Number(item.commission_percent).toLocaleString('pt-BR')}%</div>
                </div>
                <button className="btn ghost small" onClick={() => toggleInfluencer(item)}>
                  {item.active ? 'Desativar parceiro' : 'Ativar parceiro'}
                </button>
              </div>
              <div className="coupon-cards">
                {(item.coupons || []).map((coupon) => (
                  <div className={`coupon-admin ${coupon.active ? '' : 'disabled'}`} key={coupon.id}>
                    <div>
                      <strong>{coupon.code}</strong>
                      <span>{Number(coupon.discount_percent).toLocaleString('pt-BR')}% OFF</span>
                    </div>
                    <div className="coupon-actions">
                      <button className="btn ghost small" onClick={() => copyLink(coupon.code)}>Copiar link</button>
                      <button className="btn ghost small" onClick={() => toggleCoupon(coupon)}>
                        {coupon.active ? 'Desativar' : 'Ativar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Pedidos por cupom</h2>
        {orders.length === 0 && <p className="muted">Nenhum pedido com cupom ainda.</p>}
        <div className="order-list">
          {orders.map((order) => (
            <article className="affiliate-order" key={order.id}>
              <div>
                <strong>{order.products?.name || 'Produto'}</strong>
                <div className="muted">
                  {order.coupons?.code} · {order.influencers?.name} · {new Date(order.created_at).toLocaleString('pt-BR')}
                </div>
                <div className="order-values">
                  <span>Cliente: <b>{formatBRL(order.final_amount_cents)}</b></span>
                  <span>Desconto: {formatBRL(order.discount_amount_cents)}</span>
                  <span>Comissão: <b>{formatBRL(order.commission_amount_cents)}</b></span>
                </div>
              </div>
              <div className="order-status-actions">
                <span className={`order-status ${order.status}`}>
                  {order.status === 'approved' ? 'Aprovada' : order.status === 'cancelled' ? 'Cancelada' : 'Pendente'}
                </span>
                {order.status === 'pending' && (
                  <>
                    <button className="btn small" onClick={() => setOrderStatus(order, 'approved')}>Aprovar venda</button>
                    <button className="btn danger small" onClick={() => setOrderStatus(order, 'cancelled')}>Cancelar</button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
