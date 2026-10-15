// What the library does with a browser's export: the parse, the identity, and the
// merge rules that keep an edited library intact across imports.

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  compactEntry, decodeEntities, groupPath, idFor, mergeLibrary, openableUrl, parseAttributes,
  parseNetscape, parseStamp, writeIcon,
} from '../library.mjs'

/** A one-megapixel PNG header, enough for the magic-number check. */
const PNG = 'iVBORw0KGgoAAAANSUhEUg'

const EXPORT = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1676857823">收藏夹栏</H3>
    <DL><p>
        <DT><A HREF="https://a.example/1" ADD_DATE="1676857823" ICON="data:image/png;base64,${PNG}">A &amp; B</A>
        <DT><H3>Work</H3>
        <DL><p>
            <DT><A HREF='https://b.example/2'>B</A>
            <DT><A HREF="javascript:alert(1)">not a page</A>
            <DT><A HREF="https://user:pw@c.example/">with credentials</A>
            <DT><A HREF=https://d.example/unquoted>unquoted</A>
        </DL><p>
    </DL><p>
    <DT><H3>新建文件夹</H3>
    <DL><p>
    </DL><p>
</DL>
`

test('decodeEntities decodes named, decimal, and hex references', () => {
  assert.equal(decodeEntities('A &amp; B &#39;s &lt;tag&gt; &#x4e2d;'), "A & B 's <tag> 中")
  assert.equal(decodeEntities('&unknown;'), '&unknown;')
})

test('parseAttributes reads quoted, single-quoted, and unquoted values', () => {
  const attributes = parseAttributes('HREF="a" ICON=\'b\' ADD_DATE=17 >')
  assert.deepEqual(attributes, { HREF: 'a', ICON: 'b', ADD_DATE: '17' })
})

test('openableUrl keeps http/https and refuses everything else', () => {
  assert.equal(openableUrl('https://a.example/x'), 'https://a.example/x')
  assert.equal(openableUrl('http://a.example'), 'http://a.example/')
  assert.equal(openableUrl('javascript:alert(1)'), undefined)
  assert.equal(openableUrl('file:///C:/x.html'), undefined)
  assert.equal(openableUrl('chrome://settings'), undefined)
  assert.equal(openableUrl('https://user:pw@a.example/'), undefined)
  assert.equal(openableUrl(''), undefined)
})

test('idFor is stable across calls and differs per address', () => {
  assert.equal(idFor('https://a.example/'), idFor('https://a.example/'))
  assert.match(idFor('https://a.example/'), /^[0-9a-f]{12}$/u)
  assert.notEqual(idFor('https://a.example/'), idFor('https://a.example/2'))
})

test('parseStamp reads seconds, milliseconds, and microseconds alike', () => {
  const seconds = parseStamp('1676857823')
  assert.equal(parseStamp('1676857823000'), seconds)
  assert.equal(parseStamp('1676857823000000'), seconds)
  assert.equal(parseStamp('7707157823'), undefined)
  assert.equal(parseStamp('not a date'), undefined)
})

test('parseNetscape reads folders, entities, and icons in file order', () => {
  const { entries, skipped } = parseNetscape(EXPORT)
  assert.equal(entries.length, 3)
  assert.deepEqual(entries.map(entry => entry.title), ['A & B', 'B', 'unquoted'])
  assert.deepEqual(entries.map(entry => entry.group), ['', 'Work', 'Work'])
  assert.equal(entries[0].url, 'https://a.example/1')
  assert.equal(entries[0].icon, `data:image/png;base64,${PNG}`)
  assert.equal(typeof entries[0].addedAt, 'string')
  assert.equal(entries[1].addedAt, undefined)
  assert.equal(skipped.length, 2)
  assert.deepEqual(skipped.map(row => row.url), ['javascript:alert(1)', 'https://user:pw@c.example/'])
})

test('parseNetscape carries a folder name with no bookmarks as nothing at all', () => {
  const { entries } = parseNetscape(EXPORT)
  assert.equal(entries.some(entry => entry.group.includes('新建文件夹')), false)
})

test('the container folder the browser wraps the export in is not part of a path', () => {
  // `收藏夹栏` is Chrome's own toolbar container in a Chinese UI: every path would
  // repeat it, and a bookmark sitting directly in it has no folder of its own.
  assert.equal(groupPath(['', '收藏夹栏']), '')
  assert.equal(groupPath(['', '收藏夹栏', 'Work']), 'Work')
  assert.equal(groupPath(['', '收藏夹栏', 'Unreal', 'Study']), 'Unreal/Study')
  // The English spelling of the same container, and a folder that merely shares the
  // name: only the outermost one is the browser's.
  assert.equal(groupPath(['', 'Bookmarks bar', 'Work']), 'Work')
  assert.equal(groupPath(['', 'Work', '收藏夹栏']), 'Work/收藏夹栏')
  // A container this list does not know stays as the export spelled it.
  assert.equal(groupPath(['', 'Favoritos', 'Work']), 'Favoritos/Work')
})

test('writeIcon writes a real PNG and refuses a payload that only claims to be one', () => {
  const directory = mkdtempSync(join(tmpdir(), 'favorites-'))
  try {
    const entry = { id: 'abc123abc123', icon: `data:image/png;base64,${PNG}` }
    assert.equal(writeIcon(entry, directory), 'assets/abc123abc123.png')
    const bytes = readFileSync(join(directory, 'abc123abc123.png'))
    assert.deepEqual([...bytes.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47])
    assert.equal(writeIcon({ id: 'x', icon: 'data:image/png;base64,bm90YXBuZw==' }, directory), undefined)
    assert.equal(writeIcon({ id: 'x', icon: 'data:image/png;base64,' }, directory), undefined)
    assert.equal(writeIcon({ id: 'x' }, directory), undefined)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('mergeLibrary keeps every existing entry and appends what is new', () => {
  const kept = { id: 'keep', url: 'https://keep.example/', title: 'mine', group: 'g', notes: 'edited by hand' }
  const incoming = [
    { id: 'keep', url: 'https://keep.example/', title: 'from the export', group: 'g' },
    { id: 'new', url: 'https://new.example/', title: 'new', group: 'g' },
  ]
  const { bookmarks, added } = mergeLibrary([kept], incoming)
  assert.equal(added, 1)
  assert.deepEqual(bookmarks.map(entry => entry.id), ['keep', 'new'])
  assert.equal(bookmarks[0], kept)
})

test('mergeLibrary never drops an entry the export no longer has', () => {
  const only = { id: 'a', url: 'https://a.example/', title: 'a', group: 'g' }
  const { bookmarks, added } = mergeLibrary([only], [])
  assert.equal(added, 0)
  assert.deepEqual(bookmarks, [only])
})

test('compactEntry leaves out the fields that carry no value', () => {
  const written = compactEntry({
    id: 'i', url: 'u', title: 't', group: 'g', notes: '', tags: [], icon: '', pinned: false, addedAt: undefined,
  })
  assert.deepEqual(written, { id: 'i', url: 'u', title: 't', group: 'g' })
  assert.deepEqual(
    compactEntry({ id: 'i', url: 'u', title: 't', group: 'g', notes: 'n', tags: ['x'], pinned: true }),
    { id: 'i', url: 'u', title: 't', group: 'g', notes: 'n', tags: ['x'], pinned: true },
  )
})
