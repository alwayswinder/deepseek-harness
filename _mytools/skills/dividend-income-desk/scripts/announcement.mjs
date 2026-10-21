#!/usr/bin/env node
/**
 * 读个股公告：先列标题，再按需取正文。
 *
 * 用法：
 *   node announcement.mjs --code 000895                # 最近 6 条标题
 *   node announcement.mjs --code 000895 --body         # 最近 1 条正文
 *   node announcement.mjs --code 000895 --index 3 --body
 *   node announcement.mjs --art AN202610091830271801   # 按文章编号取正文
 *
 * 正文来自东方财富公告接口，HTML 会被剥成纯文本；超过 --max 字符时截断并提示。
 */

import { decodeEntities } from './shared/text.mjs'

const EM_ANN = 'https://np-anotice-stock.eastmoney.com/api/security/ann'
const EM_BODY = 'https://np-cnotice-stock.eastmoney.com/api/content/ann'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const args = parseArgs(process.argv.slice(2))
if (args.code === undefined && args.art === undefined) {
  console.error('需要 --code 或 --art，例如：node announcement.mjs --code 000895 --body')
  process.exit(2)
}

if (args.art !== undefined) {
  const body = await fetchBody(args.art)
  printBody(body, args.art)
} else {
  const list = await fetchList(args.code, args.limit)
  if (list.length === 0) {
    console.log(`${args.code}：最近没有公告`)
    process.exit(0)
  }
  if (args.body) {
    if (args.index > list.length) {
      console.error(`--index ${args.index} 超出范围：最近只有 ${list.length} 条公告`)
      process.exit(2)
    }
    const target = list[args.index - 1]
    const body = await fetchBody(target.artCode)
    console.log(`# ${target.title}（${target.date}）`)
    console.log(`## art_code：${target.artCode}`)
    console.log('')
    printBody(body, target.artCode)
  } else {
    for (const [index, item] of list.entries()) {
      console.log(`${String(index + 1).padStart(2)}. ${item.date}  ${item.title}  [${item.artCode}]`)
    }
  }
}

function parseArgs(argv) {
  const parsed = { code: undefined, art: undefined, limit: 6, index: 1, body: false, max: 4000 }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--code') parsed.code = argv[++index]
    else if (arg === '--art') parsed.art = argv[++index]
    else if (arg === '--limit') parsed.limit = Number(argv[++index])
    else if (arg === '--index') parsed.index = Number(argv[++index])
    else if (arg === '--max') parsed.max = Number(argv[++index])
    else if (arg === '--body') parsed.body = true
    else if (arg === '--help' || arg === '-h') {
      console.log('用法: node announcement.mjs --code 000895 [--limit 6] [--index 1] [--body] [--max 4000]')
      console.log('      node announcement.mjs --art <art_code>')
      process.exit(0)
    } else {
      console.error(`未知参数: ${arg}`)
      process.exit(2)
    }
  }
  if (parsed.code !== undefined && !/^\d{6}$/.test(parsed.code)) {
    console.error('--code 需要 6 位数字')
    process.exit(2)
  }
  if (!Number.isInteger(parsed.limit) || parsed.limit < 1 || parsed.limit > 30) {
    console.error('--limit 需要 1 到 30 之间的整数')
    process.exit(2)
  }
  if (!Number.isInteger(parsed.index) || parsed.index < 1) {
    console.error('--index 需要不小于 1 的整数')
    process.exit(2)
  }
  return parsed
}

async function fetchList(code, limit) {
  const url = `${EM_ANN}?sr=-1&page_size=${String(limit)}&page_index=1&ann_type=A&client_source=web&stock_list=${code}`
  const body = await getJson(url)
  return (body?.data?.list ?? []).map(item => ({
    title: String(item.title ?? item.title_ch ?? '').trim(),
    date: String(item.notice_date ?? item.display_time ?? '').slice(0, 10),
    artCode: String(item.art_code ?? ''),
  })).filter(item => item.title.length > 0 && item.artCode.length > 0)
}

async function fetchBody(artCode) {
  const body = await getJson(`${EM_BODY}?art_code=${encodeURIComponent(artCode)}&client_source=web&page_index=1`)
  const content = body?.data?.notice_content
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error(`公告 ${artCode} 没有返回正文，可能需要在浏览器打开：https://data.eastmoney.com/notices/detail/x/${artCode}.html`)
  }
  return decodeEntities(content.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function printBody(text, artCode) {
  if (text.length <= args.max) {
    console.log(text)
    return
  }
  console.log(text.slice(0, args.max))
  console.log(`\n…（已截断，正文共 ${text.length} 字；用 --max ${text.length} 取全文，或打开 https://data.eastmoney.com/notices/detail/x/${artCode}.html）`)
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://data.eastmoney.com/' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return await response.json()
}
