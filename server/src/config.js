import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Loads configuration from environment variables with sane defaults.
 * SESSION_SECRET is auto-generated and persisted on first start so that
 * sessions and encrypted tokens survive restarts without manual setup.
 */
export function loadConfig(env = process.env) {
  const rootDir = path.resolve(__dirname, '..', '..');
  const dataDir = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(rootDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  let sessionSecret = env.SESSION_SECRET;
  if (!sessionSecret) {
    const secretFile = path.join(dataDir, '.secret');
    if (fs.existsSync(secretFile)) {
      sessionSecret = fs.readFileSync(secretFile, 'utf8').trim();
    }
    if (!sessionSecret) {
      sessionSecret = crypto.randomBytes(48).toString('base64url');
      fs.writeFileSync(secretFile, sessionSecret + '\n', { mode: 0o600 });
    }
  }

  // Public base URL for generated curl commands. Priority:
  // PUBLIC_URL (full URL) > INSTALLATION_DOMAIN (bare hostname, defaults to
  // http:// for Cloudflare-Tunnel setups). The admin-panel setting overrides
  // both at runtime; without any of these the requested host/IP is used.
  let publicUrl = (env.PUBLIC_URL || '').replace(/\/+$/, '');
  if (!publicUrl && env.INSTALLATION_DOMAIN) {
    const domain = env.INSTALLATION_DOMAIN.trim().replace(/\/+$/, '');
    publicUrl = /^https?:\/\//.test(domain) ? domain : `http://${domain}`;
  }

  return {
    rootDir,
    dataDir,
    clientDist: path.join(rootDir, 'client', 'dist'),
    host: env.HOST || '127.0.0.1',
    port: int(env.PORT, 3001),
    publicUrl,
    trustProxy: bool(env.TRUST_PROXY, true),
    sessionSecret,
    sessionTtlMs: int(env.SESSION_TTL_HOURS, 24 * 7) * 3600 * 1000,
    // GitLab fetching
    gitlabAllowedHosts: (env.GITLAB_ALLOWED_HOSTS || '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
    maxScriptBytes: int(env.MAX_SCRIPT_BYTES, 1024 * 1024),
    // Automatic refresh of scripts marked with autoUpdate
    refreshIntervalMinutes: int(env.SCRIPT_REFRESH_INTERVAL, 60),
    // NGINX integration
    nginxConfPath: env.NGINX_CONF_PATH || '/etc/nginx/conf.d/install-manager.conf',
    nginxReloadCmd: env.NGINX_RELOAD_CMD || 'nginx -t && (systemctl reload nginx || nginx -s reload)',
    nginxApplyEnabled: bool(env.NGINX_AUTO_APPLY, true),
    isProduction: (env.NODE_ENV || 'production') === 'production',
  };
}
