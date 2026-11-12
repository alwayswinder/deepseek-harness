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
 * The buttons one editable card carries. The page is a generated file opened from
 * disk most of the time, where nothing may change the library, so these exist only
 * on the copy the Host serves.
 * @returns the toolbar's HTML.
 */
function cardTools() {
  return '<div class="tools">'
    + '<button type="button" class="tool" data-act="edit" title="编辑">✎</button>'
    + '<button type="button" class="tool" data-act="delete" title="删除">✕</button>'
    + '</div>'
}

/**
 * One card.
 * @param entry - a library entry.
 * @param root - directory the entry's icon path is relative to.
 * @param editable - whether the card carries its id and the edit buttons.
 * @returns the card's HTML.
 */
export function renderCard(entry, root, editable = false) {
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
    '<li class="card"',
    editable ? ` data-id="${escapeHtml(entry.id)}"` : '',
    ` data-group="${escapeHtml(entry.group)}" data-search="${escapeHtml(searchText(entry))}">`,
    `<a class="hit" href="${escapeHtml(entry.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(entry.url)}">`,
    tile,
    '<span class="text">',
    `<span class="title">${escapeHtml(shown)}</span>`,
    `<span class="host">${escapeHtml(host)}</span>`,
    '</span>',
    '</a>',
    editable ? cardTools() : '',
    marks === '' ? '' : `<div class="marks">${marks}</div>`,
    notes,
    '</li>',
  ].join('')
}

/**
 * Render the whole page.
 *
 * Two products come out of this one function. The default is the file the pet
 * opens from disk: self-contained, read-only, and holding nothing about any
 * bookmark except what a card shows. `editable` is the copy the Host serves to
 * DSH's own Browser tab, where a save request can be answered: it carries each
 * entry's fields in a JSON block and the editing script that posts them back.
 * @param library - the parsed library.
 * @param options - `root` for icon paths, `generatedAt` for the footer stamp,
 *   `editable` for the served copy, `revision` for the stamp its saves carry, and
 *   `savePath` for the route those saves are posted to.
 * @returns the page's HTML.
 */
export function buildPage(library, options = {}) {
  const root = options.root ?? import.meta.dirname
  const generatedAt = options.generatedAt ?? new Date()
  const editable = options.editable === true
  const revision = typeof options.revision === 'string' ? options.revision : ''
  const savePath = typeof options.savePath === 'string' && options.savePath !== ''
    ? options.savePath
    : '/api/little-icon/favorites/save'
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
    `<ul class="cards">${entries.map(entry => renderCard(entry, root, editable)).join('')}</ul>`,
    '</section>',
  ].join('')
  const chips = ['<button type="button" class="chip on" data-group="">全部</button>']
    .concat([...groups.keys()].map(name => `<button type="button" class="chip" data-group="${escapeHtml(name)}">${escapeHtml(name)}</button>`))
    .join('')
  // Local time, because the stamp answers "is this page the one I just built?"
  // for a person looking at their own clock.
  const stamp = new Date(generatedAt.getTime() - generatedAt.getTimezoneOffset() * 60000)
    .toISOString().replace('T', ' ').slice(0, 16)
  // Everything a save request needs, and nothing a reader does not: the icon path
  // stays out because the dialog never changes it, and the Host keeps whatever the
  // library already holds for an entry it is given back.
  const data = editable
    ? JSON.stringify({
      revision,
      bookmarks: bookmarks.map(entry => ({
        id: entry.id,
        url: entry.url,
        title: entry.title ?? '',
        group: entry.group ?? '',
        notes: entry.notes ?? '',
        autoTags: Array.isArray(entry.autoTags) ? entry.autoTags.map(String) : [],
        pinned: entry.pinned === true,
      })),
    }).replace(/</gu, '\\u003c')
    : ''
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(PAGE_TITLE)}</title>
<style>${STYLE}${editable ? EDIT_STYLE : ''}</style>
</head>
<body${editable ? ' class="editing"' : ''}>
<header>
<div class="bar">
<h1>${escapeHtml(PAGE_TITLE)}</h1>
<p class="meta">共 ${bookmarks.length} 个网站 · ${groups.size} 个分组 · 生成于 ${escapeHtml(stamp)}</p>
${editable ? '<button type="button" id="add" class="primary">＋ 添加网站</button>' : ''}
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
${editable ? `${EDITOR_HTML}<script type="application/json" id="library-data">${data}</script><script>${editScript(savePath)}</script>` : ''}
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

