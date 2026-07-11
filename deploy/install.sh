#!/usr/bin/env bash
# ============================================================================
# Easy Scripts WebApp – Server-Installation (Debian/Ubuntu)
#
#   curl -fsSL https://raw.githubusercontent.com/tom7419000/Easy-Scripts-WebApp/main/deploy/install.sh | sudo bash
#
# Installiert die App nach /opt/easy-scripts, richtet einen systemd-Dienst,
# einen Service-Benutzer und die NGINX-Integration ein.
# ============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/easy-scripts}"
APP_USER="easyscripts"
REPO_URL="${REPO_URL:-https://github.com/tom7419000/Easy-Scripts-WebApp.git}"
BRANCH="${BRANCH:-main}"
NODE_MAJOR=22

log()  { printf '\033[36m[install]\033[0m %s\n' "$*"; }
fail() { printf '\033[31m[fehler]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Bitte als root ausführen (sudo)."
command -v apt-get >/dev/null || fail "Dieses Script unterstützt Debian/Ubuntu (apt)."

log "Installiere Systempakete …"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates nginx >/dev/null

if ! command -v node >/dev/null || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 18 ]; then
  log "Installiere Node.js ${NODE_MAJOR}.x …"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
log "Node $(node -v), npm $(npm -v)"

if ! id "$APP_USER" >/dev/null 2>&1; then
  log "Lege Service-Benutzer '$APP_USER' an …"
  useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

if [ -d "$APP_DIR/.git" ]; then
  log "Aktualisiere bestehende Installation …"
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  log "Klone Repository nach $APP_DIR …"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
log "Installiere Abhängigkeiten und baue das Frontend …"
npm install --no-audit --no-fund
npm run build

mkdir -p "$APP_DIR/data"

if [ ! -f "$APP_DIR/.env" ]; then
  log "Erstelle .env …"
  cat > "$APP_DIR/.env" <<'ENV'
PORT=3001
HOST=127.0.0.1
TRUST_PROXY=true
SCRIPT_REFRESH_INTERVAL=60
NGINX_CONF_PATH=/etc/nginx/conf.d/install-manager.conf
NGINX_RELOAD_CMD=sudo -n /usr/sbin/nginx -t && sudo -n /usr/bin/systemctl reload nginx
NGINX_AUTO_APPLY=true
ENV
fi

log "Richte NGINX-Integration ein …"
touch /etc/nginx/conf.d/install-manager.conf
chown "$APP_USER:$APP_USER" /etc/nginx/conf.d/install-manager.conf
cat > /etc/sudoers.d/easyscripts-nginx <<SUDO
$APP_USER ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /usr/bin/systemctl reload nginx
SUDO
chmod 440 /etc/sudoers.d/easyscripts-nginx

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

log "Installiere systemd-Dienst …"
sed "s|/opt/easy-scripts|$APP_DIR|g" "$APP_DIR/deploy/systemd/easy-scripts.service" \
  > /etc/systemd/system/easy-scripts.service
systemctl daemon-reload
systemctl enable --now easy-scripts.service
sleep 2
systemctl is-active --quiet easy-scripts.service || fail "Dienst konnte nicht gestartet werden: journalctl -u easy-scripts"

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
cat <<DONE

$(printf '\033[32m')✓ Installation abgeschlossen!$(printf '\033[0m')

  Nächste Schritte:
  1. Admin-Panel öffnen:  http://${IP:-<server-ip>}:3001/admin
     (bzw. per SSH-Tunnel: ssh -L 3001:127.0.0.1:3001 user@server)
  2. Admin-Konto im Setup-Dialog anlegen
  3. Unter "NGINX" die Domain eintragen und "Anwenden" klicken
  4. Optional TLS:  certbot certonly --webroot -w /var/www/html -d deine-domain
  5. GitLab-Scripts unter "Scripts" hinzufügen

  Dienststatus:  systemctl status easy-scripts
  Logs:          journalctl -u easy-scripts -f

DONE
