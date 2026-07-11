/**
 * GitLab integration: URL parsing, REST API v4 client and detection of
 * installation scripts inside a repository tree. Works with gitlab.com and
 * self-hosted instances; private repos via access token (read_api scope).
 */

const BLOCKED_HOSTS = new Set(['169.254.169.254', 'metadata.google.internal']);

/**
 * Parse a GitLab repository / tree / blob URL into its parts.
 * Supported forms:
 *   https://gitlab.com/group/project
 *   https://gitlab.com/group/sub/project.git
 *   https://gitlab.com/group/project/-/tree/main[/dir]
 *   https://gitlab.com/group/project/-/blob/main/install.sh
 *   https://git.example.com/group/project  (self-hosted)
 */
export function parseGitLabUrl(input) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch {
    throw new UserError('Ungültige URL. Bitte eine vollständige GitLab-URL angeben (https://…).');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new UserError('Nur http(s)-URLs werden unterstützt.');
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) {
    throw new UserError('Dieser Host ist nicht erlaubt.');
  }

  const segments = url.pathname.split('/').map((s) => s.trim()).filter(Boolean);
  if (segments.length < 2) {
    throw new UserError('URL enthält keinen Projektpfad (erwartet: gruppe/projekt).');
  }

  let ref = null;
  let filePath = null;
  let dirPath = null;
  let projectSegments = segments;

  const dashIdx = segments.indexOf('-');
  if (dashIdx > 0 && segments.length > dashIdx + 1) {
    projectSegments = segments.slice(0, dashIdx);
    const kind = segments[dashIdx + 1];
    const rest = segments.slice(dashIdx + 2);
    if ((kind === 'blob' || kind === 'raw') && rest.length >= 2) {
      ref = decodeURIComponent(rest[0]);
      filePath = rest.slice(1).map(decodeURIComponent).join('/');
    } else if (kind === 'tree' && rest.length >= 1) {
      ref = decodeURIComponent(rest[0]);
      dirPath = rest.slice(1).map(decodeURIComponent).join('/') || null;
    }
  }

  const projectPath = projectSegments
    .map(decodeURIComponent)
    .join('/')
    .replace(/\.git$/, '');

  if (!/^[\w.-]+(\/[\w.-]+)+$/.test(projectPath)) {
    throw new UserError(`Projektpfad "${projectPath}" sieht nicht wie gruppe/projekt aus.`);
  }

  return {
    origin: `${url.protocol}//${url.host}`,
    host,
    projectPath,
    ref,
    filePath,
    dirPath,
  };
}

export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.expose = true;
    this.status = status;
  }
}

export class GitLabClient {
  constructor({ origin, token = null, allowedHosts = [], maxBytes = 1024 * 1024, fetchImpl = fetch }) {
    this.origin = origin.replace(/\/+$/, '');
    this.token = token;
    this.maxBytes = maxBytes;
    this.fetch = fetchImpl;
    const host = new URL(this.origin).hostname.toLowerCase();
    if (allowedHosts.length > 0 && !allowedHosts.includes(host)) {
      throw new UserError(`GitLab-Host "${host}" ist nicht in GITLAB_ALLOWED_HOSTS freigegeben.`, 403);
    }
  }

  async api(path, params = {}) {
    const url = new URL(`${this.origin}/api/v4${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, value);
    }
    const headers = { Accept: 'application/json' };
    if (this.token) headers['PRIVATE-TOKEN'] = this.token;
    let res;
    try {
      res = await this.fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    } catch (err) {
      throw new UserError(`GitLab nicht erreichbar (${err.cause?.code || err.name}). Host und Netzwerk prüfen.`, 502);
    }
    if (res.status === 401 || res.status === 403) {
      throw new UserError('GitLab verweigert den Zugriff. Für private Repositories wird ein Access-Token (Scope: read_api) benötigt.', 403);
    }
    if (res.status === 404) {
      throw new UserError('Projekt oder Datei auf GitLab nicht gefunden. URL prüfen (bei privaten Repos: Token angeben).', 404);
    }
    if (!res.ok) {
      throw new UserError(`GitLab-API-Fehler: HTTP ${res.status}`, 502);
    }
    return res;
  }

  async getProject(projectPath) {
    const res = await this.api(`/projects/${encodeURIComponent(projectPath)}`);
    const project = await res.json();
    return {
      id: project.id,
      name: project.name,
      path: project.path_with_namespace,
      description: project.description || '',
      defaultBranch: project.default_branch || 'main',
      webUrl: project.web_url,
      avatarUrl: project.avatar_url || null,
      lastActivityAt: project.last_activity_at,
    };
  }

  /** List repository files (recursive, capped to keep responses bounded). */
  async listTree(projectId, ref, { maxPages = 5, perPage = 100 } = {}) {
    const entries = [];
    for (let page = 1; page <= maxPages; page++) {
      const res = await this.api(`/projects/${projectId}/repository/tree`, {
        recursive: 'true', per_page: String(perPage), page: String(page), ref,
      });
      const batch = await res.json();
      for (const entry of batch) {
        if (entry.type === 'blob') entries.push({ path: entry.path, name: entry.name });
      }
      const nextPage = res.headers.get('x-next-page');
      if (!nextPage) break;
    }
    return entries;
  }

  /** Fetch file content + commit sha in one call. */
  async getFile(projectId, filePath, ref) {
    const res = await this.api(`/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}`, { ref });
    const file = await res.json();
    if (file.size > this.maxBytes) {
      throw new UserError(`Datei ist zu groß (${file.size} Bytes, Limit ${this.maxBytes}).`);
    }
    const content = Buffer.from(file.content || '', 'base64').toString('utf8');
    return {
      path: filePath,
      content,
      size: file.size,
      ref: file.ref || ref,
      commitSha: file.last_commit_id || file.commit_id || null,
      blobSha: file.blob_id || null,
    };
  }
}

const SCRIPT_EXT = /\.(sh|bash)$/i;
const NAME_SCORES = [
  [/^install\.(sh|bash)$/i, 100],
  [/^setup\.(sh|bash)$/i, 85],
  [/^(bootstrap|init|deploy|update|uninstall)\.(sh|bash)$/i, 60],
  [/install/i, 50],
  [/setup/i, 40],
];
const PENALIZED_DIRS = /(^|\/)(test|tests|spec|docs?|examples?|\.github|\.gitlab|ci|vendor|node_modules)(\/|$)/i;

/**
 * Rank the files of a repository by how likely they are installation scripts.
 * Returns candidates sorted by score (best first).
 */
export function detectInstallScripts(entries, { limit = 25 } = {}) {
  const candidates = [];
  for (const entry of entries) {
    if (!SCRIPT_EXT.test(entry.name)) continue;
    let score = 10;
    for (const [pattern, points] of NAME_SCORES) {
      if (pattern.test(entry.name)) { score += points; break; }
    }
    const depth = entry.path.split('/').length - 1;
    if (depth === 0) score += 40;
    else score -= depth * 5;
    if (PENALIZED_DIRS.test(entry.path)) score -= 30;
    candidates.push({
      path: entry.path,
      name: entry.name,
      score,
      recommended: score >= 90,
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return candidates.slice(0, limit);
}
