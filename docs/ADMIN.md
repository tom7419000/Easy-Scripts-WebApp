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

## Branding & Layout (Einstellungen)

- **Titel/Beschreibung** erscheinen im Header, Hero und im Terminal-Landing-Script.
- **Logo:** Bild-Upload (max. 300 KB, wird als data-URL gespeichert) oder Emoji.
- **Farben:** Primär- und Akzentfarbe wirken auf Verläufe, Buttons, Badges.
- **Schriftart:** systemnahe Stacks (keine externen Font-CDNs → CSP-konform).
- **Standard-Theme:** Dunkel/Hell; Besucher können jederzeit umschalten.
- **Kachel-Layout:** Spaltenzahl (auto/1–4), kompakt/komfortabel, Hero-Bereich,
  Version/Download-Anzeige ein-/ausblenden.
- **Header-/Footer-Links, Footer-Text** frei konfigurierbar.
- **Öffentliche Basis-URL:** überschreibt die automatisch erkannte Domain in den
  angezeigten curl-Befehlen (wichtig hinter mehreren Proxies).

Alle Änderungen erscheinen ohne Reload sofort auf der öffentlichen Seite (SSE).

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
- **Update der App:** `deploy/install.sh` erneut ausführen oder `git pull && npm install && npm run build && systemctl restart easy-scripts`.
- **Passwort ändern:** Einstellungen → Konto (meldet alle anderen Sessions ab).
