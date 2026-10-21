#!/usr/bin/env node
/**
 * 写入或清除持仓插件的总资产设置。
 *
 * 插件页（持仓管理 → 总资产）与 `/api/stock-pnl/positions` 读的是同一个文件
 * `$DSH_HOME/ths-holdings.assets.json`，所以这里写完立即生效，不需要重启 DSH。
 * 可用资金由插件按「总资产 − 持仓市值」算，本脚本只负责那一个数字。
 *
 * 用法：
 *   node set-assets.mjs --total 1000000
 *   node set-assets.mjs --clear
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const ASSETS_FILE = 'ths-holdings.assets.json'
const MAX_TOTAL = 1_000_000_000_000

const args = parseArgs(process.argv.slice(2))
const home = resolveDshHome()
const assetsPath = join(home, ASSETS_FILE)

if (args.clear) {
  await rm(assetsPath, { force: true })
  console.log(`已清除总资产设置：${assetsPath}`)
  process.exit(0)
}

const previous = await readTotalAssets(assetsPath)
const value = args.total ?? previous
if (value === null || !Number.isFinite(value) || value <= 0 || value > MAX_TOTAL) {
  console.error('总资产需要是大于 0 的数字，例如：node set-assets.mjs --total 1000000')
  process.exit(2)
}

const rounded = Math.round(value * 100) / 100
await mkdir(dirname(assetsPath), { recursive: true })
const temporary = `${assetsPath}.${String(process.pid)}.tmp`
await writeFile(temporary, `${JSON.stringify({ totalAssets: rounded, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
await rename(temporary, assetsPath)

console.log(`总资产已设为 ¥${rounded.toLocaleString('zh-CN')}`)
console.log(`写入：${assetsPath}`)
console.log('可用资金 = 总资产 − 持仓市值，运行 dividend-dossier.mjs 查看。')

function parseArgs(argv) {
  const parsed = { total: null, clear: false }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--total') parsed.total = Number(argv[++index])
    else if (arg === '--clear') parsed.clear = true
    else if (arg === '--help' || arg === '-h') {
      console.log('用法: node set-assets.mjs --total <金额> | --clear')
      process.exit(0)
    } else {
      console.error(`未知参数: ${arg}`)
      process.exit(2)
    }
  }
  return parsed
}

function resolveDshHome() {
  const raw = (process.env.DSH_HOME ?? '').trim()
  if (raw.length === 0) return join(homedir(), '.dsh')
  const expanded = raw.startsWith('~') ? join(homedir(), raw.slice(1)) : raw
  return resolve(expanded)
}

async function readTotalAssets(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    const value = Number(parsed.totalAssets)
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}
