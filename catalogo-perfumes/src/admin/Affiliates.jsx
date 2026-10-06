import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { formatBRL, normalizeWhatsapp } from '../lib/format.js';
import { normalizeCouponCode } from '../lib/coupons.js';
import { useToast } from '../components/Toast.jsx';

const num = (value) => Number(String(value || '').replace(',', '.'));
const dateValue = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
const expiryIso = (value) => (value ? new Date(`${value}T23:59:59`).toISOString() : null);

export default function Affiliates() {
  const toast = useToast();
  const [influencers, setInfluencers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingPartner, setEditingPartner] = useState(null);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [addingCouponTo, setAddingCouponTo] = useState(null);
  const [period, setPeriod] = useState('30');
  const [partnerFilter, setPartnerFilter] = useState('todos');
  const [form, setForm] = useState({
    name: '',
    instagram: '',
    whatsapp: '',
    commission: '10',
    code: '',
    discount: '10',
    expires: '',
  });

  const load = useCallback(async () => {
    setLoading(true);

    const infSelect = 'id, name, instagram, whatsapp, commission_percent, active, created_at, portal_token, coupons(id, code, discount_percent, active, expires_at)';
    const orderSelect = 'id, influencer_id, original_amount_cents, discount_amount_cents, final_amount_cents, commission_percent, commission_amount_cents, status, created_at, approved_at, paid_at, products(name), influencers(name), coupons(code)';

    let [infRes, orderRes] = await Promise.all([
      supabase.from('influencers').select(infSelect).order('created_at', { ascending: false }),
      supabase.from('affiliate_orders').select(orderSelect).order('created_at', { ascending: false }).limit(500),
    ]);

    if (infRes.error && /portal_token|column/i.test(infRes.error.message || '')) {
      infRes = await supabase
        .from('influencers')
        .select('id, name, instagram, whatsapp, commission_percent, active, created_at, coupons(id, code, discount_percent, active, expires_at)')
        .order('created_at', { ascending: false });
    }

    if (orderRes.error && /paid_at|column/i.test(orderRes.error.message || '')) {
      orderRes = await supabase
        .from('affiliate_orders')
        .select('id, influencer_id, original_amount_cents, discount_amount_cents, final_amount_cents, commission_percent, commission_amount_cents, status, created_at, approved_at, products(name), influencers(name), coupons(code)')
        .order('created_at', { ascending: false })
        .limit(500);
    }

    if (infRes.error || orderRes.error) {
      toast('Não foi possível carregar influenciadores e vendas.', 'error');
    }

    setInfluencers(infRes.data || []);
    setOrders((orderRes.data || []).map((o) => ({ ...o, paid_at: o.paid_at || null })));
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  function resetCreate() {
    setForm({ name: '', instagram: '', whatsapp: '', commission: '10', code: '', discount: '10', expires: '' });
  }

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
      expires_at: expiryIso(form.expires),
    });

    if (couponError) {
      await supabase.from('influencers').delete().eq('id', influencer.id);
      setSaving(false);
      return toast(couponError.code === '23505' ? 'Esse cupom já existe.' : 'Não foi possível criar o cupom.', 'error');
    }

    resetCreate();
    setSaving(false);
    toast('Influenciador e cupom criados.');
    load();
  }

  async function savePartner(e) {
    e.preventDefault();
    if (!editingPartner) return;

    const whatsapp = editingPartner.whatsapp?.trim()
      ? normalizeWhatsapp(editingPartner.whatsapp)
      : '';

    if (!editingPartner.name.trim()) return toast('Informe o nome.', 'error');
    if (whatsapp === null) return toast('WhatsApp inválido.', 'error');

    const commission = num(editingPartner.commission_percent);
    if (!Number.isFinite(commission) || commission < 0 || commission > 100)
      return toast('Comissão inválida.', 'error');

    const { error } = await supabase
      .from('influencers')
      .update({
        name: editingPartner.name.trim(),
        instagram: editingPartner.instagram?.trim() || null,
        whatsapp: whatsapp || null,
        commission_percent: commission,
      })
      .eq('id', editingPartner.id);

    if (error) return toast('Não foi possível salvar o influenciador.', 'error');
    toast('Influenciador atualizado.');
    setEditingPartner(null);
    load();
  }

  async function addCoupon(e) {
    e.preventDefault();
    if (!addingCouponTo) return;

    const code = normalizeCouponCode(addingCouponTo.code);
    const discount = num(addingCouponTo.discount);

    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return toast('Código do cupom inválido.', 'error');
    if (!Number.isFinite(discount) || discount <= 0 || discount > 100) return toast('Desconto inválido.', 'error');

    const { error } = await supabase.from('coupons').insert({
      influencer_id: addingCouponTo.influencer_id,
      code,
      discount_percent: discount,
      expires_at: expiryIso(addingCouponTo.expires),
    });

    if (error) return toast(error.code === '23505' ? 'Esse cupom já existe.' : 'Não foi possível criar o cupom.', 'error');

    toast('Novo cupom criado.');
    setAddingCouponTo(null);
    load();
  }

  async function saveCoupon(e) {
    e.preventDefault();
    if (!editingCoupon) return;

    const code = normalizeCouponCode(editingCoupon.code);
    const discount = num(editingCoupon.discount_percent);

    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return toast('Código do cupom inválido.', 'error');
    if (!Number.isFinite(discount) || discount <= 0 || discount > 100) return toast('Desconto inválido.', 'error');

    const { error } = await supabase
      .from('coupons')
      .update({
        code,
        discount_percent: discount,
        expires_at: expiryIso(editingCoupon.expires),
      })
      .eq('id', editingCoupon.id);

    if (error) return toast(error.code === '23505' ? 'Esse cupom já existe.' : 'Não foi possível salvar o cupom.', 'error');

    toast('Cupom atualizado.');
    setEditingCoupon(null);
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
    const patch = {
      status,
      approved_at: status === 'approved' ? new Date().toISOString() : null,
      paid_at: status === 'approved' ? order.paid_at : null,
    };
    const { error } = await supabase.from('affiliate_orders').update(patch).eq('id', order.id);
    if (error) return toast('Não foi possível atualizar a venda.', 'error');
    toast(status === 'approved' ? 'Venda aprovada.' : 'Pedido cancelado.');
    load();
  }

  async function toggleCommissionPaid(order) {
    const { error } = await supabase
      .from('affiliate_orders')
      .update({ paid_at: order.paid_at ? null : new Date().toISOString() })
      .eq('id', order.id)
      .eq('status', 'approved');

    if (error) {
      if (/paid_at|column/i.test(error.message || '')) {
        return toast('Execute o arquivo 05_affiliates_v2.sql no Supabase primeiro.', 'error');
      }
      return toast('Não foi possível alterar o pagamento da comissão.', 'error');
    }

    toast(order.paid_at ? 'Comissão marcada como pendente.' : 'Comissão marcada como paga.');
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

  async function copyPortal(item) {
    if (!item.portal_token) {
      return toast('Execute o arquivo 05_affiliates_v2.sql no Supabase para ativar o painel do parceiro.', 'error');
    }

    const url = `${window.location.origin}/parceiro/${item.portal_token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link do painel do parceiro copiado.');
    } catch {
      window.prompt('Copie o link:', url);
    }
  }

  const filteredOrders = useMemo(() => {
    const now = Date.now();
    const days = period === 'todos' ? null : Number(period);

    return orders.filter((o) => {
      if (partnerFilter !== 'todos' && o.influencer_id !== partnerFilter) return false;
      if (days && now - new Date(o.created_at).getTime() > days * 86400000) return false;
      return true;
    });
  }, [orders, period, partnerFilter]);

  const totals = useMemo(() => {
    const approved = filteredOrders.filter((o) => o.status === 'approved');
    return {
      sales: approved.length,
      revenue: approved.reduce((sum, o) => sum + o.final_amount_cents, 0),
      commissions: approved.reduce((sum, o) => sum + o.commission_amount_cents, 0),
      paid: approved.filter((o) => o.paid_at).reduce((sum, o) => sum + o.commission_amount_cents, 0),
      pending: approved.filter((o) => !o.paid_at).reduce((sum, o) => sum + o.commission_amount_cents, 0),
    };
  }, [filteredOrders]);

  return (
    <div>
      <div className="affiliate-head">
        <div>
          <h1 className="serif" style={{ marginBottom: 4 }}>Influenciadores & cupons</h1>
          <p className="muted" style={{ marginTop: 0 }}>Gerencie parceiros, cupons, vendas e comissões.</p>
        </div>
      </div>

      <div className="affiliate-filters">
        <label>
          Período
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="todos">Todo o período</option>
          </select>
        </label>
        <label>
          Influenciador
          <select value={partnerFilter} onChange={(e) => setPartnerFilter(e.target.value)}>
            <option value="todos">Todos</option>
            {influencers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
      </div>

      <div className="affiliate-stats affiliate-stats-v2">
        <div className="stat-card"><span>Vendas aprovadas</span><strong>{totals.sales}</strong></div>
        <div className="stat-card"><span>Valor vendido</span><strong>{formatBRL(totals.revenue)}</strong></div>
        <div className="stat-card"><span>Comissão total</span><strong>{formatBRL(totals.commissions)}</strong></div>
        <div className="stat-card"><span>Comissão paga</span><strong>{formatBRL(totals.paid)}</strong></div>
        <div className="stat-card"><span>A pagar</span><strong>{formatBRL(totals.pending)}</strong></div>
      </div>

      <form className="panel" onSubmit={createPartner}>
        <h2>Novo influenciador</h2>
        <div className="two-col">
          <div className="field"><label>Nome</label><input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div className="field"><label>Instagram</label><input type="text" value={form.instagram} onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))} placeholder="@usuario" /></div>
          <div className="field"><label>WhatsApp (opcional)</label><input type="tel" value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} /></div>
          <div className="field"><label>Comissão (%)</label><input type="text" inputMode="decimal" value={form.commission} onChange={(e) => setForm((f) => ({ ...f, commission: e.target.value }))} /></div>
          <div className="field"><label>Cupom</label><input type="text" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: normalizeCouponCode(e.target.value) }))} /></div>
          <div className="field"><label>Desconto (%)</label><input type="text" inputMode="decimal" value={form.discount} onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))} /></div>
          <div className="field"><label>Validade do cupom (opcional)</label><input type="date" value={form.expires} onChange={(e) => setForm((f) => ({ ...f, expires: e.target.value }))} /></div>
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
              {editingPartner?.id === item.id ? (
                <form onSubmit={savePartner}>
                  <div className="two-col">
                    <div className="field"><label>Nome</label><input value={editingPartner.name} onChange={(e) => setEditingPartner((x) => ({ ...x, name: e.target.value }))} /></div>
                    <div className="field"><label>Instagram</label><input value={editingPartner.instagram || ''} onChange={(e) => setEditingPartner((x) => ({ ...x, instagram: e.target.value }))} /></div>
                    <div className="field"><label>WhatsApp</label><input value={editingPartner.whatsapp || ''} onChange={(e) => setEditingPartner((x) => ({ ...x, whatsapp: e.target.value }))} /></div>
                    <div className="field"><label>Comissão (%)</label><input value={editingPartner.commission_percent} onChange={(e) => setEditingPartner((x) => ({ ...x, commission_percent: e.target.value }))} /></div>
                  </div>
                  <div className="coupon-actions">
                    <button className="btn small">Salvar</button>
                    <button type="button" className="btn ghost small" onClick={() => setEditingPartner(null)}>Cancelar</button>
                  </div>
                </form>
              ) : (
                <div className="affiliate-card-top">
                  <div>
                    <strong>{item.name}</strong>
                    <div className="muted">{item.instagram || 'Sem Instagram'} · comissão {Number(item.commission_percent).toLocaleString('pt-BR')}%</div>
                  </div>
                  <div className="coupon-actions">
                    <button className="btn ghost small" onClick={() => setEditingPartner({ ...item })}>Editar</button>
                    <button className="btn ghost small" onClick={() => copyPortal(item)}>Painel do parceiro</button>
                    <button className="btn ghost small" onClick={() => toggleInfluencer(item)}>{item.active ? 'Desativar' : 'Ativar'}</button>
                  </div>
                </div>
              )}

              <div className="coupon-cards">
                {(item.coupons || []).map((coupon) => (
                  <div className={`coupon-admin ${coupon.active ? '' : 'disabled'}`} key={coupon.id}>
                    {editingCoupon?.id === coupon.id ? (
                      <form className="coupon-edit-form" onSubmit={saveCoupon}>
                        <input value={editingCoupon.code} onChange={(e) => setEditingCoupon((x) => ({ ...x, code: normalizeCouponCode(e.target.value) }))} />
                        <input value={editingCoupon.discount_percent} inputMode="decimal" onChange={(e) => setEditingCoupon((x) => ({ ...x, discount_percent: e.target.value }))} aria-label="Desconto" />
                        <input type="date" value={editingCoupon.expires || ''} onChange={(e) => setEditingCoupon((x) => ({ ...x, expires: e.target.value }))} />
                        <button className="btn small">Salvar</button>
                        <button type="button" className="btn ghost small" onClick={() => setEditingCoupon(null)}>Cancelar</button>
                      </form>
                    ) : (
                      <>
                        <div>
                          <strong>{coupon.code}</strong>
                          <span>{Number(coupon.discount_percent).toLocaleString('pt-BR')}% OFF</span>
                          <small className="muted">{coupon.expires_at ? `Validade: ${new Date(coupon.expires_at).toLocaleDateString('pt-BR')}` : 'Sem validade'}</small>
                        </div>
                        <div className="coupon-actions">
                          <button className="btn ghost small" onClick={() => copyLink(coupon.code)}>Copiar link</button>
                          <button className="btn ghost small" onClick={() => setEditingCoupon({ ...coupon, expires: dateValue(coupon.expires_at) })}>Editar</button>
                          <button className="btn ghost small" onClick={() => toggleCoupon(coupon)}>{coupon.active ? 'Desativar' : 'Ativar'}</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {addingCouponTo?.influencer_id === item.id ? (
                <form className="add-coupon-form" onSubmit={addCoupon}>
                  <input placeholder="NOVOCUPOM" value={addingCouponTo.code} onChange={(e) => setAddingCouponTo((x) => ({ ...x, code: normalizeCouponCode(e.target.value) }))} />
                  <input placeholder="Desconto %" inputMode="decimal" value={addingCouponTo.discount} onChange={(e) => setAddingCouponTo((x) => ({ ...x, discount: e.target.value }))} />
                  <input type="date" value={addingCouponTo.expires} onChange={(e) => setAddingCouponTo((x) => ({ ...x, expires: e.target.value }))} />
                  <button className="btn small">Adicionar</button>
                  <button type="button" className="btn ghost small" onClick={() => setAddingCouponTo(null)}>Cancelar</button>
                </form>
              ) : (
                <button className="btn ghost small add-coupon-btn" onClick={() => setAddingCouponTo({ influencer_id: item.id, code: '', discount: '10', expires: '' })}>
                  + Adicionar outro cupom
                </button>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Pedidos por cupom</h2>
        {filteredOrders.length === 0 && <p className="muted">Nenhum pedido neste filtro.</p>}
        <div className="order-list">
          {filteredOrders.map((order) => (
            <article className="affiliate-order" key={order.id}>
              <div>
                <strong>{order.products?.name || 'Produto'}</strong>
                <div className="muted">{order.coupons?.code} · {order.influencers?.name} · {new Date(order.created_at).toLocaleString('pt-BR')}</div>
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

                {order.status === 'approved' && (
                  <button className={`btn small ${order.paid_at ? 'ghost' : ''}`} onClick={() => toggleCommissionPaid(order)}>
                    {order.paid_at ? 'Marcar não paga' : 'Marcar comissão paga'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
