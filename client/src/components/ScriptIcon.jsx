import React from 'react';

/**
 * Renders a script/brand icon from its stored value:
 *  - "fa-solid fa-server" / "fa-brands fa-docker"  -> Font Awesome <i>
 *  - "https://…" or "data:image/…"                 -> <img>
 *  - anything else (e.g. an emoji)                 -> text span
 */
export default function ScriptIcon({ icon, className = '' }) {
  const value = String(icon || '').trim();
  if (/^fa-[a-z0-9- ]+$/i.test(value)) {
    return <i className={`${value} ${className}`.trim()} aria-hidden="true" />;
  }
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image/')) {
    return <img src={value} alt="" className={className} />;
  }
  return <span className={className} aria-hidden="true">{value || '📦'}</span>;
}
