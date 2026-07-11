import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { UserError } from './gitlab.js';

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;
const PATH_RE = /^\/[\w./-]+$/;

export function validateNginxSettings(nginx) {
  if (!nginx.domain || !DOMAIN_RE.test(nginx.domain)) {
    throw new UserError('Bitte eine gültige Domain angeben (z. B. install.example.com).');
  }
  if (nginx.ssl) {
    if (!PATH_RE.test(nginx.sslCertPath || '')) {
      throw new UserError('Pfad zum SSL-Zertifikat fehlt oder ist ungültig.');
    }
    if (!PATH_RE.test(nginx.sslKeyPath || '')) {
      throw new UserError('Pfad zum SSL-Key fehlt oder ist ungültig.');
    }
  }
}

/**
 * Render the nginx server block(s) that reverse-proxy this app.
 * Kept deliberately simple and readable: the file is also shown in the admin
 * UI so admins can review or copy it manually.
 */
export function generateNginxConfig({ nginx, appPort, appHost = '127.0.0.1' }) {
  validateNginxSettings(nginx);
  const upstream = `${appHost}:${appPort}`;
  const proxyBlock = `        proxy_pass http://${upstream};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
        proxy_buffering off;`;

  const header = `# Automatisch generiert von Easy Scripts WebApp – ${new Date().toISOString()}
# Änderungen an dieser Datei werden beim nächsten "Anwenden" überschrieben.`;

  if (!nginx.ssl) {
    return `${header}

server {
    listen 80;
    listen [::]:80;
    server_name ${nginx.domain};

    location / {
${proxyBlock}
    }
}
`;
  }

  const httpServer = nginx.redirectHttp
    ? `server {
    listen 80;
    listen [::]:80;
    server_name ${nginx.domain};
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}`
    : `server {
    listen 80;
    listen [::]:80;
    server_name ${nginx.domain};
    location / {
${proxyBlock}
    }
}`;

  return `${header}

${httpServer}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name ${nginx.domain};

    ssl_certificate     ${nginx.sslCertPath};
    ssl_certificate_key ${nginx.sslKeyPath};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    location / {
${proxyBlock}
    }
}
`;
}

export class NginxManager {
  constructor({ config, db, events }) {
    this.config = config;
    this.db = db;
    this.events = events;
  }

  preview() {
    const nginx = this.db.data.settings.nginx;
    return generateNginxConfig({ nginx, appPort: this.config.port, appHost: this.config.host === '0.0.0.0' ? '127.0.0.1' : this.config.host });
  }

  status() {
    const confPath = this.config.nginxConfPath;
    let currentFile = null;
    let inSync = false;
    try {
      currentFile = fs.readFileSync(confPath, 'utf8');
      // ignore the timestamp comment lines when comparing
      const normalize = (s) => s.split('\n').filter((l) => !l.startsWith('#')).join('\n').trim();
      inSync = normalize(currentFile) === normalize(this.preview());
    } catch { /* not applied yet or unreadable */ }
    return {
      confPath,
      applyEnabled: this.config.nginxApplyEnabled,
      fileExists: currentFile !== null,
      inSync,
      lastAppliedAt: this.db.data.settings.nginx.lastAppliedAt,
      reloadCmd: this.config.nginxReloadCmd,
    };
  }

  /** Write the config file and reload nginx. Returns command output for the UI. */
  async apply() {
    if (!this.config.nginxApplyEnabled) {
      throw new UserError('Automatisches Anwenden ist deaktiviert (NGINX_AUTO_APPLY=false). Konfiguration bitte manuell übernehmen.', 403);
    }
    const content = this.preview();
    const confPath = this.config.nginxConfPath;
    try {
      fs.mkdirSync(path.dirname(confPath), { recursive: true });
      fs.writeFileSync(confPath, content);
    } catch (err) {
      throw new UserError(`Konnte ${confPath} nicht schreiben (${err.code}). Läuft der Dienst mit ausreichenden Rechten?`, 500);
    }
    const result = await this._runReload();
    this.db.data.settings.nginx.lastAppliedAt = new Date().toISOString();
    this.db.save();
    this.events.publish('nginx:applied', { ok: result.ok }, 'admin');
    return { confPath, ...result };
  }

  _runReload() {
    return new Promise((resolve) => {
      exec(this.config.nginxReloadCmd, { timeout: 30000 }, (err, stdout, stderr) => {
        resolve({
          ok: !err,
          output: [stdout, stderr].filter(Boolean).join('\n').trim()
            || (err ? String(err.message) : 'NGINX neu geladen.'),
        });
      });
    });
  }
}
