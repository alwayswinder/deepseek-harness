/**
 * DeepSeek usage & balance meter — browser half.
 *
 * Hand-built lazy-CJS factory artifact: the module system executes this file,
 * which registers the bundle factory through window.__ModuleLoader__.load. The
 * factory requires only platform-table modules (react, @deepseek-ai/dsh-client-store)
 * and reads live data from the `deepseek-usage` settings namespace through the
 * standard settings mirror — the Host publishes the snapshot, no RPC needed.
 *
 * The card registers as a keyed `settings.plugin.item` entry; the Plugins
 * configuration tab renders it whenever the Host serves the `deepseek-usage`
 * namespace and hides it otherwise.
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

    // ---- card controller --------------------------------------------------

    /**
     * Bridge the `deepseek-usage` settings scope onto the card: every Host
     * publish lands in the mirror, the scope emits, and the snapshot store the
     * renderer binds as useUsageCard updates.
     */
    function createController(ctx) {
      const scope = ctx.settingsScope.bind({ namespace: NS })
      const store = createSnapshotStore({
        status: 'loading',
        value: undefined,
        writable: false,
      })

      function derive() {
        const snap = scope.getSnapshot()
        if (snap === undefined) return
        const next = {
          status: snap.status ?? 'loading',
          value: snap.value ?? undefined,
          writable: snap.writable ?? false,
        }
        store.set(next)
      }

      scope.subscribe(derive)
      derive()

      return {
        inject: () => ({
          hooks: { usageCard: store },
        }),
        dispose: () => {
          // scope.subscribe already returns a disposer when the scope is bound
          // to this fiber; the mirror update path keeps no other handles.
        },
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

    function AccountCard({ account }) {
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

      if (account.balanceSupported) {
        if (account.balanceError !== null) {
          rows.push(h(Row, { key: 'balance', label: '总余额' },
            h(Badge, { tone: 'err', text: '查询失败' })))
          rows.push(h('div', { key: 'err', style: { fontSize: '11px', color: 'var(--dsw-alias-state-error-primary)', marginTop: '4px' } }, account.balanceError))
        } else if (account.balanceTotal === null) {
          rows.push(h(Row, { key: 'balance', label: '总余额' },
            h(Badge, { tone: 'warn', text: '未配置 Key' })))
        } else {
          rows.push(h(Row, { key: 'balance', label: '总余额' },
            fmtMoney(account.symbol, account.balanceTotal)))
          rows.push(h(Row, { key: 'granted', label: '赠送余额' },
            fmtMoney(account.symbol, account.balanceGranted)))
          rows.push(h(Row, { key: 'avail', label: '可用状态' },
            h(Badge, { tone: account.balanceAvailable ? 'ok' : 'err', text: account.balanceAvailable ? '可用于 API 调用' : '暂不可用' })))
        }
      } else {
        rows.push(h(Row, { key: 'balance', label: '总余额' },
          h(Badge, { tone: 'warn', text: '该平台无余额接口' })))
      }
      return h('div', { style: { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '10px', padding: '12px 14px' } }, ...rows)
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
        h('div', { style: { fontSize: '15px', fontWeight: 600 } }, 'DeepSeek 用量与余额'),
        h('div', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: '11px' } },
          `更新于 ${fmtTime(value.updatedAt)} · 时区 ${value.timezone} · 消费为本地记账估算`),
        ...list,
      )
    }


    // ---- conversation strip: balance + official-delta spend under the chat ----

    function UsageStrip(props) {
      const state = props.useUsageCard((s) => s)
      if (state.status === 'unavailable' || state.value === undefined) return null
      const accounts = Object.values(state.value.accounts ?? {})
      // An account with neither a fetched balance nor local spend has nothing to
      // say; every other account stays visible so a missing credential or an
      // unreachable balance endpoint shows up instead of hiding the strip.
      const parts = []
      const session = props.sessionId === undefined
        ? undefined
        : state.value.sessions?.[props.sessionId]
      if (session !== undefined && session.requests > 0) {
        const symbol = accounts[0]?.symbol ?? '¥'
        const tokens = session.inputTokens + session.cacheHitTokens + session.cacheWriteTokens + session.outputTokens
        parts.push('本次对话 ' + fmtMoney(symbol, session.cost) + ' · ' + fmtTokens(tokens) + ' tokens')
      }
      for (const a of accounts) {
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
      if (parts.length === 0) return null
      return h('div', {
        style: {
          boxSizing: 'border-box',
          width: 'calc(var(--dsh-composer-card-max-width, 768px) - var(--dsh-composer-dock-inset, 8px) - var(--dsh-composer-dock-inset, 8px))',
          minWidth: 'min(100%, 280px)',
          maxWidth: '100%',
          margin: '0 auto',
          padding: '2px var(--dsh-composer-dock-inset, 8px) 0',
          fontSize: '11px', color: 'var(--dsw-alias-label-secondary)',
          display: 'flex', gap: '16px', flexWrap: 'wrap', lineHeight: '16px',
        },
      }, ...parts.map((text, i) => h('span', { key: i }, text)))
    }

    // ---- plugin -----------------------------------------------------------

    const plugin = {
      name: 'deepseek-usage-client',
      inject: ['slots', 'settingsScope'],
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