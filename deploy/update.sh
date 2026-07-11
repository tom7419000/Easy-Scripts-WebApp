#!/usr/bin/env bash
# ============================================================================
# Easy Scripts WebApp – Update (Debian/Ubuntu)
#
#   sudo /opt/easy-scripts/deploy/update.sh
#   curl -fsSL https://raw.githubusercontent.com/tom7419000/Easy-Scripts-WebApp/main/deploy/update.sh | sudo bash
#
# Aktualisiert eine bestehende Installation auf den neuesten Stand des
# Repositorys, OHNE sie neu zu installieren und ohne Daten zu verlieren:
#   - Daten (data/) und Konfiguration (.env) bleiben unberuehrt
#   - vor dem Update wird ein Backup erstellt
#   - schlaegt der Health-Check nach dem Update fehl, wird automatisch auf die
#     vorherige Version zurueckgerollt
#
# Optionen:
#   --force            Neu bauen & neu starten, auch wenn keine neue Version vorliegt
#   --no-backup        Kein Daten-Backup vor dem Update anlegen
#   --rollback         Auf die zuletzt gesicherte Version zurueckrollen
#   --branch <name>    Anderen Branch verwenden (Standard: main)
#   -h | --help        Diese Hilfe anzeigen
# ============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/easy-scripts}"
APP_USER="${APP_USER:-easyscripts}"
SERVICE="${SERVICE:-easy-scripts.service}"
BRANCH="${BRANCH:-main}"
KEEP_BACKUPS="${KEEP_BACKUPS:-5}"
BACKUP_DIR="$APP_DIR/backups"
UNIT_SRC="$APP_DIR/deploy/systemd/easy-scripts.service"
UNIT_DEST="${UNIT_DEST:-/etc/systemd/system/$SERVICE}"

DO_BACKUP=1
FORCE=0
ROLLBACK=0

log()  { printf '\033[36m[update]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[warnung]\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m%s\033[0m\n' "$*"; }
fail() { printf '\033[31m[fehler]\033[0m %s\n' "$*" >&2; exit 1; }

# Hilfetext = Kommentar-Kopf zwischen den beiden "# ===="-Trennlinien
usage() {
  awk '/^# ={5,}/{c++; next} c==1{sub(/^# ?/, ""); print} c>=2{exit}' "$0"
  exit 0
}

# --- Selbstschutz: aus temporaerer Kopie ausfuehren -----------------------
# Wird das Script direkt aus dem Checkout gestartet (nicht via curl | bash),
# wuerde "git reset --hard" die gerade laufende Datei ueberschreiben. Deshalb
# einmalig in eine Kopie auslagern und von dort neu starten. Der Trap entfernt
# ausschliesslich genau diese temporaere Kopie (nie ein beliebiges $0).
if [ "${ESW_UPDATE_SELF:-}" = "" ] && [ -f "$0" ]; then
  _self="$(mktemp)"
  cat "$0" > "$_self"
  ESW_UPDATE_SELF="$_self" exec bash "$_self" "$@"
fi
if [ -n "${ESW_UPDATE_SELF:-}" ]; then
  trap 'rm -f "$ESW_UPDATE_SELF"' EXIT
fi

# --- Argumente ------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --force)     FORCE=1 ;;
    --no-backup) DO_BACKUP=0 ;;
    --rollback)  ROLLBACK=1 ;;
    --branch)    BRANCH="${2:?--branch benoetigt einen Wert}"; shift ;;
    -h|--help)   usage ;;
    *)           fail "Unbekannte Option: $1 (--help fuer Hilfe)" ;;
  esac
  shift
done

# --- Vorbedingungen -------------------------------------------------------
[ "$(id -u)" -eq 0 ] || fail "Bitte als root ausfuehren (sudo)."
[ -d "$APP_DIR/.git" ] || fail "Keine Installation unter $APP_DIR gefunden. Zuerst deploy/install.sh ausfuehren."
for cmd in git npm curl systemctl; do
  command -v "$cmd" >/dev/null || fail "'$cmd' nicht gefunden."
done

# .env-Wert auslesen (mit Fallback)
get_env() {
  local key="$1" default="$2" val=''
  if [ -f "$APP_DIR/.env" ]; then
    val="$(grep -E "^${key}=" "$APP_DIR/.env" | tail -1 | cut -d= -f2- | tr -d '"'"'"' \r')"
  fi
  printf '%s' "${val:-$default}"
}

