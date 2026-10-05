import { useEffect, useRef, useState } from 'react';
import { BUCKET, publicUrl, supabase } from '../lib/supabase.js';
import { ALLOWED_TYPES, normalizeWhatsapp, validateImageFile } from '../lib/format.js';
import { useSettings } from '../lib/settings.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Settings() {
  const { settings, reload } = useSettings();
  const toast = useToast();
  const [name, setName] = useState(settings.store_name);
  const [phone, setPhone] = useState(settings.whatsapp || '');
  const [logoPath, setLogoPath] = useState(settings.logo_path);
  const [newLogo, setNewLogo] = useState(null); // { file, url }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  // se as configurações chegarem depois da tela abrir, preenche os campos
  useEffect(() => {
    setName(settings.store_name);
    setPhone(settings.whatsapp || '');
    setLogoPath(settings.logo_path);
  }, [settings]);

  useEffect(() => () => newLogo && URL.revokeObjectURL(newLogo.url), [newLogo]);

  function pickLogo(file) {
    const msg = validateImageFile(file);
    if (msg) return setError(msg);
    setError('');
    setNewLogo({ file, url: URL.createObjectURL(file) });
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Informe o nome da loja.');
    const whatsapp = normalizeWhatsapp(phone);
    if (whatsapp === null) return setError('WhatsApp inválido. Use DDD + número, por exemplo (62) 99999-9999.');

    setSaving(true);
    try {
      let path = logoPath;
      const oldPath = settings.logo_path;
      if (newLogo) {
        path = `store/${crypto.randomUUID()}.${ALLOWED_TYPES[newLogo.file.type]}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, newLogo.file, { contentType: newLogo.file.type, cacheControl: '31536000' });
        if (upErr) throw upErr;
      }
      const { error: err } = await supabase
        .from('store_settings')
        .upsert({ id: 1, store_name: name.trim(), logo_path: path, whatsapp: whatsapp || null });
      if (err) throw err;
      if (oldPath && oldPath !== path) await supabase.storage.from(BUCKET).remove([oldPath]);
      setNewLogo(null);
      await reload();
      toast('Configurações salvas.');
    } catch (err) {
      setError(`Não foi possível salvar${err?.message ? ` (${err.message})` : ''}. Tente novamente.`);
    } finally {
      setSaving(false);
    }
  }

  const preview = newLogo ? newLogo.url : publicUrl(logoPath);

  return (
    <form onSubmit={save}>
      <h1 className="serif" style={{ margin: '0 0 14px' }}>Configurações da loja</h1>
      {error && <div className="error-box" role="alert">{error}</div>}

      <section className="panel">
        <div className="field">
          <label htmlFor="store">Nome da loja</label>
          <input id="store" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        </div>

        <div className="field">
          <label htmlFor="wa">WhatsApp para pedidos</label>
          <input id="wa" type="tel" inputMode="tel" placeholder="(62) 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <span className="hint">
            DDD + número. Sem DDI, o Brasil (+55) é assumido. Deixe em branco para não mostrar o botão de pedido.
          </span>
        </div>

        <div className="field">
          <span className="lbl">Logo</span>
          <div className="logo-prev">{preview ? <img src={preview} alt="Logo" /> : <span className="muted">Sem logo</span>}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn ghost small" disabled={saving} onClick={() => fileRef.current.click()}>
              {preview ? 'Trocar logo' : 'Enviar logo'}
            </button>
            {(logoPath || newLogo) && (
              <button
                type="button"
                className="btn danger small"
                disabled={saving}
                onClick={() => {
                  setNewLogo(null);
                  setLogoPath(null);
                }}
              >
                Remover logo
              </button>
            )}
          </div>
          <span className="hint">JPG, PNG ou WebP, até 5 MB. A alteração só vale depois de salvar.</span>
          <input
            ref={fileRef}
            type="file"
            accept={Object.keys(ALLOWED_TYPES).join(',')}
            hidden
            onChange={(e) => {
              if (e.target.files[0]) pickLogo(e.target.files[0]);
              e.target.value = '';
            }}
          />
        </div>
      </section>

      <div className="sticky-save">
        <button className="btn" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar configurações'}
        </button>
      </div>
    </form>
  );
}
