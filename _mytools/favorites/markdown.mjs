// Markdown for the notes on a bookmark.
//
// The renderer is deliberately small and self-contained: the display page is a
// single file opened from disk, so nothing here may reach the network or depend on
// a package, and the editor's live preview asks the Host to render through this
// same module rather than keeping a second implementation in the browser.
//
// Every character of a note is escaped before any markup is added, so a note that
// contains `<script>` shows that text instead of running it. Links are the one
// place a note reaches outside: they go through the library's address check, which
// leaves http/https only, and anything else stays plain text.
//
// The subset is headings, bold, italic, strikethrough, inline code, fenced code,
// lists, blockquotes, horizontal rules, and links. One deliberate deviation from
// strict Markdown: a single line break inside a paragraph is a line break, because
// notes are written in a textarea and a new line there means a new line.

import { decodeEntities, openableUrl } from './library.mjs'

/** Placeholder marking a code span while the rest of the line is processed. */
const TOKEN = '\u0000'

/**
 * Escape text for HTML.
 * @param text - raw text.
 * @returns the text with `&`, `<`, `>`, `"`, and `'` as character references.
 */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

/**
 * Render the inline markup of one block of text. The text is escaped here rather
 * than by the caller: a renderer that trusts its caller to escape is one forgotten
 * call away from letting a note run script, and every caller wants it escaped.
 * @param text - raw text, without block structure.
 * @returns the rendered HTML.
 */
export function renderInline(text) {
  const codes = []
  let out = escapeHtml(String(text).replace(/\u0000/gu, '')).replace(/`([^`\n]+)`/gu, (_match, code) => {
    codes.push(code)
    return `${TOKEN}${codes.length - 1}${TOKEN}`
  })
  // One level of parentheses inside the address, so a link to a page whose URL
  // carries them is still read whole and a refused address leaves nothing behind.
  out = out.replace(/\[([^\]\n]*)\]\(([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)\)/gu, (match, label, href) => {
    const url = openableUrl(decodeEntities(href))
    if (url === undefined) return label
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
  })
  out = out.replace(/\*\*([^*\n]+)\*\*/gu, '<strong>$1</strong>')
  out = out.replace(/__([^_\n]+)__/gu, '<strong>$1</strong>')
  out = out.replace(/~~([^~\n]+)~~/gu, '<del>$1</del>')
  out = out.replace(/\*([^*\n]+)\*/gu, '<em>$1</em>')
  out = out.replace(/(^|[^\w_])_([^_\n]+)_/gu, '$1<em>$2</em>')
  const restore = new RegExp(`${TOKEN}(\\d+)${TOKEN}`, 'gu')
  return out.replace(restore, (_match, index) => `<code>${codes[Number(index)]}</code>`)
}

/**
 * Whether a line starts a block of its own, which is what ends a paragraph.
 * @param line - one source line.
 * @returns the answer.
 */
function startsBlock(line) {
  return /^\s*(?:```|~~~|#{1,6}\s|>|[-*+]\s|\d+[.)]\s|-{3,}\s*$|\*{3,}\s*$|_{3,}\s*$)/u.test(line)
}

/**
 * Render a list of source lines as blocks.
 * @param lines - source lines with no trailing newline.
 * @returns the rendered HTML.
 */
function renderBlocks(lines) {
  const out = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (line.trim() === '') {
      index++
      continue
    }
    const fence = /^\s*(```|~~~)/u.exec(line)
    if (fence !== null) {
      const close = new RegExp(`^\\s*${fence[1]}\\s*$`, 'u')
      const body = []
      index++
      while (index < lines.length && !close.test(lines[index])) {
        body.push(lines[index])
        index++
      }
      if (index >= lines.length) {
        // A fence nobody closed: the blank line the file ends with is not content.
        while (body.length > 0 && body[body.length - 1].trim() === '') body.pop()
      } else {
        index++
      }
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`)
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/u.exec(line)
    if (heading !== null) {
      const level = heading[1].length
      out.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`)
      index++
      continue
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(line)) {
      out.push('<hr>')
      index++
      continue
    }
    if (/^\s*>/u.test(line)) {
      const quoted = []
      while (index < lines.length && /^\s*>/u.test(lines[index])) {
        quoted.push(lines[index].replace(/^\s*>\s?/u, ''))
        index++
      }
      out.push(`<blockquote>${renderBlocks(quoted)}</blockquote>`)
      continue
    }
    const first = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/u.exec(line)
    if (first !== null) {
      const indent = first[1].length
      const ordered = /\d/u.test(first[2])
      const items = []
      while (index < lines.length) {
        const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/u.exec(lines[index])
        if (item === null || item[1].length !== indent || /\d/u.test(item[2]) !== ordered) break
        const body = [item[3]]
        index++
        while (index < lines.length && lines[index].trim() !== '' && !/^\s*(?:[-*+]|\d+[.)])\s/u.test(lines[index])) {
          body.push(lines[index].trim())
          index++
        }
        const rendered = renderInline(body.join('\n')).replace(/\n/gu, '<br>')
        items.push(`<li>${rendered}</li>`)
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`)
      continue
    }
    const paragraph = []
    while (index < lines.length && lines[index].trim() !== '' && !startsBlock(lines[index])) {
      paragraph.push(lines[index].trim())
      index++
    }
    out.push(`<p>${renderInline(paragraph.join('\n')).replace(/\n/gu, '<br>')}</p>`)
  }
  return out.join('\n')
}

/**
 * Render one note.
 * @param source - the note's Markdown.
 * @returns the rendered HTML, empty when there is nothing to show.
 */
export function renderMarkdown(source) {
  const text = String(source ?? '').replace(/\u0000/gu, '').replace(/\r\n?/gu, '\n')
  if (text.trim() === '') return ''
  return renderBlocks(text.split('\n'))
}
