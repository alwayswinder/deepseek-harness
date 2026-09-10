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
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import z from '@deepseek-ai/schemastery'

const NS = 'deepseek-usage'
const CURRENCY_SYMBOL = { CNY: '¥', USD: '$' }

function localDate() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
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
 * Resolve the harness home with the same rules the harness uses
 * (`resolveDshHome`): `$DSH_HOME` when set and not blank, else `~/.dsh`, with
 * a leading `~` expanded and the result made absolute. Keeping these rules
 * identical is what makes the plugin's meter and settings writes land beside
 * the harness's own files on every machine.
 * @returns the absolute harness home path.
 */
function dshHome() {
  const fromEnv = process.env.DSH_HOME
  const selected = fromEnv !== undefined && fromEnv.trim().length > 0
    ? fromEnv
    : join(homedir(), '.dsh')
  const expanded = selected === '~'
    ? homedir()
    : selected.startsWith('~/') || selected.startsWith('~\\')
      ? join(homedir(), selected.slice(2))
      : selected
  return resolve(expanded)
}

/**
 * Fallback credential lookup for when the credentials service is not visible
 * on the context this plugin runs in (composition-dependent): read the managed
 * document's `refs:` section directly.
 * @param name - the credential reference name.
 * @returns the stored value, or `undefined` when absent.
 */
function readFileRef(name) {
  const file = join(dshHome(), '.credentials.yaml')
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
    // Provider peak-hours rule. Windows are local clock ranges in `timezone`
    // (providers publish them in their own timezone, e.g. Asia/Shanghai) and
    // multiply every rate; omit the block for a flat price.
    peak: z.object({
      timezone: z.string(),
      multiplier: z.number().default(2),
      windows: z.array(z.string()).default([]),
      weekdaysOnly: z.boolean().default(true),
    }),
    // Self-calibration against the account's own balance delta. The rates above
    // stay the list prices; an observed ratio moves a factor that every
    // displayed amount is multiplied by, so a price change reaches the figures
    // without editing this file. `enabled: false` pins the configured rates.
    calibration: z.object({
      enabled: z.boolean().default(true),
      /** Share of each observed ratio folded into the factor. */
      alpha: z.number().default(0.3),
      /** Smallest settled spend and smallest metered cost an observation may use, in the account currency. */
      minObserved: z.number().default(0.25),
      /** Accepted ratio band; observations outside it are ignored rather than trusted. */
      minFactor: z.number().default(0.2),
      maxFactor: z.number().default(5),
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
    if (event.type !== 'request/header') return
    // `EpochHeader` carries the route inside `config`; the header itself has no
    // top-level provider/model, so reading them there always yielded undefined.
    const config = event.data?.header?.config
    if (config === undefined) return
    if (typeof config.provider === 'string') this.provider = config.provider
    if (typeof config.model === 'string') this.model = config.model
  }

  route() {
    return { provider: this.provider, model: this.model }
  }
}

/**
 * Resolve the route that produced one settlement. Every `assistant/message`
 * embeds its own `message.source` (provider plus model), which is exact for the
 * request that produced it and survives a session whose log starts after a
 * fork-inherited prefix; the folded `request/header` is the fallback.
 * @param event - the settlement event.
 * @param fallback - the route folded from preceding `request/header` snapshots.
 * @returns the provider and model in force for this settlement.
 */
function routeOf(event, fallback) {
  const source = event.data?.message?.source
  if (source !== undefined && typeof source.provider === 'string' && typeof source.model === 'string') {
    return { provider: source.provider, model: source.model }
  }
  return fallback
}

function accountFor(accounts, provider) {
  const direct = Object.values(accounts).find((a) => a.provider === provider)
  if (direct !== undefined) return direct
  return Object.values(accounts).find((a) => a.provider === '')
}

/**
 * Resolve every live conversation that owns one session's spend. The harness
 * marks a subagent child with `origin: 'subagent'` plus its durable
 * `parentSession`; an ordinary fork carries the same parent field and stays a
 * conversation of its own, so the walk stops at the first session that is not a
 * subagent child. A nested subagent is itself an ancestor, so each level
 * aggregates its own descendants.
 * @param session - the session to resolve lineage for.
 * @param byId - live sessions by id.
 * @returns the owning sessions from the nearest parent outward.
 */
function subagentAncestors(session, byId) {
  const ancestors = []
  let current = session
  const seen = new Set([current.id])
  while (current.header?.origin === 'subagent' && current.header.parentSession !== undefined) {
    const parent = byId.get(current.header.parentSession)
    if (parent === undefined || seen.has(parent.id)) break
    seen.add(parent.id)
    ancestors.push(parent)
    current = parent
  }
  return ancestors
}

/** Weekdays named by `Intl` for the provider's peak-hours rule. */
const PEAK_WEEKDAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])

