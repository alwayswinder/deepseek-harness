/**
 * DSH Little Icon — browser half.
 *
 * Renders the pet's settings on the bundle's own page in the Plugins list
 * (`plugins.bundle.config`, keyed by the package name), so size and
 * translucency sit one click from the plugin list instead of behind the row's
 * own page. The Host owns every value and this half only renders controls and
 * writes through the settings form, so a change reaches the pet without
 * restarting anything: the Host republishes the state file and the pet applies
 * it within a second.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-little-icon',
  factory: (require) => {
    'use strict'
    const module = { exports: {} }
    const React = require('react')
    const { createSnapshotStore } = require('@deepseek-ai/dsh-client-store')
    const h = React.createElement

    /** Settings namespace; the Host row id. */
    const NS = 'little-icon'

    /** The bundle whose page carries this configuration. */
    const PACKAGE_NAME = '@local/dsh-little-icon'

    /** The Host route that records "the person is still doing something". */
    const ACTIVITY_PATH = '/api/little-icon/activity'

    /** At most one activity ping per window; the Host only needs coarse recency. */
    const ACTIVITY_PING_MS = 15_000

    /** Input that counts as using DSH, so the pet never sleeps while you work. */
    const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'wheel', 'keydown']

    /** Mirrors the Host schema defaults so a control never renders blank. */
    const DEFAULTS = {
      enabled: true,
      size: 160,
      translucent: true,
      idleOpacity: 0.45,
      topmost: true,
      clickAction: 'toggle',
      frameMs: 600,
      pollMs: 800,
      alertMs: 1500,
      happyMs: 3000,
      boredEverySeconds: 60,
      boredMs: 5000,
      sleepAfterSeconds: 600,
    }

    /** Slider bounds, matching the Host schema. */
    const SIZE = { min: 96, max: 320, step: 8 }
    const OPACITY = { min: 0.15, max: 1, step: 0.05 }
    const FRAME_MS = { min: 120, max: 2000, step: 20 }
    const POLL_MS = { min: 200, max: 5000, step: 100 }
    const HOLD_MS = { min: 0, max: 15000, step: 500 }
    const BORED_EVERY_SECONDS = { min: 5, max: 600, step: 5 }
    const BORED_MS = { min: 500, max: 20000, step: 500 }
    const SLEEP_SECONDS = { min: 30, max: 86400, step: 30 }

    /** How long a slider drag settles before its writes are merged into one. */
    const WRITE_DELAY_MS = 250

    const zh = {
      title: '桌宠',
      summary: '桌面上的像素桌宠：大小与虚化都能在这里调。',
      enable: '启用桌宠',
      enableHint: '关闭会立刻结束桌宠进程，再打开会重新拉起。',
      size: '大小',
      sizeHint: '桌宠窗口边长；鼠标移上去时会完全显示。',
      translucent: '闲置时虚化',
      translucentHint: '鼠标不在桌宠上时半透明，移上去变清晰。',
      opacity: '虚化程度',
      opacityHint: '越小越透明。',
      topmost: '始终置顶',
      topmostHint: '让桌宠浮在其他窗口之上。',
      click: '点击桌宠',
      clickToggle: '收起 / 恢复 DSH',
      clickMinimize: '只最小化 DSH',
      clickNone: '不动作',
      clickHint: '单击（没有拖动的那一次按下）执行的动作。',
      pace: '表情节奏',
      paceHint: '每帧停留的毫秒数。',
      advanced: '更多',
      alertMs: '任务开始的「惊讶」',
      alertHint: '每次任务开始时先惊讶这么久，然后进入干活中。',
      happyMs: '「开心」保持',
      happyHint: '一轮活干完后开心多久，然后回到待机。',
      boredEvery: '无聊间隔',
      boredHint: '闲着的时候每隔这么久插一次「无聊」。',
      boredMs: '「无聊」时长',
      sleepAfter: '无操作多久「打盹」',
      sleepHint: '鼠标、键盘、拖动桌宠都算操作；一有操作就醒过来回到待机。',
      pollMs: '状态采样间隔',
      pollMsHint: '宿主读取 agent 状态的间隔；改大更省，改小更跟手。',
      pixels: '{value} px',
      percent: '{value}%',
      seconds: '{value} 秒',
      milliseconds: '{value} 毫秒',
      unavailable: '当前连接不保存设置，改不了。',
      saved: '已保存',
      failed: '保存失败，已回到上次的值。',
    }

    const en = {
      title: 'Desktop pet',
      summary: 'The pixel pet on your desktop; its size and translucency are set here.',
      enable: 'Enable the pet',
      enableHint: 'Turning this off ends the pet process; turning it back on starts one.',
      size: 'Size',
      sizeHint: 'Window edge; the pet shows fully while the pointer is over it.',
      translucent: 'Translucent while idle',
      translucentHint: 'Half transparent until the pointer reaches it.',
      opacity: 'Translucency',
      opacityHint: 'Lower is more transparent.',
      topmost: 'Always on top',
      topmostHint: 'Keeps the pet above other windows.',
      click: 'Clicking the pet',
      clickToggle: 'Tuck / restore DSH',
      clickMinimize: 'Minimize DSH only',
      clickNone: 'Do nothing',
      clickHint: 'What a click performs — a press that did not move the window.',
      pace: 'Animation pace',
      paceHint: 'Milliseconds each frame stays on screen.',
      advanced: 'More',
      alertMs: 'Startle at task start',
      alertHint: 'How long a new task startles the pet before it starts working.',
      happyMs: 'Happy for',
      happyHint: 'How long a finished task keeps it happy before it idles again.',
      boredEvery: 'Boredom interval',
      boredHint: 'While idle, how often a bored interruption comes around.',
      boredMs: 'Boredom duration',
      sleepAfter: 'Asleep after',
      sleepHint: 'Pointer, keyboard, and dragging the pet all count as activity; any of them wakes it.',
      pollMs: 'State sampling',
      pollMsHint: 'How often the host reads agent state.',
      pixels: '{value} px',
      percent: '{value}%',
      seconds: '{value} s',
      milliseconds: '{value} ms',
      unavailable: 'This connection keeps no settings, so they cannot be changed.',
      saved: 'Saved',
      failed: 'Save failed; the previous value is back.',
    }

    /** Insert the card stylesheet once per document. */
    function injectStyles() {
      if (typeof document === 'undefined' || document.getElementById('dsh-little-icon-style') !== null) return
      const style = document.createElement('style')
      style.id = 'dsh-little-icon-style'
      style.textContent = [
        '.dli-page{display:flex;flex-direction:column;gap:16px;max-width:560px;',
        'color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;}',
        '.dli-row{display:flex;flex-direction:column;gap:6px;}',
        '.dli-head{display:flex;align-items:center;gap:8px;}',
        '.dli-label{font-weight:600;}',
        '.dli-value{margin-left:auto;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
        '.dli-hint{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;}',
        '.dli-slider{width:100%;}',
        '.dli-row[data-disabled="true"]{opacity:.5;}',
        '.dli-select{background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.12));',
        'color:inherit;border:1px solid rgba(127,127,127,.35);border-radius:6px;padding:4px 8px;font:inherit;}',
        '.dli-details summary{cursor:pointer;color:var(--dsw-alias-label-secondary);}',
        '.dli-grid{display:flex;flex-direction:column;gap:14px;padding-top:12px;}',
        '.dli-status{font-size:11px;color:var(--dsw-alias-label-secondary);min-height:16px;}',
      ].join('')
      document.head.appendChild(style)
    }

    /**
     * One labelled control row.
     * @param props - label, hint, formatted value, the control itself, and whether
     *   a switch sits on the label's own line.
     * @returns the row element.
     */
    function Row(props) {
      const label = h('span', { className: 'dli-label' }, props.label)
      const value = props.value === undefined ? null : h('span', { className: 'dli-value' }, props.value)
      return h('div', { className: 'dli-row', 'data-disabled': props.disabled === true ? 'true' : undefined },
        props.inline === true
          ? h('div', { className: 'dli-head' }, props.control, label, value)
          : h('div', { className: 'dli-head' }, label, value),
        props.inline === true ? null : props.control,
        props.text === undefined ? null : h('div', { className: 'dli-hint' }, props.text))
    }

    /**
     * The pet's settings card.
     * @param props - slot props from `plugins.bundle.config` plus the inject face:
     *   the `usePetSettings` hook over the mirrored form and the `write` callback.
     * @returns the summary line, or the settings card.
     */
    function PetSettings(props) {
      const { t, view } = props
      if (view === 'summary') return h('span', null, t('summary'))

      const live = props.usePetSettings((snapshot) => snapshot)
      const accepted = { ...DEFAULTS, ...(live.value ?? {}) }
      // Sliders follow the pointer locally; the plugin merges their writes once
      // the drag settles, so the card stays responsive without one profile write
      // per pixel.
      const [draft, setDraft] = React.useState(accepted)
      React.useEffect(() => { setDraft(accepted) }, [live.value])

      const write = (patch, immediate) => {
        setDraft((current) => ({ ...current, ...patch }))
        props.write(patch, immediate)
      }

      const editable = live.status === 'ready' && live.writable === true
      /** Slider props: local echo while dragging, one write after it settles. */
      const slider = (field) => ({
        className: 'dli-slider', type: 'range', disabled: !editable, value: draft[field],
        onChange: (event) => write({ [field]: Number(event.target.value) }, false),
      })
      /** Switch props: one write per click. */
      const toggle = (field) => ({
        type: 'checkbox', disabled: !editable, checked: draft[field] === true,
        onChange: (event) => write({ [field]: event.target.checked }, true),
      })

      return h('div', { className: 'dli-page' },
        h(Row, {
          label: t('enable'), text: t('enableHint'), inline: true, disabled: !editable,
          control: h('input', toggle('enabled')),
        }),
        h(Row, {
          label: t('size'), value: t('pixels', { value: draft.size }), text: t('sizeHint'), disabled: !editable,
          control: h('input', { min: SIZE.min, max: SIZE.max, step: SIZE.step, ...slider('size') }),
        }),
        h(Row, {
          label: t('translucent'), text: t('translucentHint'), inline: true, disabled: !editable,
          control: h('input', toggle('translucent')),
        }),
        h(Row, {
          label: t('opacity'), value: t('percent', { value: Math.round(draft.idleOpacity * 100) }),
          text: t('opacityHint'), disabled: !editable || draft.translucent !== true,
          control: h('input', {
            min: OPACITY.min, max: OPACITY.max, step: OPACITY.step,
            ...slider('idleOpacity'),
            disabled: !editable || draft.translucent !== true,
          }),
        }),
        h(Row, {
          label: t('topmost'), text: t('topmostHint'), inline: true, disabled: !editable,
          control: h('input', toggle('topmost')),
        }),
        h(Row, {
          label: t('click'), text: t('clickHint'), disabled: !editable,
          control: h('select', {
            className: 'dli-select', value: draft.clickAction, disabled: !editable,
            onChange: (event) => write({ clickAction: event.target.value }, true),
          },
          h('option', { value: 'toggle' }, t('clickToggle')),
          h('option', { value: 'minimize' }, t('clickMinimize')),
          h('option', { value: 'none' }, t('clickNone'))),
        }),
        h(Row, {
          label: t('pace'), value: t('milliseconds', { value: draft.frameMs }), text: t('paceHint'), disabled: !editable,
          control: h('input', { min: FRAME_MS.min, max: FRAME_MS.max, step: FRAME_MS.step, ...slider('frameMs') }),
        }),
        h('details', { className: 'dli-details' },
          h('summary', null, t('advanced')),
          h('div', { className: 'dli-grid' },
            h(Row, {
              label: t('alertMs'), value: t('milliseconds', { value: draft.alertMs }),
              text: t('alertHint'), disabled: !editable,
              control: h('input', { min: HOLD_MS.min, max: HOLD_MS.max, step: HOLD_MS.step, ...slider('alertMs') }),
            }),
            h(Row, {
              label: t('happyMs'), value: t('milliseconds', { value: draft.happyMs }),
              text: t('happyHint'), disabled: !editable,
              control: h('input', { min: HOLD_MS.min, max: HOLD_MS.max, step: HOLD_MS.step, ...slider('happyMs') }),
            }),
            h(Row, {
              label: t('boredEvery'), value: t('seconds', { value: draft.boredEverySeconds }),
              text: t('boredHint'), disabled: !editable,
              control: h('input', {
                min: BORED_EVERY_SECONDS.min, max: BORED_EVERY_SECONDS.max, step: BORED_EVERY_SECONDS.step,
                ...slider('boredEverySeconds'),
              }),
            }),
            h(Row, {
              label: t('boredMs'), value: t('milliseconds', { value: draft.boredMs }), disabled: !editable,
              control: h('input', { min: BORED_MS.min, max: BORED_MS.max, step: BORED_MS.step, ...slider('boredMs') }),
            }),
            h(Row, {
              label: t('sleepAfter'), value: t('seconds', { value: draft.sleepAfterSeconds }),
              text: t('sleepHint'), disabled: !editable,
              control: h('input', {
                min: SLEEP_SECONDS.min, max: SLEEP_SECONDS.max, step: SLEEP_SECONDS.step,
                ...slider('sleepAfterSeconds'),
              }),
            }),
            h(Row, {
              label: t('pollMs'), value: t('milliseconds', { value: draft.pollMs }), text: t('pollMsHint'), disabled: !editable,
              control: h('input', { min: POLL_MS.min, max: POLL_MS.max, step: POLL_MS.step, ...slider('pollMs') }),
            }))),
        h('div', { className: 'dli-status' },
          editable
            ? (live.save === 'saved' ? t('saved') : live.save === 'failed' ? t('failed') : '')
            : t('unavailable')))
    }

    // ---- plugin -------------------------------------------------------------

    const plugin = {
      name: 'little-icon-client',
      inject: ['slots', 'locale', 'configForms'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'little-icon: dictionaries')
        ctx.effect(() => {
          injectStyles()
          return () => {}
        }, 'little-icon: stylesheet')

        // The pet sleeps only when nobody is doing anything, and the Host sees
        // agents and jobs rather than input, so the page reports its own use.
        // Throttled: the Host only needs to know activity happened recently.
        let lastPing = 0
        const ping = () => {
          const now = Date.now()
          if (now - lastPing < ACTIVITY_PING_MS) return
          lastPing = now
          void fetch(ACTIVITY_PATH, { method: 'POST' }).catch(() => {})
        }
        const onVisibility = () => { if (document.visibilityState === 'visible') ping() }
        for (const name of ACTIVITY_EVENTS) window.addEventListener(name, ping, { passive: true, capture: true })
        document.addEventListener('visibilitychange', onVisibility)
        ping()
        ctx.effect(() => () => {
          for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, ping, { capture: true })
          document.removeEventListener('visibilitychange', onVisibility)
        }, 'little-icon: activity reporting')

        // The Host document stays the single owner of every value; this half
        // mirrors the accepted section into a snapshot the card renders.
        const form = ctx.configForms.get(NS)
        const store = createSnapshotStore({ ...form.getSnapshot(), save: 'idle' })
        const publish = (patch) => { store.set({ ...store.getSnapshot(), ...patch }) }
        ctx.effect(() => form.subscribe(() => { publish(form.getSnapshot()) }), 'little-icon: settings snapshot')

        let pending = {}
        let timer
        const flush = () => {
          const patch = pending
          pending = {}
          const ops = Object.entries(patch).map(([field, value]) => ({ op: 'set', path: [field], value }))
          if (ops.length === 0) return
          void form.mutate(ops, form.getSnapshot().revision).then(
            (accepted) => { publish({ save: accepted ? 'saved' : 'failed' }) },
            () => { publish({ save: 'failed' }) },
          )
        }

        /**
         * Queue field writes; a slider drag is merged into one write.
         * @param patch - field values to write.
         * @param immediate - write at once (switches, selects) or after the drag settles.
         */
        const write = (patch, immediate) => {
          pending = { ...pending, ...patch }
          publish({ save: 'idle' })
          if (timer !== undefined) clearTimeout(timer)
          if (immediate) flush()
          else timer = setTimeout(flush, WRITE_DELAY_MS)
        }

        ctx.effect(() => () => { if (timer !== undefined) clearTimeout(timer) }, 'little-icon: pending writes')

        ctx.effect(() => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config',
          key: PACKAGE_NAME,
          locale: NS,
          inject: () => ({ hooks: { petSettings: store }, write }),
        }, PetSettings)), 'little-icon: pet settings card')
      },
    }

    module.exports = plugin
    return module.exports
  },
})
