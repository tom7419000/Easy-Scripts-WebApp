const FONT_STACKS = {
  system: 'var(--font-sans)',
  inter: '"Inter", "Segoe UI", var(--font-sans)',
  serif: 'var(--font-serif)',
  mono: 'var(--font-mono)',
};

const STORAGE_KEY = 'esw-theme';

export function getStoredTheme() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* private mode */ }
}

/** Pick initial theme: user choice > branding default > OS preference. */
export function initTheme(brandingDefault = 'dark') {
  const stored = getStoredTheme();
  if (stored === 'dark' || stored === 'light') {
    document.documentElement.dataset.theme = stored;
    return stored;
  }
  let theme = brandingDefault;
  if (window.matchMedia && brandingDefault !== 'light' && window.matchMedia('(prefers-color-scheme: light)').matches && !getStoredTheme()) {
    theme = brandingDefault; // branding default wins; OS pref only if no default
  }
  document.documentElement.dataset.theme = theme;
  return theme;
}

/** Inject branding (colors, font) as CSS variables on :root. */
export function applyBranding(branding) {
  const root = document.documentElement;
  if (branding?.primaryColor) root.style.setProperty('--primary', branding.primaryColor);
  if (branding?.accentColor) root.style.setProperty('--accent', branding.accentColor);
  root.style.setProperty('--font-body', FONT_STACKS[branding?.font] || FONT_STACKS.system);
  if (branding?.title) document.title = branding.title;
}
