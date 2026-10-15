// Import a browser's exported bookmark file into `bookmarks.yml`.
//
// The export is a Netscape bookmark file: nested <DL> lists, one <H3> naming each
// folder, one <A HREF> per bookmark, and an inline base64 favicon in the anchor's
// ICON attribute. Reading it is a one-time step; from then on `bookmarks.yml` is
// the source of truth and this script only ever adds what the export has and the
// library does not.
//
// What it refuses to do matters more than what it does:
//   - an entry already in the library is left byte-for-byte alone, so a note, a
//     tag, or an icon picked up in the editor survives every later import;
//   - an entry missing from the export is never removed, so an export taken from
//     one browser profile cannot delete another profile's bookmarks;
//   - an address the page could not open (anything but http/https, or one carrying
//     credentials) is reported and skipped rather than stored.
//
// Usage: node import.mjs [export.html] [--dry]
// Exit codes: 0 = done, 1 = nothing was written because something is wrong.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  exportDir, libraryFile, loadYaml, mergeLibrary, newestExport, parseNetscape,
  readLibrary, writeIcon, writeLibrary,
} from './library.mjs'

/**
 * One parsed entry as it enters the library: an existing entry comes back
 * untouched, a new one gets its icon written out and its dates filled in.
 * @param entry - the parsed entry.
 * @param known - ids already in the library.
 * @param stamp - the instant to fall back to for a missing date.
 * @returns the library entry and whether an icon was written.
 */
function adoptEntry(entry, known, stamp) {
  if (known.has(entry.id)) return { entry, icon: false }
  const { icon: _icon, modifiedAt, ...rest } = entry
  const written = writeIcon(entry)
  const adopted = { ...rest, addedAt: entry.addedAt ?? modifiedAt ?? stamp }
  if (modifiedAt !== undefined) adopted.updatedAt = modifiedAt
  if (written !== undefined) adopted.icon = written
  return { entry: adopted, icon: written !== undefined }
}

/** Run the import the way the command line asked for it. */
function main() {
  const argv = process.argv.slice(2)
  const dry = argv.includes('--dry')
  const named = argv.find(value => !value.startsWith('--'))
  const source = named === undefined ? newestExport() : resolve(named)
  if (source === undefined || !existsSync(source)) {
    console.error(`[favorites] 找不到浏览器导出的书签文件：${source ?? exportDir}`)
    process.exitCode = 1
    return
  }
  let yaml
  try {
    yaml = loadYaml()
  } catch (error) {
    console.error(`[favorites] ${error.message}`)
    process.exitCode = 1
    return
  }
  const library = readLibrary(yaml)
  const { entries, skipped } = parseNetscape(readFileSync(source, 'utf8'))
  const { bookmarks, added } = mergeLibrary(library.bookmarks, entries)
  const known = new Set(library.bookmarks.map(entry => entry.id))
  const stamp = new Date().toISOString()
  let icons = 0
  const merged = bookmarks.map((entry) => {
    const adopted = adoptEntry(entry, known, stamp)
    if (adopted.icon) icons++
    return adopted.entry
  })
  console.log(`[favorites] 导出文件：${source}`)
  console.log(`[favorites] 解析到 ${entries.length} 条书签，跳过 ${skipped.length} 条地址打不开的`)
  for (const row of skipped) console.log(`[favorites]   跳过 ${JSON.stringify(row.url)}（${row.title || '无标题'}）`)
  console.log(`[favorites] 库里原有 ${library.bookmarks.length} 条，本次新增 ${added} 条，写出图标 ${icons} 个`)
  if (dry) {
    console.log('[favorites] --dry：没有写任何文件。')
    return
  }
  writeFileSync(libraryFile, writeLibrary(yaml, { version: library.version, bookmarks: merged }))
  console.log(`[favorites] 已写入 ${libraryFile}`)
  console.log('[favorites] 接着跑 node build-page.mjs 生成展示页。')
}

const invokedDirectly = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) main()