/** Styling of the served copy only: the buttons, the dialog, and the narrow layout. */
const EDIT_STYLE = `
body.editing .card { position: relative; }
body.editing .card .tools {
  position: absolute; top: 6px; right: 6px; display: flex; gap: 4px;
  opacity: 0; transition: opacity .12s ease;
}
body.editing .card:hover .tools, body.editing .card:focus-within .tools { opacity: 1; }
@media (hover: none) { body.editing .card .tools { opacity: 1; } }
.tool {
  width: 24px; height: 24px; padding: 0; display: grid; place-items: center;
  font: inherit; font-size: 12px; line-height: 1; color: var(--dim); cursor: pointer;
  background: var(--panel); border: 1px solid var(--line); border-radius: 7px;
}
.tool:hover { color: var(--ink); border-color: var(--accent); }
.primary {
  padding: 6px 12px; font: inherit; color: var(--panel); cursor: pointer;
  background: var(--accent); border: 1px solid transparent; border-radius: 8px;
}
.primary:disabled { opacity: .55; cursor: default; }
#add { margin-left: auto; align-self: center; }
.plain {
  padding: 6px 12px; font: inherit; color: var(--dim); cursor: pointer;
  background: none; border: 1px solid var(--line); border-radius: 8px;
}
.plain:hover { color: var(--ink); }
dialog#editor {
  width: min(460px, calc(100vw - 32px)); padding: 0; color: var(--ink);
  background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, .28);
}
dialog#editor::backdrop { background: rgba(10, 12, 16, .45); }
#editor-form { display: flex; flex-direction: column; gap: 10px; padding: 18px 20px 16px; }
#editor-form h2 { margin: 0 0 2px; font-size: 15px; font-weight: 650; }
#editor-form label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--dim); }
#editor-form input[type="text"], #editor-form input[type="url"], #editor-form textarea {
  padding: 7px 10px; font: inherit; color: var(--ink); background: var(--bg);
  border: 1px solid var(--line); border-radius: 8px;
}
#editor-form input:focus, #editor-form textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
#editor-form textarea { resize: vertical; min-height: 64px; }
#editor-form label.check { flex-direction: row; align-items: center; gap: 6px; color: var(--ink); }
#editor-form .error { margin: 0; color: #c0392b; font-size: 12px; }
#editor-form .buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
`

/** The dialog the served copy edits one entry in. */
const EDITOR_HTML = `
<dialog id="editor">
<form id="editor-form">
<h2 id="editor-head">添加网站</h2>
<label>网址<input id="f-url" type="url" required placeholder="https://" autocomplete="off"></label>
<label>标题<input id="f-title" type="text" placeholder="留空就用域名" autocomplete="off"></label>
<label>分组<input id="f-group" type="text" list="group-options" placeholder="留空就是未分组" autocomplete="off"></label>
<datalist id="group-options"></datalist>
<label>标签<input id="f-tags" type="text" placeholder="用空格或逗号分隔" autocomplete="off"></label>
<label>备注<textarea id="f-notes" rows="3" placeholder="可以写 Markdown"></textarea></label>
<label class="check"><input id="f-pinned" type="checkbox">置顶</label>
<p id="editor-error" class="error" hidden></p>
<div class="buttons">
<button type="button" id="editor-cancel" class="plain">取消</button>
<button type="submit" id="editor-save" class="primary">保存</button>
</div>
</form>
</dialog>
`

/**
 * The served copy's editing script.
 *
 * Every change is one save request carrying the whole list, and a successful
 * answer reloads the page: the Host has already written the library and the page
 * that comes back is the one it wrote, so nothing here has to keep a second
 * rendering of a card in step with the file.
 * @param savePath - the route a save request is posted to.
 * @returns the script's text.
 */
