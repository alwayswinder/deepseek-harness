// What a note may become: the markup it renders, and the text it must not.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { escapeHtml, renderInline, renderMarkdown } from '../markdown.mjs'

test('escapeHtml escapes every character that could open markup', () => {
  assert.equal(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;')
})

test('a note that contains markup renders as that text', () => {
  assert.equal(renderMarkdown('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
  assert.equal(renderMarkdown('<img src=x onerror=alert(1)>'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>')
})

test('the inline subset renders', () => {
  assert.equal(renderInline('**粗**'), '<strong>粗</strong>')
  assert.equal(renderInline('*斜*'), '<em>斜</em>')
  assert.equal(renderInline('~~删~~'), '<del>删</del>')
  assert.equal(renderInline('`a < b`'), '<code>a &lt; b</code>')
  assert.equal(renderInline('a_b_c'), 'a_b_c')
})

test('only http and https links become links', () => {
  assert.equal(
    renderInline('[x](https://a.example/?a=1&b=2)'),
    '<a href="https://a.example/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">x</a>',
  )
  assert.equal(renderInline('[x](javascript:alert(1))'), 'x')
  assert.equal(renderInline('[x](file:///C:/x)'), 'x')
})

test('block structure renders', () => {
  assert.equal(renderMarkdown('# 标题'), '<h1>标题</h1>')
  assert.equal(renderMarkdown('## 小标题'), '<h2>小标题</h2>')
  assert.equal(renderMarkdown('- 一\n- 二'), '<ul><li>一</li><li>二</li></ul>')
  assert.equal(renderMarkdown('1. 一\n2. 二'), '<ol><li>一</li><li>二</li></ol>')
  assert.equal(renderMarkdown('> 引用'), '<blockquote><p>引用</p></blockquote>')
  assert.equal(renderMarkdown('---'), '<hr>')
  assert.equal(renderMarkdown('```\na < b\n```'), '<pre><code>a &lt; b</code></pre>')
})

test('a line break in a note is a line break', () => {
  assert.equal(renderMarkdown('第一行\n第二行'), '<p>第一行<br>第二行</p>')
})

test('two blocks are separated and an empty note renders nothing', () => {
  assert.equal(renderMarkdown('一段\n\n另一段'), '<p>一段</p>\n<p>另一段</p>')
  assert.equal(renderMarkdown(''), '')
  assert.equal(renderMarkdown('   \n\n'), '')
  assert.equal(renderMarkdown(undefined), '')
})

test('a code fence without a closing line still renders its body', () => {
  assert.equal(renderMarkdown('```js\nconst a = 1\n'), '<pre><code>const a = 1</code></pre>')
})
