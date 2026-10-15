// Render `bookmarks.yml` into the navigation page: one self-contained HTML file
// that works from the filesystem, with no server and no network.
//
// Everything is resolved while generating: notes are rendered to HTML here, and
// every favicon is inlined as a data URI. Nothing about a bookmark therefore
// reaches the page's script, which holds only the filtering code — so there is no
// data-in-script escaping problem to get wrong, and the page opens the same way
// whether or not this machine has ever been online.
//
// Usage: node build-page.mjs [--out <file>]
// Exit codes: 0 = written, 1 = nothing was written because something is wrong.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { libraryFile, loadYaml, readLibrary } from './library.mjs'
import { escapeHtml, renderMarkdown } from './markdown.mjs'

/** Default output, beside this script and outside git. */
export const defaultOut = join(import.meta.dirname, 'dist', 'index.html')

/** Page title, also the browser tab's label for the local file. */
const PAGE_TITLE = '网站导航'

/** MIME types for the favicon files a browser export carries. */
const ICON_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
}

/**
 * The favicon of one entry as a data URI, read from the library's `assets/`.
 * @param entry - a library entry.
 * @param root - directory the entry's `icon` path is relative to.
 * @returns the data URI, or undefined when there is no usable file.
 */
export function iconDataUri(entry, root = import.meta.dirname) {
  const relative = typeof entry.icon === 'string' ? entry.icon : ''
  if (relative === '') return undefined
  const path = resolve(root, relative)
  if (!existsSync(path)) return undefined
  const extension = (relative.split('.').pop() ?? '').toLowerCase()
  const type = ICON_TYPES[extension]
  if (type === undefined) return undefined
  return `data:${type};base64,${readFileSync(path).toString('base64')}`
}

/**
 * The text a card is searched by: everything a person would type to find it.
 * @param entry - a library entry.
 * @returns lower-cased search text.
 */
export function searchText(entry) {
  const tags = Array.isArray(entry.autoTags) ? entry.autoTags : []
  const parts = [entry.title, entry.url, entry.group, entry.notes ?? '', ...tags]
  return parts.join(' ').toLowerCase()
}

/**
 * A tint for the tile that stands in for a missing favicon, derived from the id so
 * one bookmark keeps one colour between renders.
 * @param entry - a library entry.
 * @returns a tint index, 0 to 7.
 */
export function tintOf(entry) {
  let hash = 0
  for (const character of String(entry.id ?? '')) hash = (hash * 31 + character.codePointAt(0)) % 100000
  return hash % 8
}

/**
 * The letter shown when an entry has no favicon. An entry with no title falls back
 * to its host name rather than to the address, whose first letter is the same `h`
 * for every entry.
 * @param entry - a library entry.
 * @returns one character.
 */
export function initialOf(entry) {
  const title = String(entry.title ?? '').trim()
  if (title !== '') return [...title][0]
  try {
    return [...new URL(entry.url).hostname.replace(/^www\./u, '')][0] ?? '?'
  } catch {
    return '?'
  }
}

/**
 * One card.
 * @param entry - a library entry.
 * @param root - directory the entry's icon path is relative to.
 * @returns the card's HTML.
 */
export function renderCard(entry, root) {
  const icon = iconDataUri(entry, root)
  const host = (() => {
    try {
      return new URL(entry.url).hostname
    } catch {
      return ''
    }
  })()
  const autoTags = Array.isArray(entry.autoTags) ? entry.autoTags.map(String) : []
  const marks = [
    entry.pinned === true ? '<span class="mark pin">置顶</span>' : '',
    ...autoTags.map(tag => `<span class="mark ai">${escapeHtml(tag)}</span>`),
  ].join('')
  const notes = typeof entry.notes === 'string' && entry.notes.trim() !== ''
    ? `<div class="notes">${renderMarkdown(entry.notes)}</div>`
    : ''
  const tile = icon === undefined
    ? `<span class="tile t${tintOf(entry)}" aria-hidden="true">${escapeHtml(initialOf(entry))}</span>`
    : `<img class="favicon" src="${icon}" alt="" loading="lazy">`
  // An entry with no title is named by its host, the way the pet's own site menu
  // names a row whose note was left blank.
  const shown = String(entry.title ?? '').trim() !== '' ? String(entry.title) : host
  return [
    `<li class="card" data-group="${escapeHtml(entry.group)}" data-search="${escapeHtml(searchText(entry))}">`,
    `<a class="hit" href="${escapeHtml(entry.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(entry.url)}">`,
    tile,
    '<span class="text">',
    `<span class="title">${escapeHtml(shown)}</span>`,
    `<span class="host">${escapeHtml(host)}</span>`,
    '</span>',
    '</a>',
    marks === '' ? '' : `<div class="marks">${marks}</div>`,
    notes,
    '</li>',
  ].join('')
}

