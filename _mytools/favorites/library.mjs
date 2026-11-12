// The website library: one YAML file in this directory, plus the favicons beside
// it, and every rule about reading, merging, and writing them.
//
// `bookmarks.yml` is the only source of truth. A browser's exported bookmarks are
// read once by `import.mjs`; from then on the editor in DSH writes this file and
// `build-page.mjs` renders it. Keeping the rules here rather than in either
// caller is what makes the importer, the renderer, and the tests agree on what a
// bookmark is.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

/** Repository root, derived from this file's own location (`_mytools/favorites`). */
export const repositoryRoot = resolve(import.meta.dirname, '..', '..')

/** The library file this tool reads and writes. */
export const libraryFile = join(import.meta.dirname, 'bookmarks.yml')

/** Favicons are written here, one file per bookmark id. */
export const assetsDir = join(import.meta.dirname, 'assets')

/** Where an export is looked for when a caller names none. */
export const exportDir = join(repositoryRoot, '_mytools', 'Note')

/** Header written above the YAML, so the file explains itself where it is read. */
export const FILE_HEADER = [
  '# 个人网站库，唯一的事实来源。浏览器导出的书签文件只在 import.mjs 里读过一次。',
  '# 字段：id url title group notes(Markdown) tags icon pinned addedAt updatedAt',
  '# 展示页：桌宠右键菜单 -> 网站 -> 网站导航；格式说明见 README.md。',
  '',
].join('\n')

/**
 * The `yaml` package, loaded through the package that already depends on it, the
 * way `_mytools/settings/sync-settings.mjs` loads it: one shared parser keeps this
 * file byte-compatible with what the rest of the checkout writes.
 * @returns the `yaml` module.
 */
export function loadYaml() {
  const from = join(repositoryRoot, 'packages', 'boot', 'config-editor', 'package.json')
  try {
    return createRequire(from)('yaml')
  } catch (error) {
    throw new Error(`could not load "yaml" through ${from}: ${error.message}; is this checkout installed?`)
  }
}

/**
 * Decode the character references a browser export escapes titles and folder
 * names with. The export is HTML, so `&amp;` and `&#39;` are ordinary content.
 * @param text - raw attribute or element text.
 * @returns the decoded text.
 */
export function decodeEntities(text) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }
  return String(text).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/gu, (match, body) => {
    if (/^#x/iu.test(body)) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    const key = body.toLowerCase()
    return Object.hasOwn(named, key) ? named[key] : match
  })
}

/**
 * Read one element's attributes. Browsers quote them; older exports do not, so an
 * unquoted value ends at whitespace or the closing bracket.
 * @param text - the attribute text between the element name and `>`.
 * @returns attribute values keyed by upper-case name.
 */
