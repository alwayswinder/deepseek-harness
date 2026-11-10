/**
 * DeepSeek usage & balance meter — browser half.
 *
 * Hand-built lazy-CJS factory artifact: the module system executes this file,
 * which registers the bundle factory through window.__ModuleLoader__.load. The
 * factory requires only platform-table modules (react, @deepseek-ai/dsh-client-store)
 * and reads live data from the `deepseek-usage` configuration form through the
 * standard settings mirror — the Host publishes the snapshot, no RPC needed.
 *
 * The settings card and composer account summary render whenever the Host
 * serves the `deepseek-usage` namespace and stay hidden otherwise.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-deepseek-usage',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const { createSnapshotStore } = require('@deepseek-ai/dsh-client-store')

    const NS = 'deepseek-usage'

    const h = React.createElement

    // ---- formatting -------------------------------------------------------

    function fmtMoney(symbol, value) {
      if (!Number.isFinite(value)) return '—'
      const dec = Math.abs(value) >= 1 ? 2 : 4
      return symbol + value.toFixed(dec)
    }

    function fmtTokens(n) {
      n = Number(n) || 0
      if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 亿'
      if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
      if (n >= 1e4) return (n / 1e4).toFixed(1) + ' 万'
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k'
      return String(Math.round(n))
    }

    function fmtTime(ts) {
      if (!ts) return ''
      const d = new Date(ts)
      const p = (n) => String(n).padStart(2, '0')
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
        + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
    }

    function fmtPercent(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      return value >= 10 ? value.toFixed(1) + '%' : value.toFixed(2) + '%'
    }

    /** Month-day clock of a reset instant, compact enough for one line. */
    function fmtReset(ts) {
      if (!ts) return ''
      const d = new Date(ts)
      if (Number.isNaN(d.getTime())) return ''
      const p = (n) => String(n).padStart(2, '0')
      return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
    }

    // Subscription windows, narrowest first, as the provider documents them.
    const QUOTA_WINDOWS = [
      { key: 'fiveHour', label: '5 小时', short: '5时' },
      { key: 'week', label: '本周', short: '周' },
      { key: 'month', label: '本月', short: '月' },
    ]

    /** Whether this account bills one LLM route id. */
    function matchesProvider(account, provider) {
      if (typeof provider !== 'string' || provider === '') return false
      const list = Array.isArray(account.providers) ? account.providers : []
      if (list.includes(provider)) return true
      return typeof account.provider === 'string' && account.provider !== '' && account.provider === provider
    }

    // ---- card controller --------------------------------------------------

    /**
     * Bridge the `deepseek-usage` configuration form onto the card: every Host
     * publish lands in the mirror, the form emits, and the snapshot store the
     * renderer binds as useUsageCard updates.
     */
    function createController(ctx) {
      const form = ctx.configForms.get(NS)
      const store = createSnapshotStore({
        status: 'loading',
        value: undefined,
        writable: false,
      })

      function derive() {
        const snap = form.getSnapshot()
        if (snap === undefined) return
        const next = {
          status: snap.status ?? 'loading',
          value: snap.value?.metrics ?? undefined,
          writable: false,
        }
        store.set(next)
      }

      const unsubscribe = form.subscribe(derive)
      derive()

      return {
        inject: () => ({
          hooks: { usageCard: store },
        }),
        dispose: unsubscribe,
      }
    }

    // ---- card view --------------------------------------------------------

    function Row(props) {
      return h('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--dsw-alias-border-l1)' } },
        h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, props.label),
        h('span', { style: props.muted ? { color: 'var(--dsw-alias-label-secondary)' } : undefined }, props.children),
      )
    }

    function Badge(props) {
      const tones = {
        ok: 'var(--dsw-alias-state-success-primary)',
        warn: 'var(--dsw-alias-state-warn-primary)',
        err: 'var(--dsw-alias-state-error-primary)',
      }
      return h('span', {
        style: {
          fontSize: '11px', padding: '2px 9px', borderRadius: '999px',
          background: 'rgba(127,127,127,0.14)', color: tones[props.tone] ?? undefined, whiteSpace: 'nowrap',
        },
      }, props.text)
    }

    const CARD_STYLE = {
      border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: '10px',
      padding: '12px 14px',
    }

    /** Thin meter bar; the tone steps up as a window fills. */
    function QuotaBar({ percent }) {
      const known = typeof percent === 'number' && Number.isFinite(percent)
      const width = known ? Math.max(0, Math.min(100, percent)) : 0
      const tone = !known
        ? 'var(--dsw-alias-label-secondary)'
        : percent >= 85 ? 'var(--dsw-alias-state-error-primary)'
          : percent >= 60 ? 'var(--dsw-alias-state-warn-primary)'
            : 'var(--dsw-alias-state-success-primary)'
      return h('div', {
        style: {
          height: '4px', borderRadius: '999px', overflow: 'hidden',
          background: 'rgba(127,127,127,0.18)', margin: '0 0 10px',
        },
      }, h('div', { style: { width: width + '%', height: '100%', background: tone, borderRadius: '999px' } }))
    }

    /**
     * One subscription account: the windows its console meters, each with the
     * used share, the money behind it, and when it resets.
     */
    function QuotaCard({ account }) {
      const rows = []
      rows.push(h('div', { key: 'title', style: { fontSize: '13px', fontWeight: 600, marginBottom: '4px' } }, account.label))
      rows.push(h('div', {
        key: 'period',
        style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', marginBottom: '8px' },
      }, account.quotaPeriodEndsAt ? `订阅周期至 ${fmtTime(account.quotaPeriodEndsAt)}` : '订阅额度'))
      if (account.quotaError !== null && account.quotaError !== undefined) {
        rows.push(h(Row, { key: 'error', label: '额度' }, h(Badge, { tone: 'err', text: '查询失败' })))
        rows.push(h('div', { key: 'detail', style: { fontSize: '11px', color: 'var(--dsw-alias-state-error-primary)', marginTop: '4px' } }, account.quotaError))
        return h('div', { style: CARD_STYLE }, ...rows)
      }
      if (account.quota === null || account.quota === undefined) {
        rows.push(h(Row, { key: 'pending', label: '额度' }, h(Badge, { tone: 'warn', text: '尚未取到' })))
        return h('div', { style: CARD_STYLE }, ...rows)
      }
      for (const window of QUOTA_WINDOWS) {
        const meter = account.quota[window.key]
        if (meter === undefined) continue
        rows.push(h(Row, { key: window.key, label: window.label }, h('span', null,
          h('span', { style: { fontWeight: 600 } }, fmtPercent(meter.percent)),
          h('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: '11px', marginLeft: '8px' } },
            fmtMoney(account.symbol, meter.used) + ' / ' + fmtMoney(account.symbol, meter.limit)),
          meter.resetsAt
            ? h('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: '11px', marginLeft: '8px' } },
                fmtReset(meter.resetsAt) + ' 重置')
            : null)))
        rows.push(h(QuotaBar, { key: window.key + '-bar', percent: meter.percent }))
      }
      return h('div', { style: CARD_STYLE }, ...rows)
    }

    function AccountCard({ account }) {
      if (account.kind === 'quota') return h(QuotaCard, { account })
      const today = account.today
      const rows = []
      rows.push(h('div', { key: 'title', style: { fontSize: '13px', fontWeight: 600, marginBottom: '8px' } }, account.label))
      const official = account.officialTodaySpend
      const spendView = (official !== null && official !== undefined && account.balanceTotal !== null)
        ? h('span', null,
            h('span', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, '-' + fmtMoney(account.symbol, official)),
            h('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: '11px', marginLeft: '6px' } }, '余额差'))
        : today === null
          ? '0'
          : h('span', null,
              fmtMoney(account.symbol, today.cost),
              h('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: '11px', marginLeft: '8px' } },
                `${fmtTokens(today.inputTokens + today.cacheHitTokens + today.cacheWriteTokens)} in · ${fmtTokens(today.outputTokens)} out`))
      rows.push(h(Row, { key: 'spend', label: '今日消费' }, spendView))

      // The factor every displayed amount carries: 1 means the configured
      // rates are used unchanged, anything else is tracked from the account's
      // own balance delta.
      const factor = typeof account.rateFactor === 'number' ? account.rateFactor : 1
      const observations = account.rateObservations ?? 0
      rows.push(h(Row, { key: 'factor', label: '费率校准' },
        h('span', null,
          '× ' + factor.toFixed(3),
          h('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: '11px', marginLeft: '8px' } },
            observations > 0
              ? `按官方余额差自动校准 · 已观测 ${observations} 次`
              : '未观测到余额差，暂用配置费率'))))

      if (account.balanceSupported) {
        if (account.balanceError !== null) {
          rows.push(h(Row, { key: 'balance', label: '总余额' },
            h(Badge, { tone: 'err', text: '查询失败' })))
          rows.push(h('div', { key: 'err', style: { fontSize: '11px', color: 'var(--dsw-alias-state-error-primary)', marginTop: '4px' } }, account.balanceError))
        } else if (account.balanceTotal === null) {
          rows.push(h(Row, { key: 'balance', label: '总余额' },
            h(Badge, { tone: 'warn', text: '尚未取到' })))
        } else {
          rows.push(h(Row, { key: 'balance', label: '总余额' },
            fmtMoney(account.symbol, account.balanceTotal)))
          rows.push(h(Row, { key: 'granted', label: '赠送余额' },
            fmtMoney(account.symbol, account.balanceGranted)))
          rows.push(h(Row, { key: 'avail', label: '可用状态' },
            h(Badge, { tone: account.balanceAvailable ? 'ok' : 'err', text: account.balanceAvailable ? '可用于 API 调用' : '暂不可用' })))
          // Where the number came from: the Platform login the app already holds, or a
          // stored API key. The two can disagree when a machine has both.
          const source = account.balanceSource === 'platform'
            ? '来自平台登录'
            : account.balanceSource === 'api' ? '来自 API Key' : ''
          if (source !== '') {
            rows.push(h('div', { key: 'source', style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', marginTop: '4px' } }, source))
          }
        }
      } else {
        rows.push(h(Row, { key: 'balance', label: '总余额' },
          h(Badge, { tone: 'warn', text: '该平台无余额接口' })))
      }
      return h('div', { style: CARD_STYLE }, ...rows)
    }

    function UsageCard(props) {
      const state = props.useUsageCard((s) => s)
      if (state.status === 'unavailable' || state.value === undefined) {
        return h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } },
          'deepseek-usage 插件未激活：Host 未提供 deepseek-usage 设置命名空间。')
      }
      const value = state.value
      const accounts = value.accounts ?? {}
      const list = []
      for (const id of Object.keys(accounts)) {
        list.push(h(AccountCard, { key: id, account: accounts[id] }))
      }
      if (list.length === 0) {
        list.push(h('div', { key: 'empty', style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, '未配置任何账号。'))
      }
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        h('div', { style: { fontSize: '15px', fontWeight: 600 } }, '用量与余额'),
        h('div', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: '11px' } },
          `更新于 ${fmtTime(value.updatedAt)} · 时区 ${value.timezone} · 余额与额度取自服务商 · 今日消费为本地记账估算`),
        ...list,
      )
    }


    // ---- account summary under the chat -----------------------------------

    // The portfolio P&L figures the stock-holdings plugin publishes on
    // /api/stock-pnl. The strip opens with that bare number; a deployment
    // without the route or without exported positions simply has no figure.
    const STOCK_PNL_POLL_MS = 20000

    function fmtStockPnl(value) {
      const amount = Math.abs(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      return (value < 0 ? '-' : '+') + amount
    }

    /** Today's portfolio P&L amount, or null while there is nothing usable. */
    function useStockPnl() {
      const [value, setValue] = React.useState(null)
      React.useEffect(() => {
        let disposed = false
        let timer
        const load = () => {
          fetch('/api/stock-pnl')
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
            .then((body) => {
              if (disposed) return
              const usable = body !== null && typeof body === 'object' && !body.error && Number.isFinite(body.pnl_yk)
              setValue(usable ? body.pnl_yk : null)
              const next = Number(body && body.poll_ms) >= 1000 ? body.poll_ms : STOCK_PNL_POLL_MS
              timer = setTimeout(load, next)
            })
            .catch(() => {
              if (disposed) return
              setValue(null)
              timer = setTimeout(load, STOCK_PNL_POLL_MS)
            })
        }
        load()
        return () => {
          disposed = true
          if (timer !== undefined) clearTimeout(timer)
        }
      }, [])
      return value
    }

    const STRIP_STYLE = {
      boxSizing: 'border-box',
      width: 'calc(var(--dsh-composer-card-max-width, 768px) - var(--dsh-composer-dock-inset, 8px) - var(--dsh-composer-dock-inset, 8px))',
      minWidth: 'min(100%, 280px)',
      maxWidth: '100%',
      margin: '0 auto',
      padding: '2px var(--dsh-composer-dock-inset, 8px) 0',
      fontSize: '11px', color: 'var(--dsw-alias-label-secondary)',
      display: 'flex', gap: '16px', flexWrap: 'wrap', lineHeight: '16px',
    }

    function UsageStrip(props) {
      const state = props.useUsageCard((s) => s)
      const pnl = useStockPnl()
      // The P&L cell is the raw amount in the strip's own text colour: no label,
      // no currency or percent sign, nothing else identifying the figure.
      const cells = []
      if (pnl !== null) cells.push(h('span', { key: 'stock-pnl' }, fmtStockPnl(pnl)))
      const accounts = state.status === 'unavailable' || state.value === undefined
        ? []
        : Object.values(state.value.accounts ?? {})
      const active = state.status === 'unavailable' || state.value === undefined
        ? null
        : state.value.active
      // The strip follows the route the operator is driving: only the account
      // billing the current conversation is reported. A host that has not seen a
      // request yet has no route, so every account stays visible then.
      let shown = accounts
      if (active !== null && active !== undefined && typeof active.provider === 'string' && active.provider !== '') {
        const owner = accounts.find((a) => matchesProvider(a, active.provider))
        shown = owner === undefined ? [] : [owner]
      }
      // An account with neither a fetched balance nor local spend has nothing to
      // say; every other account stays visible so a missing credential or an
      // unreachable balance endpoint shows up instead of hiding the strip.
      const parts = []
      for (const a of shown) {
        if (a.kind === 'quota') {
          if (a.quota === null || a.quota === undefined) {
            parts.push(a.label + ' ' + (a.quotaError ? '额度不可用' : '未取到额度'))
            continue
          }
          const bits = []
          for (const window of QUOTA_WINDOWS) {
            const meter = a.quota[window.key]
            if (meter !== undefined) bits.push(window.short + ' ' + fmtPercent(meter.percent))
          }
          parts.push(a.label + ' ' + bits.join(' · '))
          continue
        }
        const o = a.officialTodaySpend
        const loc = a.today
        const hasBalance = a.balanceSupported && a.balanceError === null && a.balanceTotal !== null
        const hasSpend = (o !== null && o !== undefined && o > 0)
          || (loc !== null && loc !== undefined && loc.cost > 0)
        if (!hasBalance && !hasSpend) continue
        let spend
        if (o !== null && o !== undefined && o > 0) {
          spend = '-' + fmtMoney(a.symbol, o) + '(官方)'
        } else if (loc !== null && loc !== undefined && loc.cost > 0) {
          spend = '-' + fmtMoney(a.symbol, loc.cost) + '(本地)'
        } else {
          spend = '0'
        }
        let text = a.label + ' '
        if (hasBalance) text += '余额 ' + fmtMoney(a.symbol, a.balanceTotal) + ' · '
        text += '今日 ' + spend
        if (!a.balanceSupported) text += ' · 无余额接口'
        else if (!hasBalance) text += a.balanceError !== null ? ' · 余额不可用' : ' · 未配置 Key'
        parts.push(text)
      }
      for (let i = 0; i < parts.length; i++) cells.push(h('span', { key: 'usage-' + i }, parts[i]))
      if (cells.length === 0) return null
      return h('div', { style: STRIP_STYLE }, ...cells)
    }

    // ---- plugin -----------------------------------------------------------

    const plugin = {
      name: 'deepseek-usage-client',
      inject: ['slots', 'configForms'],
      apply(ctx) {
        const controller = createController(ctx)
        ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
          name: 'settings.plugin.item',
          key: NS,
          inject: () => controller.inject(),
        }, UsageCard))
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock',
          id: 'usage',
          order: 100,
          inject: () => controller.inject(),
        }, UsageStrip))
        ctx.effect(() => () => { controller.dispose() }, 'deepseek-usage: card disposal')
      },
    }

    module.exports = plugin
    return module.exports
  },
})
