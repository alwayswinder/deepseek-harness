// What the generated page must be: self-contained, escaped, and complete.

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { buildPage, iconDataUri, initialOf, searchText, tintOf } from '../build-page.mjs'

/** A one-pixel PNG, enough to prove the bytes were read and inlined. */
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

/**
 * A library whose icons live in a directory this test owns.
 * @param directory - the temporary root.
 * @returns the library document.
 */
function libraryIn(directory) {
  mkdirSync(join(directory, 'assets'), { recursive: true })
  writeFileSync(join(directory, 'assets', 'one.png'), PNG)
  return {
    version: 1,
    bookmarks: [
      {
        id: 'one', url: 'https://one.example/a?x=1&y=2', title: '一 & <二>', group: '收藏夹栏',
        notes: '# 备注\n**粗体**', tags: ['常用', '"引号"'], pinned: true, icon: 'assets/one.png',
      },
      { id: 'two', url: 'https://two.example/', title: '', group: '收藏夹栏/Work', addedAt: '2024-01-01T00:00:00.000Z' },
      { id: 'three', url: 'https://three.example/', title: '三', group: '收藏夹栏/Work' },
    ],
  }
}

test('a page is one file with nothing fetched from anywhere', () => {
  const directory = mkdtempSync(join(tmpdir(), 'favorites-page-'))
  try {
    const html = buildPage(libraryIn(directory), { root: directory })
    assert.match(html, /^<!DOCTYPE html>/u)
    assert.doesNotMatch(html, /<link\b/iu)
    assert.doesNotMatch(html, /<script[^>]*\bsrc=/iu)
    assert.doesNotMatch(html, /<img[^>]*\bsrc="https?:/iu)
    assert.match(html, /src="data:image\/png;base64,/u)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('every bookmark is a card, grouped in the order the library holds', () => {
  const directory = mkdtempSync(join(tmpdir(), 'favorites-page-'))
  try {
    const html = buildPage(libraryIn(directory), { root: directory })
    // Four cards for three bookmarks: the pinned one is a shortcut under 置顶 and
    // still listed with its own group, which is what pinning means here.
    assert.equal([...html.matchAll(/class="card"/gu)].length, 4)
    const groups = [...html.matchAll(/<section class="group" data-group="([^"]*)"/gu)].map(match => match[1])
    assert.deepEqual(groups, ['置顶', '收藏夹栏', '收藏夹栏/Work'])
    // Two groups, not three: 置顶 is a shortcut section rather than a group of its own.
    assert.match(html, /共 3 个网站 · 2 个分组/u)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a title, an address, and a note are escaped, never markup', () => {
  const directory = mkdtempSync(join(tmpdir(), 'favorites-page-'))
  try {
    const html = buildPage(libraryIn(directory), { root: directory })
    assert.match(html, /一 &amp; &lt;二&gt;/u)
    assert.match(html, /href="https:\/\/one\.example\/a\?x=1&amp;y=2"/u)
    assert.match(html, /<div class="notes"><h1>备注<\/h1>/u)
    assert.match(html, /<strong>粗体<\/strong>/u)
    // The Markdown a person typed survives only in the search index, which is what
    // lets a note be found by the words in it; every card shows it rendered.
    const notes = [...html.matchAll(/<div class="notes">([\s\S]*?)<\/div>/gu)].map(match => match[1])
    assert.ok(notes.length > 0, 'a note reaches the page as a rendered block')
    for (const rendered of notes) assert.doesNotMatch(rendered, /# 备注/u)
    assert.match(html, /data-search="[^"]*# 备注/u)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('an entry with no icon gets a letter tile, and the tile keeps its colour', () => {
  const directory = mkdtempSync(join(tmpdir(), 'favorites-page-'))
  try {
    const library = libraryIn(directory)
    const html = buildPage(library, { root: directory })
    assert.equal([...html.matchAll(/class="tile t\d"/gu)].length, 2)
    assert.equal(tintOf(library.bookmarks[1]), tintOf({ ...library.bookmarks[1] }))
    assert.equal(initialOf(library.bookmarks[1]), 't')
    assert.equal(initialOf(library.bookmarks[2]), '三')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a missing icon file is a letter tile rather than a broken image', () => {
  const directory = mkdtempSync(join(tmpdir(), 'favorites-page-'))
  try {
    const library = libraryIn(directory)
    library.bookmarks[0].icon = 'assets/gone.png'
    assert.equal(iconDataUri(library.bookmarks[0], directory), undefined)
    assert.doesNotMatch(buildPage(library, { root: directory }), /assets\/gone\.png/u)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('what a card is searched by is everything a person would type', () => {
  const entry = { id: 'i', url: 'https://a.example/x', title: '标题', group: '组', notes: '备注', tags: ['标签'] }
  const text = searchText(entry)
  for (const part of ['标题', 'a.example', '组', '备注', '标签']) assert.ok(text.includes(part), part)
  assert.equal(text, text.toLowerCase())
})
