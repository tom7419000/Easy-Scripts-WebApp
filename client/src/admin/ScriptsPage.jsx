import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSSE } from '../lib/useSSE.js';
import { useToast } from '../components/Toast.jsx';
import Modal from '../components/Modal.jsx';
import Toggle from '../components/Toggle.jsx';
import CopyButton from '../components/CopyButton.jsx';

/* ---------------- Import wizard (GitLab URL -> candidates -> import) ---------------- */

function ImportWizard({ onClose, onImported }) {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [filePreview, setFilePreview] = useState(null);

  const analyse = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post('/api/admin/scripts/import-preview', { url, token });
      setPreview(result);
      setSelected(new Set(
        result.candidates.filter((c) => c.recommended && !c.alreadyImported).slice(0, 1).map((c) => c.path)
      ));
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleCandidate = (path) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const showFile = async (candidate) => {
    setFilePreview({ path: candidate.path, loading: true });
    try {
      const data = await api.post('/api/admin/scripts/preview-file', {
        url, token, path: candidate.path, ref: preview.ref,
      });
      setFilePreview({ path: candidate.path, ...data });
    } catch (err) {
      setFilePreview({ path: candidate.path, error: err.message });
    }
  };

  const doImport = async () => {
    setBusy(true);
    setError(null);
    let imported = 0;
    try {
      for (const path of selected) {
        await api.post('/api/admin/scripts', {
          url, token, path, ref: preview.ref,
          metadata: {
            name: selected.size === 1
              ? preview.project.name
              : `${preview.project.name} – ${path.split('/').pop().replace(/\.(sh|bash)$/i, '')}`,
            description: preview.project.description,
            active: false,
          },
        });
        imported += 1;
      }
      toast(`${imported} Script(s) importiert. Jetzt Metadaten prüfen und aktivieren.`);
      onImported();
      onClose();
    } catch (err) {
      setError(`${err.message}${imported > 0 ? ` (${imported} bereits importiert)` : ''}`);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={step === 1 ? 'Script von GitLab hinzufügen' : `Gefundene Scripts – ${preview?.project?.name}`}
      onClose={onClose}
      wide={step === 2}
      footer={step === 1 ? (
        <>
          <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
          <button type="submit" form="import-form" className="btn btn-primary" disabled={busy || !url}>
            {busy && <span className="spinner" aria-hidden="true" />} Repository analysieren
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn" onClick={() => { setStep(1); setFilePreview(null); }}>← Zurück</button>
          <button type="button" className="btn btn-primary" disabled={busy || selected.size === 0} onClick={doImport}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {selected.size > 1 ? `${selected.size} Scripts importieren` : 'Script importieren'}
          </button>
        </>
      )}
    >
      {step === 1 && (
        <form id="import-form" className="stack" onSubmit={analyse}>
          <div className="field">
            <label htmlFor="gitlab-url">GitLab Repository-URL</label>
            <input
              id="gitlab-url" className="input" type="url" required
              placeholder="https://gitlab.com/gruppe/projekt"
              value={url} onChange={(e) => setUrl(e.target.value)}
            />
            <p className="hint">
              Repository-, Branch- oder direkte Datei-URL (…/-/blob/main/install.sh).
              Selbst gehostete GitLab-Instanzen werden unterstützt.
            </p>
          </div>
          <div className="field">
            <label htmlFor="gitlab-token">Access-Token <span className="faint">(optional, für private Repos)</span></label>
            <input
              id="gitlab-token" className="input" type="password" autoComplete="off"
              placeholder="glpat-…" value={token} onChange={(e) => setToken(e.target.value)}
            />
            <p className="hint">Benötigt Scope „read_api“. Wird verschlüsselt gespeichert.</p>
          </div>
          {error && <p className="error-text" role="alert">{error}</p>}
        </form>
      )}

      {step === 2 && preview && (
        <div className="stack">
          <p className="muted" style={{ margin: 0 }}>
            <strong>{preview.project.path}</strong> · Branch <code>{preview.ref}</code>
            {preview.project.description ? ` – ${preview.project.description}` : ''}
          </p>
          <div className="stack" style={{ gap: 8 }} role="listbox" aria-label="Gefundene Scripts" aria-multiselectable="true">
            {preview.candidates.map((c) => (
              <div
                key={c.path}
                role="option"
                aria-selected={selected.has(c.path)}
                tabIndex={0}
                className={`candidate${selected.has(c.path) ? ' selected' : ''}`}
                onClick={() => !c.alreadyImported && toggleCandidate(c.path)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); !c.alreadyImported && toggleCandidate(c.path); } }}
              >
                <input
                  type="checkbox" checked={selected.has(c.path)} readOnly
                  disabled={c.alreadyImported} tabIndex={-1} aria-hidden="true"
                />
                <span className="path">{c.path}</span>
                {c.recommended && <span className="badge badge-ok">Empfohlen</span>}
                {c.alreadyImported && <span className="badge">Bereits importiert</span>}
                <button
                  type="button" className="btn btn-ghost btn-sm"
                  onClick={(e) => { e.stopPropagation(); showFile(c); }}
                >
                  Vorschau
                </button>
              </div>
            ))}
          </div>

          {filePreview && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="spread">
                <strong className="mono" style={{ fontSize: '.85rem' }}>{filePreview.path}</strong>
                {filePreview.sha256 && <span className="faint">SHA-256: {filePreview.sha256.slice(0, 16)}…</span>}
              </div>
              {filePreview.loading && <span className="spinner" role="status" aria-label="Lädt Vorschau" />}
              {filePreview.error && <p className="error-text">{filePreview.error}</p>}
              {filePreview.content && <pre className="script-preview" tabIndex={0}>{filePreview.content}</pre>}
            </div>
          )}
          {error && <p className="error-text" role="alert">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

/* ---------------- Edit modal ---------------- */

function EditModal({ script, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: script.name,
    slug: script.slug,
    description: script.description,
    version: script.version,
    icon: script.icon,
    tags: (script.tags || []).join(', '),
    autoUpdate: script.autoUpdate,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [versions, setVersions] = useState(script.versions || []);
  const [content, setContent] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await api.patch(`/api/admin/scripts/${script.id}`, {
        ...form,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      toast('Script gespeichert.');
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      const { changed, script: updated } = await api.post(`/api/admin/scripts/${script.id}/refresh`);
      toast(changed ? 'Neue Version von GitLab geladen.' : 'Bereits aktuell – keine Änderung.');
      setVersions(updated.versions);
      setForm((f) => ({ ...f, version: updated.version }));
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const showContent = async (versionId) => {
    try {
      const data = await api.get(`/api/admin/scripts/${script.id}/versions/${versionId}/content`);
      setContent(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const restore = async (versionId) => {
    try {
      const updated = await api.post(`/api/admin/scripts/${script.id}/versions/${versionId}/restore`);
      toast('Version wiederhergestellt.');
      setForm((f) => ({ ...f, version: updated.version }));
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal
      title={`Script bearbeiten – ${script.name}`}
      onClose={onClose}
      wide
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
          <button type="submit" form="edit-form" className="btn btn-primary" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />} Speichern
          </button>
        </>
      )}
    >
      <form id="edit-form" className="stack" onSubmit={save}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="field" style={{ width: 90 }}>
            <label htmlFor="icon">Icon</label>
            <input id="icon" className="input" value={form.icon} onChange={set('icon')} placeholder="📦" />
          </div>
          <div className="field grow">
            <label htmlFor="name">Name</label>
            <input id="name" className="input" required value={form.name} onChange={set('name')} />
          </div>
          <div className="field" style={{ width: 130 }}>
            <label htmlFor="version">Version</label>
            <input id="version" className="input" value={form.version} onChange={set('version')} />
          </div>
        </div>
        <p className="hint" style={{ marginTop: -8 }}>Icon: Emoji oder Bild-URL (https://… / data:image/…).</p>

        <div className="field">
          <label htmlFor="slug">Slug <span className="faint">(URL-Name)</span></label>
          <input id="slug" className="input mono" value={form.slug} onChange={set('slug')} />
          <p className="hint">Install-URL: <code>/install/{form.slug || '…'}</code></p>
        </div>

        <div className="field">
          <label htmlFor="description">Beschreibung</label>
          <textarea id="description" className="textarea" value={form.description} onChange={set('description')} />
        </div>

        <div className="field">
          <label htmlFor="tags">Tags <span className="faint">(kommagetrennt)</span></label>
          <input id="tags" className="input" value={form.tags} onChange={set('tags')} placeholder="docker, proxmox, backup" />
        </div>

        <label className="checkbox-row">
          <Toggle
            checked={form.autoUpdate}
            onChange={(v) => setForm((f) => ({ ...f, autoUpdate: v }))}
            label="Automatisch von GitLab aktualisieren"
          />
          Automatisch von GitLab aktualisieren
        </label>

        <hr className="divider" />

        <div className="spread">
          <div>
            <strong>Quelle</strong>
            <p className="faint" style={{ margin: 0 }}>
              <a href={script.source.webUrl} target="_blank" rel="noreferrer">{script.source.projectPath}</a>
              {' · '}<code>{script.source.filePath}</code> @ {script.source.ref}
            </p>
          </div>
          <button type="button" className="btn btn-sm" onClick={refresh} disabled={busy}>
            ⟳ Jetzt von GitLab aktualisieren
          </button>
        </div>
        {script.lastError && <p className="error-text">Letzter Fehler: {script.lastError}</p>}

        <div>
          <strong>Versionen</strong>
          <table className="data" style={{ marginTop: 6 }}>
            <thead>
              <tr><th>Version</th><th>Commit</th><th>Geladen</th><th>Größe</th><th aria-label="Aktionen" /></tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td>
                    {v.version}{' '}
                    {v.id === script.currentVersionId && <span className="badge badge-ok">Aktiv</span>}
                  </td>
                  <td className="mono">{(v.commitSha || '').slice(0, 8) || '–'}</td>
                  <td>{new Date(v.fetchedAt).toLocaleString('de-DE')}</td>
                  <td>{(v.size / 1024).toFixed(1)} KB</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => showContent(v.id)}>Ansehen</button>
                    {v.id !== script.currentVersionId && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => restore(v.id)}>Wiederherstellen</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {content && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="spread">
              <strong>Inhalt v{content.version.version}</strong>
              <span className="faint mono">SHA-256: {content.version.sha256.slice(0, 20)}…</span>
            </div>
            <pre className="script-preview" tabIndex={0}>{content.content}</pre>
          </div>
        )}

        {error && <p className="error-text" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

/* ---------------- Page ---------------- */

export default function ScriptsPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scripts, setScripts] = useState(null);
  const [showImport, setShowImport] = useState(searchParams.get('add') === '1');
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    try {
      setScripts(await api.get('/api/admin/scripts'));
    } catch { /* auth guard handles */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useSSE('/api/admin/events', ['scripts:changed'], () => load());

  const openImport = () => setShowImport(true);
  const closeImport = () => {
    setShowImport(false);
    if (searchParams.get('add')) setSearchParams({}, { replace: true });
  };

  const toggleActive = async (script) => {
    try {
      await api.patch(`/api/admin/scripts/${script.id}`, { active: !script.active });
      toast(script.active ? `„${script.name}“ deaktiviert.` : `„${script.name}“ ist jetzt öffentlich.`);
      load();
    } catch (err) {
      toast(err.message, 'err');
    }
  };

  const doDelete = async () => {
    const script = confirmDelete;
    setConfirmDelete(null);
    try {
      await api.del(`/api/admin/scripts/${script.id}`);
      toast(`„${script.name}“ gelöscht.`);
      load();
    } catch (err) {
      toast(err.message, 'err');
    }
  };

  const move = async (index, dir) => {
    const list = [...scripts];
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    setScripts(list);
    try {
      await api.post('/api/admin/scripts/reorder', { ids: list.map((s) => s.id) });
    } catch (err) {
      toast(err.message, 'err');
      load();
    }
  };

  if (!scripts) {
    return <div aria-busy="true"><span className="spinner" role="status" aria-label="Lädt …" /></div>;
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="spread">
        <h1 className="admin-title">Scripts</h1>
        <button type="button" className="btn btn-primary" onClick={openImport}>+ Script hinzufügen</button>
      </div>

      {scripts.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: '2rem', margin: '0 0 8px' }}>📦</p>
          <p>Noch keine Scripts vorhanden.</p>
          <button type="button" className="btn btn-primary" onClick={openImport}>
            Erstes Script von GitLab importieren
          </button>
        </div>
      ) : (
        <div className="card">
          {scripts.map((s, i) => (
            <div className="script-row" key={s.id}>
              <div className="stack" style={{ gap: 2 }}>
                <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`${s.name} nach oben`} disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`${s.name} nach unten`} disabled={i === scripts.length - 1} onClick={() => move(i, 1)}>▼</button>
              </div>
              <span className="tile-icon" aria-hidden="true">
                {s.icon?.startsWith('http') || s.icon?.startsWith('data:') ? <img src={s.icon} alt="" /> : s.icon}
              </span>
              <div className="info">
                <div className="name">
                  {s.name} <span className="badge badge-accent">v{s.version}</span>
                  {s.lastError && <span className="badge badge-err" title={s.lastError}>Fehler</span>}
                </div>
                <div className="sub">
                  /install/{s.slug} · {s.source.projectPath} · ⬇ {s.downloads}
                </div>
              </div>
              <div className="actions">
                <CopyButton text={s.curl} label="curl" />
                <button type="button" className="btn btn-sm" onClick={() => setEditing(s)}>Bearbeiten</button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(s)}>Löschen</button>
                <Toggle checked={s.active} onChange={() => toggleActive(s)} label={`${s.name} aktivieren`} />
              </div>
            </div>
          ))}
        </div>
      )}

      {showImport && <ImportWizard onClose={closeImport} onImported={load} />}
      {editing && (
        <EditModal
          script={editing}
          onClose={() => setEditing(null)}
          onSaved={() => load()}
        />
      )}
      {confirmDelete && (
        <Modal
          title="Script löschen?"
          onClose={() => setConfirmDelete(null)}
          footer={(
            <>
              <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>Abbrechen</button>
              <button type="button" className="btn btn-danger" onClick={doDelete}>Endgültig löschen</button>
            </>
          )}
        >
          <p>
            „{confirmDelete.name}“ wird inklusive aller gespeicherten Versionen entfernt.
            Der Install-Link <code>/install/{confirmDelete.slug}</code> funktioniert danach nicht mehr.
          </p>
        </Modal>
      )}
    </div>
  );
}