# Health-Check gegen den /healthz-Endpunkt des Dienstes
health_check() {
  local host port url
  host="$(get_env HOST 127.0.0.1)"
  [ "$host" = "0.0.0.0" ] && host="127.0.0.1"
  port="$(get_env PORT 3001)"
  url="http://${host}:${port}/healthz"
  log "Health-Check: $url"
  for _ in $(seq 1 20); do
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

# Auf einen Commit deployen: Code setzen, bauen, systemd-Unit erneuern,
# Rechte setzen und Dienst neu starten. Jeder Schritt wird explizit geprueft,
# damit ein Fehler sauber als Rueckgabewert weitergereicht wird.
deploy_commit() {
  local ref="$1"
  log "Setze Code auf $(git -C "$APP_DIR" rev-parse --short "$ref") …"
  git -C "$APP_DIR" reset --hard "$ref" >/dev/null || return 1
  cd "$APP_DIR" || return 1
  log "Installiere Abhaengigkeiten …"
  npm install --no-audit --no-fund || return 1
  log "Baue Frontend …"
  npm run build || return 1
  if [ -f "$UNIT_SRC" ]; then
    log "Aktualisiere systemd-Unit …"
    sed "s|/opt/easy-scripts|$APP_DIR|g" "$UNIT_SRC" > "$UNIT_DEST" || return 1
  fi
  chown -R "$APP_USER:$APP_USER" "$APP_DIR" || return 1
  systemctl daemon-reload || return 1
  log "Starte Dienst neu …"
  systemctl restart "$SERVICE" || return 1
  return 0
}

# --------------------------------------------------------------------------
# Rollback-Modus
# --------------------------------------------------------------------------
if [ "$ROLLBACK" = 1 ]; then
  [ -f "$BACKUP_DIR/.previous-commit" ] || fail "Keine vorherige Version gespeichert (noch kein Update durchgefuehrt?)."
  target="$(cat "$BACKUP_DIR/.previous-commit")"
  log "Rolle zurueck auf $target …"
  if deploy_commit "$target" && health_check; then
    ok "✓ Rollback erfolgreich. Aktuelle Version: $(git -C "$APP_DIR" rev-parse --short HEAD)"
    exit 0
  fi
  fail "Rollback fehlgeschlagen. Logs pruefen: journalctl -u $SERVICE -n 50"
fi

# --------------------------------------------------------------------------
# Update-Modus
# --------------------------------------------------------------------------
cd "$APP_DIR"
OLD_COMMIT="$(git rev-parse HEAD)"
log "Aktuelle Version: $(git rev-parse --short HEAD) (Branch: $BRANCH)"

log "Hole Aenderungen von origin/$BRANCH …"
attempt=0
until git fetch --tags --prune origin "$BRANCH"; do
  attempt=$((attempt + 1))
  [ "$attempt" -ge 4 ] && fail "git fetch fehlgeschlagen (Netzwerk?)."
  sleep "$((attempt * 2))"
done
NEW_COMMIT="$(git rev-parse "origin/$BRANCH")"

if [ "$OLD_COMMIT" = "$NEW_COMMIT" ] && [ "$FORCE" != 1 ]; then
  ok "✓ Bereits auf dem neuesten Stand ($(git rev-parse --short HEAD))."
  echo "  (Mit --force trotzdem neu bauen und neu starten.)"
  exit 0
fi

# --- Backup ---------------------------------------------------------------
mkdir -p "$BACKUP_DIR"
if [ "$DO_BACKUP" = 1 ]; then
  ts="$(date +%Y%m%d-%H%M%S)"
  archive="$BACKUP_DIR/backup-${ts}.tar.gz"
  log "Sichere Daten & Konfiguration nach $archive …"
  backup_items=()
  [ -d "$APP_DIR/data" ] && backup_items+=("data")
  [ -f "$APP_DIR/.env" ] && backup_items+=(".env")
  if [ "${#backup_items[@]}" -gt 0 ]; then
    tar czf "$archive" -C "$APP_DIR" "${backup_items[@]}" || warn "Backup konnte nicht vollstaendig erstellt werden."
  else
    warn "Keine Daten/Konfiguration zum Sichern gefunden."
  fi
  # Alte Backups aufraeumen (die neuesten KEEP_BACKUPS behalten)
  ls -1t "$BACKUP_DIR"/backup-*.tar.gz 2>/dev/null | tail -n +"$((KEEP_BACKUPS + 1))" | xargs -r rm -f
fi
# Vorherige Version fuer spaeteres --rollback merken
echo "$OLD_COMMIT" > "$BACKUP_DIR/.previous-commit"

changes="$(git log --oneline "$OLD_COMMIT..$NEW_COMMIT" 2>/dev/null | wc -l | tr -d ' ')"
log "Neue Commits: ${changes:-0}"

# --- Update anwenden mit Auto-Rollback ------------------------------------
if deploy_commit "$NEW_COMMIT" && health_check; then
  echo
  ok "✓ Update erfolgreich!"
  echo "  Version:  $(git rev-parse --short "$OLD_COMMIT")  →  $(git rev-parse --short HEAD)"
  if [ "${changes:-0}" -gt 0 ]; then
    echo "  Aenderungen:"
    git log --oneline "$OLD_COMMIT..HEAD" | sed 's/^/    /' | head -n 15
  fi
  echo
  echo "  Dienststatus:  systemctl status $SERVICE"
  echo "  Logs:          journalctl -u $SERVICE -f"
  echo "  Rollback:      sudo $APP_DIR/deploy/update.sh --rollback"
  echo
else
  warn "Update fehlgeschlagen oder Dienst nicht gesund – automatischer Rollback auf $(git rev-parse --short "$OLD_COMMIT") …"
  if deploy_commit "$OLD_COMMIT" && health_check; then
    fail "Update fehlgeschlagen, Rollback auf die vorherige Version war erfolgreich. Logs: journalctl -u $SERVICE -n 50"
  else
    fail "Update UND Rollback fehlgeschlagen! Dienst dringend pruefen: journalctl -u $SERVICE -n 50"
  fi
fi
