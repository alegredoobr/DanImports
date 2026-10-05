import { useEffect, useState } from 'react';
import entries from '../data/photo-import.json';
import { BUCKET, supabase } from '../lib/supabase.js';
import { DETAIL_FIELDS, DETAIL_LABELS, matchProduct, importEntry } from '../lib/photoImport.mjs';
import { Spinner } from '../components/Common.jsx';

export default function PhotoImport() {
  const [products, setProducts] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState({});
  const [onlyReview, setOnlyReview] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.from('products').select(`id, slug, name, ${DETAIL_FIELDS.join(',')}`).order('name').then(({ data, error: err }) => {
      if (!alive) return;
      if (err) { setError(`Não foi possível carregar. Execute primeiro supabase/03_descriptions.sql no SQL Editor e tente novamente. Detalhe: ${err.message}`); }
      else {
        setProducts(data);
        setRows(entries.map(entry => {
          const productId = matchProduct(entry, data);
          return { ...entry, productId, selected: !!productId && !entry.review, overwrite: false };
        }));
      }
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);
  const edit = (key, patch) => setRows(list => list.map(r => r.key === key ? { ...r, ...patch } : r));
  const selected = rows.filter(r => r.selected && r.productId);
  async function run() {
    if (busy || !selected.length) return;
    setBusy(true); setError('');
    let ok = 0, failures = 0;
    for (const [i, row] of selected.entries()) {
      setProgress(`${i + 1} de ${selected.length}: ${row.source_name}`);
      try {
        const message = await importEntry(supabase, BUCKET, row);
        setResults(prev => ({ ...prev, [row.key]: { ok: true, message } }));
        edit(row.key, { selected: false }); ok++;
      } catch (err) {
        setResults(prev => ({ ...prev, [row.key]: { ok: false, message: `Falhou: ${err.message || String(err)}. Pode tentar novamente; campos e fotos já concluídos serão mantidos.` } }));
        failures++;
      }
    }
    setProgress(`Importação encerrada: ${ok} concluído(s), ${failures} com erro.`);
    const { data } = await supabase.from('products').select(`id, slug, name, ${DETAIL_FIELDS.join(',')}`).order('name');
    if (data) setProducts(data);
    setBusy(false);
  }
  if (loading) return <Spinner />;
  if (error && !rows.length) return <div className="error-box" role="alert">{error}</div>;
  return <>
    <h1 className="serif">Importar fotos e descrições</h1>
    <p>Confira o perfume de cada foto. Foram reunidas 64 artes de 63 produtos ou versões; 16 fotos repetidas e uma foto geral do estoque ficaram fora da importação.</p>
    <p className="muted">Os textos foram escritos a partir das imagens enviadas. Só aparecem as notas que estão legíveis nas artes. Preços, categorias e fotos existentes são preservados. As novas fotos entram no final da galeria.</p>
    <div className="panel">
      <label className="check"><input type="checkbox" checked={onlyReview} onChange={e => setOnlyReview(e.target.checked)} /><span>Mostrar somente casos para revisar</span></label>
      <p>Selecionados: {selected.length}. Casos duvidosos começam desmarcados.</p>
      <button type="button" className="btn ghost small" disabled={busy} onClick={() => setRows(list => list.map(r => ({ ...r, selected: false })))}>Desmarcar todos</button>
      <p className="hint">Produtos que não estão na lista devem ser cadastrados na aba Produtos. Depois volte aqui e escolha o cadastro correto. Confira também nomes de versões, como Gold Edition e Tropical.</p>
    </div>
    {rows.filter(r => !onlyReview || r.review || !r.productId).map(row => {
      const current = products.find(p => p.id === row.productId);
      const conflicts = DETAIL_FIELDS.filter(key => row[key]?.trim() && current?.[key]?.trim() && current[key] !== row[key].trim());
      const result = results[row.key];
      return <section className="panel import-card" key={row.key}>
        <div className="import-photos">{row.files.map(file => <a href={file} target="_blank" rel="noreferrer" key={file}><img src={file} alt={row.source_name} loading="lazy" /></a>)}</div>
        <div>
          <h2>{row.source_name}</h2>
          {row.review && <p className="import-warning">{row.review}</p>}
          <label className="field"><span>Adicionar ao produto</span><select aria-label={`Produto para ${row.source_name}`} disabled={busy} value={row.productId} onChange={e => edit(row.key, { productId: e.target.value, selected: false, overwrite: false })}><option value="">Escolha o produto correto</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="check"><input type="checkbox" disabled={busy || !row.productId} checked={row.selected} onChange={e => edit(row.key, { selected: e.target.checked })} /><span>Importar para este produto</span></label>
          <details><summary>Conferir e editar descrição e notas</summary>
            {DETAIL_FIELDS.map((key, i) => <div className="field" key={key}><label htmlFor={`${row.key}-${key}`}>{DETAIL_LABELS[i]}</label><textarea id={`${row.key}-${key}`} rows={key === 'description' ? 3 : 2} disabled={busy} maxLength={3000} value={row[key]} onChange={e => edit(row.key, { [key]: e.target.value })} /></div>)}
          </details>
          {conflicts.length > 0 && <>
            <p className="import-warning">Já existe conteúdo diferente em: {conflicts.map(k => DETAIL_LABELS[DETAIL_FIELDS.indexOf(k)]).join(', ')}. Ele será preservado.</p>
            <details><summary>Ver conteúdo atual</summary>{conflicts.map(k => <p key={k}><strong>{DETAIL_LABELS[DETAIL_FIELDS.indexOf(k)]}:</strong> {current[k]}</p>)}</details>
          </>}
          <label className="check"><input type="checkbox" disabled={busy} checked={row.overwrite} onChange={e => edit(row.key, { overwrite: e.target.checked })} /><span>Substituir textos já preenchidos pelos textos acima</span></label>
          {result && <p role="status" className={`import-result ${result.ok ? '' : 'import-warning'}`}>{result.message}</p>}
        </div>
      </section>;
    })}
    <div className="sticky-save"><button className="btn" disabled={busy || !selected.length} onClick={run}>{busy ? 'Importando… mantenha esta página aberta' : `Importar ${selected.length} selecionado(s)`}</button></div>
    {progress && <p role="status" aria-live="polite">{progress}</p>}
  </>;
}
