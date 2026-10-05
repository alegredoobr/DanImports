import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase.js';

const DEFAULTS = { store_name: 'Catálogo de Perfumes', logo_path: null, whatsapp: null };
const Ctx = createContext({ settings: DEFAULTS, reload: () => {} });

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);

  const reload = useCallback(async () => {
    const { data } = await supabase.from('store_settings').select('*').eq('id', 1).maybeSingle();
    if (data) setSettings({ ...DEFAULTS, ...data });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    document.title = settings.store_name || DEFAULTS.store_name;
  }, [settings.store_name]);

  return <Ctx.Provider value={{ settings, reload }}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);