export function parseAttributes(text) {
  const attributes = {}
  const pattern = /([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gu
  for (const match of String(text).matchAll(pattern)) {
    attributes[match[1].toUpperCase()] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return attributes
}

/**
 * Whether an address is one the navigation page may open: http or https, and
 * without credentials in it.
 * @param value - the address to check.
 * @returns the absolute address, or undefined when nothing may open.
 */
export function openableUrl(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text === '') return undefined
  let url
  try {
    url = new URL(text)
  } catch {
    return undefined
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  if (url.username !== '' || url.password !== '') return undefined
  return url.href
}

/**
 * Stable identity of one address, derived from the address itself so that
 * importing the same export on another machine produces the same ids and the two
 * libraries line up entry for entry. Assigned once and never recomputed: editing
 * an address keeps the note, the tags, and the icon attached to the entry.
 * @param url - an absolute address.
 * @returns twelve hex characters.
 */
export function idFor(url) {
  return createHash('sha1').update(url).digest('hex').slice(0, 12)
}

/**
 * Turn an `ADD_DATE`/`LAST_MODIFIED` attribute into an ISO instant. Browsers have
 * shipped seconds, milliseconds, and microseconds in this attribute, so the unit
 * is read from the magnitude and anything that does not land in a sane range is
 * dropped rather than stored as a wrong date.
 * @param value - the raw attribute value.
 * @returns an ISO instant, or undefined.
 */
export function parseStamp(value) {
  const digits = String(value ?? '').trim()
  if (!/^\d+$/u.test(digits)) return undefined
  const scale = digits.length >= 16 ? 1e6 : digits.length >= 13 ? 1e3 : 1
  const date = new Date(Number(digits) / scale * 1000)
  const year = date.getUTCFullYear()
  return year >= 1990 && year <= 2100 ? date.toISOString() : undefined
}

/**
 * Characters a document can carry without ever showing them: zero-width spaces and
 * joiners, bidirectional controls, and the byte-order mark. A title copied out of a
 * Feishu document arrives with a few dozen of them in front, which the card then
 * renders as a gap and the search index matches nothing against.
 */
const INVISIBLE = /[\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb]/gu

/**
 * One line of text as the library records it: no invisible characters, and the
 * whitespace they leave behind folded into single spaces. Titles and folder names
 * go through this; a note does not, because its line breaks are the author's.
 * @param value - raw text from the export.
 * @returns the cleaned text.
 */
export function cleanText(value) {
  return String(value ?? '').replace(INVISIBLE, '').replace(/\s+/gu, ' ').trim()
}

/**
 * Folder names a browser puts around the whole export rather than around a set of
 * bookmarks: Chrome's own toolbar container. Every path would carry the same name,
 * and the name says nothing a reader does not already know, so a path that starts
 * with one drops it — `收藏夹栏/Work` is `Work` — while a bookmark sitting directly
 * in it keeps no group at all. Chrome localizes this name with the browser's
 * language, so the list covers the languages this library has been imported from;
 * a name that is not listed is kept exactly as the export spelled it.
 */
const CONTAINER_FOLDERS = new Set([
  '收藏夹栏', '书签栏', '書籤列', 'Bookmarks bar', 'Bookmarks Bar', 'Bookmarks Toolbar', 'ブックマーク バー',
])

/**
 * The folder path one bookmark sits in, without the container the browser wrapped
 * the whole export in.
 * @param folders - the open folder names, outermost first, root included.
 * @returns the path as the library records it, empty for a bookmark at the top.
 */
export function groupPath(folders) {
  const path = folders.slice(1).filter(name => name !== '')
  const trimmed = path.length > 0 && CONTAINER_FOLDERS.has(path[0]) ? path.slice(1) : path
  return trimmed.join('/')
}

/**
 * Read one exported bookmark file.
 * @param html - the file's text.
 * @returns `entries` in file order and the addresses `skipped` with their reason.
 */
export function parseNetscape(html) {
  const token = /<DL\b[^>]*>|<\/DL\s*>|<H3\b([^>]*)>([\s\S]*?)<\/H3\s*>|<A\b([^>]*)>([\s\S]*?)<\/A\s*>/giu
  const folders = []
  const entries = []
  const skipped = []
  let pending = null
  for (const match of String(html).matchAll(token)) {
    const text = match[0]
    if (/^<DL/iu.test(text)) {
      // A folder owns the list that follows its own <H3>; the outermost list has
      // none, which is what the empty name marks.
      folders.push(pending ?? '')
      pending = null
      continue
    }
    if (/^<\/DL/iu.test(text)) {
      folders.pop()
      continue
    }
    if (/^<H3/iu.test(text)) {
      pending = cleanText(decodeEntities(match[2]))
      continue
    }
    const attributes = parseAttributes(match[3])
    const raw = attributes.HREF ?? ''
    const group = groupPath(folders)
    const url = openableUrl(raw)
    if (url === undefined) {
      skipped.push({ url: raw, title: cleanText(decodeEntities(match[4])), group, reason: 'address' })
      continue
    }
    const title = cleanText(decodeEntities(match[4]))
    entries.push({
      id: idFor(url),
      url,
      title: title === '' ? new URL(url).hostname : title,
      group,
      icon: attributes.ICON,
      addedAt: parseStamp(attributes.ADD_DATE),
      modifiedAt: parseStamp(attributes.LAST_MODIFIED),
    })
  }
  return { entries, skipped }
}

/**
 * Write one entry's favicon beside the library.
 * @param entry - a parsed entry carrying an `icon` data URI.
 * @param directory - directory to write into; the library's own `assets/` unless a caller says otherwise.
 * @returns the library-relative icon path, or undefined when there is no usable icon.
 */
export function writeIcon(entry, directory = assetsDir) {
  const match = /^data:image\/([a-z0-9.+-]+);base64,([\s\S]*)$/iu.exec(entry.icon ?? '')
  if (match === null) return undefined
  const extension = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase()
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.length === 0) return undefined
  // A PNG that is not a PNG decodes to something a browser shows as a broken
  // image, which looks like a broken bookmark; the magic number is the check.
  if (extension === 'png' && !(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) {
    return undefined
  }
  const name = `${entry.id}.${extension}`
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, name), bytes)
  return `assets/${name}`
}

/**
 * The library after importing: every existing entry untouched and in place, then
 * the entries the export has and the library does not.
 * @param existing - entries already in the library.
 * @param incoming - entries just parsed.
 * @returns the merged list and how many were added.
 */
export function mergeLibrary(existing, incoming) {
  const known = new Map(existing.map(entry => [entry.id, entry]))
  const added = []
  for (const entry of incoming) {
    if (known.has(entry.id)) continue
    known.set(entry.id, entry)
    added.push(entry.id)
  }
  const order = [...existing.map(entry => entry.id), ...added]
  return { bookmarks: order.map(id => known.get(id)), added: added.length }
}

/**
 * Drop the fields that carry no value, so the file stays one readable block per
 * bookmark and a diff shows the fields that actually changed.
 * @param entry - a library entry.
 * @returns the entry as it is written.
 */
export function compactEntry(entry) {
  const written = {
    id: entry.id,
    url: entry.url,
    title: entry.title,
    group: entry.group,
  }
  if (typeof entry.notes === 'string' && entry.notes !== '') written.notes = entry.notes
  // The machine's own tags sit beside the folder the person files an entry under:
  // two classifications, and only this one is ever regenerated from scratch.
  if (Array.isArray(entry.autoTags) && entry.autoTags.length > 0) written.autoTags = entry.autoTags
  if (typeof entry.icon === 'string' && entry.icon !== '') written.icon = entry.icon
  if (entry.pinned === true) written.pinned = true
  if (typeof entry.addedAt === 'string') written.addedAt = entry.addedAt
  if (typeof entry.updatedAt === 'string') written.updatedAt = entry.updatedAt
  return written
}

/**
 * Read the library file.
 * @param yaml - the `yaml` module.
 * @param file - the library file, the one this directory holds unless a caller
 *   names another (a test keeps its own).
 * @returns the parsed document, or an empty library when the file is absent.
 */
export function readLibrary(yaml, file = libraryFile) {
  if (!existsSync(file)) return { version: 1, bookmarks: [] }
  const parsed = yaml.parse(readFileSync(file, 'utf8'))
  const bookmarks = Array.isArray(parsed?.bookmarks) ? parsed.bookmarks : []
  const version = typeof parsed?.version === 'number' ? parsed.version : 1
  return { version, bookmarks }
}

/**
 * Serialize a library the way this tool wants it on disk: block style, no line
 * wrapping, one block per bookmark, and empty optional fields left out.
 * @param yaml - the `yaml` module.
 * @param library - the document to write.
 * @returns the file's text.
 */
export function writeLibrary(yaml, library) {
  const document = { version: library.version, bookmarks: library.bookmarks.map(compactEntry) }
  return `${FILE_HEADER}${yaml.stringify(document, { lineWidth: 0 })}`
}

/**
 * Newest exported bookmark file, since an export's name carries the date it was
 * taken and one machine accumulates one per export.
 * @param directory - where the exports are kept.
 * @returns the newest path, or undefined when the directory holds none.
 */
export function newestExport(directory = exportDir) {
  if (!existsSync(directory)) return undefined
  const dated = readdirSync(directory)
    .filter(name => /^favorites_.*\.html?$/iu.test(name))
    .map(name => ({ path: join(directory, name), at: statSync(join(directory, name)).mtimeMs }))
  dated.sort((left, right) => right.at - left.at)
  return dated[0]?.path
}

// ---- the editor ------------------------------------------------------------
//
// The navigation page edits the library in a browser, so a save request is
// untrusted input by definition: it arrives as JSON over a local socket and its
// fields hold whatever the page — or anything able to post there — sent. The
// functions below are where such a request becomes a library entry, and the page
// and the Host both use them, so an entry built in the dialog is exactly the
// entry written to the file.

/** Longest title a card keeps. */
export const TITLE_MAX = 200

/** Longest note a card keeps, in characters. */
export const NOTES_MAX = 4000

/** Most tags one entry may carry. */
export const TAGS_MAX = 8

/** Longest one tag may be. */
export const TAG_MAX = 40

/** Longest folder path one entry may name. */
export const GROUP_MAX = 120

/**
 * Cut text to a character count without splitting a surrogate pair, which
 * `slice` would do and which then renders as a replacement character.
 * @param text - the text to cut.
 * @param limit - most characters to keep.
 * @returns the text, at most `limit` characters long.
 */
function clip(text, limit) {
  const characters = [...String(text)]
  return characters.length <= limit ? String(text) : characters.slice(0, limit).join('')
}

/**
 * The host a card shows under its title.
 * @param url - an absolute address.
 * @returns the host name, or the address itself when no part of it parses.
 */
function hostOf(url) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/**
 * The tags one entry carries, cleaned the way the importer cleans a title:
 * invisible characters gone, blanks folded, duplicates dropped. A tag is a word
 * somebody types, so every separator a Chinese or English keyboard puts between
 * words splits one.
 * @param value - an array of tags, or the text of one input box.
 * @returns at most {@link TAGS_MAX} tags, each at most {@link TAG_MAX} characters.
 */
export function normalizeTags(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string' ? value.split(/[,，、;；\s]+/u) : []
  const tags = []
  for (const item of raw) {
    const tag = clip(cleanText(item), TAG_MAX)
    if (tag === '' || tags.includes(tag)) continue
    tags.push(tag)
    if (tags.length >= TAGS_MAX) break
  }
  return tags
}

/**
 * The folder path one entry files under: a slash-separated path with empty
 * segments dropped, so replacing a missing segment and trailing slashes both
 * describe the same folder.
 * @param value - the raw folder text.
 * @returns the cleaned path, empty for the root.
 */
export function normalizeGroup(value) {
  const parts = cleanText(value).split('/').map(part => part.trim()).filter(part => part !== '')
  return clip(parts.join('/'), GROUP_MAX)
}

/**
 * Whether two entries carry the same content. Identity and the date an entry was
 * added are not content; everything a card shows is.
 * @param left - one entry.
 * @param right - another.
 * @returns whether an edit changed anything a reader would see.
 */
export function sameEntry(left, right) {
  const tags = entry => (Array.isArray(entry.autoTags) ? entry.autoTags.join('\u0000') : '')
  return left.url === right.url
    && left.title === right.title
    && (left.group ?? '') === (right.group ?? '')
    && (left.notes ?? '') === (right.notes ?? '')
    && tags(left) === tags(right)
    && (left.pinned === true) === (right.pinned === true)
}

/**
 * One entry a save request describes, as the library records it.
 *
 * The address decides identity: a request names the `id` it read from the page,
 * and an entry keeps that id, its icon, and the date it was added. Everything
 * else belongs to the request and is cleaned here — the title falls back to the
 * host name, the folder to the root, and blank optional fields are left out
 * rather than stored empty.
 * @param raw - one bookmark as the request sent it.
 * @param previous - the entry this one replaces, when the library already holds it.
 * @param now - the instant a new or changed entry is stamped with.
 * @returns `{ ok: true, entry }`, or `{ ok: false, reason, message }` when the
 *   request cannot become an entry.
 */
export function normalizeEntry(raw, previous, now = new Date()) {
  const url = openableUrl(raw?.url)
  if (url === undefined) {
    return { ok: false, reason: 'address', message: `不是可打开的 http/https 地址：${String(raw?.url ?? '')}` }
  }
  const asked = typeof raw?.id === 'string' ? raw.id.trim() : ''
  const title = clip(cleanText(raw?.title), TITLE_MAX) || hostOf(url)
  const group = normalizeGroup(raw?.group)
  const notes = typeof raw?.notes === 'string'
    ? String(raw.notes).replace(/\r\n?/gu, '\n').trim().slice(0, NOTES_MAX)
    : ''
  const entry = {
    // A page that lost its id (a hand-written request, a stale card) still names
    // one address, and the id is derived from the address, so it is the same id
    // the library would have given it on import.
    id: asked !== '' ? asked : idFor(url),
    url,
    title,
    group,
  }
  if (notes !== '') entry.notes = notes
  const tags = normalizeTags(raw?.autoTags)
  if (tags.length > 0) entry.autoTags = tags
  // The icon is the library's own file, not a field a page sets: whatever this
  // entry had stays with it, and a new entry starts with a letter tile.
  if (typeof previous?.icon === 'string' && previous.icon !== '') entry.icon = previous.icon
  if (raw?.pinned === true) entry.pinned = true
  entry.addedAt = typeof previous?.addedAt === 'string' ? previous.addedAt : now.toISOString()
  if (previous === undefined) return { ok: true, entry }
  if (sameEntry(previous, entry)) {
    if (typeof previous.updatedAt === 'string') entry.updatedAt = previous.updatedAt
    return { ok: true, entry }
  }
  entry.updatedAt = now.toISOString()
  return { ok: true, entry }
}

/**
 * The library a save request describes, checked against the one on disk.
 *
 * A request carries the whole list the page showed, so an entry missing from it
 * was deleted and one with no id is new. Every entry is matched to the one it
 * replaces by its id, which is what keeps an icon and the date an entry was added
 * attached to a renamed card.
 * @param current - the library as the file holds it.
 * @param bookmarks - the list the request sent.
 * @param now - the instant to stamp new and changed entries with.
 * @returns `{ ok: true, library, added, updated, removed }`, or
 *   `{ ok: false, reason, message, index }` for the first entry that cannot be one.
 */
export function applyLibrary(current, bookmarks, now = new Date()) {
  if (!Array.isArray(bookmarks)) {
    return { ok: false, reason: 'list', message: '请求里没有书签列表', index: 0 }
  }
  const known = new Map(current.bookmarks.map(entry => [entry.id, entry]))
  const seenIds = new Set()
  const seenUrls = new Map()
  const next = []
  let added = 0
  let updated = 0
  for (const [index, raw] of bookmarks.entries()) {
    const asked = typeof raw?.id === 'string' ? raw.id.trim() : ''
    const previous = asked !== '' ? known.get(asked) : undefined
    if (asked !== '' && previous === undefined) {
      return {
        ok: false, reason: 'stale', index,
        message: `第 ${index + 1} 条书签已经不在库里了（页面陈旧？），刷新后重试`,
      }
    }
    const result = normalizeEntry(raw, previous, now)
    if (!result.ok) return { ...result, index }
    const entry = result.entry
    if (seenIds.has(entry.id)) {
      return { ok: false, reason: 'duplicate', index, message: `第 ${index + 1} 条书签重复出现` }
    }
    // Two cards for one address is what a browser export never produces and what a
    // person adding a bookmarked page twice otherwise creates with no warning.
    const first = seenUrls.get(entry.url)
    if (first !== undefined) {
      return {
        ok: false, reason: 'duplicate', index,
        message: `第 ${index + 1} 条与第 ${first + 1} 条是同一个地址：${entry.url}`,
      }
    }
    seenIds.add(entry.id)
    seenUrls.set(entry.url, index)
    if (previous === undefined) added++
    else if (!sameEntry(previous, entry)) updated++
    next.push(entry)
  }
  const kept = new Set(next.map(entry => entry.id))
  const removed = current.bookmarks.filter(entry => !kept.has(entry.id)).length
  return { ok: true, library: { version: current.version, bookmarks: next }, added, updated, removed }
}

/**
 * The version stamp of a library on disk: the pair a save request has to name for
 * its write not to throw away an edit made since the page was opened.
 * @param path - the library file.
 * @returns the stamp, or undefined when the file cannot be read.
 */
export function revisionOf(path) {
  try {
    const stat = statSync(path)
    return `${Math.round(stat.mtimeMs)}-${stat.size}`
  } catch {
    return undefined
  }
}