/**
 * Render the whole page.
 * @param library - the parsed library.
 * @param options - `root` for icon paths and `generatedAt` for the footer stamp.
 * @returns the page's HTML.
 */
export function buildPage(library, options = {}) {
  const root = options.root ?? import.meta.dirname
  const generatedAt = options.generatedAt ?? new Date()
  const bookmarks = Array.isArray(library.bookmarks) ? library.bookmarks : []
  const pinned = bookmarks.filter(entry => entry.pinned === true)
  const groups = new Map()
  for (const entry of bookmarks) {
    const name = typeof entry.group === 'string' && entry.group !== '' ? entry.group : '未分组'
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name).push(entry)
  }
  const section = (name, entries) => [
    `<section class="group" data-group="${escapeHtml(name)}">`,
    `<h2><button type="button" class="fold" aria-expanded="true">`,
    `<span class="name">${escapeHtml(name)}</span>`,
    `<span class="tally">${entries.length}</span>`,
    '</button></h2>',
    `<ul class="cards">${entries.map(entry => renderCard(entry, root)).join('')}</ul>`,
    '</section>',
  ].join('')
  const chips = ['<button type="button" class="chip on" data-group="">全部</button>']
    .concat([...groups.keys()].map(name => `<button type="button" class="chip" data-group="${escapeHtml(name)}">${escapeHtml(name)}</button>`))
    .join('')
  // Local time, because the stamp answers "is this page the one I just built?"
  // for a person looking at their own clock.
  const stamp = new Date(generatedAt.getTime() - generatedAt.getTimezoneOffset() * 60000)
    .toISOString().replace('T', ' ').slice(0, 16)
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(PAGE_TITLE)}</title>
<style>${STYLE}</style>
</head>
<body>
<header>
<div class="bar">
<h1>${escapeHtml(PAGE_TITLE)}</h1>
<p class="meta">共 ${bookmarks.length} 个网站 · ${groups.size} 个分组 · 生成于 ${escapeHtml(stamp)}</p>
</div>
<div class="find">
<input id="q" type="search" placeholder="搜索标题、网址、备注、标签" autocomplete="off">
<span class="count"><b id="count">${bookmarks.length}</b> / ${bookmarks.length}</span>
</div>
<nav class="chips">${chips}</nav>
</header>
<main>
${pinned.length > 0 ? section('置顶', pinned) : ''}
${[...groups.entries()].map(([name, entries]) => section(name, entries)).join('\n')}
<p id="empty" class="empty" hidden>没有匹配的网站。</p>
</main>
<footer>${escapeHtml(libraryFile)} → ${escapeHtml(stamp)}</footer>
<script>${SCRIPT}</script>
</body>
</html>
`
}

/** Page styling: tokens for both themes, then the layout. */
const STYLE = `
:root {
  --bg: #f6f7f9; --panel: #ffffff; --ink: #1c1f23; --dim: #6b7280; --line: #e5e7eb;
  --accent: #2b6cb0; --chip: #eef1f5; --shadow: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.1);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16181c; --panel: #1e2126; --ink: #e8eaed; --dim: #9aa1ab; --line: #2c3037;
    --accent: #7aa7d8; --chip: #262a31; --shadow: 0 1px 2px rgba(0,0,0,.4);
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 14px/1.55 "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
}
header {
  position: sticky; top: 0; z-index: 2; padding: 18px 24px 12px;
  background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--line);
}
.bar { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
h1 { margin: 0; font-size: 19px; font-weight: 650; }
.meta { margin: 0; color: var(--dim); font-size: 12px; }
.find { display: flex; align-items: center; gap: 10px; margin: 12px 0 10px; }
#q {
  flex: 1 1 auto; min-width: 0; padding: 8px 12px; font: inherit; color: var(--ink);
  background: var(--panel); border: 1px solid var(--line); border-radius: 9px;
}
#q:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
.count { color: var(--dim); font-size: 12px; white-space: nowrap; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  padding: 3px 10px; font: inherit; font-size: 12px; color: var(--dim); cursor: pointer;
  background: var(--chip); border: 1px solid transparent; border-radius: 999px;
}
.chip.on { color: var(--panel); background: var(--accent); }
main { padding: 18px 24px 40px; }
.group { margin: 0 0 22px; }
.group h2 { margin: 0 0 10px; font-size: 13px; font-weight: 600; }
.fold {
  display: inline-flex; align-items: center; gap: 8px; padding: 2px 0; font: inherit;
  color: var(--dim); background: none; border: 0; cursor: pointer;
}
.fold::before { content: "▾"; font-size: 10px; }
.group.collapsed .fold::before { content: "▸"; }
.group.collapsed .cards { display: none; }
.tally { padding: 1px 7px; font-size: 11px; background: var(--chip); border-radius: 999px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
.card {
  display: flex; flex-direction: column; gap: 7px; padding: 11px 12px;
  background: var(--panel); border: 1px solid var(--line); border-radius: 11px; box-shadow: var(--shadow);
}
.card:hover { border-color: var(--accent); }
.hit { display: flex; gap: 10px; align-items: center; color: inherit; text-decoration: none; min-width: 0; }
.favicon, .tile { width: 28px; height: 28px; flex: 0 0 auto; border-radius: 7px; }
.favicon { object-fit: contain; }
.tile {
  display: grid; place-items: center; font-size: 14px; font-weight: 600;
  color: #ffffff; background: hsl(var(--hue, 210) 45% 46%);
}
.t0 { --hue: 210; } .t1 { --hue: 265; } .t2 { --hue: 160; } .t3 { --hue: 20; }
.t4 { --hue: 330; } .t5 { --hue: 90; } .t6 { --hue: 190; } .t7 { --hue: 45; }
.text { display: flex; flex-direction: column; min-width: 0; }
.title {
  font-weight: 550; overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.host { color: var(--dim); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.marks { display: flex; flex-wrap: wrap; gap: 5px; }
.mark { padding: 1px 7px; font-size: 11px; color: var(--dim); background: var(--chip); border-radius: 999px; }
.mark.pin { color: var(--panel); background: var(--accent); }
/* Dashed, so a machine's tag never reads as something the person wrote. */
.mark.ai { border: 1px dashed var(--line); }
.notes {
  color: var(--dim); font-size: 12.5px; overflow: hidden;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
}
.notes > :first-child { margin-top: 0; }
.notes > :last-child { margin-bottom: 0; }
.notes p { margin: 0 0 4px; }
.notes code { padding: 0 4px; background: var(--chip); border-radius: 4px; }
.notes pre { margin: 0 0 4px; padding: 6px 8px; overflow: auto; background: var(--chip); border-radius: 6px; }
.notes a { color: var(--accent); }
.empty { color: var(--dim); text-align: center; padding: 40px 0; }
footer { padding: 0 24px 24px; color: var(--dim); font-size: 11px; }
`

/** Page behaviour: filtering and folding, and nothing about any bookmark. */
const SCRIPT = `
const input = document.getElementById('q')
const groupChips = Array.from(document.querySelectorAll('.chip[data-group]'))
const cards = Array.from(document.querySelectorAll('.card'))
const sections = Array.from(document.querySelectorAll('section.group'))
const counter = document.getElementById('count')
const empty = document.getElementById('empty')
let group = ''
const apply = () => {
  const needle = input.value.trim().toLowerCase()
  let shown = 0
  for (const card of cards) {
    const ok = (group === '' || card.dataset.group === group)
      && (needle === '' || card.dataset.search.includes(needle))
    card.hidden = !ok
    if (ok) shown++
  }
  for (const section of sections) section.hidden = !Array.from(section.querySelectorAll('.card')).some(card => !card.hidden)
  counter.textContent = String(shown)
  empty.hidden = shown !== 0
}
input.addEventListener('input', apply)
for (const chip of groupChips) {
  chip.addEventListener('click', () => {
    group = chip.dataset.group
    for (const other of groupChips) other.classList.toggle('on', other === chip)
    apply()
  })
}
for (const fold of document.querySelectorAll('.fold')) {
  fold.addEventListener('click', () => {
    const section = fold.closest('.group')
    section.classList.toggle('collapsed')
    fold.setAttribute('aria-expanded', String(!section.classList.contains('collapsed')))
  })
}
apply()
`

/** Generate the page the way the command line asked for it. */
function main() {
  const argv = process.argv.slice(2)
  const at = argv.indexOf('--out')
  const out = at >= 0 && argv[at + 1] !== undefined ? resolve(argv[at + 1]) : defaultOut
  let library
  try {
    library = readLibrary(loadYaml())
  } catch (error) {
    console.error(`[favorites] ${error.message}`)
    process.exitCode = 1
    return
  }
  if (!existsSync(libraryFile)) {
    console.error(`[favorites] 还没有 ${libraryFile}，先跑 node import.mjs`)
    process.exitCode = 1
    return
  }
  const html = buildPage(library)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, html)
  const groups = new Set(library.bookmarks.map(entry => entry.group))
  console.log(`[favorites] 已生成 ${out}`)
  console.log(`[favorites] ${library.bookmarks.length} 个网站 · ${groups.size} 个分组 · ${Math.round(html.length / 1024)} KB`)
}

const invokedDirectly = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) main()
