import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Brand, Spinner } from '../components/Common.jsx';
import { formatBRL } from '../lib/format.js';

const labels = {
  pending: 'Aguardando checkout',
  checkout_created: 'Aguardando pagamento',
  paid: 'Pagamento confirmado',
  cancelled: 'Pagamento cancelado',
  expired: 'Checkout expirado',
  failed: 'Falha no pagamento',
};

export default function OrderPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/orders/status?id=${encodeURIComponent(id)}`);
        const data = await response.json();
        if (!alive) return;
        if (!response.ok) throw new Error(data?.error || 'Erro');
        setState({ status: 'ok', order: data });
      } catch {
        if (alive) setState({ status: 'error' });
      }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [id]);

  return (
    <>
      <header className="topbar"><Brand /></header>
      <main className="page narrow">
        {state.status === 'loading' && <Spinner />}
        {state.status === 'error' && (
          <div className="center-msg">
            <p>Não foi possível consultar este pedido.</p>
            <Link className="btn" to="/">Voltar ao catálogo</Link>
          </div>
        )}
        {state.status === 'ok' && (
          <div className="panel order-confirmation">
            <p className="eyebrow">Pedido</p>
            <h1 className="serif">#{id.split('-')[0].toUpperCase()}</h1>
            <div className={`order-big-status ${state.order.status}`}>
              {labels[state.order.status] || state.order.status}
            </div>

            {params.get('retorno') === 'sucesso' && state.order.status !== 'paid' && (
              <p className="muted">O checkout foi concluído. Estamos aguardando a confirmação do Asaas.</p>
            )}

            <div className="order-summary-items">
              {state.order.items.map((item, index) => (
                <div key={index}>
                  <span>{item.quantity}x {item.product_name}{item.volume_ml ? ` — ${item.volume_ml} ml` : ''}</span>
                </div>
              ))}
            </div>

            <p className="order-total">Total: <strong>{formatBRL(state.order.totalCents)}</strong></p>

            {state.order.status === 'paid' && (
              <p>Pagamento confirmado. Seu pedido já pode seguir para preparação.</p>
            )}

            <Link className="btn ghost" to="/">Voltar ao catálogo</Link>
          </div>
        )}
      </main>
    </>
  );
}
