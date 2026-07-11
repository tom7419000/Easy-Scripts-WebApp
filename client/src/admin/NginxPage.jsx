import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import Toggle from '../components/Toggle.jsx';
import CopyButton from '../components/CopyButton.jsx';

export default function NginxPage() {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [applyResult, setApplyResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadPreview = useCallback(async () => {
    try {
      const data = await api.get('/api/admin/nginx/preview');
      setPreview(data.config);
      setStatus(data.status);
      setPreviewError(null);
    } catch (err) {
      setPreview(null);
      setPreviewError(err.message);
      try { setStatus(await api.get('/api/admin/nginx/status')); } catch { /* keep */ }
    }
  }, []);

  useEffect(() => {
    api.get('/api/admin/settings').then((s) => setSettings(s)).catch(() => {});
    loadPreview();
  }, [loadPreview]);

  if (!settings) {
    return <div aria-busy="true"><span className="spinner" role="status" aria-label="Lädt …" /></div>;
  }

  const nginx = settings.nginx;
  const setN = (key, value) => setSettings((s) => ({ ...s, nginx: { ...s.nginx, [key]: value } }));

  const saveAndPreview = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const updated = await api.put('/api/admin/settings', { nginx });
      setSettings(updated);
      await loadPreview();
      toast('NGINX-Einstellungen gespeichert.');
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    setApplyResult(null);
    try {
      const result = await api.post('/api/admin/nginx/apply');
      setApplyResult(result);
      await loadPreview();
      toast(result.ok ? 'NGINX-Konfiguration angewendet.' : 'Angewendet, aber Reload meldete Fehler.', result.ok ? 'ok' : 'err');
    } catch (err) {
      setApplyResult({ ok: false, output: err.message });
      toast(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 24, maxWidth: 900 }}>
      <h1 className="admin-title">NGINX-Proxy</h1>
      <p className="muted" style={{ margin: '-12px 0 0' }}>
        Die App generiert die Reverse-Proxy-Konfiguration automatisch – kein manuelles Editieren nötig.
      </p>

      <form className="card card-pad stack" onSubmit={saveAndPreview}>
        <h3>Domain & TLS</h3>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field grow">
            <label htmlFor="domain">Domain</label>
            <input id="domain" className="input" placeholder="install.example.com" value={nginx.domain} onChange={(e) => setN('domain', e.target.value)} />
          </div>
          <label className="checkbox-row" style={{ paddingBottom: 8 }}>
            <Toggle checked={nginx.ssl} onChange={(v) => setN('ssl', v)} label="HTTPS aktivieren" />
            HTTPS (TLS)
          </label>
        </div>

        {nginx.ssl && (
          <>
            <div className="row">
              <div className="field grow">
                <label htmlFor="cert">Zertifikat (fullchain)</label>
                <input id="cert" className="input mono" placeholder="/etc/letsencrypt/live/install.example.com/fullchain.pem" value={nginx.sslCertPath} onChange={(e) => setN('sslCertPath', e.target.value)} />
              </div>
              <div className="field grow">
                <label htmlFor="key">Privater Schlüssel</label>
                <input id="key" className="input mono" placeholder="/etc/letsencrypt/live/install.example.com/privkey.pem" value={nginx.sslKeyPath} onChange={(e) => setN('sslKeyPath', e.target.value)} />
              </div>
            </div>
            <label className="checkbox-row">
              <Toggle checked={nginx.redirectHttp} onChange={(v) => setN('redirectHttp', v)} label="HTTP zu HTTPS umleiten" />
              HTTP automatisch auf HTTPS umleiten
            </label>
            <p className="hint">
              Zertifikat z. B. mit <code>certbot certonly --webroot -w /var/www/html -d {nginx.domain || 'deine-domain'}</code> erstellen.
            </p>
          </>
        )}

        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />} Speichern & Vorschau aktualisieren
          </button>
        </div>
      </form>

      <section className="card card-pad stack">
        <div className="spread">
          <h3 style={{ margin: 0 }}>Generierte Konfiguration</h3>
          <div className="row">
            {status && (
              <span className={`badge ${status.inSync ? 'badge-ok' : status.fileExists ? 'badge-warn' : ''}`}>
                {status.inSync ? 'Aktuell angewendet' : status.fileExists ? 'Abweichend von Serverdatei' : 'Noch nicht angewendet'}
              </span>
            )}
            {preview && <CopyButton text={preview} label="Config kopieren" />}
          </div>
        </div>
        {status && (
          <p className="faint" style={{ margin: 0 }}>
            Zieldatei: <code>{status.confPath}</code>
            {status.lastAppliedAt && ` · Zuletzt angewendet: ${new Date(status.lastAppliedAt).toLocaleString('de-DE')}`}
          </p>
        )}
        {previewError && <p className="error-text" role="alert">{previewError}</p>}
        {preview && <pre className="script-preview" tabIndex={0}>{preview}</pre>}

        <div className="row">
          <button type="button" className="btn btn-primary" onClick={apply} disabled={busy || !preview || (status && !status.applyEnabled)}>
            {busy && <span className="spinner" aria-hidden="true" />} Anwenden & NGINX neu laden
          </button>
          {status && !status.applyEnabled && (
            <span className="faint">Automatisches Anwenden ist deaktiviert (NGINX_AUTO_APPLY=false).</span>
          )}
        </div>

        {applyResult && (
          <div className="stack" style={{ gap: 6 }}>
            <strong style={{ color: applyResult.ok ? 'var(--ok)' : 'var(--err)' }}>
              {applyResult.ok ? '✓ Erfolgreich angewendet' : '✗ Fehler beim Anwenden'}
            </strong>
            {applyResult.output && <pre className="script-preview" style={{ maxHeight: 200 }}>{applyResult.output}</pre>}
          </div>
        )}
      </section>
    </div>
  );
}
