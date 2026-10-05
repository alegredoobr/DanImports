import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BUCKET, publicUrl, supabase } from '../lib/supabase.js';
import {
  ALLOWED_TYPES,
  CATEGORIES,
  centsToInput,
  makeSlug,
  parsePriceToCents,
  validateImageFile,
} from '../lib/format.js';
import { Spinner } from '../components/Common.jsx';
import { useToast } from '../components/Toast.jsx';

const EMPTY = { name: '', price: '', category: 'masculino', available: true, visible: true, description: '', olfactory_family: '', olfactory_notes: '', top_notes: '', heart_notes: '', base_notes: '' };
const ACCEPT = Object.keys(ALLOWED_TYPES).join(',');

export default function ProductEditor() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState(EMPTY);
  // items: { key, id?, path?, url, file?, oldPath? }  — a ordem do array é a ordem das fotos
  const [items, setItems] = useState([]);
  const [removed, setRemoved] = useState([]); // { id, path }
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const addRef = useRef(null);
  const replaceRef = useRef(null);
  const replaceKey = useRef(null);

  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    setLoadError('');
    const { data, error: err } = await supabase
      .from('products')
      .select('id, name, price_cents, category, available, visible, description, olfactory_family, olfactory_notes, top_notes, heart_notes, base_notes, product_images(id, path, position)')
      .eq('id', id)
      .maybeSingle();
    setLoading(false);
    if (err) return setLoadError('Não foi possível carregar o produto.');
    if (!data) return setLoadError('Produto não encontrado.');
    setForm({
      name: data.name,
      description: data.description || '',
      olfactory_family: data.olfactory_family || '',
      olfactory_notes: data.olfactory_notes || '',
      top_notes: data.top_notes || '',
      heart_notes: data.heart_notes || '',
      base_notes: data.base_notes || '',

      price: centsToInput(data.price_cents),
      category: data.category,
      available: data.available,
      visible: data.visible,
    });
    setItems(
      [...data.product_images]
        .sort((a, b) => a.position - b.position)
        .map((im) => ({ key: im.id, id: im.id, path: im.path, url: publicUrl(im.path) })),
    );
    setRemoved([]);
  }, [id, isNew]);

  useEffect(() => {
    load();
  }, [load]);

  // libera as pré-visualizações locais ao sair da tela
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(
    () => () => itemsRef.current.forEach((it) => it.file && URL.revokeObjectURL(it.url)),
    [],
  );

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  function addFiles(fileList) {
    const problems = [];
    const added = [];
    for (const file of fileList) {
      const msg = validateImageFile(file);
      if (msg) problems.push(msg);
      else added.push({ key: crypto.randomUUID(), file, url: URL.createObjectURL(file) });
    }
    if (added.length) setItems((list) => [...list, ...added]);
    setError(problems.join('\n'));
  }

  function replaceFile(file) {
    const msg = validateImageFile(file);
    if (msg) return setError(msg);
    setError('');
    setItems((list) =>
      list.map((it) => {
        if (it.key !== replaceKey.current) return it;
        if (it.file) URL.revokeObjectURL(it.url);
        return { ...it, file, url: URL.createObjectURL(file), oldPath: it.oldPath || it.path };
      }),
    );
  }

  function removeItem(item) {
    if (item.file) URL.revokeObjectURL(item.url);
    if (item.id) setRemoved((r) => [...r, { id: item.id, path: item.oldPath || item.path }]);
    setItems((list) => list.filter((it) => it.key !== item.key));
  }

  const move = (index, delta) =>
    setItems((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const makePrimary = (index) =>
    setItems((list) => [list[index], ...list.filter((_, i) => i !== index)]);

  async function syncImages(productId) {
    if (removed.length) {
      const { error: err } = await supabase
        .from('product_images')
        .delete()
        .in('id', removed.map((r) => r.id));
      if (err) throw err;
      const paths = removed.map((r) => r.path).filter(Boolean);
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths); // órfãos não são críticos
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let path = it.path;
      if (it.file) {
        path = `${productId}/${crypto.randomUUID()}.${ALLOWED_TYPES[it.file.type]}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, it.file, { contentType: it.file.type, cacheControl: '31536000' });
        if (upErr) throw upErr;
      }
      if (it.id) {
        const { error: err } = await supabase.from('product_images').update({ path, position: i }).eq('id', it.id);
        if (err) throw err;
        if (it.file && it.oldPath) await supabase.storage.from(BUCKET).remove([it.oldPath]);
      } else {
        const { error: err } = await supabase
          .from('product_images')
          .insert({ product_id: productId, path, position: i });
        if (err) throw err;
      }
    }
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    const name = form.name.trim();
    if (!name) return setError('Informe o nome do produto.');
    const cents = parsePriceToCents(form.price);
    if (cents === null) return setError('Preço inválido. Use um formato como 350,00.');

    setSaving(true);
    let productId = id;
    try {
      const payload = {
        name,
        description: form.description.trim(),
        olfactory_family: form.olfactory_family.trim(),
        olfactory_notes: form.olfactory_notes.trim(),
        top_notes: form.top_notes.trim(),
        heart_notes: form.heart_notes.trim(),
        base_notes: form.base_notes.trim(),
        price_cents: cents,
        category: form.category,
        available: form.available,
        visible: form.visible,
      };
      if (isNew) {
        const { data, error: err } = await supabase
          .from('products')
          .insert({ ...payload, slug: makeSlug(name) })
          .select('id')
          .single();
        if (err) throw err;
        productId = data.id;
      } else {
        const { error: err } = await supabase.from('products').update(payload).eq('id', productId);
        if (err) throw err;
      }
      await syncImages(productId);
      toast('Produto salvo com sucesso.');
      if (isNew) nav(`/admin/produto/${productId}`, { replace: true });
      else await load();
    } catch (err) {
      const detail = err?.message ? ` (${err.message})` : '';
      if (isNew && productId) {
        // o produto foi criado; só as fotos falharam — segue para a edição para tentar de novo
        toast(`Produto criado, mas houve erro ao enviar as fotos${detail}. Envie-as novamente.`, 'error');
        nav(`/admin/produto/${productId}`, { replace: true });
      } else {
        setError(`Não foi possível salvar${detail}. Tente novamente.`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct() {
    if (!window.confirm(`Excluir "${form.name}" definitivamente? Para só esconder da vitrine, use "Visível". Esta ação não pode ser desfeita.`))
      return;
    setDeleting(true);
    const paths = [...items.map((it) => it.path), ...removed.map((r) => r.path)].filter(Boolean);
    const { error: err } = await supabase.from('products').delete().eq('id', id);
    if (err) {
      setDeleting(false);
      return setError('Não foi possível excluir o produto.');
    }
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    toast('Produto excluído.');
    nav('/admin', { replace: true });
  }

  if (loading) return <Spinner />;
  if (loadError)
    return (
      <div className="center-msg">
        <p>{loadError}</p>
        <Link className="btn" to="/admin">
          Voltar
        </Link>
      </div>
    );

  const busy = saving || deleting;

  return (
    <form onSubmit={save}>
      <p style={{ margin: '0 0 10px' }}>
        <Link className="back" to="/admin">
          ‹ Produtos
        </Link>
      </p>
      <h1 className="serif" style={{ margin: '0 0 14px' }}>
        {isNew ? 'Novo produto' : 'Editar produto'}
      </h1>

      {error && <div className="error-box" role="alert">{error}</div>}

      <section className="panel">
        <h2>Dados</h2>
        <div className="field">
          <label htmlFor="name">Nome</label>
          <input id="name" type="text" value={form.name} onChange={set('name')} maxLength={200} required />
        </div>
        <div className="two-col">
          <div className="field">
            <label htmlFor="price">Preço (R$)</label>
            <input id="price" type="text" inputMode="decimal" placeholder="350,00" value={form.price} onChange={set('price')} required />
          </div>
          <div className="field">
            <label htmlFor="cat">Categoria</label>
            <select id="cat" value={form.category} onChange={set('category')}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={form.available} onChange={set('available')} />
          <span>Disponível (desmarque para mostrar “Indisponível”)</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={form.visible} onChange={set('visible')} />
          <span>Visível na vitrine (desmarque para ocultar sem excluir)</span>
        </label>
      </section>

      <section className="panel">
        <h2>Descrição e notas olfativas</h2>
        <div className="field">
          <label htmlFor="description">Descrição</label>
          <textarea id="description" rows={3} maxLength={3000} value={form.description} onChange={set('description')} />
        </div>
        <div className="field">
          <label htmlFor="olfactory_family">Família olfativa</label>
          <textarea id="olfactory_family" rows={2} maxLength={3000} value={form.olfactory_family} onChange={set('olfactory_family')} />
        </div>
        <div className="field">
          <label htmlFor="olfactory_notes">Notas olfativas gerais</label>
          <textarea id="olfactory_notes" rows={2} maxLength={3000} value={form.olfactory_notes} onChange={set('olfactory_notes')} />
        </div>
        <div className="field">
          <label htmlFor="top_notes">Notas de saída</label>
          <textarea id="top_notes" rows={2} maxLength={3000} value={form.top_notes} onChange={set('top_notes')} />
        </div>
        <div className="field">
          <label htmlFor="heart_notes">Notas de coração</label>
          <textarea id="heart_notes" rows={2} maxLength={3000} value={form.heart_notes} onChange={set('heart_notes')} />
        </div>
        <div className="field">
          <label htmlFor="base_notes">Notas de fundo</label>
          <textarea id="base_notes" rows={2} maxLength={3000} value={form.base_notes} onChange={set('base_notes')} />
        </div>
        <p className="hint">Preencha apenas as informações conhecidas. Os campos vazios não aparecem na vitrine.</p>
      </section>

      <section className="panel">
        <h2>Fotos</h2>
        <p className="hint" style={{ marginTop: -6 }}>
          JPG, PNG ou WebP, até 5 MB cada. A primeira foto é a principal. As novas aparecem aqui antes de
          salvar e só são enviadas ao tocar em “Salvar”.
        </p>
        <div className="img-list">
          {items.length === 0 && <p className="muted">Nenhuma foto ainda — o catálogo mostra um espaço reservado.</p>}
          {items.map((it, i) => (
            <div className="img-item" key={it.key}>
              <div className="prev">
                <img src={it.url} alt={`Foto ${i + 1}`} />
              </div>
              <div className="img-meta">
                <div className="img-tags">
                  {i === 0 && <span className="tag gold">Principal</span>}
                  {it.file && <span className="tag new">{it.id ? 'Substituição pendente' : 'Nova — não salva'}</span>}
                </div>
                <div className="img-btns">
                  <button type="button" className="btn ghost small" disabled={i === 0 || busy} onClick={() => move(i, -1)} aria-label="Mover para cima">↑</button>
                  <button type="button" className="btn ghost small" disabled={i === items.length - 1 || busy} onClick={() => move(i, 1)} aria-label="Mover para baixo">↓</button>
                  {i !== 0 && (
                    <button type="button" className="btn ghost small" disabled={busy} onClick={() => makePrimary(i)}>
                      Tornar principal
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn ghost small"
                    disabled={busy}
                    onClick={() => {
                      replaceKey.current = it.key;
                      replaceRef.current.click();
                    }}
                  >
                    Substituir
                  </button>
                  <button type="button" className="btn danger small" disabled={busy} onClick={() => removeItem(it)}>
                    Remover
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => addRef.current.click()}>
          + Adicionar fotos
        </button>
        <input
          ref={addRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            addFiles([...e.target.files]);
            e.target.value = '';
          }}
        />
        <input
          ref={replaceRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            if (e.target.files[0]) replaceFile(e.target.files[0]);
            e.target.value = '';
          }}
        />
      </section>

      <div className="sticky-save">
        <button className="btn" disabled={busy}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      {!isNew && (
        <p style={{ textAlign: 'center', marginTop: 24 }}>
          <button type="button" className="btn danger small" disabled={busy} onClick={deleteProduct}>
            {deleting ? 'Excluindo…' : 'Excluir produto'}
          </button>
        </p>
      )}
    </form>
  );
}
