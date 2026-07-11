import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DEFAULT_SETTINGS = {
  branding: {
    title: 'Install Dashboard',
    description: 'Installations-Scripts – ein curl-Befehl genügt.',
    logo: '',            // data URL or emoji, empty = default icon
    primaryColor: '#6366f1',
    accentColor: '#22d3ee',
    font: 'system',      // system | inter | serif | mono
    defaultTheme: 'dark' // dark | light
  },
  layout: {
    columns: '2',        // auto | 1 | 2 | 3 | 4  (2 = voller curl-Befehl sichtbar)
    cardStyle: 'comfortable', // comfortable | compact
    showDownloads: true,
    showVersion: true,
    showHero: true
  },
  header: {
    links: []            // [{label, url}]
  },
  footer: {
    text: '',
    links: []            // [{label, url}]
  },
  gitlab: {
    defaultTokenEnc: ''  // encrypted default access token (optional)
  },
  nginx: {
    domain: '',
    ssl: false,
    sslCertPath: '',
    sslKeyPath: '',
    redirectHttp: true,
    lastAppliedAt: null
  },
  publicUrl: ''          // overrides auto-detected base URL for curl commands
};

/**
 * Small JSON file database with atomic writes.
 * Fits this workload (single-node admin tool, few hundred records) and keeps
 * the app free of native dependencies. Script contents are stored as blobs on
 * disk next to it (see blobs/).
 */
export class Db {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'db.json');
    this.blobDir = path.join(dataDir, 'blobs');
    fs.mkdirSync(this.blobDir, { recursive: true });
    this._saveTimer = null;
    this.data = this._load();
  }

  _load() {
    let raw = null;
    try {
      raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      raw = {};
    }
    const data = {
      users: raw.users || [],
      scripts: raw.scripts || [],
      settings: deepMerge(structuredClone(DEFAULT_SETTINGS), raw.settings || {}),
      meta: raw.meta || { createdAt: new Date().toISOString() },
    };
    return data;
  }

  /** Persist to disk atomically (tmp file + rename). */
  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  /** Debounced save for high-frequency updates (download counters). */
  saveSoon(delayMs = 2000) {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      try { this.save(); } catch (err) { console.error('db save failed:', err.message); }
    }, delayMs);
    this._saveTimer.unref?.();
  }

  flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this.save();
  }

  newId() {
    return crypto.randomBytes(9).toString('base64url');
  }

  // ---- blob storage for script contents ----

  blobPath(scriptId, versionId) {
    // ids are base64url (no path separators), but stay defensive:
    const safe = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '');
    return path.join(this.blobDir, safe(scriptId), `${safe(versionId)}.sh`);
  }

  writeBlob(scriptId, versionId, content) {
    const file = this.blobPath(scriptId, versionId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
  }

  readBlob(scriptId, versionId) {
    return fs.readFileSync(this.blobPath(scriptId, versionId), 'utf8');
  }

  deleteBlobs(scriptId) {
    const dir = path.dirname(this.blobPath(scriptId, 'x'));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)
      && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      deepMerge(target[key], value);
    } else if (value !== undefined) {
      target[key] = value;
    }
  }
  return target;
}
