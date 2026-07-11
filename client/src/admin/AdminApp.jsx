import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { api, setCsrf } from '../lib/api.js';
import { applyBranding, initTheme, applyTheme, getStoredTheme } from '../lib/theme.js';
import Login from './Login.jsx';
import Dashboard from './Dashboard.jsx';
import ScriptsPage from './ScriptsPage.jsx';
import SettingsPage from './SettingsPage.jsx';
import NginxPage from './NginxPage.jsx';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const NAV = [
  { to: '/admin', end: true, icon: '📊', label: 'Übersicht' },
  { to: '/admin/scripts', icon: '📦', label: 'Scripts' },
  { to: '/admin/settings', icon: '🎨', label: 'Einstellungen' },
  { to: '/admin/nginx', icon: '🔀', label: 'NGINX' },
];

export default function AdminApp() {
  const [state, setState] = useState({ loading: true, user: null, needsSetup: false });
  const [theme, setTheme] = useState(() => getStoredTheme() || 'dark');
  const navigate = useNavigate();

  const check = useCallback(async () => {
    try {
      const status = await api.get('/api/admin/setup-status');
      if (status.needsSetup) {
        setState({ loading: false, user: null, needsSetup: true });
        return;
      }
      const me = await api.get('/api/admin/me');
      setCsrf(me.csrf);
      setState({ loading: false, user: me.username, needsSetup: false });
    } catch {
      setState({ loading: false, user: null, needsSetup: false });
    }
  }, []);

  useEffect(() => {
    initTheme(getStoredTheme() || 'dark');
    api.get('/api/public/config').then((cfg) => applyBranding(cfg.branding)).catch(() => {});
    check();
  }, [check]);

  const onLogin = (username) => setState({ loading: false, user: username, needsSetup: false });

  const logout = async () => {
    try { await api.post('/api/admin/logout'); } catch { /* session may be gone */ }
    setCsrf(null);
    setState({ loading: false, user: null, needsSetup: false });
    navigate('/admin');
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  if (state.loading) {
    return <div className="auth-wrap" aria-busy="true"><span className="spinner" role="status" aria-label="Lädt …" /></div>;
  }

  if (!state.user) {
    return <Login needsSetup={state.needsSetup} onLogin={onLogin} />;
  }

  return (
    <AuthContext.Provider value={{ user: state.user, logout }}>
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div className="brand">
            <span className="brand-logo" aria-hidden="true">🚀</span>
            <span className="brand-title">Admin</span>
          </div>
          <nav className="stack" style={{ gap: 4 }} aria-label="Admin-Navigation">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <span className="icon" aria-hidden="true">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
            <a className="nav-item" href="/" target="_blank" rel="noreferrer">
              <span className="icon" aria-hidden="true">🌐</span>
              Öffentliche Seite
            </a>
          </nav>
          <div className="sidebar-footer" style={{ marginTop: 'auto' }}>
            <div className="row" style={{ padding: '0 6px', justifyContent: 'space-between' }}>
              <button type="button" className="btn btn-ghost btn-icon" onClick={toggleTheme} aria-label="Design wechseln">
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
                Abmelden
              </button>
            </div>
            <p className="faint" style={{ padding: '4px 8px', margin: 0 }}>Angemeldet als {state.user}</p>
          </div>
        </aside>
        <main className="admin-main">
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="scripts" element={<ScriptsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="nginx" element={<NginxPage />} />
          </Routes>
        </main>
      </div>
    </AuthContext.Provider>
  );
}
