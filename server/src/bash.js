/**
 * Generates the bash "landing script" that users get when they run
 *   curl -fsSL https://example.com | bash
 * It lists all active scripts and, when a TTY is available, offers an
 * interactive picker that downloads and runs the chosen script.
 */

/** Safely single-quote a string for bash. */
export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/** Strip control characters that could mess with the terminal. */
function clean(value, max = 200) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
}

export function renderIndexScript({ baseUrl, title, description, scripts }) {
  const safeTitle = clean(title, 80) || 'Install Dashboard';
  const safeDesc = clean(description, 160);

  const entries = scripts.map((s) => ({
    slug: clean(s.slug, 60),
    name: clean(s.name, 60),
    version: clean(s.version, 30),
    description: clean(s.description?.split('\n')[0] || '', 100),
  }));

  const listLines = entries.map((e, i) => {
    const nr = String(i + 1).padStart(2);
    return `  printf '  %s%s)%s %s%-28s%s %s%-10s%s %s\\n' "$C_ACCENT" ${shellQuote(nr)} "$C_RESET" "$C_BOLD" ${shellQuote(e.name)} "$C_RESET" "$C_DIM" ${shellQuote('v' + e.version)} "$C_RESET" ${shellQuote(e.description)}`;
  }).join('\n');

  const slugArray = entries.map((e) => shellQuote(e.slug)).join(' ');
  const nameArray = entries.map((e) => shellQuote(e.name)).join(' ');

  return `#!/usr/bin/env bash
# ${safeTitle} – generiert von Easy Scripts WebApp
# Verwendung:  curl -fsSL ${baseUrl} | bash
set -euo pipefail

BASE_URL=${shellQuote(baseUrl)}

# /dev/tty can exist but be unusable (CI, Container) – wirklich öffnen testen
if (: </dev/tty) 2>/dev/null; then HAS_TTY=1; else HAS_TTY=0; fi

if [ -t 1 ] || [ "$HAS_TTY" = 1 ]; then
  C_BOLD=$'\\033[1m'; C_DIM=$'\\033[2m'; C_ACCENT=$'\\033[36m'; C_OK=$'\\033[32m'; C_ERR=$'\\033[31m'; C_RESET=$'\\033[0m'
else
  C_BOLD=''; C_DIM=''; C_ACCENT=''; C_OK=''; C_ERR=''; C_RESET=''
fi

printf '\\n%s%s%s\\n' "$C_BOLD" ${shellQuote(safeTitle)} "$C_RESET"
${safeDesc ? `printf '%s%s%s\\n' "$C_DIM" ${shellQuote(safeDesc)} "$C_RESET"` : ':'}
printf '\\n'

SLUGS=(${slugArray})
NAMES=(${nameArray})

if [ \${#SLUGS[@]} -eq 0 ]; then
  printf '%sAktuell sind keine Scripts verfügbar.%s\\n\\n' "$C_DIM" "$C_RESET"
  exit 0
fi

printf '%sVerfügbare Scripts:%s\\n\\n' "$C_BOLD" "$C_RESET"
${listLines}
printf '\\n'

run_script() {
  local slug="$1" name="$2"
  printf '%s→ Lade %s …%s\\n\\n' "$C_ACCENT" "$name" "$C_RESET"
  local tmp
  tmp="$(mktemp)"
  if ! curl -fsSL "\${BASE_URL}/install/\${slug}" -o "$tmp"; then
    printf '%sDownload fehlgeschlagen.%s\\n' "$C_ERR" "$C_RESET"
    rm -f "$tmp"
    exit 1
  fi
  bash "$tmp" </dev/tty
  local rc=$?
  rm -f "$tmp"
  if [ $rc -eq 0 ]; then
    printf '\\n%s✓ %s abgeschlossen.%s\\n' "$C_OK" "$name" "$C_RESET"
  else
    printf '\\n%s✗ %s endete mit Fehlercode %s.%s\\n' "$C_ERR" "$name" "$rc" "$C_RESET"
  fi
  exit $rc
}

if [ "$HAS_TTY" = 1 ]; then
  printf '%sNummer eingeben und mit Enter bestätigen (q = beenden):%s ' "$C_BOLD" "$C_RESET"
  read -r choice </dev/tty || choice='q'
  printf '\\n'
  case "$choice" in
    q|Q|'') printf '%sAbgebrochen.%s\\n' "$C_DIM" "$C_RESET"; exit 0 ;;
  esac
  if ! printf '%s' "$choice" | grep -Eq '^[0-9]+$' || [ "$choice" -lt 1 ] || [ "$choice" -gt \${#SLUGS[@]} ]; then
    printf '%sUngültige Auswahl.%s\\n' "$C_ERR" "$C_RESET"
    exit 1
  fi
  idx=$((choice - 1))
  run_script "\${SLUGS[$idx]}" "\${NAMES[$idx]}"
else
  printf '%sKein Terminal verfügbar – Scripts direkt installieren mit:%s\\n\\n' "$C_DIM" "$C_RESET"
  for i in "\${!SLUGS[@]}"; do
    printf '  curl -fsSL %s/install/%s | bash\\n' "$BASE_URL" "\${SLUGS[$i]}"
  done
  printf '\\n'
fi
`;
}

/** The one-liner shown on the public page for a single script. */
export function curlCommand(baseUrl, slug) {
  return `curl -fsSL ${baseUrl}/install/${slug} | bash`;
}
