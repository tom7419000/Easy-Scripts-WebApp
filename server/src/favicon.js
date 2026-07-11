/**
 * Generates the favicon from the configured branding logo, so the browser
 * icon always matches the dashboard – no manual favicon files needed.
 * SVG output scales crisply to every size browsers request (16/32/64…).
 */

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  }[c]));
}

const DEFAULT_ROCKET = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{PRIMARY}"/>
      <stop offset="1" stop-color="{ACCENT}"/>
    </linearGradient>
  </defs>
  <text x="32" y="39" font-size="46" text-anchor="middle" dominant-baseline="middle" fill="url(#g)">🚀</text>
</svg>`;

export function renderFavicon(branding) {
  const logo = String(branding?.logo || '').trim();

  // Uploaded SVG logo: serve it directly
  if (logo.startsWith('data:image/svg+xml;base64,')) {
    try {
      return { type: 'image/svg+xml', body: Buffer.from(logo.split(',')[1], 'base64').toString('utf8') };
    } catch { /* fall through to default */ }
  }

  // Uploaded raster logo (png/jpeg/webp/gif): wrap in SVG so it scales cleanly.
  // The data URL is validated on save (strict data:image/...;base64 prefix),
  // base64 contains no characters that could break out of the attribute.
  if (/^data:image\/(png|jpeg|gif|webp);base64,/.test(logo)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><image href="${logo}" width="64" height="64" preserveAspectRatio="xMidYMid meet"/></svg>`;
    return { type: 'image/svg+xml', body: svg };
  }

  // Emoji logo
  if (logo && !logo.startsWith('fa-') && !logo.startsWith('http')) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text x="32" y="39" font-size="46" text-anchor="middle" dominant-baseline="middle">${escapeXml(logo.slice(0, 8))}</text></svg>`;
    return { type: 'image/svg+xml', body: svg };
  }

  // Default mark, tinted with the branding colors
  const svg = DEFAULT_ROCKET
    .replace('{PRIMARY}', escapeXml(branding?.primaryColor || '#6366f1'))
    .replace('{ACCENT}', escapeXml(branding?.accentColor || '#22d3ee'));
  return { type: 'image/svg+xml', body: svg };
}
