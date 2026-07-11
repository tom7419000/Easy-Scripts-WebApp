# Admin-Handbuch

## Erster Start

1. App starten (siehe [README](../README.md)) und `https://deine-domain/admin` öffnen.
2. Beim ersten Aufruf erscheint der **Setup-Dialog**: Benutzername und Passwort
   (mind. 10 Zeichen) festlegen. Danach bist du automatisch angemeldet.
3. Das Setup ist nur möglich, solange noch kein Konto existiert – danach ist der
   Endpunkt gesperrt.

> Passwort vergessen? Auf dem Server `data/db.json` öffnen und das `users`-Array
> leeren (`"users": []`), dann den Dienst neu starten – der Setup-Dialog erscheint erneut.

## Scripts von GitLab hinzufügen

1. **Scripts → „+ Script hinzufügen“**
2. GitLab-URL einfügen. Unterstützt werden:
   - Projekt-URLs: `https://gitlab.com/gruppe/projekt` (auch Subgruppen, auch selbst gehostet)
   - Branch-URLs: `…/-/tree/develop`
   - Direkte Datei-URLs: `…/-/blob/main/install.sh` (überspringt die Erkennung)
3. Für **private Repositories** ein Access-Token mit Scope `read_api` angeben
   (GitLab → Settings → Access Tokens). Das Token wird AES-verschlüsselt gespeichert.
   Alternativ unter **Einstellungen → Integration** ein Standard-Token für alle
   Repos hinterlegen.
4. **„Repository analysieren“**: Die App listet alle Shell-Scripts, sortiert nach
   Wahrscheinlichkeit (`install.sh` im Root wird empfohlen). Mit **Vorschau** den
   Inhalt prüfen, gewünschte Scripts anhaken, **importieren**.
5. Importierte Scripts sind zunächst **inaktiv**. Metadaten prüfen (Bearbeiten)
   und mit dem Schalter **aktivieren** – erst dann sind sie öffentlich abrufbar.

## Scripts verwalten

| Aktion | Wo |
|---|---|
| Metadaten (Name, Beschreibung, Version, Icon, Tags, Slug) | Bearbeiten-Dialog |
| Aktivieren/Deaktivieren | Schalter in der Script-Liste |
| Reihenfolge auf der öffentlichen Seite | ▲/▼ in der Liste |
| curl-Befehl kopieren | „curl“-Button |
| Manuell von GitLab aktualisieren | Bearbeiten → „⟳ Jetzt von GitLab aktualisieren“ |
| Ältere Version ansehen / wiederherstellen | Bearbeiten → Versionstabelle |
| Löschen (inkl. aller Versionen) | „Löschen“ + Bestätigung |

**Versionierung:** Jeder Abruf mit geändertem Inhalt erzeugt eine neue Version
(Inhalt wird lokal gecacht – GitLab-Ausfälle betreffen die Auslieferung nicht).
Bei semantischen Versionen (`1.2.3`) wird automatisch die Patch-Version erhöht,
sonst `YYYY-MM-DD-<commit>` vergeben. End-User können Versionen pinnen:
`curl -fsSL https://domain/install/slug@1.2.3 | bash`.

**Auto-Update:** Scripts mit aktivem „Automatisch aktualisieren“ werden alle
`SCRIPT_REFRESH_INTERVAL` Minuten (Default 60) neu von GitLab geladen. Fehler
erscheinen auf der Übersichtsseite.

## Script-Icons (Font Awesome)

Im Bearbeiten-Dialog öffnet **„Icon wählen"** einen durchsuchbaren Picker mit
374 kuratierten Font-Awesome-6-Icons (Infrastruktur, Entwicklung und Marken wie
`fa-brands fa-docker`, `fa-brands fa-ubuntu`, `fa-solid fa-server`). Die Icons
sind selbst gehostet – kein externes CDN, CSP bleibt strikt. Über das Feld
„Eigener Wert" sind weiterhin Emojis oder Bild-URLs möglich. Ungültige
Font-Awesome-Klassen werden serverseitig verworfen.

## Branding & Layout (Einstellungen)

- **Titel/Beschreibung** erscheinen im Header, Hero und im Terminal-Landing-Script.
- **Logo:** Bild-Upload (max. 300 KB, wird als data-URL gespeichert) oder Emoji.
  Das Logo wird ohne Hintergrund-Box direkt im Header angezeigt (mit dezentem
  Hover-Effekt) und automatisch als **Favicon** ausgeliefert (`/favicon.svg`,
  skaliert verlustfrei auf 16/32/64 px; Änderungen greifen ohne weiteres Zutun).
- **Farben:** Primär- und Akzentfarbe wirken auf Verläufe, Buttons, Badges und
  das Standard-Favicon.
- **Schriftart:** systemnahe Stacks (keine externen Font-CDNs → CSP-konform).
- **Standard-Theme:** Dunkel/Hell; Besucher können jederzeit umschalten.
- **Kachel-Layout:** Standard sind **2 Spalten** (Desktop/Tablet; mobil 1 Spalte),
  damit curl-Befehle vollständig sichtbar sind. Alternativ auto/1/3/4 Spalten,
  kompakt/komfortabel, Hero-Bereich, Version/Download-Anzeige ein-/ausblenden.
