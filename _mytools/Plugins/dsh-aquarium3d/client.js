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
      hint: '拖拽环视 · 滚轮缩放 · 按 Esc 关闭',
    }

    const en = {
      exit: 'Close the glass aquarium',
      loading: 'Filling with water…',
      failed: 'The 3D scene failed to load',
      hint: 'Drag to look · Scroll to zoom · Esc to close',
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

    /** The fullscreen stage: owns the canvas, the scene lifecycle, and Esc. */
    function AquariumStage(props) {
      const t = props.t
      const canvasRef = React.useRef(null)
      const [status, setStatus] = React.useState('loading')

      React.useEffect(() => {
        let disposed = false
        let controller = null
        loadSceneModule().then((scene) => {
          if (disposed) return
          controller = scene.mount(canvasRef.current)
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
        h('button', {
          key: 'close',
          type: 'button',
          className: 'aq-close',
          onClick: props.onClose,
          'aria-label': t('exit'),
        }, t('exit')),
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
