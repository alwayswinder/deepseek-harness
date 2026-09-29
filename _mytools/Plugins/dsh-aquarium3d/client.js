/**
 * DSH 3D aquarium — browser half (hand-built lazy-CJS bundle, no build step).
 *
 * The module system executes this file, which registers the bundle factory
 * through window.__ModuleLoader__.load. The factory requires only the
 * platform-table react module and contributes one `shell.overlay` entry — the
 * fullscreen canvas, mounted only while the overlay is open — plus the
 * `aquarium3d` service that opens and closes it. This plugin draws no entry of
 * its own: the desktop pet's 小游戏 menu calls that service.
 *
 * The 3D scene itself is NOT in this bundle: the host half serves it from
 * /api/aquarium3d/src/main.js, and this file imports that module when the
 * overlay first opens. Closing the overlay disposes the renderer, so a closed
 * aquarium holds no WebGL context and burns no frames.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-aquarium3d',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const h = React.createElement

    const NS = 'aquarium3d'
    /** Host-half route the scene modules and the three.js runtime are served from. */
    const BASE = '/api/aquarium3d'
    const STYLE_ID = 'dsh-aquarium3d-style'

    // ---- locale -----------------------------------------------------------

    const zh = {
      exit: '关闭玻璃鱼缸',
      loading: '正在注水…',
      failed: '3D 场景加载失败',
      hint: '拖拽环视 · 滚轮缩放 · 点水面投喂鱼食 · 按 Esc 关闭',
      panelTitle: '鱼缸控制',
      panelOpen: '控制面板',
      panelClose: '收起',
      panelNote: '点一下水面可以投喂鱼食。',
      hood: '顶灯强度',
      waterLevel: '水位',
      wind: '水面流动',
      caustics: '缸底光影',
      reflection: '水面倒影',
      refraction: '水面折射',
      glass: '玻璃厚度',
      bubbles: '气泡量',
      post: '画质增强',
      quality: '画质档位',
      qualityHigh: '高',
      qualityMedium: '中',
      qualityLow: '低',
      feed: '投喂鱼食',
    }

    const en = {
      exit: 'Close the glass aquarium',
      loading: 'Filling with water…',
      failed: 'The 3D scene failed to load',
      hint: 'Drag to look · Scroll to zoom · Click the water to feed · Esc to close',
      panelTitle: 'Tank controls',
      panelOpen: 'Controls',
      panelClose: 'Hide',
      panelNote: 'Click the water to drop food for the fish.',
      hood: 'Hood light',
      waterLevel: 'Water level',
      wind: 'Surface flow',
      caustics: 'Caustics',
      reflection: 'Reflections',
      refraction: 'Refraction',
      glass: 'Glass thickness',
      bubbles: 'Bubbles',
      post: 'Enhanced',
      quality: 'Quality',
      qualityHigh: 'High',
      qualityMedium: 'Medium',
      qualityLow: 'Low',
      feed: 'Feed the fish',
    }

    // ---- stylesheet -------------------------------------------------------

    /** Inject the plugin stylesheet once; repeated overlays reuse the same tag. */
    function injectStyles() {
      if (document.getElementById(STYLE_ID) !== null) return
      const tag = document.createElement('style')
      tag.id = STYLE_ID
      tag.textContent = [
        '.aq-stage{position:fixed;inset:0;z-index:1600;background:#050d12;overflow:hidden;}',
        '.aq-stage canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab;}',
        '.aq-stage canvas:active{cursor:grabbing;}',
        '.aq-note{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);',
        '  font:13px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;',
        '  letter-spacing:.14em;color:rgba(226,244,242,.66);pointer-events:none;}',
        '.aq-note.failed{color:#ff9c8a;}',
        '.aq-hint{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);',
        '  font:11.5px/1 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;',
        '  color:rgba(226,244,242,.62);background:rgba(7,22,28,.55);border:1px solid rgba(255,255,255,.14);',
        '  padding:7px 15px;border-radius:999px;backdrop-filter:blur(14px);white-space:nowrap;pointer-events:none;}',
        '.aq-close{position:absolute;right:14px;top:14px;z-index:2;display:flex;align-items:center;gap:6px;',
        '  font:12px/1 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;',
        '  color:#eaf7f5;background:rgba(7,22,28,.58);border:1px solid rgba(255,255,255,.16);',
        '  padding:8px 13px;border-radius:999px;cursor:pointer;backdrop-filter:blur(14px);}',
        '.aq-close:hover{background:rgba(12,36,44,.78);}',
        '.aq-panel{position:absolute;right:14px;bottom:14px;z-index:2;width:246px;max-height:calc(100% - 96px);',
        '  overflow-y:auto;overscroll-behavior:contain;padding:12px 13px 10px;border-radius:14px;',
        '  background:rgba(7,22,28,.6);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(16px);',
        '  box-shadow:0 14px 40px rgba(0,0,0,.4);color:#eaf7f5;',
        '  font:12px/1.4 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;}',
        '.aq-panel-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;',
        '  font-size:12.5px;letter-spacing:.06em;color:rgba(234,247,245,.92);}',
        '.aq-panel-fold,.aq-panel-toggle{font:11px/1 inherit;color:rgba(234,247,245,.7);cursor:pointer;',
        '  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:4px 8px;}',
        '.aq-panel-fold:hover,.aq-panel-toggle:hover{background:rgba(255,255,255,.14);color:#eaf7f5;}',
        '.aq-panel-toggle{position:absolute;right:14px;bottom:14px;z-index:2;padding:8px 12px;border-radius:999px;}',
        '.aq-row{display:grid;grid-template-columns:74px 1fr 46px;align-items:center;gap:7px;margin:7px 0;}',
        '.aq-label{color:rgba(226,244,242,.72);white-space:nowrap;}',
        '.aq-value{text-align:right;font-variant-numeric:tabular-nums;color:rgba(226,244,242,.85);}',
        '.aq-panel input[type=range]{-webkit-appearance:none;appearance:none;height:3px;border-radius:2px;',
        '  background:rgba(255,255,255,.2);outline:none;}',
        '.aq-panel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;',
        '  border-radius:50%;background:#78e6cf;cursor:pointer;box-shadow:0 0 0 2px rgba(120,230,207,.24);}',
        '.aq-row-actions{grid-template-columns:1fr auto;margin-top:10px;}',
        '.aq-action{font:12px/1 inherit;color:#04191b;background:#78e6cf;border:none;border-radius:9px;',
        '  padding:8px 10px;cursor:pointer;}',
        '.aq-action:hover{background:#95f0dc;}',
        '.aq-check{display:flex;align-items:center;gap:6px;color:rgba(226,244,242,.78);cursor:pointer;}',
        '.aq-row-quality{grid-template-columns:74px 1fr;}',
        '.aq-segmented{display:flex;gap:4px;}',
        '.aq-seg{flex:1;font:11.5px/1 inherit;color:rgba(226,244,242,.72);background:rgba(255,255,255,.06);',
        '  border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:5px 0;cursor:pointer;}',
        '.aq-seg.on{background:rgba(120,230,207,.22);border-color:rgba(120,230,207,.5);color:#eaf7f5;}',
        '.aq-panel-note{margin:9px 0 0;font-size:11px;color:rgba(226,244,242,.5);}',
      ].join('\n')
      document.head.appendChild(tag)
    }

    // ---- scene module -----------------------------------------------------

    /** The imported scene module, or the promise that will produce it. */
    let sceneModule = null

    /**
     * Import the scene module from the host-half route once.
     * @returns a promise of the scene module namespace.
     */
    function loadSceneModule() {
      sceneModule ??= import(`${BASE}/src/main.js`)
      return sceneModule
    }

    // ---- overlay control --------------------------------------------------

    /**
     * Whether the overlay is open. The state lives here rather than inside the
     * component because the desktop pet's menu opens the aquarium from another
     * plugin, so it needs an owner outside React: `subscribeAquarium` and
     * `aquariumIsOpen` are the read side the component binds to, and the
     * `aquarium3d` service below is the write side other plugins call.
     */
    let aquariumOpen = false
    const aquariumListeners = new Set()

    /**
     * Subscribe to the overlay's open state.
     * @param listener - called after every change.
     * @returns the unsubscribe function.
     */
    function subscribeAquarium(listener) {
      aquariumListeners.add(listener)
      return () => { aquariumListeners.delete(listener) }
    }

    /** @returns whether the overlay is open right now. */
    function aquariumIsOpen() {
      return aquariumOpen
    }

    /**
     * Put the overlay into one state and wake its subscribers.
     * @param next - the state the overlay should be in.
     */
    function setAquariumOpen(next) {
      if (aquariumOpen === next) return
      aquariumOpen = next
      for (const listener of aquariumListeners) listener()
    }

    // ---- components -------------------------------------------------------

    /** The fullscreen stage: owns the canvas, the scene lifecycle, the panel, and Esc. */
    function AquariumStage(props) {
      const t = props.t
      const canvasRef = React.useRef(null)
      const [status, setStatus] = React.useState('loading')
      const [stage, setStage] = React.useState(null)

      React.useEffect(() => {
        let disposed = false
        let controller = null
        loadSceneModule().then((scene) => {
          if (disposed) return
          controller = scene.mount(canvasRef.current)
          setStage(controller)
          setStatus('ready')
        }).catch((error) => {
          console.error('aquarium3d: the scene module failed to load', error)
          if (!disposed) setStatus('failed')
        })
        return () => {
          disposed = true
          // Disposing releases the WebGL context; a closed overlay then costs nothing.
          try {
            if (controller !== null) controller.dispose()
          } catch (error) {
            console.warn('aquarium3d: disposing the scene failed', error)
          }
        }
      }, [])

      React.useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            props.onClose()
          }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => { window.removeEventListener('keydown', onKeyDown) }
      }, [props.onClose])

      return h('div', { className: 'aq-stage' },
        h('canvas', { key: 'canvas', ref: canvasRef }),
        status === 'loading' ? h('p', { key: 'note', className: 'aq-note' }, t('loading')) : null,
        status === 'failed' ? h('p', { key: 'note', className: 'aq-note failed' }, t('failed')) : null,
        status === 'ready' ? h('p', { key: 'hint', className: 'aq-hint' }, t('hint')) : null,
        stage !== null ? h(AquariumPanel, { key: 'panel', stage, t }) : null,
        h('button', {
          key: 'close',
          type: 'button',
          className: 'aq-close',
          onClick: props.onClose,
          'aria-label': t('exit'),
        }, t('exit')),
      )
    }

    /** One labelled slider row. */
    function PanelSlider(props) {
      return h('label', { className: 'aq-row' },
        h('span', { className: 'aq-label' }, props.label),
        h('input', {
          type: 'range',
          min: props.min,
          max: props.max,
          step: props.step ?? 0.01,
          value: props.value,
          onChange: (event) => { props.onChange(Number(event.target.value)) },
        }),
        h('span', { className: 'aq-value' }, props.format === undefined ? props.value.toFixed(2) : props.format(props.value)),
      )
    }

    /** The tank controls: every value here is owned by the stage. */
    function AquariumPanel(props) {
      const stage = props.stage
      const t = props.t
      const [open, setOpen] = React.useState(true)
      const [values, setValues] = React.useState(() => ({ ...stage.settings }))
      const update = React.useCallback((key, value) => {
        stage.setSetting(key, value)
        // The stage may adjust more than the key it was given (quality moves the
        // fish count), so the panel re-reads the whole settings object.
        setValues({ ...stage.settings })
      }, [stage])
      if (!open) {
        return h('button', {
          type: 'button',
          className: 'aq-panel-toggle',
          onClick: () => { setOpen(true) },
        }, t('panelOpen'))
      }
      const qualityLabels = { high: t('qualityHigh'), medium: t('qualityMedium'), low: t('qualityLow') }
      return h('section', { className: 'aq-panel' },
        h('header', { className: 'aq-panel-head' },
          h('span', null, t('panelTitle')),
          h('button', { type: 'button', className: 'aq-panel-fold', onClick: () => { setOpen(false) } }, t('panelClose')),
        ),
        h(PanelSlider, {
          label: t('hood'), min: 0, max: 2, value: values.hood,
          onChange: (value) => { update('hood', value) },
        }),
        h(PanelSlider, {
          label: t('waterLevel'), min: 0.15, max: 0.95, value: values.waterLevel,
          format: (value) => `${value.toFixed(2)} m`,
          onChange: (value) => { update('waterLevel', value) },
        }),
        h(PanelSlider, {
          label: t('wind'), min: 0, max: 1, value: values.wind,
          onChange: (value) => { update('wind', value) },
        }),
        h(PanelSlider, {
          label: t('caustics'), min: 0, max: 2, value: values.caustics,
          onChange: (value) => { update('caustics', value) },
        }),
        h(PanelSlider, {
          label: t('reflection'), min: 0, max: 2, value: values.reflection,
          onChange: (value) => { update('reflection', value) },
        }),
        h(PanelSlider, {
          label: t('refraction'), min: 0, max: 1.4, value: values.refraction,
          onChange: (value) => { update('refraction', value) },
        }),
        h(PanelSlider, {
          label: t('glass'), min: 0, max: 0.12, step: 0.005, value: values.glassThickness,
          format: (value) => `${(value * 100).toFixed(1)} cm`,
          onChange: (value) => { update('glassThickness', value) },
        }),
        h(PanelSlider, {
          label: t('bubbles'), min: 0, max: 1.5, value: values.bubbles,
          onChange: (value) => { update('bubbles', value) },
        }),
        h('div', { className: 'aq-row aq-row-actions' },
          h('button', {
            type: 'button',
            className: 'aq-action',
            onClick: () => { stage.feedAt(window.innerWidth * 0.5, window.innerHeight * 0.5) },
          }, t('feed')),
          h('label', { className: 'aq-check' },
            h('input', {
              type: 'checkbox',
              checked: values.post,
              onChange: (event) => { update('post', event.target.checked) },
            }),
            t('post'),
          ),
        ),
        h('div', { className: 'aq-row aq-row-quality' },
          h('span', { className: 'aq-label' }, t('quality')),
          h('div', { className: 'aq-segmented' },
            ['high', 'medium', 'low'].map((tier) => h('button', {
              key: tier,
              type: 'button',
              className: values.quality === tier ? 'aq-seg on' : 'aq-seg',
              onClick: () => { update('quality', tier) },
            }, qualityLabels[tier])),
          ),
        ),
        h('p', { className: 'aq-panel-note' }, t('panelNote')),
      )
    }

    /**
     * The shell.overlay entry: the stage, mounted only while it is open.
     *
     * There is deliberately no button of this plugin's own. The only way in is a
     * caller of the `aquarium3d` service — today the desktop pet's 小游戏 menu —
     * so nothing floats over the window until someone asks for the tank.
     */
    function AquariumOverlay(props) {
      const open = React.useSyncExternalStore(subscribeAquarium, aquariumIsOpen)
      const close = React.useCallback(() => { setAquariumOpen(false) }, [])
      if (!open) return null
      return h(AquariumStage, { t: props.t, onClose: close })
    }

    // ---- plugin -----------------------------------------------------------

    /** The control object every caller of the service shares. */
    const control = {
      open: () => { setAquariumOpen(true) },
      close: () => { setAquariumOpen(false) },
      toggle: () => { setAquariumOpen(!aquariumOpen) },
      isOpen: aquariumIsOpen,
      subscribe: subscribeAquarium,
    }

    const plugin = {
      name: 'aquarium3d-client',
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'aquarium3d: dictionaries')
        ctx.effect(() => {
          injectStyles()
          return () => {}
        }, 'aquarium3d: stylesheet')
        // The way in: the desktop pet's 小游戏 menu asks for this service instead
        // of reaching into the overlay's DOM, and a profile without this plugin
        // simply has no such service.
        ctx.effect(() => {
          const stop = ctx.reflect.provide('aquarium3d', control)
          // Development handle, the same kind the scene module publishes as
          // `window.__AQUARIUM__`: the screenshot loop opens the overlay through
          // the exact object the pet's menu reaches over the service.
          window.__AQUARIUM_UI__ = control
          return () => {
            stop()
            if (window.__AQUARIUM_UI__ === control) delete window.__AQUARIUM_UI__
          }
        }, 'aquarium3d: overlay control')
        ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'aquarium3d',
          order: 320,
          locale: NS,
        }, AquariumOverlay)), 'aquarium3d: shell overlay entry')
      },
    }

    module.exports = plugin
    return module.exports
  },
})