- **Header-/Footer-Links, Footer-Text** frei konfigurierbar.

Alle Änderungen erscheinen ohne Reload sofort auf der öffentlichen Seite (SSE).

## Öffentliche Installations-URL (Domain statt IP)

Unter **Einstellungen → Integration** lässt sich festlegen, welche Adresse in
den generierten curl-Befehlen erscheint:

1. Protokoll wählen (`https://` oder `http://` – z. B. `http://`, wenn ein
   Cloudflare Tunnel intern unverschlüsselt an die App anbindet).
2. Domain/Hostname eintragen, z. B. `install-dashboard.tomsattler.de`
   (optional mit `:Port`). Die Eingabe wird client- und serverseitig validiert;
   eine Live-Vorschau zeigt den resultierenden Befehl.
3. Speichern – alle curl-Befehle (Webseite **und** Terminal-Landing-Script)
   verwenden sofort die Domain.

Fallback-Reihenfolge, wenn das Feld leer ist: Umgebungsvariable `PUBLIC_URL`
(vollständige URL) → `INSTALLATION_DOMAIN` (nur Hostname, Standard-Protokoll
`http://`) → automatisch die aufgerufene Adresse/IP.

## NGINX

Unter **NGINX**:

1. Domain eintragen, optional HTTPS mit Zertifikatspfaden aktivieren.
2. **„Speichern & Vorschau aktualisieren“** – die generierte Konfiguration wird angezeigt.
3. **„Anwenden & NGINX neu laden“** schreibt die Datei nach `NGINX_CONF_PATH`
   und führt `NGINX_RELOAD_CMD` aus (`nginx -t` + Reload). Ausgabe erscheint im Panel.
4. Statusanzeige: *Aktuell angewendet* / *Abweichend* / *Noch nicht angewendet*.

Voraussetzungen für das automatische Anwenden:
- Der Dienst muss die Zieldatei schreiben dürfen und NGINX neu laden können.
  `deploy/install.sh` richtet das automatisch ein (Dateibesitz + sudo-Regel).
- Mit `NGINX_AUTO_APPLY=false` wird der Button deaktiviert (nur Vorschau/Kopieren).

TLS: `sudo certbot certonly --webroot -w /var/www/html -d deine-domain`, dann
Zertifikatspfade eintragen und erneut anwenden.

## Betrieb

- **Dienststatus:** `systemctl status easy-scripts` · Logs: `journalctl -u easy-scripts -f`
- **Backup:** Verzeichnis `data/` sichern (enthält DB, Script-Versionen, Secret).
  Ohne `data/.secret` (bzw. `SESSION_SECRET`) sind gespeicherte GitLab-Tokens unlesbar.
- **Update der App:** `sudo /opt/easy-scripts/deploy/update.sh` (siehe unten).
- **Passwort ändern:** Einstellungen → Konto (meldet alle anderen Sessions ab).

## Update

Zum Aktualisieren auf den neuesten Stand – ohne Neuinstallation und ohne
Datenverlust:

```bash
sudo /opt/easy-scripts/deploy/update.sh
```

Ablauf des Skripts:

1. Prüft, ob überhaupt eine neue Version vorliegt (sonst Abbruch, außer `--force`).
2. Legt ein Backup von `data/` und `.env` unter `data/../backups/` an
   (die letzten 5 werden behalten) und merkt sich die aktuelle Version.
3. Holt den neuesten Code (`git fetch` + `reset --hard`), installiert
   Abhängigkeiten, baut das Frontend neu, erneuert die systemd-Unit und startet
   den Dienst.
4. Führt einen **Health-Check** gegen `/healthz` aus. Schlägt er fehl, wird
   **automatisch auf die vorherige Version zurückgerollt** – die App bleibt lauffähig.

`data/` und `.env` werden dabei nie überschrieben (sie sind aus der
Versionsverwaltung ausgenommen).

**Optionen:**

| Option | Wirkung |
|---|---|
| `--force` | Neu bauen & neu starten, auch wenn keine neue Version vorliegt |
| `--branch <name>` | Von einem anderen Branch aktualisieren (Standard: `main`) |
| `--no-backup` | Kein Daten-Backup anlegen (die Vorversion wird trotzdem für Rollback gemerkt) |
| `--rollback` | Manuell auf die zuletzt gesicherte Version zurückrollen |
| `-h`, `--help` | Hilfe anzeigen |

Sollte nach einem Update doch ein Problem auftreten, das der Health-Check nicht
erkannt hat:

```bash
sudo /opt/easy-scripts/deploy/update.sh --rollback
```

Die Daten-Backups liegen als `backup-<Zeitstempel>.tar.gz` im Verzeichnis
`backups/` und lassen sich bei Bedarf manuell entpacken
(`tar xzf backups/backup-….tar.gz -C /opt/easy-scripts`).
