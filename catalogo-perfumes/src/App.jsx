import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { isConfigured } from './lib/supabase.js';
import { SettingsProvider } from './lib/settings.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { Spinner } from './components/Common.jsx';
import Catalog from './pages/Catalog.jsx';
import ProductPage from './pages/ProductPage.jsx';
import PartnerDashboard from './pages/PartnerDashboard.jsx';
import OrderPage from './pages/OrderPage.jsx';

// O painel é carregado só quando alguém abre /admin, mantendo a vitrine leve.
const Admin = lazy(() => import('./admin/Admin.jsx'));

function SetupNotice() {
  return (
    <div className="page narrow">
      <h1 className="serif">Configuração pendente</h1>
      <p>
        Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (veja{' '}
        <code>.env.example</code>) e reinicie o app. No deploy, cadastre as duas variáveis na Vercel e
        publique novamente.
      </p>
    </div>
  );
}

export default function App() {
  if (!isConfigured) return <SetupNotice />;
  return (
    <SettingsProvider>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Catalog />} />
          <Route path="/produto/:id" element={<ProductPage />} />
          <Route path="/parceiro/:token" element={<PartnerDashboard />} />
          <Route path="/pedido/:id" element={<OrderPage />} />
          <Route
            path="/admin/*"
            element={
              <Suspense fallback={<Spinner />}>
                <Admin />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </SettingsProvider>
  );
}
