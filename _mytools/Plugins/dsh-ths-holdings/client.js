/**
 * dsh-ths-holdings browser half.
 *
 * Hand-built lazy-CJS factory artifact: the module system executes this file,
 * which registers the bundle factory through window.__ModuleLoader__.load. The
 * factory requires only platform-table modules, so nothing but React has to
 * exist in the browser.
 *
 * One contribution: the holdings manager on this plugin's own page under
 * Settings → Plugins (the `plugins.bundle.config` entry keyed by this package —
 * the same surface the desktop pet's settings use). It reads and writes the
 * host half's `/api/stock-pnl/positions` route, which owns the snapshot file;
 * the browser never touches the file, the Cookie, or any ledger credential.
 */
window.__ModuleLoader__.load({
  id: 'dsh-ths-holdings',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }

    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useState } = React

    /** The host route that reads and rewrites the holdings. */
    const API = '/api/stock-pnl/positions'
    /** The host route that chooses which file `API` reads and writes. */
    const LOCATION_API = API + '/location'
    /**
     * The bundle this configuration belongs to: the Plugins page keys this slot
     * by the bundle's package name, spelled the way the profile's bundle list does.
     */
    const BUNDLE = 'dsh-ths-holdings'

    // ---- formatting -------------------------------------------------------

    // A-share convention: red is a gain, green is a loss. The palette's error
    // and success reds/greens are the only tokens that carry those hues.
    const RISE = 'var(--dsw-alias-state-error-primary)'
    const FALL = 'var(--dsw-alias-state-success-primary)'

    function fmtMoney(value) {
      if (!Number.isFinite(value)) return '—'
      const sign = value < 0 ? '-' : ''
      return sign + '¥' + Math.abs(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }

    function fmtSigned(value) {
      if (!Number.isFinite(value)) return '—'
      const sign = value < 0 ? '-' : '+'
      return sign + '¥' + Math.abs(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }

    function fmtPct(value) {
      if (!Number.isFinite(value)) return '—'
      return (value < 0 ? '' : '+') + value.toFixed(2) + '%'
    }

    function fmtTime(value) {
      if (typeof value !== 'string' || value === '') return ''
      const when = new Date(value)
      if (Number.isNaN(when.getTime())) return value
      const pad = (part) => String(part).padStart(2, '0')
      return `${String(when.getFullYear())}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`
        + ` ${pad(when.getHours())}:${pad(when.getMinutes())}`
    }

    /** Price colour for one signed number: red up, green down, muted flat or unknown. */
    function tone(value) {
      if (!Number.isFinite(value) || value === 0) return { color: 'var(--dsw-alias-label-secondary)' }
      return { color: value > 0 ? RISE : FALL }
    }

    // ---- styles -----------------------------------------------------------

    const S = {
      page: { display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px', color: 'var(--dsw-alias-label-primary)' },
      title: { fontSize: '15px', fontWeight: 600 },
      sub: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', lineHeight: '17px' },
      note: { fontSize: '11px', lineHeight: '17px', color: 'var(--dsw-alias-state-warn-label)' },
      error: { fontSize: '11px', lineHeight: '17px', color: 'var(--dsw-alias-state-error-primary)' },
      bar: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
      button: {
        font: 'inherit', fontSize: '12px', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l3)', background: 'transparent', color: 'inherit',
      },
      buttonPrimary: {
        font: 'inherit', fontSize: '12px', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer',
        border: '1px solid var(--dsw-alias-state-business-primary)', background: 'transparent',
        color: 'var(--dsw-alias-state-business-primary)',
      },
      buttonDisabled: { opacity: 0.45, cursor: 'default' },
      tableWrap: { overflowX: 'auto', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '8px' },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
      th: {
        textAlign: 'left', fontWeight: 500, whiteSpace: 'nowrap', padding: '6px 10px',
        color: 'var(--dsw-alias-label-secondary)', borderBottom: '1px solid var(--dsw-alias-border-l2)',
      },
      td: { padding: '4px 10px', borderBottom: '1px solid var(--dsw-alias-border-l1)', whiteSpace: 'nowrap' },
      input: {
        font: 'inherit', fontSize: '12px', width: '100%', boxSizing: 'border-box', padding: '3px 6px',
        borderRadius: '5px', border: '1px solid var(--dsw-alias-border-l3)', background: 'transparent',
        color: 'inherit', textAlign: 'right',
      },
      inputText: { textAlign: 'left' },
      inputBad: { borderColor: 'var(--dsw-alias-state-error-primary)' },
      inputPath: {
        font: 'inherit', fontSize: '12px', flex: '1 1 360px', minWidth: '0', padding: '4px 8px',
        borderRadius: '5px', border: '1px solid var(--dsw-alias-border-l3)', background: 'transparent',
        color: 'inherit',
      },
      fileBlock: {
        display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 10px',
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '8px',
      },
      fileLabel: { fontSize: '12px', fontWeight: 500 },
      summary: { display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px' },
    }

    /** One button whose disabled look is part of its own contract. */
    function Button(props) {
      return h('button', {
        type: 'button',
        style: { ...(props.primary === true ? S.buttonPrimary : S.button), ...(props.disabled === true ? S.buttonDisabled : {}) },
        disabled: props.disabled === true,
        onClick: props.onClick,
      }, props.children)
    }

    // ---- draft handling ---------------------------------------------------

    /** The editable form of one row: quantities stay text while the person types. */
    function toDraft(view) {
      const positions = view !== null && view !== undefined && Array.isArray(view.positions) ? view.positions : []
      return positions.map(row => ({ code: row.code, name: row.name, qty: String(row.qty), cost: String(row.cost) }))
    }

    /** The request rows: the host validates them and answers every rejected field. */
    function toPayload(rows) {
      return rows.map(row => ({
        code: String(row.code).trim(),
        name: String(row.name).trim(),
        qty: Number(row.qty),
        cost: Number(row.cost),
      }))
    }

    /** The priced rows of the loaded view, keyed by code, for totals and quote cells. */
    function priceIndex(view) {
      const index = new Map()
      const positions = view !== null && view !== undefined && Array.isArray(view.positions) ? view.positions : []
      for (const row of positions) {
        if (typeof row.price === 'number') index.set(row.code, row)
      }
      return index
    }

    /** How the host says it found the file in force. */
    const SOURCE_LABEL = { machine: '本机设置', config: '插件配置', default: '默认位置' }

    /**
     * The file path a picked directory implies: the snapshot the plugin reads,
     * unless the picker already named a JSON file.
     * @param {string} picked - the absolute directory (or file) the picker returned.
     * @returns {string} the path to put in the field.
     */
    function pathFromPicked(picked) {
      const base = picked.replace(/[\\/]+$/, '')
      if (/\.json$/i.test(base)) return base
      return base + (picked.includes('\\') ? '\\' : '/') + 'positions.json'
    }

    // ---- page -------------------------------------------------------------

    /**
     * The holdings manager.
     *
     * `props.view` is the Plugins page's ask: `page` renders the table on the
     * open bundle's page, and `summary` is the one-line description a list row
     * would carry. The view of a mounted entry never changes, so answering the
     * summary before the hooks below is safe — and keeps the list row from
     * fetching the holdings.
     */
    function PositionsManager(props) {
      if (props !== undefined && props.view === 'summary') {
        return h('span', null, '改成本 / 数量、增删持仓，含实时市值与盈亏')
      }

      const [view, setView] = useState(null)
      const [draft, setDraft] = useState([])
      const [baseline, setBaseline] = useState('[]')
      const [phase, setPhase] = useState('loading')
      const [failure, setFailure] = useState('')
      const [fieldErrors, setFieldErrors] = useState([])
      const [notice, setNotice] = useState('')
      const [saving, setSaving] = useState(false)
      const [fileDraft, setFileDraft] = useState('')
      const [fileFailure, setFileFailure] = useState('')
      const [fileNotice, setFileNotice] = useState('')
      const [fileSaving, setFileSaving] = useState(false)
      const pickDirectory = props !== undefined ? props.pickDirectory : undefined

      /** Adopt one host view as both the shown facts and the saved baseline. */
      const adopt = useCallback((next) => {
        const rows = toDraft(next)
        setView(next)
        setDraft(rows)
        setBaseline(JSON.stringify(rows))
        setFileDraft(typeof next.file === 'string' ? next.file : '')
      }, [])

      const load = useCallback(() => {
        setPhase('loading')
        setFailure('')
        setFieldErrors([])
        setNotice('')
        fetch(API)
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error('HTTP ' + String(response.status)))))
          .then((body) => { adopt(body); setPhase('ready') })
          .catch((error) => { setFailure(String(error && error.message ? error.message : error)); setPhase('failed') })
      }, [adopt])

      useEffect(() => { load() }, [load])

      const save = useCallback(() => {
        setSaving(true)
        setFieldErrors([])
        setNotice('')
        fetch(API, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ positions: toPayload(draft) }),
        })
          .then(async (response) => {
            const body = await response.json().catch(() => null)
            if (!response.ok || body === null || body.ok !== true) {
              setFieldErrors(body !== null && Array.isArray(body.errors) && body.errors.length > 0
                ? body.errors
                : [{ index: -1, field: 'body', message: 'HTTP ' + String(response.status) }])
              return
            }
            adopt(body.view)
            setNotice('已保存')
          })
          .catch((error) => {
            setFieldErrors([{ index: -1, field: 'body', message: String(error && error.message ? error.message : error) }])
          })
          .finally(() => { setSaving(false) })
      }, [adopt, draft])

      /**
       * Ask the host to switch the holdings file, then reload the rows from it.
       *
       * An empty path returns to the profile's `positionsFile` or the default
       * under the harness home. The choice is remembered for this machine only.
       * @param {string} positionsFile - the absolute path, or an empty string to reset.
       */
      const applyFile = useCallback((positionsFile) => {
        setFileSaving(true)
        setFileFailure('')
        setFileNotice('')
        fetch(LOCATION_API, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ positionsFile }),
        })
          .then(async (response) => {
            const body = await response.json().catch(() => null)
            if (!response.ok || body === null || body.ok !== true) {
              setFileFailure(body !== null && typeof body.message === 'string' && body.message !== ''
                ? body.message
                : response.status === 404
                  ? '宿主半边还没有这个路由：重启 DSH 再试'
                  : 'HTTP ' + String(response.status))
              return
            }
            setFileNotice(typeof body.file === 'string' && body.file !== '' ? '已切换到 ' + body.file : '已切换持仓文件')
            load()
          })
          .catch((error) => {
            setFileFailure(String(error && error.message ? error.message : error))
          })
          .finally(() => { setFileSaving(false) })
      }, [load])

      /** Ask the shell's directory picker, when this profile has one. */
      const browseFile = useCallback(() => {
        if (typeof pickDirectory !== 'function') return
        setFileFailure('')
        setFileNotice('')
        Promise.resolve(pickDirectory())
          .then((picked) => {
            if (typeof picked !== 'string' || picked === '') return
            setFileDraft(pathFromPicked(picked))
          })
          .catch((error) => {
            setFileFailure('选择目录失败：' + String(error && error.message ? error.message : error))
          })
      }, [pickDirectory])

      const updateField = useCallback((index, field, value) => {
        setDraft(rows => rows.map((row, at) => (at === index ? { ...row, [field]: value } : row)))
      }, [])

      const prices = useMemo(() => priceIndex(view), [view])

      const totals = useMemo(() => {
        let market = 0
        let cost = 0
        let pnl = 0
        let day = 0
        let dayBase = 0
        let quoted = 0
        let unquoted = 0
        for (const row of draft) {
          const quote = prices.get(String(row.code).trim())
          const qty = Number(row.qty)
          const unit = Number(row.cost)
          if (quote === undefined || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unit)) {
            unquoted += 1
            continue
          }
          quoted += 1
          market += quote.price * qty
          cost += unit * qty
          pnl += (quote.price - unit) * qty
          day += (quote.price - quote.prev_close) * qty
          dayBase += quote.prev_close * qty
        }
        return {
          market, cost, pnl, quoted, unquoted,
          pnlPct: cost > 0 ? (pnl / cost) * 100 : 0,
          day, dayPct: dayBase > 0 ? (day / dayBase) * 100 : 0,
        }
      }, [draft, prices])

      const dirty = useMemo(() => JSON.stringify(draft) !== baseline, [draft, baseline])
      const badFields = useMemo(() => {
        const map = new Map()
        for (const error of fieldErrors) {
          if (typeof error.index !== 'number' || error.index < 0) continue
          const set = map.get(error.index) ?? new Set()
          set.add(error.field)
          map.set(error.index, set)
        }
        return map
      }, [fieldErrors])
      const pageErrors = fieldErrors.filter(error => typeof error.index !== 'number' || error.index < 0)

      // A reload keeps the table on screen: only the first read has nothing to
      // show, and a failed refresh is reported beside the rows already loaded.
      if (phase === 'loading' && view === null) return h('div', { style: S.sub }, '正在读取持仓…')

      if (phase === 'failed' && view === null) {
        return h('div', { style: S.page },
          h('div', { style: S.error }, '读取持仓失败：' + failure),
          h('div', { style: S.bar }, h(Button, { onClick: load }, '重试')))
      }

      const notes = []
      if (phase === 'failed') notes.push('读取持仓失败：' + failure)
      if (view.cookie_configured === true) {
        notes.push('已配置账本 Cookie：上方那条盈亏来自账本接口，本页的持仓只在没有 Cookie 的本地行情模式下生效。')
      }
      if (typeof view.unreadable === 'string') notes.push('持仓文件无法解析：' + view.unreadable)
      if (view.skipped > 0) notes.push('有 ' + String(view.skipped) + ' 行因数量或成本无效，未显示在本页。')
      if (typeof view.quotes_error === 'string' && view.quotes_error !== '') notes.push(view.quotes_error)
      if (totals.unquoted > 0) notes.push('有 ' + String(totals.unquoted) + ' 行没有行情价，未计入下面的合计。')

      const columns = ['代码', '名称', '数量', '成本', '现价', '市值', '累计盈亏', '今日盈亏', '']
      const rows = draft.map((row, index) => {
        const bad = badFields.get(index) ?? new Set()
        const quote = prices.get(String(row.code).trim())
        const qty = Number(row.qty)
        const unit = Number(row.cost)
        const market = quote === undefined ? Number.NaN : quote.price * qty
        const pnl = quote === undefined ? Number.NaN : (quote.price - unit) * qty
        const costValue = unit * qty
        const day = quote === undefined ? Number.NaN : (quote.price - quote.prev_close) * qty
        const cell = (key, content, extra) => h('td', { key, style: { ...S.td, ...(extra ?? {}) } }, content)
        const input = (field, value, style) => h('input', {
          style: { ...S.input, ...(style ?? {}), ...(bad.has(field) ? S.inputBad : {}) },
          value,
          inputMode: field === 'name' || field === 'code' ? undefined : 'decimal',
          'aria-label': `${columns[['code', 'name', 'qty', 'cost'].indexOf(field)]} 第 ${String(index + 1)} 行`,
          onChange: (event) => { updateField(index, field, event.currentTarget.value) },
        })
        return h('tr', { key: String(index) },
          cell('code', input('code', row.code, S.inputText)),
          cell('name', input('name', row.name, S.inputText)),
          cell('qty', input('qty', row.qty)),
          cell('cost', input('cost', row.cost)),
          cell('price', quote === undefined ? '—' : quote.price.toFixed(3), { textAlign: 'right', color: 'var(--dsw-alias-label-secondary)' }),
          cell('market', quote === undefined ? '—' : fmtMoney(market), { textAlign: 'right' }),
          cell('pnl', quote === undefined
            ? '—'
            : h('span', { style: tone(pnl) }, `${fmtSigned(pnl)} (${fmtPct(costValue > 0 ? (pnl / costValue) * 100 : 0)})`),
          { textAlign: 'right' }),
          cell('day', quote === undefined ? '—' : h('span', { style: tone(day) }, fmtSigned(day)), { textAlign: 'right' }),
          cell('actions', h(Button, {
            onClick: () => { setDraft(current => current.filter((_row, at) => at !== index)); setNotice('') },
          }, '删除')),
        )
      })

      return h('div', { style: S.page },
        h('div', { style: S.title }, '持仓管理'),
        h('div', { style: S.sub },
          `数据文件 ${String(view.file)}`,
          typeof view.export_date === 'string' && view.export_date !== '' ? ` · 导出 ${view.export_date}` : '',
          typeof view.updated_at === 'string' && view.updated_at !== '' ? ` · 更新 ${fmtTime(view.updated_at)}` : ''),
        ...notes.map((text, index) => h('div', { key: 'note' + String(index), style: S.note }, text)),
        h('div', { style: S.fileBlock },
          h('div', { style: S.fileLabel }, '持仓文件位置'),
          h('div', { style: S.bar },
            h('input', {
              style: S.inputPath,
              value: fileDraft,
              spellCheck: false,
              placeholder: '绝对路径，例如 D:\\holdings\\positions.json',
              'aria-label': '持仓文件路径',
              onChange: (event) => {
                setFileDraft(event.currentTarget.value)
                setFileFailure('')
                setFileNotice('')
              },
            }),
            typeof pickDirectory === 'function'
              ? h(Button, { disabled: fileSaving, onClick: browseFile }, '选择目录…')
              : null,
            h(Button, {
              primary: true,
              disabled: fileSaving || fileDraft.trim() === '' || fileDraft.trim() === String(view.file),
              onClick: () => { applyFile(fileDraft.trim()) },
            }, fileSaving ? '切换中…' : '保存位置'),
            view.file_source === 'machine'
              ? h(Button, { disabled: fileSaving, onClick: () => { applyFile('') } }, '恢复默认')
              : null),
          h('div', { style: S.sub },
            `当前来源：${SOURCE_LABEL[view.file_source] ?? '未知'}`
              + (view.file_source === 'default' ? '' : ` · 默认位置 ${String(view.file_default)}`)),
          h('div', { style: S.sub }, '这里选的路径只在这台机器上生效，会覆盖插件配置里的 positionsFile。'),
          fileFailure === '' ? null : h('div', { style: S.error }, fileFailure),
          fileNotice === '' ? null : h('div', { style: S.sub }, fileNotice)),
        h('div', { style: S.summary },
          h('span', null, `共 ${String(draft.length)} 条`),
          totals.unquoted > 0 ? h('span', { style: S.sub }, `有价 ${String(totals.quoted)} 条`) : null,
          h('span', null, `市值 ${fmtMoney(totals.market)}`),
          h('span', null, `成本 ${fmtMoney(totals.cost)}`),
          h('span', { style: tone(totals.pnl) }, `累计 ${fmtSigned(totals.pnl)} (${fmtPct(totals.pnlPct)})`),
          h('span', { style: tone(totals.day) }, `今日 ${fmtSigned(totals.day)} (${fmtPct(totals.dayPct)})`)),
        h('div', { style: S.tableWrap },
          h('table', { style: S.table },
            h('thead', null, h('tr', null, ...columns.map((label, index) => h('th', {
              key: String(index),
              style: { ...S.th, textAlign: index >= 2 && index <= 7 ? 'right' : 'left' },
            }, label)))),
            h('tbody', null, ...rows))),
        draft.length === 0
          ? h('div', { style: S.sub }, '还没有持仓。点「添加一行」填代码、数量、成本即可。')
          : null,
        h('div', { style: S.bar },
          h(Button, { primary: true, disabled: saving || !dirty, onClick: save }, saving ? '保存中…' : '保存'),
          h(Button, { disabled: saving, onClick: load }, dirty ? '放弃修改' : '重新载入'),
          h(Button, {
            disabled: saving,
            onClick: () => { setDraft(current => [...current, { code: '', name: '', qty: '', cost: '' }]); setNotice('') },
          }, '添加一行'),
          notice === '' ? null : h('span', { style: S.sub }, notice),
          dirty ? h('span', { style: S.sub }, '有未保存的修改') : null),
        ...pageErrors.map((error, index) => h('div', {
          key: 'error' + String(index), style: S.error,
        }, String(error.message ?? ''))),
        ...fieldErrors
          .filter(error => typeof error.index === 'number' && error.index >= 0)
          .map((error, index) => h('div', {
            key: 'rowError' + String(index), style: S.error,
          }, `第 ${String(Number(error.index) + 1)} 行 ${String(error.field)}：${String(error.message ?? '')}`)),
        h('div', { style: S.sub },
          '保存会直接改写上面的持仓文件；盈亏卡片在下一次轮询（约 20 秒）后使用新数据。'),
      )
    }

    // ---- plugin -----------------------------------------------------------

    /** The shell service that opens a native directory picker, when the profile has one. */
    function pickDirectoryFrom(ctx) {
      const workspace = typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : undefined
      if (workspace === undefined || typeof workspace.pickDirectory !== 'function') return undefined
      return () => workspace.pickDirectory()
    }

    const plugin = {
      name: 'ths-holdings-client',
      inject: ['slots'],
      apply(ctx) {
        // The picker belongs to the shell; a profile without the workspace UI
        // simply has none, and the path field stays typeable either way.
        const pickDirectory = pickDirectoryFrom(ctx)
        // This plugin's own page in Settings → Plugins, the way the desktop
        // pet's settings are contributed; the page renders the entry in `page`
        // view once the bundle is open.
        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config',
          key: BUNDLE,
          inject: () => ({ pickDirectory }),
        }, PositionsManager))
      },
    }

    module.exports = plugin
    return module.exports
  },
})