/**
 * Read one instant's weekday and minute-of-day in the account's peak timezone
 * (provider time windows are published in the provider's own timezone, not the
 * host's).
 * @param time - epoch milliseconds.
 * @param timeZone - IANA timezone name.
 * @returns the short weekday name and minutes since local midnight.
 */
function zonedClock(time, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(time))
  const read = (type) => parts.find(part => part.type === type)?.value ?? ''
  return {
    weekday: read('weekday'),
    minutes: Number(read('hour')) * 60 + Number(read('minute')),
  }
}

function windowBounds(text) {
  const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(String(text).trim())
  if (match === null) return undefined
  return {
    start: Number(match[1]) * 60 + Number(match[2]),
    end: Number(match[3]) * 60 + Number(match[4]),
  }
}

/**
 * Whether one instant falls in the account's peak windows. An account without
 * `peak.windows` has a single flat price, which is what every account had
 * before peak pricing existed.
 * @param account - the account configuration.
 * @param time - epoch milliseconds of the settlement.
 * @returns true when the peak multiplier applies.
 */
function isPeak(account, time) {
  const windows = account.peak?.windows
  if (!Array.isArray(windows) || windows.length === 0) return false
  let clock
  try {
    clock = zonedClock(time, account.peak.timezone)
  } catch {
    // An unusable timezone name cannot classify the window; the flat rate stays.
    return false
  }
  if (account.peak.weekdaysOnly === true && !PEAK_WEEKDAYS.has(clock.weekday)) return false
  return windows.some((text) => {
    const bounds = windowBounds(text)
    return bounds !== undefined && clock.minutes >= bounds.start && clock.minutes < bounds.end
  })
}

/**
 * Price one settlement with the account's rate for its model, multiplied by the
 * account's peak multiplier when its event time falls inside a peak window.
 * @param account - the account configuration.
 * @param model - the route model the settlement used.
 * @param time - epoch milliseconds of the settlement.
 * @returns input, cache-hit, and output prices in the account currency per 1M tokens.
 */
function rateFor(account, model, time) {
  const base = account.rates?.[model] ?? account.defaultRate
  if (base === undefined) return { input: 0, cacheHit: 0, output: 0 }
  if (!isPeak(account, time)) return { input: base.input, cacheHit: base.cacheHit, output: base.output }
  const multiplier = toFinite(account.peak.multiplier) || 1
  return { input: base.input * multiplier, cacheHit: base.cacheHit * multiplier, output: base.output * multiplier }
}

/**
 * The multiplier every displayed amount for one account carries. The ledger
 * keeps metered costs at list prices so the observed ratio stays a comparison
 * between two different quantities; this factor is applied when a snapshot or a
 * session total is built.
 * @param ledger - the loaded ledger.
 * @param account - the account configuration.
 * @returns the calibrated factor, 1 when no observation was accepted yet.
 */
function factorOf(ledger, account) {
  const factor = ledger.accounts[account.id]?.calibration?.factor
  return typeof factor === 'number' && Number.isFinite(factor) && factor > 0 ? factor : 1
}

/**
 * Fold one official-balance observation into an account's price factor: the
 * day's settled balance delta against the same day's locally metered list-price
 * cost, so a provider price change reaches the figures without an edit here.
 * Observations below `minObserved` on either side, and ratios outside the
 * accepted band, are skipped; accepted ratios move the factor by `alpha` (the
 * first one seeds it).
 * @param ledger - the loaded ledger, mutated in place.
 * @param account - the account configuration.
 * @param today - the local date the observation belongs to.
 * @param official - the day's balance delta in the account currency.
 * @returns true when the factor moved.
 */
function observeCalibration(ledger, account, today, official) {
  const settings = account.calibration
  if (settings === undefined || settings.enabled !== true) return false
  const state = ledger.accounts[account.id] ??= {}
  const metered = toFinite(state[today]?.cost)
  if (metered < settings.minObserved || official < settings.minObserved) return false
  const ratio = official / metered
  if (ratio < settings.minFactor || ratio > settings.maxFactor) return false
  const previous = state.calibration
  const alpha = Math.min(Math.max(toFinite(settings.alpha), 0), 1)
  const factor = previous === undefined || previous.observations === 0
    ? ratio
    : previous.factor + alpha * (ratio - previous.factor)
  state.calibration = {
    factor,
    ratio,
    metered,
    official,
    observations: (previous?.observations ?? 0) + 1,
    updatedAt: Date.now(),
  }
  return true
}

