# 🚀 Easy Scripts WebApp – Installation Script Manager

Eine moderne Web-Anwendung, mit der Installations-Scripts per `curl` bereitgestellt
werden – verwaltet über ein komfortables Admin-Dashboard, ohne manuelle NGINX-
oder Node.js-Konfiguration.

```bash
# So installieren End-User ein Script:
curl -fsSL https://install.example.com | bash          # interaktive Auswahl
curl -fsSL https://install.example.com/install/docker | bash   # direkt
```

## Features

**Öffentliche Seite**
- Kachel-Dashboard mit allen aktiven Scripts (2-Spalten-Grid auf Desktop/Tablet,
  1 Spalte mobil – der volle curl-Befehl bleibt sichtbar)
- Copy-to-Clipboard-curl-Befehl, Beschreibung, Version, Tags und SHA-256-Prüfsumme pro Script
- Font Awesome 6 Icons pro Script (selbst gehostet, kein CDN – CSP-konform)
- Suche, Dark-/Light-Mode, responsiv (Mobile/Tablet/Desktop), WCAG-orientiert
- `curl https://domain | bash` zeigt eine interaktive Script-Auswahl im Terminal
- Favicon wird automatisch aus dem Branding-Logo generiert
- Live-Aktualisierung über Server-Sent Events

**Admin-Panel** (`/admin`)
- Geschützter Bereich mit Session-Login (scrypt-Passwort-Hashing, CSRF-Schutz, Rate-Limiting)
- **GitLab-Integration:** Repository-URL einfügen → App erkennt Install-Scripts
  (`install.sh`, `setup.sh`, …) automatisch, mit Datei-Vorschau vor dem Import
- Script-Verwaltung: Metadaten (Name, Beschreibung, Version, Icon, Tags), Slug,
  Aktivieren/Deaktivieren, Reihenfolge, Löschen
- Icon-Auswahl: durchsuchbarer Font-Awesome-Picker (374 kuratierte Icons,
  z. B. `fa-server`, `fa-docker`) plus Emoji/Bild-URL als Alternative
- Öffentliche Installations-URL: Domain/Hostname mit HTTP/HTTPS-Auswahl statt
  Server-IP in den curl-Befehlen – ideal für Cloudflare-Tunnel-Setups
  (Fallback-Reihenfolge: Admin-Einstellung → `PUBLIC_URL` →
  `INSTALLATION_DOMAIN` → aufgerufene Adresse/IP)
- Versionierung: jede Änderung aus GitLab wird als Version gecacht; ältere Versionen
  einsehbar, wiederherstellbar und per `…/install/slug@version` abrufbar
- Auto-Update: Scripts werden periodisch von GitLab aktualisiert (konfigurierbar)
- Branding: Titel, Beschreibung, Logo (Upload oder Emoji), Farben, Schriftart,
  Standard-Theme, Kachel-Layout, Header-/Footer-Links
- **NGINX:** Reverse-Proxy-Konfiguration wird generiert und per Klick angewendet
  (inkl. `nginx -t` + Reload), mit Statusanzeige und Vorschau

**Technik**
- Backend: Node.js ≥ 18 + Express, JSON-Datei-DB mit atomaren Writes, keine nativen Abhängigkeiten
- Frontend: React 18 + Vite, CSS-Design-System mit Custom Properties
- Sicherheit: HttpOnly-Session-Cookies (SameSite=Strict), CSRF-Token, Security-Header
  (CSP, HSTS, …), Input-Validierung, verschlüsselte GitLab-Tokens (AES-256-GCM)
- Erweiterbar: Script-Quellen sind als `source.type` abstrahiert (aktuell `gitlab`)

## Schnellstart (Entwicklung)

```bash
git clone https://github.com/tom7419000/Easy-Scripts-WebApp.git
cd Easy-Scripts-WebApp
npm install
npm run dev
```

- Frontend (mit Hot-Reload): http://127.0.0.1:5173 – Admin unter http://127.0.0.1:5173/admin
- API/curl-Endpunkte: http://127.0.0.1:3001
- Beim ersten Aufruf von `/admin` wird das Admin-Konto angelegt (Setup-Dialog).

## Produktion

### Variante A: Automatische Installation (Debian/Ubuntu)

```bash
curl -fsSL https://raw.githubusercontent.com/tom7419000/Easy-Scripts-WebApp/main/deploy/install.sh | sudo bash
```

Das Script installiert Node.js + NGINX, legt den Service-Benutzer und den
systemd-Dienst an und konfiguriert die NGINX-Integration (inkl. sudo-Regel für
den Reload). Danach: Admin-Panel öffnen → Konto anlegen → Domain unter „NGINX“
eintragen → „Anwenden“.

### Variante B: Manuell

```bash
npm install
npm run build          # baut client/dist
cp .env.example .env   # optional anpassen
npm start              # startet den Server (Port 3001)
```

