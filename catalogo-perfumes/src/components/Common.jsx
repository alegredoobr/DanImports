import { publicUrl } from '../lib/supabase.js';
import { useSettings } from '../lib/settings.jsx';

export function Placeholder() {
  return (
    <div className="placeholder" aria-label="Foto em breve">
      <svg viewBox="0 0 64 64" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="26" y="8" width="12" height="9" rx="1.5" />
        <path d="M22 21h20a4 4 0 0 1 4 4v25a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V25a4 4 0 0 1 4-4z" />
        <path d="M24 34h16" opacity=".5" />
      </svg>
      <span>Foto em breve</span>
    </div>
  );
}

export function ProductImage({ path, alt }) {
  if (!path) return <Placeholder />;
  return <img src={publicUrl(path)} alt={alt} loading="lazy" decoding="async" />;
}

export function Brand({ small }) {
  const { settings } = useSettings();
  return (
    <div className={`brand ${small ? 'small' : ''}`}>
      {settings.logo_path && <img className="brand-logo" src={publicUrl(settings.logo_path)} alt="" />}
      <span className="brand-name">{settings.store_name}</span>
    </div>
  );
}

export function Spinner({ label = 'Carregando…' }) {
  return (
    <div className="center-msg" role="status">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  );
}
