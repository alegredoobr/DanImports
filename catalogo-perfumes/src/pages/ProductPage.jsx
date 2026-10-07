import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { publicUrl, supabase } from '../lib/supabase.js';
import { categoryLabel, formatBRL, whatsappLink } from '../lib/format.js';
import { clearCouponCode, discountedCents, loadCouponCode, normalizeCouponCode, validateCoupon } from '../lib/coupons.js';
import { useSettings } from '../lib/settings.jsx';
import { Brand, Placeholder, Spinner } from '../components/Common.jsx';

function Lightbox({ urls, start, name, onClose }) {
  const [i, setI] = useState(start);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  });

  const go = (d) => {
    setZoom(false);
    setI((x) => (x + d + urls.length) % urls.length);
  };

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`Imagem de ${name}`}>
      <div className="lb-bar">
        <span className="muted-light">{urls.length > 1 ? `${i + 1} / ${urls.length}` : ''}</span>
        <div className="lb-actions">
          <button className="lb-btn" onClick={() => setZoom((z) => !z)}>{zoom ? 'Reduzir' : 'Ampliar'}</button>
          <button className="lb-btn" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
      </div>
      <div className="lb-scroll">
        <img src={urls[i]} alt={name} className={zoom ? 'zoomed' : ''} onClick={() => setZoom((z) => !z)} />
      </div>
      {urls.length > 1 && (
        <div className="lb-nav">
          <button className="lb-btn" onClick={() => go(-1)} aria-label="Imagem anterior">‹</button>
          <button className="lb-btn" onClick={() => go(1)} aria-label="Próxima imagem">›</button>
        </div>
      )}
    </div>
  );
}

