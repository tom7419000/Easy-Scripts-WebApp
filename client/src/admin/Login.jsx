import React, { useState } from 'react';
import { api, setCsrf } from '../lib/api.js';

export default function Login({ needsSetup, onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (needsSetup) {
      if (password.length < 10) {
        setError('Das Passwort muss mindestens 10 Zeichen lang sein.');
        return;
      }
      if (password !== password2) {
        setError('Die Passwörter stimmen nicht überein.');
        return;
      }
    }
    setBusy(true);
    try {
      const endpoint = needsSetup ? '/api/admin/setup' : '/api/admin/login';
      const res = await api.post(endpoint, { username, password });
      setCsrf(res.csrf);
      onLogin(res.username);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card stack" onSubmit={submit}>
        <div className="brand">
          <span className="brand-logo" aria-hidden="true">🚀</span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.3rem' }}>{needsSetup ? 'Willkommen!' : 'Admin-Anmeldung'}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {needsSetup
              ? 'Lege jetzt dein Admin-Konto an, um loszulegen.'
              : 'Bitte melde dich an, um Scripts zu verwalten.'}
          </p>
        </div>

        <div className="field">
          <label htmlFor="username">Benutzername</label>
          <input
            id="username" className="input" autoComplete="username" required
            value={username} onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Passwort</label>
          <input
            id="password" className="input" type="password" required
            autoComplete={needsSetup ? 'new-password' : 'current-password'}
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
          {needsSetup && <p className="hint">Mindestens 10 Zeichen.</p>}
        </div>
        {needsSetup && (
          <div className="field">
            <label htmlFor="password2">Passwort wiederholen</label>
            <input
              id="password2" className="input" type="password" required autoComplete="new-password"
              value={password2} onChange={(e) => setPassword2(e.target.value)}
            />
          </div>
        )}

        {error && <p className="error-text" role="alert">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {needsSetup ? 'Konto erstellen' : 'Anmelden'}
        </button>
        <a href="/" className="faint" style={{ textAlign: 'center' }}>← Zur öffentlichen Seite</a>
      </form>
    </div>
  );
}
