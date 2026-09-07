/**
 * DeepSeek usage & balance meter — host half (plain ESM, no build step).
 *
 * Each configured account resolves a credential through the harness
 * credentials seam. When the account declares a balance base URL, the host
 * calls `{baseURL}/user/balance` periodically and caches the response. Daily
 * spend is metered locally: every `assistant/message` session event carries
 * provider token usage, which the host prices with the account's configured
 * rates and folds into a per-account, per-local-day ledger persisted under the
 * harness home. The computed snapshot is published (debounced) into the
 * `deepseek-usage` settings namespace; the browser card renders it through the
 * standard settings mirror, so no custom RPC or subprocess is involved.
 *
 * This file is the plugin's own source. It lives outside the harness package
 * tree and never affects upstream updates or builds.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import z from '@deepseek-ai/schemastery'

const NS = 'deepseek-usage'
const CURRENCY_SYMBOL = { CNY: '¥', USD: '$' }

function localDate() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function monthKey(date) {
  return date.slice(0, 7)
}

function currencyOf(currency) {
  return currency === undefined || currency === '' ? 'CNY' : currency
}

function currencySymbol(currency) {
  const c = currencyOf(currency)
  return CURRENCY_SYMBOL[c] ?? `${c} `
}

function toFinite(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}


/**
 * Fallback credential lookup for when the credentials service is not visible
 * on the context this plugin runs in (composition-dependent): read the managed
 * document's `refs:` section directly.
 * @param name - the credential reference name.
 * @returns the stored value, or `undefined` when absent.
 */
function readFileRef(name) {
  let home = process.env.DSH_HOME ?? ''
  if (home === '') {
    const base = process.env.USERPROFILE ?? process.env.HOME ?? ''
    home = base === '' ? '.' : `${base.replace(/\\/g, '/')}/.dsh`
  }
  const file = `${home.replace(/\/+$/, '')}/.credentials.yaml`
  try {
    let inRefs = false
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trimEnd()
      if (/^refs:\s*$/.test(trimmed)) { inRefs = true; continue }
      if (inRefs) {
        if (trimmed === '') continue
        if (!/^\s/.test(trimmed)) { inRefs = false; continue }
        const match = /^ {2,}([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(trimmed)
        if (match !== null && match[1] === name) {
          let value = match[2].trim()
          const quoted = value.length >= 2
            && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
          if (quoted) value = value.slice(1, -1)
          return value.length > 0 ? value : undefined
        }
      }
    }
  } catch {
    // absent or unreadable document: fall through to the environment
  }
  return undefined
}

/**
 * Resolve one account's key: the credentials service when this composition
 * provides it, then the managed document, then the process environment.
 * @param ctx - the plugin context.
 * @param account - the account configuration.
 * @returns the resolved key value, or `undefined` when nothing holds it.
 */
async function resolveKey(ctx, account) {
  try {
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(account.credential)
      if (hit !== undefined && hit.value !== undefined && hit.value.length > 0) return hit.value
    }
  } catch {
    // service present but failing: fall through to the local fallbacks
  }
  const fromFile = readFileRef(account.credential)
  if (fromFile !== undefined) return fromFile
  const fromEnv = process.env[account.credential]
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : undefined
}

let lastYamlDedupe = ''

export const name = 'deepseek-usage'

export const Config = z.object({
  // schemastery: fields are optional by default (no .optional() in this
  // version); use .default() where an absent value needs a concrete fallback.
  accounts: z.dict(z.object({
    id: z.string(),
    label: z.string(),
    provider: z.string(),
    balanceBaseUrl: z.string(),
    credential: z.string(),
    currency: z.string().default('CNY'),
    rates: z.dict(z.object({
      input: z.number(),
      cacheHit: z.number(),
      output: z.number(),
    })),
    defaultRate: z.object({
      input: z.number(),
      cacheHit: z.number(),
      output: z.number(),
    }),
  })).default({}),
  refreshSeconds: z.number().default(30),
})

/**
 * Track a session's current provider/model by folding its signed
 * `request/header` snapshots, so each assistant/message bill resolves to the
 * request that produced it.
 */

