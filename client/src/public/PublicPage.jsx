import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { applyBranding, applyTheme, initTheme } from '../lib/theme.js';
import { useSSE } from '../lib/useSSE.js';
import CopyButton from '../components/CopyButton.jsx';
import ScriptIcon from '../components/ScriptIcon.jsx';

function BrandLogo({ branding }) {
  const logo = branding?.logo || 'fa-solid fa-rocket';
  return (
    <span className="brand-logo" aria-hidden="true">
      <ScriptIcon icon={logo} />
    </span>
  );
}

function ScriptTile({ script, layout, compact }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className={`tile${compact ? ' compact' : ''}`}>
      <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <span className="tile-icon" aria-hidden="true">
          <ScriptIcon icon={script.icon} />
        </span>
        <div className="grow" style={{ minWidth: 0 }}>
          <h3>{script.name}</h3>
          <div className="row" style={{ gap: 6 }}>
            {layout.showVersion && <span className="badge badge-accent">v{script.version}</span>}
            {layout.showDownloads && (
              <span className="badge" title="Installationen">⬇ {script.downloads}</span>
            )}
          </div>
        </div>
      </div>

      {script.description && <p className="desc">{script.description}</p>}

      {script.tags?.length > 0 && (
        <div className="row" style={{ gap: 6 }}>
          {script.tags.map((t) => <span key={t} className="badge">{t}</span>)}
        </div>
      )}

      <div className="tile-meta stack" style={{ gap: 8, width: '100%' }}>
        <div className="codebox">
          <code>{script.curl}</code>
          <CopyButton text={script.curl} compact />
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? 'Weniger anzeigen ▴' : 'Anleitung anzeigen ▾'}
        </button>
        {expanded && (
          <div className="faint stack" style={{ gap: 6 }}>
            <p style={{ margin: 0 }}>
              Befehl kopieren, in ein Terminal einfügen und mit Enter ausführen.
              Das Script wird direkt von diesem Server geladen und gestartet.
            </p>
            {script.sha256 && (
              <p style={{ margin: 0, wordBreak: 'break-all' }}>
                <strong>SHA-256:</strong> <span className="mono">{script.sha256}</span>
              </p>
            )}
            <p style={{ margin: 0 }}>
              Zuletzt aktualisiert: {new Date(script.updatedAt).toLocaleDateString('de-DE')}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

export default function PublicPage() {
  const [config, setConfig] = useState(null);
  const [scripts, setScripts] = useState(null);
  const [query, setQuery] = useState('');
  const [theme, setTheme] = useState('dark');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [cfg, list] = await Promise.all([
        api.get('/api/public/config'),
        api.get('/api/public/scripts'),
      ]);
      setConfig(cfg);
      setScripts(list);
      applyBranding(cfg.branding);
      setTheme(initTheme(cfg.branding.defaultTheme));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // live refresh when admin changes something
  useSSE('/api/public/events', ['scripts:changed', 'settings:changed'], () => load());

  const filtered = useMemo(() => {
    if (!scripts) return [];
    const q = query.trim().toLowerCase();
    if (!q) return scripts;
    return scripts.filter((s) =>
      [s.name, s.description, s.slug, ...(s.tags || [])].join(' ').toLowerCase().includes(q));
  }, [scripts, query]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  if (error) {
    return (
      <div className="auth-wrap">
        <div className="card card-pad" role="alert">
          <h2>Nicht erreichbar</h2>
          <p className="muted">{error}</p>
          <button type="button" className="btn btn-primary" onClick={load}>Erneut versuchen</button>
        </div>
      </div>
    );
  }

  if (!config || !scripts) {
    return (
      <div className="auth-wrap" aria-busy="true">
        <span className="spinner" role="status" aria-label="Lädt …" />
      </div>
    );
  }

  const { branding, layout, header, footer, baseUrl } = config;
  const mainCurl = `curl -fsSL ${baseUrl} | bash`;

  return (
    <>
      <a className="visually-hidden" href="#scripts">Zu den Scripts springen</a>
      <header className="public-header">
        <div className="container spread">
          <div className="brand">
            <BrandLogo branding={branding} />
            <span className="brand-title">{branding.title}</span>
          </div>
          <nav className="row" aria-label="Header-Navigation">
            {(header.links || []).map((l) => (
              <a key={l.url} className="btn btn-ghost btn-sm" href={l.url} target="_blank" rel="noreferrer">{l.label}</a>
            ))}
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Helles Design aktivieren' : 'Dunkles Design aktivieren'}
              title="Design wechseln"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </nav>
        </div>
      </header>

      <main className="container" id="scripts">
        {layout.showHero && (
          <section className="hero">
            <h1>{branding.title}</h1>
            {branding.description && <p>{branding.description}</p>}
            <div className="codebox">
              <code>{mainCurl}</code>
              <CopyButton text={mainCurl} />
            </div>
            <p className="faint" style={{ marginTop: 10 }}>
              Startet eine interaktive Auswahl aller Scripts im Terminal.
            </p>
          </section>
        )}

        <div className="toolbar spread">
          <label className="visually-hidden" htmlFor="search">Scripts durchsuchen</label>
          <input
            id="search"
            type="search"
            className="input search-input"
            placeholder={`${scripts.length} Script${scripts.length === 1 ? '' : 's'} durchsuchen …`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="faint">{filtered.length} von {scripts.length} Scripts</span>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            {scripts.length === 0
              ? 'Es sind noch keine Scripts veröffentlicht.'
              : 'Keine Treffer – Suchbegriff anpassen.'}
          </div>
        ) : (
          <section
            className="tile-grid"
            data-cols={layout.columns}
            aria-label="Verfügbare Installations-Scripts"
          >
            {filtered.map((s) => (
              <ScriptTile key={s.slug} script={s} layout={layout} compact={layout.cardStyle === 'compact'} />
            ))}
          </section>
        )}
      </main>

      <footer className="public-footer">
        <div className="container spread">
          <span>{footer.text || `© ${new Date().getFullYear()} ${branding.title}`}</span>
          <nav className="row" aria-label="Footer-Navigation">
            {(footer.links || []).map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.label}</a>
            ))}
            <Link to="/admin" className="faint">Admin</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
