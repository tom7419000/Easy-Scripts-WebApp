import { GitLabClient, parseGitLabUrl, detectInstallScripts, UserError } from './gitlab.js';
import { sha256hex, encryptSecret, decryptSecret } from './crypto.js';

const FA_CLASS_RE = /^fa-(solid|regular|brands) fa-[a-z0-9-]+$/;
export const DEFAULT_ICON = 'fa-solid fa-box';

/**
 * Normalize a script icon: Font-Awesome classnames are strictly validated
 * (they end up in a className attribute), everything else (emoji, image URL)
 * is only length-limited.
 */
export function normalizeIcon(value, fallback = DEFAULT_ICON) {
  const icon = String(value ?? '').trim().slice(0, 300);
  if (!icon) return fallback;
  if (icon.startsWith('fa-')) {
    const compact = icon.replace(/\s+/g, ' ');
    return FA_CLASS_RE.test(compact) ? compact : fallback;
  }
  return icon;
}

export function slugify(name) {
  const slug = String(name)
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c]))
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'script';
}

/**
 * Service layer for install scripts: import from GitLab, local version
 * cache (blobs on disk), refresh, and serving.
 */
export class ScriptService {
  constructor({ db, config, events }) {
    this.db = db;
    this.config = config;
    this.events = events;
  }

  _client(origin, token) {
    return new GitLabClient({
      origin,
      token: token || this._defaultToken(),
      allowedHosts: this.config.gitlabAllowedHosts,
      maxBytes: this.config.maxScriptBytes,
    });
  }

  _defaultToken() {
    const enc = this.db.data.settings.gitlab.defaultTokenEnc;
    return enc ? decryptSecret(enc, this.config.sessionSecret) : null;
  }

  _tokenFor(script) {
    if (script.source.tokenEnc) {
      const token = decryptSecret(script.source.tokenEnc, this.config.sessionSecret);
      if (token) return token;
    }
    return null;
  }

  /**
   * Analyse a GitLab URL: fetch project info and rank candidate scripts.
   * If the URL points directly to a file (blob URL), it becomes the single
   * pre-selected candidate.
   */
  async importPreview({ url, token }) {
    const parsed = parseGitLabUrl(url);
    const client = this._client(parsed.origin, token);
    const project = await client.getProject(parsed.projectPath);
    const ref = parsed.ref || project.defaultBranch;

    let candidates;
    if (parsed.filePath) {
      candidates = [{ path: parsed.filePath, name: parsed.filePath.split('/').pop(), score: 100, recommended: true }];
    } else {
      const tree = await client.listTree(project.id, ref);
      const scoped = parsed.dirPath
        ? tree.filter((e) => e.path.startsWith(parsed.dirPath + '/'))
        : tree;
      candidates = detectInstallScripts(scoped);
    }
    if (candidates.length === 0) {
      throw new UserError('Keine Shell-Scripts (.sh/.bash) im Repository gefunden.');
    }

    const existingPaths = new Set(
      this.db.data.scripts
        .filter((s) => s.source.origin === parsed.origin && s.source.projectPath === project.path)
        .map((s) => `${s.source.ref}:${s.source.filePath}`)
    );

    return {
      project,
      origin: parsed.origin,
      ref,
      candidates: candidates.map((c) => ({
        ...c,
        alreadyImported: existingPaths.has(`${ref}:${c.path}`),
      })),
    };
  }

  /** Fetch a candidate file for the admin preview modal. */
  async previewFile({ url, path, ref, token }) {
    const parsed = parseGitLabUrl(url);
    const client = this._client(parsed.origin, token);
    const project = await client.getProject(parsed.projectPath);
    const file = await client.getFile(project.id, path, ref || project.defaultBranch);
    return { content: file.content, size: file.size, commitSha: file.commitSha, sha256: sha256hex(file.content) };
  }

  _uniqueSlug(base, excludeId = null) {
    let slug = base;
    let n = 2;
    while (this.db.data.scripts.some((s) => s.slug === slug && s.id !== excludeId)) {
      slug = `${base}-${n++}`;
    }
    return slug;
  }