/**
 * Pull the provider-reported usage out of one `assistant/message` event: the
 * direct `data.usage` when the settlement carried it, else the last `usage`
 * chunk inside `data.stream` (surface shape per the harness session log).
 * @param stream - the event's `data.stream`, when present.
 * @returns the usage object, or `undefined` when the event reports none.
 */
function usageFromStream(stream) {
  if (!Array.isArray(stream)) return undefined
  for (const member of stream) {
    const chunk = member?.chunk
    if (chunk?.type === 'usage') return chunk.usage
  }
  return undefined
}

class RequestSelector {
  provider = ''
  model = ''

  observe(event) {
    if (event.type === 'request/header') {
      this.provider = event.data.header.provider
      this.model = event.data.header.model
    }
  }

  route() {
    return { provider: this.provider, model: this.model }
  }
}

function accountFor(accounts, provider) {
  const direct = Object.values(accounts).find((a) => a.provider === provider)
  if (direct !== undefined) return direct
  return Object.values(accounts).find((a) => a.provider === '')
}

function rateFor(account, model) {
  const byModel = account.rates?.[model]
  if (byModel !== undefined) return byModel
  if (account.defaultRate !== undefined) return account.defaultRate
  return { input: 0, cacheHit: 0, output: 0 }
}

function meterPath() {
  let home = process.env.DSH_HOME ?? ''
  if (home === '') {
    const base = process.env.USERPROFILE ?? process.env.HOME ?? ''
    home = base === '' ? '.' : `${base.replace(/\\/g, '/')}/.dsh`
  }
  return `${home.replace(/\/+$/, '')}/storages/deepseek-usage-meter.json`
}

function loadMeter(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    if (parsed && typeof parsed === 'object' && typeof parsed.accounts === 'object') return parsed
  } catch {
    // absent or corrupt: start empty
  }
  return { accounts: {} }
}


/**
 * Direct settings-document writer. The settings service's file persistence can
 * wedge in this composition, leaving the browser mirror reading a stale
 * document; writing our own section keeps the served value current. Only a
 * changed snapshot (compared without `updatedAt`) touches the disk.
 */

function settingsDocPath() {
  let home = process.env.DSH_HOME ?? ''
  if (home === '') {
    const base = process.env.USERPROFILE ?? process.env.HOME ?? ''
    home = base === '' ? '.' : `${base.replace(/\\/g, '/')}/.dsh`
  }
  return `${home.replace(/\/+$/, '')}/settings.yaml`
}

function yamlScalar(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return JSON.stringify(String(value))
}

function yamlBlockLines(value, indent) {
  const lines = []
  for (const [key, child] of Object.entries(value)) {
    const pad = ' '.repeat(indent)
    if (child !== null && typeof child === 'object') {
      lines.push(`${pad}${key}:`)
      lines.push(...yamlBlockLines(child, indent + 2))
    } else {
      lines.push(`${pad}${key}: ${yamlScalar(child)}`)
    }
  }
  return lines
}

/** Replace one top-level section (its own indented block) in a yaml text. */
function replaceTopSection(text, key, blockLines) {
  const lines = text.split(/\r?\n/)
  let start = -1
  let end = lines.length
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\S/.test(lines[i])) continue
    if (start >= 0) { end = i; break }
    if (lines[i].startsWith(`${key}:`)) start = i
  }
  const body = start >= 0
    ? [...lines.slice(0, start), ...blockLines, ...lines.slice(end)]
    : [...lines, '', ...blockLines]
  return body.join('\n')
}

function writeSnapshotYaml(snapshot, dedupeKey) {
  const block = ['deepseek-usage:']
  for (const [key, value] of Object.entries({ updatedAt: Date.now(), timezone: snapshot.timezone, accounts: snapshot.accounts })) {
    if (value !== null && typeof value === 'object') {
      block.push(`  ${key}:`)
      block.push(...yamlBlockLines(value, 4))
    } else {
      block.push(`  ${key}: ${yamlScalar(value)}`)
    }
  }
  const json = JSON.stringify(dedupeKey)
  try {
    const path = settingsDocPath()
    const text = readFileSync(path, 'utf8')
    if (json === lastYamlDedupe && text.includes('deepseek-usage:')) return
    const next = replaceTopSection(text, 'deepseek-usage', block)
    writeFileSync(path, next)
    lastYamlDedupe = json
  } catch (error) {
    // Non-fatal: the settings-scope publish is the primary channel.
    console.warn('deepseek-usage: settings doc write failed', error?.message ?? String(error))
  }
}

