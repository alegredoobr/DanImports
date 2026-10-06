import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { formatBRL } from '../lib/format.js';
import { Brand, Spinner } from '../components/Common.jsx';

export default function PartnerDashboard() {
  const { token } = useParams();
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });

    supabase.rpc('get_partner_dashboard', { p_token: token }).then(({ data, error }) => {
      if (!alive) return;
      if (error) {
        setState({
          status: 'error',
          message: /get_partner_dashboard|schema cache/i.test(error.message || '')
            ? 'O painel do parceiro ainda não foi ativado.'
            : 'Não foi possível carregar seu painel agora.',
        });
        return;
      }
      if (!data) {
        setState({ status: 'missing' });
        return;
      }
      setState({ status: 'ok', data });
    });

    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <>
      <header className="topbar"><Brand /></header>
      <main className="page narrow partner-page">
        {state.status === 'loading' && <Spinner />}
        {state.status === 'error' && <div className="center-msg"><p>{state.message}</p></div>}
        {state.status === 'missing' && (
          <div className="center-msg">
            <p>Link de parceiro inválido ou desativado.</p>
            <Link className="btn" to="/">Ver catálogo</Link>
          </div>
        )}

        {state.status === 'ok' && (() => {
          const { influencer, coupons = [], stats = {}, orders = [] } = state.data;
          return (
            <>
              <div className="partner-hero">
                <p className="eyebrow">Painel do parceiro</p>
                <h1 className="serif">Olá, {influencer.name}</h1>
                {influencer.instagram && <p className="muted">{influencer.instagram}</p>}
              </div>

              <div className="affiliate-stats partner-stats">
                <div className="stat-card"><span>Vendas aprovadas</span><strong>{stats.approved_sales || 0}</strong></div>
                <div className="stat-card"><span>Valor vendido</span><strong>{formatBRL(stats.revenue_cents || 0)}</strong></div>
                <div className="stat-card"><span>Comissão acumulada</span><strong>{formatBRL(stats.commission_total_cents || 0)}</strong></div>
                <div className="stat-card"><span>Já pago</span><strong>{formatBRL(stats.commission_paid_cents || 0)}</strong></div>
                <div className="stat-card"><span>A receber</span><strong>{formatBRL(stats.commission_pending_cents || 0)}</strong></div>
              </div>

              <section className="panel">
                <h2>Seus cupons</h2>
                <div className="coupon-cards">
                  {coupons.map((coupon) => (
                    <div className={`coupon-admin ${coupon.active ? '' : 'disabled'}`} key={coupon.code}>
                      <div>
                        <strong>{coupon.code}</strong>
                        <span>{Number(coupon.discount_percent).toLocaleString('pt-BR')}% OFF</span>
                        {coupon.expires_at && (
                          <small className="muted">
                            Validade: {new Date(coupon.expires_at).toLocaleDateString('pt-BR')}
                          </small>
                        )}
                      </div>
                      <a className="btn ghost small" href={`/?cupom=${encodeURIComponent(coupon.code)}`}>Abrir link</a>
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel">
                <h2>Suas vendas</h2>
                {orders.length === 0 && <p className="muted">Nenhuma venda aprovada ainda.</p>}
                <div className="order-list">
                  {orders.map((order) => (
                    <article className="affiliate-order" key={order.id}>
                      <div>
                        <strong>{order.product_name}</strong>
                        <div className="muted">
                          {order.coupon_code} · {new Date(order.created_at).toLocaleString('pt-BR')}
                        </div>
                        <div className="order-values">
                          <span>Venda: <b>{formatBRL(order.final_amount_cents)}</b></span>
                          <span>Comissão: <b>{formatBRL(order.commission_amount_cents)}</b></span>
                        </div>
                      </div>
                      <span className={`order-status ${order.paid_at ? 'approved' : 'pending'}`}>
                        {order.paid_at ? 'Comissão paga' : 'A receber'}
                      </span>
                    </article>
                  ))}
                </div>
              </section>
            </>
          );
        })()}
      </main>
    </>
  );
}
