/**
 * Whale-girl companion client bundle.
 *
 * This plain browser bundle stays installable as an out-of-tree DSH plugin.
 * It does not request Electron IPC: the public client-plugin API exposes no
 * native-window control, so the pet remains inside the DSH application window.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-little-icon',
  factory: (require) => {
    'use strict'
    const React = require('react')
    const h = React.createElement
    const NS = 'littleIcon'
    const POSITION_KEY = 'dsh.little-icon.position.v1'
    const ROUTE_PREFIX = '/api/little-icon/'
    const PET_WIDTH = 96
    const PET_HEIGHT = 144
    const EDGE_GAP = 8

    const zh = Object.freeze({
      label: '鲸鱼娘桌宠',
      idle: '待机中',
      bored: '无聊中',
      sleeping: '打盹中',
      happy: '开心',
      working: '干活中',
      peeking: '偷偷看一眼',
      greet: '和鲸鱼娘打招呼',
      drag: '按住并拖动鲸鱼娘',
    })
    const en = Object.freeze({
      label: 'Whale-girl companion',
      idle: 'Idle',
      bored: 'Bored',
      sleeping: 'Napping',
      happy: 'Happy',
      working: 'Working',
      peeking: 'Peeking',
      greet: 'Greet the whale-girl companion',
      drag: 'Hold and drag the whale-girl companion',
    })

    function clamp(value, low, high) {
      return Math.max(low, Math.min(high, value))
    }

    function viewport() {
      return {
        width: Number.isFinite(window.innerWidth) ? window.innerWidth : 1280,
        height: Number.isFinite(window.innerHeight) ? window.innerHeight : 720,
      }
    }

    function clampPosition(position) {
      const size = viewport()
      return {
        x: clamp(position.x, EDGE_GAP, Math.max(EDGE_GAP, size.width - PET_WIDTH - EDGE_GAP)),
        y: clamp(position.y, EDGE_GAP, Math.max(EDGE_GAP, size.height - PET_HEIGHT - EDGE_GAP)),
      }
    }

    function defaultPosition() {
      const size = viewport()
      return clampPosition({ x: size.width - PET_WIDTH - EDGE_GAP, y: Math.round((size.height - PET_HEIGHT) / 2) })
    }

    function loadPosition() {
      try {
        const raw = localStorage.getItem(POSITION_KEY)
        if (raw !== null) {
          const parsed = JSON.parse(raw)
          if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) return clampPosition(parsed)
        }
      } catch {
        // A corrupt browser-local preference only resets the pet position.
      }
      return defaultPosition()
    }

    function savePosition(position) {
      try { localStorage.setItem(POSITION_KEY, JSON.stringify(position)) } catch {
        // Private browsing or quota failures leave the current drag position usable.
      }
    }

    /** Small observable state machine, independent from React rendering. */
    function createPetController(clock = () => Date.now()) {
      let state = 'idle'
      let busy = false
      let lastActivity = clock()
      let sequence = 0
      let timer = null
      const listeners = new Set()
      const publish = (next) => {
        if (state === next) return
        state = next
        for (const listener of listeners) listener(state)
      }
      const scheduleIdle = (delay) => {
        if (timer !== null) clearTimeout(timer)
        const current = ++sequence
        timer = setTimeout(() => {
          if (!busy && current === sequence) publish('idle')
        }, delay)
      }
      const wake = () => {
        lastActivity = clock()
        if (!busy) {
          publish('happy')
          scheduleIdle(2_400)
        }
      }
      const tick = () => {
        if (busy) return
        const inactiveFor = clock() - lastActivity
        if (inactiveFor >= 60_000) publish('sleeping')
        else if (inactiveFor >= 30_000 && state === 'bored') publish('peeking')
        else if (inactiveFor >= 8_000 && state === 'idle') publish('bored')
      }
      return {
        getSnapshot: () => state,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
        setBusy(next) {
          if (busy === next) return
          busy = next
          lastActivity = clock()
          if (busy) {
            if (timer !== null) clearTimeout(timer)
            timer = null
            ++sequence
            publish('working')
          } else wake()
        },
        greet: wake,
        tick,
        dispose() { if (timer !== null) clearTimeout(timer); listeners.clear() },
      }
    }

    function injectStyles() {
      if (document.getElementById('dsh-little-icon-style') !== null) return () => {}
      const style = document.createElement('style')
      style.id = 'dsh-little-icon-style'
      style.textContent = [
        '.dli-pet{position:fixed;z-index:1350;width:96px;height:144px;touch-action:none;user-select:none;opacity:.42;transition:opacity .18s ease,filter .18s ease,transform .18s ease;}',
        '.dli-pet:hover,.dli-pet:focus-within{opacity:1;filter:drop-shadow(0 4px 8px color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,transparent));transform:scale(1.06);}',
        '.dli-button{display:block;width:100%;height:100%;padding:0;border:0;background:transparent;cursor:grab;touch-action:none;}',
        '.dli-button:active{cursor:grabbing;}',
        '.dli-image{display:block;width:100%;height:100%;background-repeat:no-repeat;background-size:300% 200%;image-rendering:pixelated;pointer-events:none;animation:dli-sprite 1s steps(1,end) infinite;}',
        '@keyframes dli-sprite{0%,16.66%{background-position:0 0}16.67%,33.32%{background-position:50% 0}33.33%,49.98%{background-position:100% 0}49.99%,66.64%{background-position:0 100%}66.65%,83.3%{background-position:50% 100%}83.31%,100%{background-position:100% 100%}}',
      ].join('')
      document.head.appendChild(style)
      return () => style.remove()
    }

    function hasRunningSession(snapshot) {
      const byId = snapshot?.byId
      if (byId === undefined || byId === null) return false
      return Object.values(byId).some((session) => session?.running === true)
    }

    function PetOverlay({ controller, t }) {
      const [state, setState] = React.useState(() => controller.getSnapshot())
      const [position, setPosition] = React.useState(loadPosition)
      const drag = React.useRef(null)
      React.useEffect(() => controller.subscribe(setState), [controller])
      React.useEffect(() => {
        const onActivity = () => controller.greet()
        const onResize = () => setPosition((value) => clampPosition(value))
        const interval = setInterval(() => controller.tick(), 1_000)
        window.addEventListener('keydown', onActivity)
        window.addEventListener('pointerdown', onActivity)
        window.addEventListener('resize', onResize)
        return () => {
          clearInterval(interval)
          window.removeEventListener('keydown', onActivity)
          window.removeEventListener('pointerdown', onActivity)
          window.removeEventListener('resize', onResize)
        }
      }, [controller])
      const move = (event) => {
        const active = drag.current
        if (active === null || active.pointerId !== event.pointerId) return
        const dx = event.clientX - active.startX
        const dy = event.clientY - active.startY
        if (Math.abs(dx) + Math.abs(dy) > 5) active.moved = true
        setPosition(clampPosition({ x: active.origin.x + dx, y: active.origin.y + dy }))
      }
      const release = (event) => {
        const active = drag.current
        if (active === null || active.pointerId !== event.pointerId) return
        drag.current = null
        const next = clampPosition({ x: active.origin.x + event.clientX - active.startX, y: active.origin.y + event.clientY - active.startY })
        setPosition(next)
        savePosition(next)
        if (!active.moved) controller.greet()
      }
      return h('div', { className: 'dli-pet', style: { left: position.x + 'px', top: position.y + 'px' } },
        h('button', {
          type: 'button', className: 'dli-button', title: `${t('label')} · ${t(state)}`,
          'aria-label': `${t('greet')} · ${t(state)}`,
          onPointerDown: (event) => {
            if (event.button !== 0) return
            event.currentTarget.setPointerCapture?.(event.pointerId)
            drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: position, moved: false }
          },
          onPointerMove: move,
          onPointerUp: release,
          onPointerCancel: release,
        }, h('span', {
          className: 'dli-image', 'aria-hidden': true,
          style: { backgroundImage: `url("${ROUTE_PREFIX}${state}.png")` },
        })),
      )
    }

    const plugin = {
      name: 'little-icon-client',
      inject: ['slots', 'locale'],
      apply(ctx) {
        const controller = createPetController()
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'little-icon: dictionaries')
        ctx.effect(injectStyles, 'little-icon: stylesheet')
        ctx.inject(['sessions'], (sessionCtx) => {
          const list = sessionCtx.sessions.list
          const update = () => controller.setBusy(hasRunningSession(list.getSnapshot()))
          const unsubscribe = list.subscribe(update)
          update()
          ctx.effect(() => unsubscribe, 'little-icon: session activity')
        })
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay', id: 'little-icon', order: 320, locale: NS,
        }, (props) => h(PetOverlay, { ...props, controller, t }))), 'little-icon: shell overlay entry')
        ctx.effect(() => () => controller.dispose(), 'little-icon: controller')
      },
    }
    plugin.__internals = { PET_WIDTH, PET_HEIGHT, clampPosition, createPetController, hasRunningSession }
    return plugin
  },
})
