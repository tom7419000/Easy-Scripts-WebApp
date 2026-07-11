import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSSE } from '../lib/useSSE.js';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [scripts, setScripts] = useState([]);

  const load = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([
        api.get('/api/admin/stats'),
        api.get('/api/admin/scripts'),
      ]);
      setStats(s);
      setScripts(list);
    } catch { /* handled by guard */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useSSE('/api/admin/events', ['scripts:changed', 'stats:changed', 'settings:changed'], () => load());

  if (!stats) {
    return <div aria-busy="true"><span className="spinner" role="status" aria-label="Lädt …" /></div>;
  }

  const recent = [...scripts]
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .slice(0, 5);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="spread">
        <h1 className="admin-title">Übersicht</h1>
        <Link to="/admin/scripts?add=1" className="btn btn-primary">+ Script hinzufügen</Link>
      </div>

      <div className="stat-grid">
        <div className="card stat">
          <div className="num">{stats.activeScripts}</div>
          <div className="lbl">Aktive Scripts</div>
        </div>
        <div className="card stat">
          <div className="num">{stats.totalScripts}</div>
          <div className="lbl">Scripts gesamt</div>
        </div>
        <div className="card stat">
          <div className="num">{stats.totalDownloads}</div>
          <div className="lbl">Installationen</div>
        </div>
        <div className="card stat">
          <div className="num" style={{ fontSize: '1.1rem', paddingTop: 8 }}>
            {stats.lastUpdatedAt ? new Date(stats.lastUpdatedAt).toLocaleString('de-DE') : '–'}
          </div>
          <div className="lbl">Letzte Änderung</div>
        </div>
      </div>

      {stats.errors.length > 0 && (
        <div className="card card-pad" role="alert">
          <h3 style={{ color: 'var(--err)' }}>⚠ Update-Fehler</h3>
          {stats.errors.map((e) => (
            <p key={e.id} style={{ margin: '4px 0' }}>
              <strong>{e.name}:</strong> <span className="muted">{e.error}</span>
            </p>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-pad spread" style={{ paddingBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Zuletzt geändert</h3>
          <Link to="/admin/scripts" className="faint">Alle Scripts →</Link>
        </div>
        {recent.length === 0 ? (
          <p className="muted" style={{ padding: '0 20px 20px' }}>
            Noch keine Scripts. Füge dein erstes Script über eine GitLab-URL hinzu.
          </p>
        ) : recent.map((s) => (
          <div className="script-row" key={s.id}>
            <span className="tile-icon" aria-hidden="true">{s.icon?.startsWith('http') || s.icon?.startsWith('data:') ? <img src={s.icon} alt="" /> : s.icon}</span>
            <div className="info">
              <div className="name">{s.name} <span className="badge badge-accent">v{s.version}</span></div>
              <div className="sub">{s.source.projectPath} · {s.downloads} Installationen</div>
            </div>
            <span className={`badge ${s.active ? 'badge-ok' : ''}`}>{s.active ? 'Aktiv' : 'Inaktiv'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
