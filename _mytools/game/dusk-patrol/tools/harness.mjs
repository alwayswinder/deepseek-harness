/**
 * Shared plumbing for the headless verification scripts.
 *
 * Resolves everything from this file's own location so the scripts run on any
 * machine and checkout: the built game URL, the capture directory, the repo's
 * Playwright install, and a Chrome (or Edge) executable.
 */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..', '..', '..');

/** Absolute URL of the built game; `query` must start with `?` when given. */
export function gameUrl(query = '') {
  return pathToFileURL(join(root, 'index.html')).href + query;
}

/** Absolute output path for a capture under `shots/`. */
export function shotPath(name) {
  return join(root, 'shots', name);
}

async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_MODULE) {
    return import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  }
  const pnpm = join(repo, 'node_modules', '.pnpm');
  const entries = existsSync(pnpm)
    ? readdirSync(pnpm).filter((name) => /^playwright@\d/.test(name)).sort()
    : [];
  for (const entry of entries) {
    const module = join(pnpm, entry, 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(module)) return import(pathToFileURL(module).href);
  }
  throw new Error(
    `Playwright not found under ${pnpm}. Run "pnpm install" in the repository root, ` +
      'or point PLAYWRIGHT_MODULE at playwright/index.mjs.',
  );
}

function findChrome() {
  const local = process.env.LOCALAPPDATA || '';
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    join(local, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find((path) => path && existsSync(path));
}

const { chromium } = await loadPlaywright();

/** Launch headless Chromium with the SwiftShader flags the game's WebGL needs. */
export function launch(options = {}) {
  const executablePath = options.executablePath || findChrome();
  return chromium.launch({ ...options, ...(executablePath ? { executablePath } : {}) });
}
