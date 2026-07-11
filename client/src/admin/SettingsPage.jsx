import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { applyBranding } from '../lib/theme.js';
import { useToast } from '../components/Toast.jsx';
import Toggle from '../components/Toggle.jsx';

function LinksEditor({ links, onChange, idPrefix }) {
  const update = (i, key, value) => {
    const next = links.map((l, idx) => (idx === i ? { ...l, [key]: value } : l));
    onChange(next);
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      {links.map((link, i) => (
        <div className="row" key={i} style={{ flexWrap: 'nowrap' }}>
          <label className="visually-hidden" htmlFor={`${idPrefix}-label-${i}`}>Link-Text</label>
          <input
            id={`${idPrefix}-label-${i}`} className="input" placeholder="Text"
            style={{ maxWidth: 160 }} value={link.label}
            onChange={(e) => update(i, 'label', e.target.value)}
          />
          <label className="visually-hidden" htmlFor={`${idPrefix}-url-${i}`}>Link-URL</label>
          <input
            id={`${idPrefix}-url-${i}`} className="input" placeholder="https://…"
            value={link.url} onChange={(e) => update(i, 'url', e.target.value)}
          />
          <button
            type="button" className="btn btn-ghost btn-icon" aria-label="Link entfernen"
            onClick={() => onChange(links.filter((_, idx) => idx !== i))}
          >✕</button>
        </div>
      ))}
      {links.length < 10 && (
        <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...links, { label: '', url: '' }])}>
          + Link hinzufügen
        </button>
      )}
    </div>
  );
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i;

/** Split a stored public URL into protocol + host for the settings form. */
function splitPublicUrl(publicUrl) {
  const m = /^(https?):\/\/(.+)$/.exec(publicUrl || '');
  return m ? { proto: m[1], domain: m[2] } : { proto: 'https', domain: '' };
}

