// Build a static, host-agnostic copy of FieldLab into `out/`.
//
// `npm run build` targets Cloudflare Workers: it emits client assets plus a
// worker that renders the HTML shell per request. FieldLab is a single route
// with no server data, so we boot that worker once, snapshot the shell it
// renders, and pair the snapshot with the client assets. The result is a plain
// static directory that any static host (Vercel, Netlify, GitHub Pages) can
// serve without a server runtime.
//
// Usage: node scripts/build-static.mjs [--skip-build] [--port 8799]

import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const portIndex = args.indexOf('--port');
const port = portIndex === -1 ? 8799 : Number(args[portIndex + 1]);
const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'out');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const vercelConfig = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  headers: [
    {
      source: '/_next/static/(.*)',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
  ],
  rewrites: [{ source: '/(.*)', destination: '/index.html' }],
};

// `vercel link` writes an OIDC token to `out/.env.local`, and the Cloudflare
// build leaves metadata behind. None of it belongs on a public static host.
const vercelIgnore = [
  '# Never upload credentials or build metadata with the static site.',
  '.env',
  '.env.*',
  '.vite',
  '.assetsignore',
  '.gitignore',
];

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0)
    throw new Error(`${command} ${commandArgs.join(' ')} failed`);
}

async function waitForServer(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.text();
    } catch {
      // server is still starting
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`timed out waiting for ${url}`);
}

if (!skipBuild) run(npm, ['run', 'build']);

const worker = spawn(
  npx,
  ['wrangler', 'dev', '--config', 'dist/server/wrangler.json', '--port', String(port)],
  { cwd: root, stdio: 'ignore', shell: process.platform === 'win32' },
);

let html;
try {
  html = await waitForServer(`http://127.0.0.1:${port}/`);
} finally {
  // On Windows the shell wrapper is the direct child; killing only that orphans
  // wrangler and workerd, which keep a handle on `dist/` and make the next
  // build fail with EPERM. Take down the whole tree first.
  if (process.platform === 'win32' && worker.pid)
    spawnSync('taskkill', ['/pid', String(worker.pid), '/t', '/f'], {
      stdio: 'ignore',
    });
  worker.kill();
  await new Promise((done) => setTimeout(done, 500));
}

if (!html.includes('<!DOCTYPE html>'))
  throw new Error('worker did not return an HTML shell');

// Replace the built files but keep dotfiles, so a `vercel link` in `out/`
// survives rebuilds and the host keeps deploying to the same project.
mkdirSync(outDir, { recursive: true });
for (const entry of readdirSync(outDir))
  if (!entry.startsWith('.'))
    rmSync(resolve(outDir, entry), { recursive: true, force: true });

cpSync(resolve(root, 'dist/client'), outDir, { recursive: true });
rmSync(resolve(outDir, '_headers'), { force: true }); // Cloudflare-only
writeFileSync(resolve(outDir, 'index.html'), html, 'utf8');
writeFileSync(
  resolve(outDir, 'vercel.json'),
  `${JSON.stringify(vercelConfig, null, 2)}\n`,
  'utf8',
);
writeFileSync(
  resolve(outDir, '.vercelignore'),
  `${vercelIgnore.join('\n')}\n`,
  'utf8',
);

const leaked = readdirSync(outDir).filter((entry) => entry.startsWith('.env'));
if (leaked.length)
  throw new Error(`refusing to publish credentials: out/${leaked.join(', ')}`);

if (existsSync(resolve(outDir, '.vercel')))
  console.log('Kept existing Vercel project link in out/.vercel.');

console.log(`Static site written to ${outDir} (${html.length} byte shell).`);
