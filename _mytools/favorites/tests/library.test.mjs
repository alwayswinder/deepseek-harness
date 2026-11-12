// What the library does with a browser's export: the parse, the identity, and the
// merge rules that keep an edited library intact across imports.

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  applyLibrary, cleanText, compactEntry, decodeEntities, groupPath, idFor, mergeLibrary, normalizeEntry,
  normalizeGroup, normalizeTags, openableUrl, parseAttributes, parseNetscape, parseStamp, revisionOf,
  sameEntry, TAG_MAX, TAGS_MAX, writeIcon,
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
    id: 'i', url: 'u', title: 't', group: 'g', notes: '', autoTags: [], icon: '', pinned: false, addedAt: undefined,
  })
  assert.deepEqual(written, { id: 'i', url: 'u', title: 't', group: 'g' })
  assert.deepEqual(
    compactEntry({ id: 'i', url: 'u', title: 't', group: 'g', notes: 'n', autoTags: ['x'], pinned: true }),
    { id: 'i', url: 'u', title: 't', group: 'g', notes: 'n', autoTags: ['x'], pinned: true },
  )
})

test('cleanText drops the characters a copied title carries invisibly', () => {
  // A Feishu document title arrives with a few dozen zero-width characters in
  // front: they render as a gap and no search ever matches them.
  assert.equal(cleanText('\u200b\u200c\u200d\u2060\u2061\u2063\u2064\u202c\ufeff光影工作室'), '光影工作室')
  assert.equal(cleanText('  too\u200b   many   spaces  '), 'too many spaces')
  assert.equal(cleanText(undefined), '')
})

// ---- the editor -------------------------------------------------------------
//
// A save request is untrusted input: it arrives as JSON from a page and its fields
// are whatever that page sent. These are the rules that turn one into a library.

const NOW = new Date('2026-11-11T10:00:00.000Z')

test('a tag box is split on every separator a keyboard produces', () => {
  assert.deepEqual(normalizeTags('工具, AI、Unreal；素材\n社区'), ['工具', 'AI', 'Unreal', '素材', '社区'])
  assert.deepEqual(normalizeTags(['a', ' a ', '', 'b']), ['a', 'b'])
  assert.deepEqual(normalizeTags(''), [])
  assert.deepEqual(normalizeTags(undefined), [])
})

test('tags are capped, so one paste cannot fill the card', () => {
  assert.equal(normalizeTags('a b c d e f g h i j').length, TAGS_MAX)
  assert.equal(normalizeTags('x'.repeat(80))[0].length, TAG_MAX)
})

test('a folder path loses its empty segments', () => {
  assert.equal(normalizeGroup(' Unreal / Study '), 'Unreal/Study')
  assert.equal(normalizeGroup('/A//B/'), 'A/B')
  assert.equal(normalizeGroup(''), '')
  // What the editor writes is what the person typed; the browser's container name
  // is only stripped while importing an export that wrapped everything in it.
  assert.equal(normalizeGroup(' 收藏夹栏 '), '收藏夹栏')
})

test('an edited entry keeps its id, its icon, and the date it was added', () => {
  const previous = {
    id: 'abc123abc123', url: 'https://a.example/', title: 'a', group: 'g',
    icon: 'assets/abc123abc123.png', addedAt: '2024-01-01T00:00:00.000Z',
  }
  const result = normalizeEntry({
    id: 'abc123abc123', url: 'https://a.example/x', title: '  a  ', group: 'g2', autoTags: 'x y',
  }, previous, NOW)
  assert.equal(result.ok, true)
  assert.equal(result.entry.id, 'abc123abc123', 'the address is part of the entry, not its identity')
  assert.equal(result.entry.icon, 'assets/abc123abc123.png', 'the icon belongs to the entry, not to the request')
  assert.equal(result.entry.addedAt, '2024-01-01T00:00:00.000Z')
  assert.deepEqual(result.entry.autoTags, ['x', 'y'])
  assert.equal(result.entry.updatedAt, NOW.toISOString(), 'a changed entry says when it changed')
})

