import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { coverPath, supabase } from '../lib/supabase.js';
import { CATEGORIES, categoryLabel, centsToInput, formatBRL, normalize, parsePriceToCents } from '../lib/format.js';
import { ProductImage, Spinner } from '../components/Common.jsx';
import { useToast } from '../components/Toast.jsx';

function PriceCell({ product, onSaved }) {
  const toast = useToast();
  const [value, setValue] = useState(centsToInput(product.price_cents));
  const [busy, setBusy] = useState(false);

  useEffect(() => setValue(centsToInput(product.price_cents)), [product.price_cents]);

  async function commit() {
    const cents = parsePriceToCents(value);
    if (cents === null) {
      toast('Preço inválido. Use um formato como 350,00.', 'error');
      setValue(centsToInput(product.price_cents));
      return;
    }
    if (cents === product.price_cents) return setValue(centsToInput(cents));
    setBusy(true);
    const { error } = await supabase.from('products').update({ price_cents: cents }).eq('id', product.id);
    setBusy(false);
    if (error) {
      toast('Não foi possível salvar o preço. Tente novamente.', 'error');
      setValue(centsToInput(product.price_cents));
      return;
    }
    onSaved({ price_cents: cents });
    toast(`Preço de ${product.name} atualizado para ${formatBRL(cents)}.`);
  }

  return (
    <label className="toggle">
      R$
      <input
        className={`price-input ${busy ? 'saving' : ''}`}
        inputMode="decimal"
        aria-label={`Preço de ${product.name}`}
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  );
}

export default function ProductList() {
  const toast = useToast();
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('todos');

  const load = useCallback(async () => {
    setError('');
    const { data, error: err } = await supabase
      .from('products')
      .select('id, name, price_cents, category, available, visible, product_images(path, position)')
      .order('name');
    if (err) return setError('Não foi possível carregar os produtos.');
    setProducts(data.map((p) => ({ ...p, cover: coverPath(p.product_images) })));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (id, changes) => setProducts((list) => list.map((p) => (p.id === id ? { ...p, ...changes } : p)));

  async function toggle(p, field, label) {
    const next = !p[field];
    patch(p.id, { [field]: next });
    const { error: err } = await supabase.from('products').update({ [field]: next }).eq('id', p.id);
    if (err) {
      patch(p.id, { [field]: !next });
      return toast('Não foi possível salvar a alteração. Tente novamente.', 'error');
    }
    toast(label(next));
  }

  const list = useMemo(() => {
    if (!products) return [];
    const term = normalize(q);
    return products
      .filter((p) => (cat === 'todos' || p.category === cat) && (!term || normalize(p.name).includes(term)))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  }, [products, q, cat]);

  if (error)
    return (
      <div className="center-msg">
        <p>{error}</p>
        <button className="btn" onClick={load}>
          Tentar novamente
        </button>
      </div>
    );
  if (!products) return <Spinner />;

  return (
    <>
      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Buscar produto…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filtrar por categoria">
          <option value="todos">Todas</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <Link className="btn small" to="/admin/produto/novo">
          + Novo produto
        </Link>
      </div>
      <p className="muted" style={{ margin: '0 0 10px' }}>
        {list.length} de {products.length} produtos · edite o preço direto na linha (salva ao sair do campo).
      </p>

      <div className="rows">
        {list.length === 0 && <p className="muted">Nenhum produto encontrado.</p>}
        {list.map((p) => (
          <div className={`row ${p.visible ? '' : 'hidden-item'}`} key={p.id}>
            <div className="row-thumb">
              <ProductImage path={p.cover} alt="" />
            </div>
            <div>
              <Link className="row-title" to={`/admin/produto/${p.id}`}>
                {p.name}
              </Link>
              <span className="row-sub">
                {categoryLabel(p.category)} · {p.product_images.length}{' '}
                {p.product_images.length === 1 ? 'foto' : 'fotos'}
                {!p.visible && ' · oculto'}
              </span>
            </div>
            <div className="row-controls">
              <PriceCell product={p} onSaved={(c) => patch(p.id, c)} />
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={p.available}
                  onChange={() => toggle(p, 'available', (n) => (n ? 'Marcado como disponível.' : 'Marcado como indisponível.'))}
                />
                Disponível
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={p.visible}
                  onChange={() => toggle(p, 'visible', (n) => (n ? 'Produto visível na vitrine.' : 'Produto oculto da vitrine.'))}
                />
                Visível
              </label>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