  /** Import one script from a GitLab repository (fetches content immediately). */
  async createFromGitLab({ url, path, ref, token, metadata = {} }) {
    const parsed = parseGitLabUrl(url);
    const client = this._client(parsed.origin, token);
    const project = await client.getProject(parsed.projectPath);
    const useRef = ref || parsed.ref || project.defaultBranch;
    const filePath = path || parsed.filePath;
    if (!filePath) throw new UserError('Kein Script-Pfad angegeben.');
    const file = await client.getFile(project.id, filePath, useRef);
    validateScriptContent(file.content);

    const now = new Date().toISOString();
    const id = this.db.newId();
    const versionId = this.db.newId();
    const baseName = metadata.name || project.name || filePath.split('/').pop().replace(/\.(sh|bash)$/i, '');
    const version = metadata.version || '1.0.0';

    const script = {
      id,
      slug: this._uniqueSlug(slugify(metadata.slug || baseName)),
      name: baseName,
      description: metadata.description ?? (project.description || ''),
      version,
      icon: normalizeIcon(metadata.icon),
      tags: Array.isArray(metadata.tags) ? metadata.tags.slice(0, 10) : [],
      active: Boolean(metadata.active),
      autoUpdate: metadata.autoUpdate !== false,
      order: this.db.data.scripts.length,
      downloads: 0,
      source: {
        type: 'gitlab',
        origin: parsed.origin,
        projectId: project.id,
        projectPath: project.path,
        webUrl: project.webUrl,
        ref: useRef,
        filePath,
        tokenEnc: token ? encryptSecret(token, this.config.sessionSecret) : '',
      },
      currentVersionId: versionId,
      versions: [this._versionEntry(versionId, version, file, now)],
      createdAt: now,
      updatedAt: now,
      lastCheckedAt: now,
      lastError: null,
    };

    this.db.writeBlob(id, versionId, file.content);
    this.db.data.scripts.push(script);
    this.db.save();
    this.events.publish('scripts:changed', { id }, 'all');
    return script;
  }

  _versionEntry(versionId, version, file, now) {
    return {
      id: versionId,
      version,
      commitSha: file.commitSha,
      sha256: sha256hex(file.content),
      size: Buffer.byteLength(file.content, 'utf8'),
      fetchedAt: now,
    };
  }

  getById(id) {
    const script = this.db.data.scripts.find((s) => s.id === id);
    if (!script) throw new UserError('Script nicht gefunden.', 404);
    return script;
  }

  update(id, patch) {
    const script = this.getById(id);
    const allowed = ['name', 'description', 'version', 'icon', 'tags', 'active', 'autoUpdate', 'slug'];
    for (const key of allowed) {
      if (patch[key] === undefined) continue;
      if (key === 'slug') {
        const slug = slugify(patch.slug);
        script.slug = this._uniqueSlug(slug, id);
      } else if (key === 'tags') {
        script.tags = Array.isArray(patch.tags)
          ? patch.tags.map((t) => String(t).slice(0, 30)).filter(Boolean).slice(0, 10)
          : script.tags;
      } else if (key === 'name') {
        script.name = String(patch.name).slice(0, 80) || script.name;
      } else if (key === 'description') {
        script.description = String(patch.description).slice(0, 2000);
      } else if (key === 'version') {
        script.version = String(patch.version).slice(0, 40);
      } else if (key === 'icon') {
        script.icon = normalizeIcon(patch.icon, script.icon);
      } else {
        script[key] = Boolean(patch[key]);
      }
    }
    script.updatedAt = new Date().toISOString();
    this.db.save();
    this.events.publish('scripts:changed', { id }, 'all');
    return script;
  }

  remove(id) {
    const idx = this.db.data.scripts.findIndex((s) => s.id === id);
    if (idx === -1) throw new UserError('Script nicht gefunden.', 404);
    this.db.data.scripts.splice(idx, 1);
    this.db.deleteBlobs(id);
    this.db.save();
    this.events.publish('scripts:changed', { id, deleted: true }, 'all');
  }

  reorder(ids) {
    const byId = new Map(this.db.data.scripts.map((s) => [s.id, s]));
    let order = 0;
    for (const id of ids) {
      const script = byId.get(id);
      if (script) script.order = order++;
    }
    this.db.data.scripts.sort((a, b) => a.order - b.order);
    this.db.save();
    this.events.publish('scripts:changed', {}, 'all');
  }

