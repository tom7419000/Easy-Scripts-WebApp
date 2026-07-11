# Sicherheitskonzept

## Überblick

Die App liefert ausführbaren Shell-Code an End-User aus – Integrität und
Zugriffsschutz stehen daher im Mittelpunkt.

## Authentifizierung & Sessions

- Passwörter werden mit **scrypt** (N=16384, r=8, p=1, 16-Byte-Salt) gehasht;
  Vergleich timing-sicher.
- Sessions sind serverseitig gespeichert; das Cookie enthält nur eine
  HMAC-signierte Session-ID (**HttpOnly, SameSite=Strict**, `Secure` hinter HTTPS).
- **Rate-Limiting** auf Login (8 Versuche/Benutzer, 20/IP pro 15 min) und Setup.
- Der Setup-Endpunkt ist nur nutzbar, solange kein Konto existiert.
- Passwortwechsel invalidiert alle bestehenden Sessions.

## CSRF & Header

- Alle mutierenden Admin-Endpunkte verlangen den Header `X-CSRF-Token`
  (per Session generiert, an den Client nur nach Login übergeben) – zusätzlich
  zu `SameSite=Strict`.
- Security-Header auf allen Antworten: `Content-Security-Policy`
  (`default-src 'self'`, keine externen Quellen), `X-Content-Type-Options`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`,
  `Strict-Transport-Security` (hinter HTTPS).
- Frontend lädt keinerlei externe Ressourcen (Fonts, CDNs) – CSP-konform.

## Eingabevalidierung

- Alle Admin-Eingaben werden serverseitig validiert und begrenzt (Längen,
  Hex-Farben, Domain-Regex, URL-Schemata; `javascript:`-Links werden verworfen).
- Slugs werden normalisiert (`[a-z0-9-]`), Blob-Dateinamen zusätzlich gefiltert –
  keine Pfad-Traversal-Möglichkeit.
- NGINX-Konfiguration wird nur aus validierten Werten generiert
  (Domain-/Pfad-Regex verhindern Injection in die Config).
- Request-Bodies sind auf 1 MB begrenzt, Script-Dateien auf `MAX_SCRIPT_BYTES`.

## Script-Integrität

- Scriptinhalte werden beim Import lokal versioniert gecacht; ausgeliefert wird
  ausschließlich der geprüfte Cache (ein kompromittiertes/erreichbares GitLab
  beeinflusst laufende Auslieferungen nicht sofort).
- SHA-256-Prüfsummen werden gespeichert, auf der Webseite angezeigt und als
  `X-Script-SHA256`-Header mitgesendet.
- Binärdateien und leere Dateien werden abgelehnt.
- Das Terminal-Landing-Script escapet sämtliche Metadaten shell-sicher
  (getestet mit `bash -n` und feindlichen Namen wie `$(…)`, Backticks, Quotes).
- **Hinweis:** Die inhaltliche Vertrauenswürdigkeit der Scripts liegt beim Admin –
  die App prüft Herkunft und Integrität, nicht die Semantik des Codes.

## Geheimnisse

- GitLab-Access-Tokens werden mit **AES-256-GCM** verschlüsselt gespeichert
  (Schlüssel per HKDF aus dem App-Secret abgeleitet) und nie an den Client
  zurückgegeben (nur `hasToken`-Flag).
- Das App-Secret wird automatisch generiert und mit Mode `0600` in
  `data/.secret` abgelegt (alternativ `SESSION_SECRET` per ENV).
- `data/` gehört ins Backup, aber nicht ins Git (siehe `.gitignore`).

## SSRF / GitLab-Fetching

- Nur `http(s)`-URLs; Cloud-Metadaten-Endpunkte (`169.254.169.254`,
  `metadata.google.internal`) sind blockiert.
- Optional kann `GITLAB_ALLOWED_HOSTS` die erlaubten GitLab-Hosts auf eine
  Allowlist beschränken – empfohlen, wenn mehrere Admins Zugriff haben.
  (Interne Hosts sind bewusst nicht pauschal gesperrt, da selbst gehostete
  GitLab-Instanzen häufig in privaten Netzen laufen.)
- Nur authentifizierte Admins können Fetches auslösen; Timeouts und
  Größenlimits begrenzen die Wirkung.

## NGINX-Integration

- Automatisches Anwenden lässt sich mit `NGINX_AUTO_APPLY=false` komplett
  deaktivieren (dann nur Vorschau).
- Der Installer richtet minimale Rechte ein: Der Dienst-Benutzer besitzt genau
  die eine Konfigurationsdatei und darf per sudo ausschließlich
  `nginx -t` und `systemctl reload nginx` ausführen.
- Empfohlen: TLS aktivieren (Let's Encrypt), damit curl-Downloads
  manipulationssicher übertragen werden. HSTS wird automatisch gesetzt.

## Meldungen

Sicherheitslücken bitte vertraulich an den Betreiber melden (siehe Footer der
Installationsseite) statt öffentlich zu posten.
