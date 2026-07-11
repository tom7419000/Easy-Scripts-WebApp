# Anleitung für End-User

## Scripts entdecken

Öffne die Dashboard-Seite (z. B. `https://install.example.com`) im Browser:
Alle verfügbaren Installations-Scripts werden als Kacheln mit Beschreibung,
Version und fertigem curl-Befehl angezeigt. Mit **Kopieren** landet der Befehl
in der Zwischenablage.

Alternativ direkt im Terminal:

```bash
curl -fsSL https://install.example.com | bash
```

Das zeigt alle Scripts an und fragt (sofern ein Terminal verfügbar ist), welches
installiert werden soll. Ohne Terminal (z. B. in CI) werden die direkten
curl-Befehle aufgelistet.

## Ein bestimmtes Script installieren

```bash
curl -fsSL https://install.example.com/install/<name> | bash
```

Den genauen Befehl zeigt jede Kachel auf der Webseite.

### Eine bestimmte Version installieren

```bash
curl -fsSL https://install.example.com/install/<name>@1.2.3 | bash
```

Ohne Versionsangabe wird immer die aktuelle Version ausgeliefert.

## Script vor der Ausführung prüfen (empfohlen)

Führe niemals blind fremde Scripts aus. So prüfst du den Inhalt vorher:

```bash
# Herunterladen und ansehen
curl -fsSL https://install.example.com/install/<name> -o script.sh
less script.sh

# Prüfsumme mit der Angabe auf der Webseite vergleichen
sha256sum script.sh

# Danach ausführen
bash script.sh
```

Die erwartete SHA-256-Prüfsumme steht auf der Webseite unter „Anleitung anzeigen“
und wird zusätzlich im HTTP-Header `X-Script-SHA256` mitgeliefert.

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| `404` / „nicht gefunden“ | Script wurde deaktiviert oder umbenannt – Webseite prüfen |
| `curl: command not found` | `apt install curl` bzw. `dnf install curl` |
| Script bricht ab | Fehlermeldung lesen; viele Scripts benötigen `sudo`/root |
| Interaktive Auswahl erscheint nicht | `bash <(curl -fsSL https://install.example.com)` verwenden |
