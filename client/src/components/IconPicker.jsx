import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FA_ICONS } from '../lib/faIcons.js';
import ScriptIcon from './ScriptIcon.jsx';

/**
 * Font Awesome icon picker: a preview button that opens a searchable icon
 * grid. A free-text field allows advanced values (emoji or image URL) so
 * existing scripts keep working.
 */
export default function IconPicker({ value, onChange, label = 'Icon' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FA_ICONS.slice(0, 120);
    return FA_ICONS.filter((i) => i.n.includes(q) || i.k.includes(q)).slice(0, 120);
  }, [query]);

  return (
    <div className="icon-picker" ref={wrapRef}>
      <button
        type="button"
        className="btn icon-picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label} auswählen`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="tile-icon" style={{ width: 34, height: 34, fontSize: 17 }}>
          <ScriptIcon icon={value} />
        </span>
        <span className="muted" style={{ fontSize: '.85rem' }}>Icon wählen ▾</span>
      </button>

      {open && (
        <div className="icon-picker-pop card" role="dialog" aria-label="Icon auswählen">
          <input
            type="search"
            className="input"
            placeholder={`${FA_ICONS.length} Icons durchsuchen … (z. B. server, docker)`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="icon-picker-grid" role="listbox" aria-label="Icons">
            {filtered.map((icon) => (
              <button
                key={icon.c}
                type="button"
                role="option"
                aria-selected={value === icon.c}
                className={`icon-cell${value === icon.c ? ' selected' : ''}`}
                title={icon.n}
                onClick={() => { onChange(icon.c); setOpen(false); }}
              >
                <i className={icon.c} aria-hidden="true" />
              </button>
            ))}
            {filtered.length === 0 && <p className="faint" style={{ gridColumn: '1/-1', margin: 8 }}>Keine Treffer.</p>}
          </div>
          <div className="field" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <label style={{ fontSize: '.78rem' }} htmlFor="icon-custom">Eigener Wert (Emoji oder Bild-URL)</label>
            <input
              id="icon-custom"
              className="input"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="fa-solid fa-server · 🐳 · https://…/logo.png"
            />
          </div>
        </div>
      )}
    </div>
  );
}
