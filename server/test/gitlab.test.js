import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGitLabUrl, detectInstallScripts, UserError } from '../src/gitlab.js';

test('parseGitLabUrl: plain project URL', () => {
  const p = parseGitLabUrl('https://gitlab.com/mygroup/myproject');
  assert.equal(p.origin, 'https://gitlab.com');
  assert.equal(p.projectPath, 'mygroup/myproject');
  assert.equal(p.ref, null);
  assert.equal(p.filePath, null);
});

test('parseGitLabUrl: subgroups and .git suffix', () => {
  const p = parseGitLabUrl('https://gitlab.com/group/sub/deep/project.git');
  assert.equal(p.projectPath, 'group/sub/deep/project');
});

test('parseGitLabUrl: self-hosted instance', () => {
  const p = parseGitLabUrl('https://git.example.com/tools/installer');
  assert.equal(p.origin, 'https://git.example.com');
  assert.equal(p.projectPath, 'tools/installer');
});

test('parseGitLabUrl: tree URL with branch', () => {
  const p = parseGitLabUrl('https://gitlab.com/group/project/-/tree/develop');
  assert.equal(p.projectPath, 'group/project');
  assert.equal(p.ref, 'develop');
});

test('parseGitLabUrl: tree URL with branch and directory', () => {
  const p = parseGitLabUrl('https://gitlab.com/group/project/-/tree/main/scripts');
  assert.equal(p.ref, 'main');
  assert.equal(p.dirPath, 'scripts');
});

test('parseGitLabUrl: blob URL points at a file', () => {
  const p = parseGitLabUrl('https://gitlab.com/group/project/-/blob/main/scripts/install.sh');
  assert.equal(p.projectPath, 'group/project');
  assert.equal(p.ref, 'main');
  assert.equal(p.filePath, 'scripts/install.sh');
});

test('parseGitLabUrl: rejects garbage and metadata hosts', () => {
  assert.throws(() => parseGitLabUrl('not a url'), UserError);
  assert.throws(() => parseGitLabUrl('ftp://gitlab.com/a/b'), UserError);
  assert.throws(() => parseGitLabUrl('https://gitlab.com/onlygroup'), UserError);
  assert.throws(() => parseGitLabUrl('http://169.254.169.254/a/b'), UserError);
});

test('detectInstallScripts: ranks install.sh at repo root first', () => {
  const entries = [
    { path: 'README.md', name: 'README.md' },
    { path: 'docs/example.sh', name: 'example.sh' },
    { path: 'install.sh', name: 'install.sh' },
    { path: 'scripts/setup.sh', name: 'setup.sh' },
    { path: 'tests/install.sh', name: 'install.sh' },
    { path: 'run.bash', name: 'run.bash' },
  ];
  const result = detectInstallScripts(entries);
  assert.equal(result[0].path, 'install.sh');
  assert.ok(result[0].recommended);
  const paths = result.map((r) => r.path);
  assert.ok(!paths.includes('README.md'));
  // root install.sh must outrank the one in tests/
  assert.ok(paths.indexOf('install.sh') < paths.indexOf('tests/install.sh'));
  // setup.sh in scripts/ should rank above generic run.bash
  assert.ok(paths.indexOf('scripts/setup.sh') < paths.indexOf('run.bash'));
});

test('detectInstallScripts: empty when repo has no shell scripts', () => {
  assert.deepEqual(detectInstallScripts([{ path: 'main.py', name: 'main.py' }]), []);
});
