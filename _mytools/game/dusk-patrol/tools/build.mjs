import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const template = readFileSync(join(src, 'template.html'), 'utf8');
const css = readFileSync(join(src, 'style.css'), 'utf8');
const body = readFileSync(join(src, 'body.html'), 'utf8');

const jsDir = join(src, 'js');
const parts = readdirSync(jsDir).filter((f) => f.endsWith('.js')).sort();
const js = parts.map((f) => `\n/* ---- ${f} ---- */\n` + readFileSync(join(jsDir, f), 'utf8')).join('\n');

const out = template
  .replace('/*__CSS__*/', () => css)
  .replace('<!--__BODY__-->', () => body)
  .replace('/*__JS__*/', () => `(() => {\n'use strict';\n${js}\n})();`);

mkdirSync(join(root, 'shots'), { recursive: true });
writeFileSync(join(root, 'index.html'), out);
const kb = (statSync(join(root, 'index.html')).size / 1024).toFixed(1);
console.log(`built index.html (${kb} KB) from ${parts.length} parts: ${parts.join(', ')}`);