function editScript(savePath) {
  return 'const SAVE = ' + JSON.stringify(savePath) + '\n' + `
const dataBlock = document.getElementById('library-data')
const data = JSON.parse(dataBlock.textContent)
const bookmarks = data.bookmarks
const revision = data.revision
const dialog = document.getElementById('editor')
const form = document.getElementById('editor-form')
const head = document.getElementById('editor-head')
const errorBox = document.getElementById('editor-error')
const groupOptions = document.getElementById('group-options')
const field = (id) => document.getElementById(id)
let editingId = ''

const refreshGroups = () => {
  groupOptions.textContent = ''
  const names = [...new Set(bookmarks.map((entry) => entry.group).filter((name) => name !== ''))].sort()
  for (const name of names) {
    const option = document.createElement('option')
    option.value = name
    groupOptions.append(option)
  }
}

const showError = (message) => {
  errorBox.textContent = message
  errorBox.hidden = false
}

const report = (message) => {
  window.alert(message)
}

const save = async (next) => {
  let response
  try {
    response = await fetch(SAVE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ revision, bookmarks: next }),
    })
  } catch (error) {
    report('保存失败：' + (error && error.message ? error.message : '连接不上 DSH'))
    return false
  }
  let payload
  try {
    payload = await response.json()
  } catch {
    payload = undefined
  }
  if (payload === undefined || payload.ok !== true) {
    const message = payload && payload.message ? payload.message : '保存失败（HTTP ' + response.status + '）'
    report(message)
    return false
  }
  location.reload()
  return true
}

const openEditor = (entry) => {
  editingId = entry ? entry.id : ''
  head.textContent = entry ? '编辑网站' : '添加网站'
  const chosen = document.querySelector('.chip.on')
  const activeGroup = chosen === null ? '' : chosen.dataset.group
  field('f-url').value = entry ? entry.url : ''
  field('f-title').value = entry ? entry.title : ''
  field('f-group').value = entry ? entry.group : activeGroup
  field('f-tags').value = entry ? entry.autoTags.join(' ') : ''
  field('f-notes').value = entry ? entry.notes : ''
  field('f-pinned').checked = entry ? entry.pinned : false
  errorBox.hidden = true
  refreshGroups()
  dialog.showModal()
  field('f-url').focus()
}

document.getElementById('add').addEventListener('click', () => openEditor(undefined))
document.getElementById('editor-cancel').addEventListener('click', () => dialog.close())

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const url = field('f-url').value.trim()
  if (url === '') {
    showError('网址不能为空')
    return
  }
  const raw = {
    url,
    title: field('f-title').value.trim(),
    group: field('f-group').value.trim(),
    notes: field('f-notes').value,
    autoTags: field('f-tags').value.split(/[,，、;；\\s]+/).filter((tag) => tag !== ''),
    pinned: field('f-pinned').checked,
  }
  const next = editingId === ''
    ? [...bookmarks, raw]
    : bookmarks.map((entry) => (entry.id === editingId ? { ...entry, ...raw } : entry))
  const button = document.getElementById('editor-save')
  const label = button.textContent
  button.disabled = true
  button.textContent = '保存中…'
  const done = await save(next)
  button.disabled = false
  button.textContent = label
  if (done) dialog.close()
})

document.addEventListener('click', (event) => {
  const button = event.target.closest('.tool')
  if (button === null) return
  const card = button.closest('.card')
  const id = card === null ? undefined : card.dataset.id
  if (id === undefined) return
  const entry = bookmarks.find((item) => item.id === id)
  if (entry === undefined) return
  if (button.dataset.act === 'edit') {
    openEditor(entry)
    return
  }
  if (button.dataset.act === 'delete') {
    if (!window.confirm('删除「' + (entry.title || entry.url) + '」？')) return
    void save(bookmarks.filter((item) => item.id !== id))
  }
})
`
}

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
