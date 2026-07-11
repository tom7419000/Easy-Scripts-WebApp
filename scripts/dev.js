#!/usr/bin/env node
/**
 * Development orchestrator: starts the API server (port 3001) and the Vite
 * dev server (port 5173, proxying /api and /install to the backend).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const procs = [
  spawn('node', ['--watch', 'src/index.js'], {
    cwd: path.join(root, 'server'),
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  }),
  spawn('npx', ['vite'], {
    cwd: path.join(root, 'client'),
    stdio: 'inherit',
    env: { ...process.env },
  }),
];

const stop = () => {
  for (const p of procs) p.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => { if (code) stop(); });

console.log('\n  Backend:  http://127.0.0.1:3001\n  Frontend: http://127.0.0.1:5173  (Admin: /admin)\n');