Anschließend im Admin-Panel unter **NGINX** die Domain eintragen und „Anwenden &
NGINX neu laden“ klicken – die App schreibt die Konfiguration nach
`NGINX_CONF_PATH` (Default `/etc/nginx/conf.d/install-manager.conf`) und lädt
NGINX neu. Alternativ die Vorschau kopieren und manuell ablegen
(`deploy/nginx/install-manager.conf.example` zeigt das Zielformat).

TLS-Zertifikat (Let's Encrypt):

```bash
sudo certbot certonly --webroot -w /var/www/html -d install.example.com
```

Danach im Admin-Panel HTTPS aktivieren und die Zertifikatspfade eintragen.

### Update (ohne Neuinstallation)

Eine bestehende Installation lässt sich jederzeit aktualisieren, ohne sie neu
aufzusetzen – Daten (`data/`) und Konfiguration (`.env`) bleiben erhalten:

```bash
sudo /opt/easy-scripts/deploy/update.sh
```

Das Skript legt vor dem Update ein Backup an, holt den neuesten Stand, baut das
Frontend neu, erneuert die systemd-Unit und startet den Dienst. Schlägt der
anschließende Health-Check fehl, wird **automatisch auf die vorherige Version
zurückgerollt**. Optionen: `--force` (neu bauen trotz gleichem Stand),
`--branch <name>`, `--no-backup`, `--rollback` (manuell auf die zuletzt
gesicherte Version zurück). Details in [docs/ADMIN.md](docs/ADMIN.md#update).

## Workflow

1. Admin öffnet das Admin-Panel und meldet sich an
2. GitLab-Repository-URL ins Eingabefeld kopieren (auch Branch-/Datei-URLs möglich)
3. System parst das Repository und erkennt Install-Scripts (mit Score/Empfehlung)
4. Vorschau ansehen, Scripts auswählen und importieren, Metadaten anpassen
5. Script aktivieren → sofort per curl abrufbar, NGINX bleibt unangetastet
   (Proxy leitet alles an die App weiter; neue Scripts brauchen keine NGINX-Änderung)

## Projektstruktur

```
├── server/            Express-Backend
│   ├── src/
│   │   ├── index.js       Einstiegspunkt (Boot, Auto-Update-Timer)
│   │   ├── app.js         Express-App-Factory
│   │   ├── config.js      Konfiguration aus ENV
│   │   ├── db.js          JSON-Datenbank + Blob-Speicher für Scriptinhalte
│   │   ├── gitlab.js      GitLab-API-Client, URL-Parser, Script-Erkennung
│   │   ├── scripts.js     Script-Service (Import, Versionen, Refresh, Serving)
│   │   ├── bash.js        Generator für das interaktive curl-Landing-Script
│   │   ├── nginx.js       NGINX-Config-Generierung + Apply
│   │   ├── sessions.js    Session-Store, Auth-/CSRF-Middleware
│   │   ├── crypto.js      scrypt-Hashing, AES-GCM-Token-Verschlüsselung
│   │   ├── events.js      Server-Sent-Events-Bus
│   │   └── routes/        public.js (curl + öffentliche API), admin.js
│   └── test/          node:test-Suite (38 Tests, inkl. End-to-End)
├── client/            React-Frontend (Vite)
│   └── src/
│       ├── public/        Öffentliche Dashboard-Seite
│       ├── admin/         Admin-Panel (Login, Übersicht, Scripts, Einstellungen, NGINX)
│       ├── components/    Modal, Toast, Toggle, CopyButton
│       └── lib/           API-Client (CSRF), SSE-Hook, Theme/Branding
├── deploy/            install.sh, systemd-Unit, NGINX-Beispiel
├── docs/              ADMIN.md, USER.md, SECURITY.md
└── scripts/dev.js     Dev-Orchestrator (Server + Vite)
```

## Konfiguration

Alle Optionen (Ports, Datenverzeichnis, GitLab-Host-Allowlist, NGINX-Pfade,
Auto-Update-Intervall, …) sind in [`.env.example`](.env.example) dokumentiert.

## Tests

```bash
npm test
```

Deckt URL-Parsing, Script-Erkennung, Krypto, NGINX-Generierung, Bash-Escaping
(inkl. `bash -n`-Syntaxprüfung) und einen vollständigen End-to-End-Flow
(Setup → Login → Import → Aktivieren → curl-Abruf → Löschen) ab.

## Dokumentation

- [Admin-Handbuch](docs/ADMIN.md) – Scripts verwalten, Branding, NGINX, Updates
- [End-User-Anleitung](docs/USER.md) – Scripts installieren, Prüfsummen verifizieren
- [Sicherheitskonzept](docs/SECURITY.md) – Threat Model, Härtung, Hinweise

## Lizenz

MIT