test('an unchanged entry keeps the stamp it already had', () => {
  const previous = {
    id: 'a', url: 'https://a.example/', title: 'a', group: '',
    addedAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-02-02T00:00:00.000Z',
  }
  const result = normalizeEntry({ id: 'a', url: 'https://a.example/', title: 'a' }, previous, NOW)
  assert.equal(result.entry.updatedAt, '2024-02-02T00:00:00.000Z')
  assert.equal(sameEntry(previous, result.entry), true)
})

test('a new entry is named by its host and derives its id from the address', () => {
  const result = normalizeEntry({ url: 'https://www.example.com/path' }, undefined, NOW)
  assert.equal(result.ok, true)
  assert.equal(result.entry.title, 'www.example.com')
  assert.equal(result.entry.id, idFor('https://www.example.com/path'))
  assert.equal(result.entry.addedAt, NOW.toISOString())
})

test('an address that opens nothing is refused', () => {
  for (const url of ['javascript:alert(1)', 'file:///C:/notes.txt', 'https://u:p@a.example/', '', undefined]) {
    const refused = normalizeEntry({ url }, undefined, NOW)
    assert.equal(refused.ok, false, String(url))
    assert.equal(refused.reason, 'address')
  }
})

const CURRENT = {
  version: 1,
  bookmarks: [
    { id: 'a', url: 'https://a.example/', title: 'a', group: 'g', icon: 'assets/a.png', addedAt: '2024-01-01T00:00:00.000Z' },
    { id: 'b', url: 'https://b.example/', title: 'b', group: 'g' },
    { id: 'c', url: 'https://c.example/', title: 'c', group: 'g' },
  ],
}

test('one save adds, edits, and deletes in the order the page showed', () => {
  const result = applyLibrary(CURRENT, [
    { id: 'a', url: 'https://a.example/', title: 'a renamed', group: 'g' },
    { id: 'c', url: 'https://c.example/', title: 'c', group: 'g' },
    { url: 'https://d.example/', title: 'd', group: '', autoTags: ['新'] },
  ], NOW)
  assert.equal(result.ok, true)
  assert.deepEqual(result.library.bookmarks.map(entry => entry.title), ['a renamed', 'c', 'd'])
  assert.deepEqual([result.added, result.updated, result.removed], [1, 1, 1])
  assert.equal(result.library.bookmarks[0].icon, 'assets/a.png', 'an edit keeps the icon it did not touch')
  assert.equal(result.library.bookmarks[2].id, idFor('https://d.example/'))
  assert.equal(result.library.bookmarks[2].addedAt, NOW.toISOString())
})

test('two cards for one address are refused rather than written twice', () => {
  const result = applyLibrary(CURRENT, [
    { id: 'a', url: 'https://a.example/', title: 'a' },
    { url: 'https://a.example/', title: 'again' },
  ], NOW)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'duplicate')
  assert.match(result.message, /第 2 条/u)
})

test('an entry that left the library while the page was open is refused', () => {
  const result = applyLibrary(CURRENT, [{ id: 'gone', url: 'https://gone.example/', title: 'gone' }], NOW)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'stale')
})

test('a request that is not a list is refused', () => {
  assert.equal(applyLibrary(CURRENT, undefined).reason, 'list')
  assert.equal(applyLibrary(CURRENT, 'nope').reason, 'list')
})

test('a revision changes when the file does', async () => {
  const { mkdtempSync: make, writeFileSync: write, rmSync: remove } = await import('node:fs')
  const directory = make(join(tmpdir(), 'favorites-revision-'))
  try {
    const file = join(directory, 'bookmarks.yml')
    assert.equal(revisionOf(file), undefined, 'a file that is not there has no revision')
    write(file, 'version: 1\nbookmarks: []\n')
    const first = revisionOf(file)
    assert.match(first, /^\d+-\d+$/u)
    write(file, 'version: 1\nbookmarks: []\n\n')
    assert.notEqual(revisionOf(file), first)
  } finally {
    remove(directory, { recursive: true, force: true })
  }
})
