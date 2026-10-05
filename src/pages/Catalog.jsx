import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { coverPath, supabase } from '../lib/supabase.js';
import { CATEGORIES, formatBRL, normalize } from '../lib/format.js';
import { Brand, ProductImage } from '../components/Common.jsx';

// Cache em memória: ao voltar da página do produto a lista aparece na hora
// (mantendo a rolagem) e é atualizada em segundo plano.
let cache = null;

const SORTS = {
  nome: (a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
  menor: (a, b) => a.price_cents - b.price_cents || SORTS.nome(a, b),
  maior: (a, b) => b.price_cents - a.price_cents || SORTS.nome(a, b),
};

function Skeletons() {
  return (
    <div className="grid" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div className="card skeleton" key={i}>
          <div className="card-img" />
          <div className="card-body">
            <div className="sk-line" />
            <div className="sk-line short" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const cat = params.get('cat') || 'todos';
  const sort = SORTS[params.get('ordem')] ? params.get('ordem') : 'nome';

  const [products, setProducts] = useState(cache);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const { data, error: err } = await supabase
      .from('products')
      .select('id, name, price_cents, category, available, product_images(path, position)')
      .eq('visible', true);
    if (err) {
      setError('Não foi possível carregar o catálogo. Verifique sua conexão e tente novamente.');
      return;
    }
    cache = data.map((p) => ({ ...p, cover: coverPath(p.product_images) }));
    setProducts(cache);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setParam = (key, value, def) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!value || value === def) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const list = useMemo(() => {
    if (!products) return [];
    const term = normalize(q);
    return products
      .filter((p) => (cat === 'todos' || p.category === cat) && (!term || normalize(p.name).includes(term)))
      .sort(SORTS[sort]);
  }, [products, q, cat, sort]);

  return (
    <>
      <header className="topbar">
        <Brand />
      </header>

      <div className="controls">
        <input
          className="search"
          type="search"
          inputMode="search"
          placeholder="Buscar perfume…"
          aria-label="Buscar pelo nome do produto"
          value={q}
          onChange={(e) => setParam('q', e.target.value, '')}
        />
        <div className="chips" role="tablist" aria-label="Categorias">
          {[{ value: 'todos', label: 'Todos' }, ...CATEGORIES].map((c) => (
            <button
              key={c.value}
              role="tab"
              aria-selected={cat === c.value}
              className={`chip ${cat === c.value ? 'active' : ''}`}
              onClick={() => setParam('cat', c.value, 'todos')}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="sort-row">
          <span className="muted">{products ? `${list.length} ${list.length === 1 ? 'item' : 'itens'}` : ''}</span>
          <label className="sort">
            Ordenar
            <select value={sort} onChange={(e) => setParam('ordem', e.target.value, 'nome')}>
              <option value="nome">Nome (A–Z)</option>
              <option value="menor">Menor preço</option>
              <option value="maior">Maior preço</option>
            </select>
          </label>
        </div>
      </div>

      <main className="page">
        {error && !products && (
          <div className="center-msg">
            <p>{error}</p>
            <button className="btn" onClick={load}>
              Tentar novamente
            </button>
          </div>
        )}
        {!products && !error && <Skeletons />}
        {products && list.length === 0 && (
          <div className="center-msg">
            <p>
              {products.length === 0
                ? 'Nenhum produto disponível no momento.'
                : 'Nenhum produto encontrado para essa busca.'}
            </p>
            {(q || cat !== 'todos') && (
              <button className="btn ghost" onClick={() => setParams({}, { replace: true })}>
                Limpar filtros
              </button>
            )}
          </div>
        )}
        {products && list.length > 0 && (
          <div className="grid">
            {list.map((p) => (
              <Link to={`/produto/${p.id}`} className={`card ${p.available ? '' : 'unavailable'}`} key={p.id}>
                <div className="card-img">
                  <ProductImage path={p.cover} alt={p.name} />
                  {!p.available && <span className="badge">Indisponível</span>}
                </div>
                <div className="card-body">
                  <h2 className="card-name">{p.name}</h2>
                  <p className="card-price">{formatBRL(p.price_cents)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