  /**
   * Re-fetch a script from GitLab. Creates a new version entry when the
   * content changed; otherwise only bumps lastCheckedAt.
   */
  async refresh(id, { setVersion } = {}) {
    const script = this.getById(id);
    const client = this._client(script.source.origin, this._tokenFor(script));
    const now = new Date().toISOString();
    try {
      const file = await client.getFile(script.source.projectId, script.source.filePath, script.source.ref);
      validateScriptContent(file.content);
      script.lastCheckedAt = now;
      script.lastError = null;
      const sha256 = sha256hex(file.content);
      const current = script.versions.find((v) => v.id === script.currentVersionId);
      if (current && current.sha256 === sha256) {
        this.db.save();
        return { script, changed: false };
      }
      const versionId = this.db.newId();
      const label = setVersion || nextVersionLabel(script.version, file.commitSha);
      script.versions.unshift(this._versionEntry(versionId, label, file, now));
      script.versions = script.versions.slice(0, 20);
      script.currentVersionId = versionId;
      script.version = label;
      script.updatedAt = now;
      this.db.writeBlob(id, versionId, file.content);
      this.db.save();
      this.events.publish('scripts:changed', { id }, 'all');
      return { script, changed: true };
    } catch (err) {
      script.lastCheckedAt = now;
      script.lastError = err.expose ? err.message : 'Aktualisierung fehlgeschlagen.';
      this.db.save();
      this.events.publish('scripts:changed', { id }, 'admin');
      throw err;
    }
  }

  /** Background refresh for all auto-update scripts (called by interval timer). */
  async refreshAll() {
    const results = [];
    for (const script of this.db.data.scripts.filter((s) => s.autoUpdate)) {
      try {
        const { changed } = await this.refresh(script.id);
        results.push({ id: script.id, changed });
      } catch (err) {
        results.push({ id: script.id, error: err.message });
      }
    }
    return results;
  }

  restoreVersion(id, versionId) {
    const script = this.getById(id);
    const version = script.versions.find((v) => v.id === versionId);
    if (!version) throw new UserError('Version nicht gefunden.', 404);
    script.currentVersionId = versionId;
    script.version = version.version;
    script.updatedAt = new Date().toISOString();
    this.db.save();
    this.events.publish('scripts:changed', { id }, 'all');
    return script;
  }

  getVersionContent(id, versionId) {
    const script = this.getById(id);
    const version = script.versions.find((v) => v.id === versionId);
    if (!version) throw new UserError('Version nicht gefunden.', 404);
    return { version, content: this.db.readBlob(id, versionId) };
  }

  /** Resolve a script for public serving; supports "slug" and "slug@version". */
  resolveForServe(slugSpec) {
    const [slug, versionLabel] = String(slugSpec).split('@', 2);
    const script = this.db.data.scripts.find((s) => s.slug === slug && s.active);
    if (!script) return null;
    let version = script.versions.find((v) => v.id === script.currentVersionId) || script.versions[0];
    if (versionLabel) {
      version = script.versions.find((v) => v.version === versionLabel || v.commitSha?.startsWith(versionLabel));
      if (!version) return null;
    }
    let content;
    try {
      content = this.db.readBlob(script.id, version.id);
    } catch {
      return null;
    }
    return { script, version, content };
  }

  countDownload(id) {
    const script = this.db.data.scripts.find((s) => s.id === id);
    if (!script) return;
    script.downloads = (script.downloads || 0) + 1;
    this.db.saveSoon();
    this.events.publish('stats:changed', { id, downloads: script.downloads }, 'admin');
  }
}

/** Basic sanity checks before storing/serving a script. */
export function validateScriptContent(content) {
  if (!content || !content.trim()) {
    throw new UserError('Die Datei ist leer.');
  }
  if (content.includes('\u0000')) {
    throw new UserError('Die Datei scheint binär zu sein (kein Shell-Script).');
  }
}

/**
 * Derive the next version label after an upstream change:
 * bumps the patch of a semver-ish label, otherwise falls back to
 * date + short commit sha.
 */
export function nextVersionLabel(current, commitSha) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current || '');
  if (m) return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
  const sha = (commitSha || '').slice(0, 7);
  const date = new Date().toISOString().slice(0, 10);
  return sha ? `${date}-${sha}` : date;
}
