import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { publicUrl, supabase } from '../lib/supabase.js';
import { categoryLabel, formatBRL, whatsappLink } from '../lib/format.js';
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
          <button className="lb-btn" onClick={() => setZoom((z) => !z)}>
            {zoom ? 'Reduzir' : 'Ampliar'}
          </button>
          <button className="lb-btn" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
      </div>
      <div className="lb-scroll">
        <img
          src={urls[i]}
          alt={name}
          className={zoom ? 'zoomed' : ''}
          onClick={() => setZoom((z) => !z)}
        />
      </div>
      {urls.length > 1 && (
        <div className="lb-nav">
          <button className="lb-btn" onClick={() => go(-1)} aria-label="Imagem anterior">
            ‹
          </button>
          <button className="lb-btn" onClick={() => go(1)} aria-label="Próxima imagem">
            ›
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProductPage() {
  const { id } = useParams();
  const { settings } = useSettings();
  const [state, setState] = useState({ status: 'loading' });
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    setActive(0);
    supabase
      .from('products')
      .select('id, name, price_cents, category, available, description, olfactory_family, olfactory_notes, top_notes, heart_notes, base_notes, product_images(path, position)')
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

  if (state.status === 'loading')
    return (
      <>
        {header}
        <Spinner />
      </>
    );

  if (state.status !== 'ok')
    return (
      <>
        {header}
        <div className="center-msg">
          <p>
            {state.status === 'error'
              ? 'Não foi possível carregar o produto. Tente novamente.'
              : 'Produto não encontrado.'}
          </p>
          <Link className="btn" to="/">
            Ver catálogo
          </Link>
        </div>
      </>
    );

  const { product, urls } = state;
  const link = product.available ? whatsappLink(settings.whatsapp, product) : null;

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
            <div className="gallery-main static">
              <Placeholder />
            </div>
          )}
          {urls.length > 1 && (
            <div className="thumbs">
              {urls.map((u, idx) => (
                <button
                  key={u}
                  className={`thumb ${idx === active ? 'active' : ''}`}
                  onClick={() => setActive(idx)}
                  aria-label={`Ver imagem ${idx + 1}`}
                >
                  <img src={u} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="info">
          <p className="eyebrow">{categoryLabel(product.category)}</p>
          <h1 className="serif product-name">{product.name}</h1>
          <p className="product-price">{formatBRL(product.price_cents)}</p>
          <p className={`status ${product.available ? 'ok' : 'off'}`}>
            {product.available ? 'Disponível' : 'Indisponível'}
          </p>

          {product.description?.trim() && <section className="product-detail"><h2>Descrição</h2><p>{product.description}</p></section>}
          {[['olfactory_family', 'Família olfativa'], ['olfactory_notes', 'Notas olfativas'], ['top_notes', 'Notas de saída'], ['heart_notes', 'Notas de coração'], ['base_notes', 'Notas de fundo']].some(([key]) => product[key]?.trim()) && (
            <section className="product-detail"><h2>Notas olfativas</h2><dl>{[['olfactory_family', 'Família olfativa'], ['olfactory_notes', 'Notas principais'], ['top_notes', 'Saída'], ['heart_notes', 'Coração'], ['base_notes', 'Fundo']].map(([key, label]) => product[key]?.trim() && <div key={key}><dt>{label}</dt><dd>{product[key]}</dd></div>)}</dl></section>
          )}

          {!product.available && <p className="muted">Este produto está indisponível no momento.</p>}
          {product.available && link && (
            <a className="btn wa" href={link} target="_blank" rel="noopener noreferrer">
              Pedir pelo WhatsApp
            </a>
          )}
          {product.available && !link && (
            <p className="muted">Pedidos pelo WhatsApp em breve.</p>
          )}
        </div>
      </main>
      {open && <Lightbox urls={urls} start={active} name={product.name} onClose={() => setOpen(false)} />}
    </>
  );
}
