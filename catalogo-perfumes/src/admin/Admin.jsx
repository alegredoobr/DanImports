import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { Brand, Spinner } from '../components/Common.jsx';
import ProductList from './ProductList.jsx';
import ProductEditor from './ProductEditor.jsx';
import Settings from './Settings.jsx';
import Affiliates from './Affiliates.jsx';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setBusy(false);
      setError(
        err.status === 400 || /invalid/i.test(err.message)
          ? 'E-mail ou senha incorretos.'
          : 'Não foi possível entrar. Verifique sua conexão e tente novamente.',
      );
    }
    // Em caso de sucesso o guard detecta a sessão e troca a tela.
  }

  return (
    <form className="login" onSubmit={submit}>
      <h1 className="serif">Área administrativa</h1>
      <p className="muted" style={{ marginBottom: 20 }}>Acesso exclusivo do administrador.</p>
      {error && <div className="error-box">{error}</div>}
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="pw">Senha</label>
        <input id="pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <button className="btn" style={{ width: '100%' }} disabled={busy}>
        {busy ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}

function Denied() {
  return (
    <div className="login">
      <h1 className="serif">Sem permissão</h1>
      <p>Esta conta não é de administrador. Entre com a conta correta.</p>
      <button className="btn ghost" onClick={() => supabase.auth.signOut()}>
        Sair
      </button>
    </div>
  );
}

function Guard({ children }) {
  const [status, setStatus] = useState('loading'); // loading | out | denied | admin

  useEffect(() => {
    let alive = true;
    async function check(session) {
      if (!session) return alive && setStatus('out');
      const { data } = await supabase.rpc('is_admin');
      if (alive) setStatus(data === true ? 'admin' : 'denied');
    }
    supabase.auth.getSession().then(({ data }) => check(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // adiado para não chamar o Supabase dentro do próprio callback de autenticação
      setTimeout(() => check(session), 0);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  if (status === 'loading') return <Spinner />;
  if (status === 'out') return <Login />;
  if (status === 'denied') return <Denied />;
  return children;
}

function Layout() {
  return (
    <>
      <div className="admin-bar">
        <div className="admin-bar-top">
          <Brand small />
          <div style={{ display: 'flex', gap: 8 }}>
            <a className="btn ghost small" href="/" target="_blank" rel="noopener noreferrer">
              Ver vitrine
            </a>
            <button className="btn ghost small" onClick={() => supabase.auth.signOut()}>
              Sair
            </button>
          </div>
        </div>
        <nav className="admin-tabs">
          <NavLink end to="/admin" className={({ isActive }) => `admin-tab ${isActive ? 'active' : ''}`}>
            Produtos
          </NavLink>
          <NavLink to="/admin/influenciadores" className={({ isActive }) => `admin-tab ${isActive ? 'active' : ''}`}>
            Influenciadores & cupons
          </NavLink>
          <NavLink to="/admin/configuracoes" className={({ isActive }) => `admin-tab ${isActive ? 'active' : ''}`}>
            Configurações
          </NavLink>
        </nav>
      </div>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}

export default function Admin() {
  return (
    <Guard>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ProductList />} />
          <Route path="produto/novo" element={<ProductEditor />} />
          <Route path="produto/:id" element={<ProductEditor />} />
          <Route path="influenciadores" element={<Affiliates />} />
          <Route path="importar" element={<Navigate to="/admin" replace />} />
          <Route path="configuracoes" element={<Settings />} />
        </Route>
      </Routes>
    </Guard>
  );
}