function meterPath() {
  return join(dshHome(), 'storages', 'deepseek-usage-meter.json')
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
 * Stable fingerprint of every account's price table. A ledger day is priced
 * incrementally as events arrive, so a changed table leaves the part of the day
 * that was metered earlier under the superseded prices until the date rolls.
 * @param accounts - the configured accounts.
 * @returns the serialized rate tables, compared as one opaque value.
 */
function rateTableFingerprint(accounts) {
  return JSON.stringify(Object.values(accounts).map(account => [
    account.id, account.defaultRate ?? null, account.rates ?? null, account.peak ?? null,
  ]))
}

/**
 * Re-price the current day's already-metered tokens after a price-table change,
 * so a mid-day rate adjustment does not leave today's figure as a sum of two
 * tables. Aggregated tokens carry no model or peak split, so the account's
 * flat default rate prices them; later settlements still price individually.
 * History is left alone: earlier days were charged under the table in force
 * then, and no later table should rewrite what they cost.
 * @param ledger - the loaded ledger, mutated in place.
 * @param accounts - the configured accounts.
 * @param path - the ledger file to persist to.
 * @returns the number of re-priced day entries.
 */
function repriceCurrentDay(ledger, accounts, path) {
  const fingerprint = rateTableFingerprint(accounts)
  if (ledger.rateTable === fingerprint) return 0
  const today = localDate()
  let repriced = 0
  for (const account of Object.values(accounts)) {
    const day = ledger.accounts[account.id]?.[today]
    if (day === undefined) continue
    const rate = account.defaultRate ?? { input: 0, cacheHit: 0, output: 0 }
    day.cost =
      ((toFinite(day.inputTokens) + toFinite(day.cacheWriteTokens)) / 1_000_000) * rate.input
      + (toFinite(day.cacheHitTokens) / 1_000_000) * rate.cacheHit
      + (toFinite(day.outputTokens) / 1_000_000) * rate.output
    repriced += 1
  }
  ledger.rateTable = fingerprint
  persistMeter(path, ledger)
  return repriced
}


/**
 * Direct settings-document writer. The settings service's file persistence can
 * wedge in this composition, leaving the browser mirror reading a stale
 * document; writing our own section keeps the served value current. Only a
 * changed snapshot (compared without `updatedAt`) touches the disk.
 */

function settingsDocPath() {
  return join(dshHome(), 'settings.yaml')
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
  for (const [key, value] of Object.entries({ updatedAt: Date.now(), timezone: snapshot.timezone, accounts: snapshot.accounts, sessions: snapshot.sessions })) {
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
  sessions: z.dict(z.object({})),
})

export function apply(ctx, config) {
  const accounts = config.accounts
  const path = meterPath()
  const ledger = loadMeter(path)
  const repriced = repriceCurrentDay(ledger, accounts, path)
  if (repriced > 0) {
    ctx.logger?.info?.('deepseek-usage: rate table changed; re-priced %d current-day entr%s', repriced, repriced === 1 ? 'y' : 'ies')
  }
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
    const route = routeOf(event, selectors.get(session.id)?.route() ?? { provider: '', model: '' })
    const account = accountFor(accounts, route.provider)
    if (account === undefined) return
    const input = toFinite(usage.inputTokens)
    const cacheHit = toFinite(usage.cacheReadTokens)
    const cacheWrite = toFinite(usage.cacheWriteTokens)
    const output = toFinite(usage.outputTokens)
    if (input === 0 && cacheHit === 0 && output === 0 && cacheWrite === 0) return
    const at = typeof event.time === 'number' ? event.time : Date.now()
    const rate = rateFor(account, route.model, at)
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

  /**
   * Per-conversation totals, folded from each live session's own log so a
   * resumed conversation keeps its number across process restarts and a fork
   * does not inherit its parent's spend.
   *
   * A subagent runs in its own session, so its spend would otherwise sit
   * beside the conversation that started it. Each subagent's own cost is added
   * to every conversation that owns it, which is how `本次对话` answers for what
   * the conversation actually cost; the subagent's own entry stays in the map
   * too, so opening it shows its share of the same work.
   * @returns session id to { cost, ownCost, subagentCost, subagents, inputTokens, outputTokens, cacheHitTokens, cacheWriteTokens, requests }.
   */
  function sessionTotals() {
    const sessions = ctx.get('sessions')
    if (sessions === undefined) return {}
    const live = sessions.list()
    const byId = new Map(live.map((session) => [session.id, session]))
    const totals = {}
    for (const session of live) {
      const selector = new RequestSelector()
      let cost = 0
      let inputTokens = 0
      let outputTokens = 0
      let cacheHitTokens = 0
      let cacheWriteTokens = 0
      let requests = 0
      for (const event of session.ownEvents()) {
        if (event.type === 'request/header') {
          selector.observe(event)
          continue
        }
        if (event.type !== 'assistant/message') continue
        const usage = event.data?.usage ?? usageFromStream(event.data?.stream)
        if (usage === undefined) continue
        const route = routeOf(event, selector.route())
        const account = accountFor(accounts, route.provider)
        if (account === undefined) continue
        const input = toFinite(usage.inputTokens)
        const cacheHit = toFinite(usage.cacheReadTokens)
        const cacheWrite = toFinite(usage.cacheWriteTokens)
        const output = toFinite(usage.outputTokens)
        if (input === 0 && cacheHit === 0 && cacheWrite === 0 && output === 0) continue
        const rate = rateFor(account, route.model, typeof event.time === 'number' ? event.time : Date.now())
        // A session outlives price changes, so its whole history carries the
        // account's current factor rather than a per-day one.
        const factor = factorOf(ledger, account)
        cost += factor * (((input + cacheWrite) / 1_000_000) * rate.input
          + (cacheHit / 1_000_000) * rate.cacheHit
          + (output / 1_000_000) * rate.output)
        inputTokens += input
        outputTokens += output
        cacheHitTokens += cacheHit
        cacheWriteTokens += cacheWrite
        requests += 1
      }
      if (requests > 0) {
        totals[session.id] = {
          cost, ownCost: cost, subagentCost: 0, subagents: 0,
          inputTokens, outputTokens, cacheHitTokens, cacheWriteTokens, requests,
        }
      }
    }
    for (const session of live) {
      const own = totals[session.id]
      if (own === undefined || session.header?.origin !== 'subagent') continue
      for (const ancestor of subagentAncestors(session, byId)) {
        const aggregate = totals[ancestor.id] ??= {
          cost: 0, ownCost: 0, subagentCost: 0, subagents: 0,
          inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, cacheWriteTokens: 0, requests: 0,
        }
        aggregate.cost += own.cost
        aggregate.subagentCost += own.cost
        aggregate.subagents += 1
        aggregate.inputTokens += own.inputTokens
        aggregate.outputTokens += own.outputTokens
        aggregate.cacheHitTokens += own.cacheHitTokens
        aggregate.cacheWriteTokens += own.cacheWriteTokens
        aggregate.requests += own.requests
      }
    }
    return totals
  }

  function snapshotFor() {
    const byAccount = {}
    const today = localDate()
    for (const account of Object.values(accounts)) {
      const bal = balances.get(account.id)
      const day = ledger.accounts[account.id]?.[today]
      const calibration = ledger.accounts[account.id]?.calibration
      const factor = factorOf(ledger, account)
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
        rateFactor: factor,
        rateObservations: calibration?.observations ?? 0,
        today: day === undefined ? null : {
          // Calibrated: the ledger's own cost stays at list prices so the
          // observed ratio keeps comparing the balance with the price table.
          cost: day.cost * factor,
          listCost: day.cost,
          inputTokens: day.inputTokens,
          outputTokens: day.outputTokens,
          cacheHitTokens: day.cacheHitTokens,
          cacheWriteTokens: day.cacheWriteTokens,
        },
      }
    }
    return {
      updatedAt: Date.now(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      accounts: byAccount,
      sessions: sessionTotals(),
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
      } else if (dayEntry.dayOpen.total > base.total
        && observeCalibration(ledger, account, today, dayEntry.dayOpen.total - base.total)) {
        persistMeter(path, ledger)
        ctx.logger?.info?.(
          'deepseek-usage: %s price factor %s from balance delta %s against metered %s',
          account.id,
          dayEntry.calibration.factor.toFixed(4),
          String(dayEntry.calibration.official),
          String(dayEntry.calibration.metered),
        )
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