export default function SettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [gitlabToken, setGitlabToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });
  const [publicHost, setPublicHost] = useState({ proto: 'https', domain: '' });
  const [domainError, setDomainError] = useState(null);

  useEffect(() => {
    api.get('/api/admin/settings').then((s) => {
      setSettings(s);
      setPublicHost(splitPublicUrl(s.publicUrl));
    }).catch(() => {});
  }, []);

  if (!settings) {
    return <div aria-busy="true"><span className="spinner" role="status" aria-label="Lädt …" /></div>;
  }

  const setB = (key, value) => setSettings((s) => ({ ...s, branding: { ...s.branding, [key]: value } }));
  const setL = (key, value) => setSettings((s) => ({ ...s, layout: { ...s.layout, [key]: value } }));

  const onLogoFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 300 * 1024) {
      toast('Logo ist zu groß (max. 300 KB).', 'err');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setB('logo', reader.result);
    reader.readAsDataURL(file);
  };

  const save = async (e) => {
    e.preventDefault();
    const domain = publicHost.domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (domain && !DOMAIN_RE.test(domain)) {
      setDomainError('Ungültiges Format – erwartet z. B. install-dashboard.tomsattler.de (optional mit :Port).');
      toast('Bitte die Domain-Eingabe korrigieren.', 'err');
      return;
    }
    setDomainError(null);
    setBusy(true);
    try {
      const payload = {
        branding: settings.branding,
        layout: settings.layout,
        header: settings.header,
        footer: settings.footer,
        publicUrl: domain ? `${publicHost.proto}://${domain}` : '',
      };
      if (gitlabToken.trim() || gitlabToken === '') {
        // only send when admin typed something (empty string clears)
        if (gitlabToken !== '') payload.gitlab = { defaultToken: gitlabToken.trim() };
      }
      const updated = await api.put('/api/admin/settings', payload);
      setSettings(updated);
      setPublicHost(splitPublicUrl(updated.publicUrl));
      applyBranding(updated.branding);
      toast('Einstellungen gespeichert.');
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const clearToken = async () => {
    try {
      const updated = await api.put('/api/admin/settings', { gitlab: { defaultToken: '' } });
      setSettings(updated);
      setGitlabToken('');
      toast('Standard-Token entfernt.');
    } catch (err) {
      toast(err.message, 'err');
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/admin/change-password', pwForm);
      setPwForm({ currentPassword: '', newPassword: '' });
      toast('Passwort geändert.');
    } catch (err) {
      toast(err.message, 'err');
    }
  };

  return (
    <div className="stack" style={{ gap: 24, maxWidth: 860 }}>
      <h1 className="admin-title">Einstellungen</h1>

      <form className="stack" style={{ gap: 24 }} onSubmit={save}>
        <section className="card card-pad stack">
          <h3>Branding</h3>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div className="field grow">
              <label htmlFor="title">Dashboard-Titel</label>
              <input id="title" className="input" value={settings.branding.title} onChange={(e) => setB('title', e.target.value)} />
            </div>
            <div className="field grow">
              <label htmlFor="desc">Beschreibung</label>
              <input id="desc" className="input" value={settings.branding.description} onChange={(e) => setB('description', e.target.value)} />
            </div>
          </div>

          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field">
              <label htmlFor="logo-file">Logo</label>
              <div className="row">
                {settings.branding.logo?.startsWith('data:image/') ? (
                  <img src={settings.branding.logo} alt="Aktuelles Logo" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover' }} />
                ) : (
                  <span className="brand-logo" aria-hidden="true">{settings.branding.logo || '🚀'}</span>
                )}
                <input id="logo-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" onChange={onLogoFile} className="input" style={{ maxWidth: 260 }} />
                {settings.branding.logo && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setB('logo', '')}>Entfernen</button>
                )}
              </div>
              <p className="hint">Alternativ ein Emoji im Feld unten eintragen.</p>
            </div>
            <div className="field" style={{ width: 120 }}>
              <label htmlFor="logo-emoji">Emoji-Logo</label>
              <input
                id="logo-emoji" className="input" placeholder="🚀"
                value={settings.branding.logo?.startsWith('data:') ? '' : settings.branding.logo}
                onChange={(e) => setB('logo', e.target.value.slice(0, 8))}
              />
            </div>
          </div>

          <div className="row">
            <div className="field">
              <label htmlFor="primary">Primärfarbe</label>
              <div className="color-input">
                <input id="primary" type="color" value={settings.branding.primaryColor} onChange={(e) => setB('primaryColor', e.target.value)} />
                <code>{settings.branding.primaryColor}</code>
              </div>
            </div>
            <div className="field">
              <label htmlFor="accent">Akzentfarbe</label>
              <div className="color-input">
                <input id="accent" type="color" value={settings.branding.accentColor} onChange={(e) => setB('accentColor', e.target.value)} />
                <code>{settings.branding.accentColor}</code>
              </div>
            </div>
            <div className="field">
              <label htmlFor="font">Schriftart</label>
              <select id="font" className="select" value={settings.branding.font} onChange={(e) => setB('font', e.target.value)}>
                <option value="system">System (empfohlen)</option>
                <option value="inter">Inter / Humanist</option>
                <option value="serif">Serif</option>
                <option value="mono">Monospace</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="theme">Standard-Theme</label>
              <select id="theme" className="select" value={settings.branding.defaultTheme} onChange={(e) => setB('defaultTheme', e.target.value)}>
                <option value="dark">Dunkel</option>
                <option value="light">Hell</option>
              </select>
            </div>
          </div>
        </section>

        <section className="card card-pad stack">
          <h3>Kachel-Layout</h3>
          <div className="row">
            <div className="field">
              <label htmlFor="columns">Spalten</label>
              <select id="columns" className="select" value={settings.layout.columns} onChange={(e) => setL('columns', e.target.value)}>
                <option value="auto">Automatisch</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="cardStyle">Kachel-Größe</label>
              <select id="cardStyle" className="select" value={settings.layout.cardStyle} onChange={(e) => setL('cardStyle', e.target.value)}>
                <option value="comfortable">Komfortabel</option>
                <option value="compact">Kompakt</option>
              </select>
            </div>
          </div>
          <div className="row" style={{ gap: 24 }}>
            <label className="checkbox-row">
              <Toggle checked={settings.layout.showHero} onChange={(v) => setL('showHero', v)} label="Hero-Bereich anzeigen" />
              Hero-Bereich mit Haupt-curl-Befehl
            </label>
            <label className="checkbox-row">
              <Toggle checked={settings.layout.showVersion} onChange={(v) => setL('showVersion', v)} label="Versionen anzeigen" />
              Versionen anzeigen
            </label>
            <label className="checkbox-row">
              <Toggle checked={settings.layout.showDownloads} onChange={(v) => setL('showDownloads', v)} label="Downloads anzeigen" />
              Download-Zähler anzeigen
            </label>
          </div>
        </section>

        <section className="card card-pad stack">
          <h3>Header & Footer</h3>
          <div className="field">
            <span style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--text-dim)' }}>Header-Links</span>
            <LinksEditor idPrefix="header" links={settings.header.links} onChange={(links) => setSettings((s) => ({ ...s, header: { ...s.header, links } }))} />
          </div>
          <div className="field">
            <label htmlFor="footer-text">Footer-Text</label>
            <input id="footer-text" className="input" value={settings.footer.text} onChange={(e) => setSettings((s) => ({ ...s, footer: { ...s.footer, text: e.target.value } }))} placeholder="© 2026 Mein Homelab" />
          </div>
          <div className="field">
            <span style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--text-dim)' }}>Footer-Links</span>
            <LinksEditor idPrefix="footer" links={settings.footer.links} onChange={(links) => setSettings((s) => ({ ...s, footer: { ...s.footer, links } }))} />
          </div>
        </section>

        <section className="card card-pad stack">
          <h3>Integration</h3>
          <div className="field">
            <label htmlFor="public-domain">Öffentliche Installations-URL (Domain / Hostname)</label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <select
                className="select" style={{ maxWidth: 110 }} value={publicHost.proto}
                aria-label="Protokoll"
                onChange={(e) => setPublicHost((p) => ({ ...p, proto: e.target.value }))}
              >
                <option value="https">https://</option>
                <option value="http">http://</option>
              </select>
              <input
                id="public-domain" className="input" placeholder="install-dashboard.tomsattler.de"
                value={publicHost.domain}
                aria-invalid={Boolean(domainError)}
                onChange={(e) => { setPublicHost((p) => ({ ...p, domain: e.target.value })); setDomainError(null); }}
              />
            </div>
            {domainError && <p className="error-text" role="alert">{domainError}</p>}
            <p className="hint">
              ℹ️ Diese Domain wird in den generierten curl-Befehlen verwendet – ideal für Cloudflare
              Tunnel (Protokoll „http://" wählen, wenn der Tunnel intern unverschlüsselt anbindet).
              Leer lassen → die aufgerufene Adresse/IP wird automatisch verwendet.
              {publicHost.domain && DOMAIN_RE.test(publicHost.domain.trim()) && (
                <> Vorschau: <code>curl -fsSL {publicHost.proto}://{publicHost.domain.trim()}/install/&lt;script&gt; | bash</code></>
              )}
            </p>
          </div>
          <div className="field">
            <label htmlFor="gitlab-default-token">
              GitLab Standard-Token{' '}
              {settings.gitlab.hasDefaultToken && <span className="badge badge-ok">Gespeichert</span>}
            </label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input
                id="gitlab-default-token" className="input" type="password" autoComplete="off"
                placeholder={settings.gitlab.hasDefaultToken ? '••••••••  (neues Token eingeben zum Ersetzen)' : 'glpat-…'}
                value={gitlabToken} onChange={(e) => setGitlabToken(e.target.value)}
              />
              {settings.gitlab.hasDefaultToken && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearToken}>Entfernen</button>
              )}
            </div>
            <p className="hint">Wird für alle Repositories ohne eigenes Token verwendet (Scope: read_api). Verschlüsselt gespeichert.</p>
          </div>
        </section>

        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />} Einstellungen speichern
          </button>
        </div>
      </form>

      <section className="card card-pad stack">
        <h3>Konto</h3>
        <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={changePassword}>
          <div className="field grow">
            <label htmlFor="pw-current">Aktuelles Passwort</label>
            <input id="pw-current" className="input" type="password" required autoComplete="current-password" value={pwForm.currentPassword} onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))} />
          </div>
          <div className="field grow">
            <label htmlFor="pw-new">Neues Passwort <span className="faint">(min. 10 Zeichen)</span></label>
            <input id="pw-new" className="input" type="password" required minLength={10} autoComplete="new-password" value={pwForm.newPassword} onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))} />
          </div>
          <button type="submit" className="btn">Passwort ändern</button>
        </form>
      </section>
    </div>
  );
}