export default function ProductPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { settings } = useSettings();
  const [state, setState] = useState({ status: 'loading' });
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState(null);
  const [couponMessage, setCouponMessage] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    setActive(0);
    supabase
      .from('products')
      .select('id, name, price_cents, volume_ml, category, available, description, olfactory_family, olfactory_notes, top_notes, heart_notes, base_notes, product_images(path, position)')
      .eq('id', id)
      .eq('visible', true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error && error.code !== '22P02') return setState({ status: 'error' });
        if (!data) return setState({ status: 'missing' });
        const urls = [...data.product_images]
          .sort((a, b) => a.position - b.position)
          .map((im) => publicUrl(im.path));
        setState({ status: 'ok', product: data, urls });
      });
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    const incoming = normalizeCouponCode(searchParams.get('cupom')) || loadCouponCode();
    if (!incoming) return;
    setCouponInput(incoming);
    let alive = true;
    validateCoupon(incoming).then((result) => {
      if (!alive) return;
      if (result.valid) {
        setCoupon(result.coupon);
        setCouponMessage(`Cupom ${result.coupon.code} aplicado: ${result.coupon.discount_percent.toLocaleString('pt-BR')}% de desconto.`);
      } else if (!result.setupMissing) {
        clearCouponCode();
      }
    });
    return () => {
      alive = false;
    };
  }, [searchParams]);

  async function applyCoupon(e) {
    e?.preventDefault();
    setCouponBusy(true);
    setCouponMessage('');
    const result = await validateCoupon(couponInput);
    setCouponBusy(false);
    if (!result.valid) {
      setCoupon(null);
      setCouponMessage(result.message);
      return;
    }
    setCoupon(result.coupon);
    setCouponInput(result.coupon.code);
    setCouponMessage(`Cupom ${result.coupon.code} aplicado: ${result.coupon.discount_percent.toLocaleString('pt-BR')}% de desconto.`);
  }

  function removeCoupon() {
    setCoupon(null);
    setCouponInput('');
    setCouponMessage('');
    clearCouponCode();
  }

  const header = (
    <header className="topbar">
      <Link to="/" className="back" aria-label="Voltar ao catálogo" onClick={(e) => {
        if (window.history.length > 1) {
          e.preventDefault();
          window.history.back();
        }
      }}>
        ‹ Catálogo
      </Link>
      <Brand small />
    </header>
  );

  if (state.status === 'loading') return <>{header}<Spinner /></>;

  if (state.status !== 'ok')
    return (
      <>
        {header}
        <div className="center-msg">
          <p>{state.status === 'error' ? 'Não foi possível carregar o produto. Tente novamente.' : 'Produto não encontrado.'}</p>
          <Link className="btn" to="/">Ver catálogo</Link>
        </div>
      </>
    );

  const { product, urls } = state;
  const finalPrice = coupon
    ? discountedCents(product.price_cents, coupon.discount_percent)
    : product.price_cents;
  const normalLink = product.available && !coupon ? whatsappLink(settings.whatsapp, product) : null;

  async function buyOnline() {
    if (!product.available || paymentBusy) return;
    setPaymentBusy(true);
    setPaymentError('');

    try {
      const response = await fetch('/api/asaas/create-checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [{ productId: product.id, quantity: 1 }],
          couponCode: coupon?.code || '',
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.checkoutUrl) {
        throw new Error(data?.error || 'Não foi possível iniciar o pagamento.');
      }

      window.location.href = data.checkoutUrl;
    } catch (error) {
      setPaymentError(error?.message || 'Não foi possível iniciar o pagamento.');
      setPaymentBusy(false);
    }
  }

  async function orderWithCoupon() {
    if (!coupon || !settings.whatsapp || ordering) return;
    setOrdering(true);

    const { data, error } = await supabase.rpc('create_affiliate_order', {
      p_product_id: product.id,
      p_coupon_code: coupon.code,
    });

    setOrdering(false);
    if (error) {
      setCouponMessage('Não foi possível registrar o pedido com este cupom. Tente novamente.');
      return;
    }

    const order = Array.isArray(data) ? data[0] : data;
    if (!order) {
      setCouponMessage('Não foi possível registrar o pedido com este cupom.');
      return;
    }

    const shortId = String(order.order_id).split('-')[0].toUpperCase();
    const message = [
      'Olá! Quero fazer este pedido:',
      '',
      `1x ${product.name}${product.volume_ml ? ` — ${product.volume_ml} ml` : ''}`,
      `Valor original: ${formatBRL(order.original_amount_cents)}`,
      `Cupom: ${order.coupon_code}`,
      `Desconto: -${formatBRL(order.discount_amount_cents)}`,
      '',
      `TOTAL: ${formatBRL(order.final_amount_cents)}`,
      '',
      `Código do pedido: #${shortId}`,
    ].join('\n');

    window.location.href = `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(message)}`;
  }

  return (
    <>
      {header}
      <main className="page product">
        <div className="gallery">
          {urls.length > 0 ? (
            <button className="gallery-main" onClick={() => setOpen(true)} aria-label="Ampliar imagem">
              <img src={urls[active]} alt={product.name} />
              <span className="zoom-hint">Toque para ampliar</span>
            </button>
          ) : (
            <div className="gallery-main static"><Placeholder /></div>
          )}
          {urls.length > 1 && (
            <div className="thumbs">
              {urls.map((u, idx) => (
                <button key={u} className={`thumb ${idx === active ? 'active' : ''}`} onClick={() => setActive(idx)} aria-label={`Ver imagem ${idx + 1}`}>
                  <img src={u} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="info">
          <p className="eyebrow">{categoryLabel(product.category)}</p>
          <h1 className="serif product-name">{product.name}</h1>
          {product.volume_ml && <p className="product-volume">{product.volume_ml} ml</p>}
          {coupon ? (
            <div className="coupon-price">
              <span className="old-price">{formatBRL(product.price_cents)}</span>
              <p className="product-price">{formatBRL(finalPrice)}</p>
              <span className="discount-pill">{coupon.discount_percent.toLocaleString('pt-BR')}% OFF</span>
            </div>
          ) : (
            <p className="product-price">{formatBRL(product.price_cents)}</p>
          )}
          <p className={`status ${product.available ? 'ok' : 'off'}`}>{product.available ? 'Disponível' : 'Indisponível'}</p>

          {product.available && (
            <section className="coupon-box">
              <div className="coupon-box-head">
                <div>
                  <strong>Tem cupom de desconto?</strong>
                  <p>Use o código do seu influenciador.</p>
                </div>
                {coupon && <button className="coupon-remove" onClick={removeCoupon}>Remover</button>}
              </div>
              <form className="coupon-form" onSubmit={applyCoupon}>
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(normalizeCouponCode(e.target.value))}
                  placeholder="Ex.: ANA10"
                  maxLength={30}
                  aria-label="Cupom de desconto"
                />
                <button className="btn small" disabled={couponBusy}>{couponBusy ? 'Validando…' : 'Aplicar'}</button>
              </form>
              {couponMessage && <p className={`coupon-message ${coupon ? 'success' : ''}`}>{couponMessage}</p>}
            </section>
          )}

          {product.description?.trim() && <section className="product-detail"><h2>Descrição</h2><p>{product.description}</p></section>}
          {[['olfactory_family', 'Família olfativa'], ['olfactory_notes', 'Notas olfativas'], ['top_notes', 'Notas de saída'], ['heart_notes', 'Notas de coração'], ['base_notes', 'Notas de fundo']].some(([key]) => product[key]?.trim()) && (
            <section className="product-detail"><h2>Notas olfativas</h2><dl>{[['olfactory_family', 'Família olfativa'], ['olfactory_notes', 'Notas principais'], ['top_notes', 'Saída'], ['heart_notes', 'Coração'], ['base_notes', 'Fundo']].map(([key, label]) => product[key]?.trim() && <div key={key}><dt>{label}</dt><dd>{product[key]}</dd></div>)}</dl></section>
          )}

          {!product.available && <p className="muted">Este produto está indisponível no momento.</p>}

          {product.available && (
            <div className="payment-actions">
              <button className="btn pay" onClick={buyOnline} disabled={paymentBusy}>
                {paymentBusy ? 'Abrindo pagamento…' : `Comprar online por ${formatBRL(finalPrice)}`}
              </button>
              <p className="payment-note">Pagamento seguro pelo Asaas · Pix ou cartão</p>
              {paymentError && <p className="coupon-message">{paymentError}</p>}
            </div>
          )}

          {product.available && coupon && settings.whatsapp && (
            <button className="btn wa" onClick={orderWithCoupon} disabled={ordering}>
              {ordering ? 'Preparando pedido…' : `Pedir por ${formatBRL(finalPrice)} no WhatsApp`}
            </button>
          )}
          {product.available && !coupon && normalLink && (
            <a className="btn wa" href={normalLink} target="_blank" rel="noopener noreferrer">Pedir pelo WhatsApp</a>
          )}
          {product.available && !settings.whatsapp && <p className="muted">Pedidos pelo WhatsApp em breve.</p>}
        </div>
      </main>
      {open && <Lightbox urls={urls} start={active} name={product.name} onClose={() => setOpen(false)} />}
    </>
  );
}