function persistMeter(path, meter) {
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(meter))
  } catch (error) {
    // Non-fatal: live metering continues for this process.
    console.warn('deepseek-usage: meter persist failed', error?.message ?? String(error))
  }
}

const metricsSchema = z.object({
  updatedAt: z.number(),
  timezone: z.string(),
  accounts: z.dict(z.object({})),
})

export function apply(ctx, config) {
  const accounts = config.accounts
  const path = meterPath()
  const ledger = loadMeter(path)
  const selectors = new Map()
  const balances = new Map()
  let scope

  function foldMessage(session, event) {
    if (event.type === 'request/header') {
      let selector = selectors.get(session.id)
      if (selector === undefined) {
        selector = new RequestSelector()
        selectors.set(session.id, selector)
      }
      selector.observe(event)
      return
    }
    if (event.type !== 'assistant/message') return
    const usage = event.data?.usage ?? usageFromStream(event.data?.stream)
    if (usage === undefined) return
    const route = selectors.get(session.id)?.route() ?? { provider: '', model: '' }
    const account = accountFor(accounts, route.provider)
    if (account === undefined) return
    const input = toFinite(usage.inputTokens)
    const cacheHit = toFinite(usage.cacheReadTokens)
    const cacheWrite = toFinite(usage.cacheWriteTokens)
    const output = toFinite(usage.outputTokens)
    if (input === 0 && cacheHit === 0 && output === 0 && cacheWrite === 0) return
    const rate = rateFor(account, route.model)
    // Token counts are disjoint: billed input = uncached input + cache write;
    // cache reads bill at the cache-hit rate.
    const cost =
      ((input + cacheWrite) / 1_000_000) * rate.input
      + (cacheHit / 1_000_000) * rate.cacheHit
      + (output / 1_000_000) * rate.output
    const today = localDate()
    const byDay = ledger.accounts[account.id] ??= {}
    const day = byDay[today] ??= {
      date: today, inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, cacheWriteTokens: 0, cost: 0,
    }
    day.inputTokens += input
    day.cacheHitTokens += cacheHit
    day.cacheWriteTokens += cacheWrite
    day.outputTokens += output
    day.cost += cost
    persistMeter(path, ledger)
    schedulePublish()
  }

  ctx.on('session/event', (session, event) => {
    try {
      foldMessage(session, event)
    } catch (error) {
      ctx.logger?.warn?.('deepseek-usage: session event ignored (%s)', error?.message ?? String(error))
    }
  })
  ctx.on('session/created', (session) => {
    if (!selectors.has(session.id)) selectors.set(session.id, new RequestSelector())
  })
  ctx.on('session/disposed', (session) => {
    selectors.delete(session.id)
  })

  function snapshotFor() {
    const byAccount = {}
    const today = localDate()
    for (const account of Object.values(accounts)) {
      const bal = balances.get(account.id)
      const day = ledger.accounts[account.id]?.[today]
      let monthCost = 0
      let monthTokens = 0
      for (const l of Object.values(ledger.accounts[account.id] ?? {})) {
        if (typeof l.date === 'string' && monthKey(l.date) === monthKey(today)) {
          monthCost += l.cost
          monthTokens += l.inputTokens + l.outputTokens + l.cacheHitTokens
        }
      }
      const dayOpen = ledger.accounts[account.id]?.dayOpen?.total ?? null
      const officialToday = (dayOpen !== null && bal?.total !== null && dayOpen > bal?.total)
        ? dayOpen - bal.total
        : null
      byAccount[account.id] = {
        id: account.id,
        label: account.label,
        currency: currencyOf(bal?.currency ?? account.currency),
        symbol: currencySymbol(bal?.currency ?? account.currency),
        balanceAvailable: bal?.available ?? false,
        balanceTotal: bal?.total ?? null,
        balanceGranted: bal?.granted ?? null,
        balanceToppedUp: bal?.toppedUp ?? null,
        balanceDayOpen: dayOpen,
        officialTodaySpend: officialToday,
        balanceError: bal?.error ?? null,
        balanceSupported: account.balanceBaseUrl !== '',
        today: day === undefined ? null : {
          cost: day.cost,
          inputTokens: day.inputTokens,
          outputTokens: day.outputTokens,
          cacheHitTokens: day.cacheHitTokens,
          cacheWriteTokens: day.cacheWriteTokens,
        },
        monthCost,
        monthTokens,
      }
    }
    return {
      updatedAt: Date.now(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      accounts: byAccount,
    }
  }

  // Debounced (and deduped) publish of the computed snapshot: an unchanged
  // snapshot is skipped so idle sessions never write the settings document, and
  // the client mirror only refreshes when the card's numbers move.
  let publishTimer
  let publishing = false
  let lastPublished = ''
  function schedulePublish() {
    if (publishTimer !== undefined) return
    publishTimer = setTimeout(() => {
      publishTimer = undefined
      void publish()
    }, 1500)
  }
  async function publish() {
    if (scope === undefined || publishing) return
    const snapshot = snapshotFor()
    const { updatedAt: _, ...comparable } = snapshot
    const serialized = JSON.stringify(comparable)
    if (serialized === lastPublished) return
    publishing = true
    try {
      writeSnapshotYaml(snapshot, serialized)
      lastPublished = serialized
    } catch (error) {
      ctx.logger?.warn?.('deepseek-usage: publish failed (%s)', error?.message ?? String(error))
    } finally {
      publishing = false
    }
  }

  async function refreshBalance(account, force) {
    const cached = balances.get(account.id)
    const ttl = Math.max(1, config.refreshSeconds) * 1000
    if (!force && cached !== undefined && cached.at + ttl > Date.now()) return
    const base = {
      at: Date.now(), refreshedAt: Date.now(), total: null, granted: null, toppedUp: null,
      available: false, currency: currencyOf(account.currency), error: null,
    }
    if (account.balanceBaseUrl === '') {
      balances.set(account.id, base)
      return
    }
    const key = await resolveKey(ctx, account)
    if (key === undefined) {
      base.error = `no credential "${account.credential}" (store it on the Models page or in ~/.dsh/.credentials.yaml)`
      balances.set(account.id, base)
      return
    }
    try {
      const url = `${account.balanceBaseUrl.replace(/\/+$/, '')}/user/balance`
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        base.error = `balance http ${response.status}${text ? ': ' + text.slice(0, 120) : ''}`
      } else {
        const body = await response.json()
        const infos = Array.isArray(body.balance_infos) ? body.balance_infos : []
        const wanted = currencyOf(account.currency)
        const picked = infos.find((i) => i && i.currency === wanted) ?? infos[0]
        if (picked !== undefined) {
          base.total = toFinite(picked.total_balance)
          base.granted = toFinite(picked.granted_balance)
          base.toppedUp = toFinite(picked.topped_up_balance)
          base.currency = typeof picked.currency === 'string' ? picked.currency : base.currency
        }
        base.available = body.is_available !== false
      }
    } catch (error) {
      base.error = error?.message ?? String(error)
    }
    if (base.error === null && base.total !== null) {
      const dayEntry = (ledger.accounts[account.id] ??= {})
      const today = localDate()
      if (dayEntry.dayOpen === undefined || dayEntry.dayOpen.date !== today) {
        dayEntry.dayOpen = { date: today, total: base.total }
        persistMeter(path, ledger)
      }
    }
    balances.set(account.id, base)
  }

  async function refreshAll(force) {
    await Promise.all(Object.values(accounts).map((account) => refreshBalance(account, force)))
    await publish()
  }

  // Register the host-owned metrics namespace once settings is available.
  ctx.inject(['settings'], (settingsCtx) => {
    const settings = settingsCtx.get('settings')
    scope = settings.register(NS, metricsSchema)
    void refreshAll(false)
  })

  // Periodic balance refresh while mounted.
  const timer = setInterval(() => { void refreshAll(true) }, Math.max(1, config.refreshSeconds) * 1000)
  ctx.effect(() => () => {
    clearInterval(timer)
    if (publishTimer !== undefined) clearTimeout(publishTimer)
    selectors.clear()
    balances.clear()
    scope = undefined
  })
}