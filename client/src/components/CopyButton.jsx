import React, { useState } from 'react';

export default function CopyButton({ text, label = 'Kopieren' }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard API unavailable (http) – fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button type="button" className="btn btn-sm" onClick={copy} aria-label={`${label}: ${text}`}>
      {copied ? '✓ Kopiert' : label}
    </button>
  );
}
