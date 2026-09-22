/**
 * DSH fish tank — browser half (hand-built lazy-CJS bundle, no build step).
 *
 * The module system executes this file, which registers the bundle factory
 * through window.__ModuleLoader__.load. The factory requires only the
 * platform-table react module and contributes one `shell.overlay` entry: a
 * floating pixel-fish button on the right edge that toggles a fullscreen
 * aquarium. The aquarium is one canvas driven by requestAnimationFrame with
 * deltaTime, a plugin-owned small engine (fish AI, pellets, bubbles,
 * seaweed, corals, light rays), a translucent pixel-styled action panel
 * (feed / blow bubbles), and localStorage persistence of the tank.
 *
 * The background is the concept image served by the host half at
 * /api/fish-tank/background; when that route is absent the engine draws a
 * procedural gradient seabed instead, so the plugin degrades gracefully.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-fish-tank',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const h = React.createElement

    const NS = 'fishTank'
    const BACKGROUND_URL = '/api/fish-tank/background'
    const STORAGE_KEY = 'dsh.fish-tank.v1'

    // ---- locale -----------------------------------------------------------

    const zh = {
      enter: '进入海底世界',
      exit: '退出海底世界',
      feed: '投喂',
      bubbles: '吹泡泡',
      fish: '条鱼',
      fed: '累计吃掉',
    }

    const en = {
      enter: 'Enter the aquarium',
      exit: 'Leave the aquarium',
      feed: 'Feed',
      bubbles: 'Bubbles',
      fish: 'fish',
      fed: 'pellets eaten',
    }

    // ---- pixel sprites ----------------------------------------------------
    //
    // Two 20x9 body grids shared by four species through palettes (columns
    // 0-2 stay empty: the tail is drawn there as a separate pass shifted up
    // and down for the wag animation). Chars: '.' transparent; body/band/
    // marking colors per palette; 'e' eye white, 'p' pupil, 't' tail.

    const GRID_W = 20
    const GRID_H = 9
    const TAIL_MAP = ['.kk.', 'tttt', 'tttt', 'tttt', '.kk.']

    const STRIPED_MAP = [
      '.........kkkk.......',
      '.......kkooookk.....',
      '.....kkoowwoooook...',
      '....koowwwooooooee..',
      '...koowwwooooooooep.',
      '....koowwwooooooke..',
      '.....kkoowwoooook...',
      '.......kkooookk.....',
      '.........kkkk.......',
    ]

    const BELLY_MAP = [
      '.........kkkk.......',
      '.......kkbbbbkk.....',
      '.....kkbbsbbsbbbk...',
      '....kbbsbbsbbbbeep..',
      '...kbbsbbsbbbbbbeep.',
      '....kbbsbbsbbbbbk...',
      '.....kkbbsbbsbbbk...',
      '.......kkbbbbkk.....',
      '.........kkkk.......',
    ]

    /** Species table: palette chars cover body, band/belly, trim, eye, tail. */
    const SPECIES = {
      clownfish: {
        id: 'clownfish', map: STRIPED_MAP, scale: 3,
        palette: { o: '#f97b21', w: '#ffedd5', k: '#173042', e: '#f8fafc', p: '#0b1220', t: '#f97b21' },
        cruise: 58, seek: 170, flee: 290,
      },
      blueTang: {
        id: 'blueTang', map: BELLY_MAP, scale: 4,
        palette: { b: '#2563eb', s: '#60a5fa', k: '#111827', e: '#f8fafc', p: '#111827', t: '#facc15' },
        cruise: 46, seek: 150, flee: 260,
      },
      pinkFairy: {
        id: 'pinkFairy', map: BELLY_MAP, scale: 3,
        palette: { b: '#ec4899', s: '#f9a8d4', k: '#7c3aed', e: '#fdf4ff', p: '#3b0764', t: '#c084fc' },
        cruise: 64, seek: 185, flee: 300,
      },
      yellowTang: {
        id: 'yellowTang', map: STRIPED_MAP, scale: 3,
        palette: { o: '#facc15', w: '#fde047', k: '#b45309', e: '#fffbeb', p: '#78350f', t: '#f59e0b' },
        cruise: 52, seek: 160, flee: 270,
      },
    }

    const SPECIES_IDS = Object.keys(SPECIES)
    const DEFAULT_POPULATION = ['clownfish', 'clownfish', 'blueTang', 'pinkFairy', 'yellowTang']

    /** Rendered-sprite cache: `${species}:${wag}:${scale}` -> canvas. */
    const spriteCache = new Map()

    /**
     * Build one sprite frame onto an offscreen canvas.
     * @param species - the SPECIES entry to draw.
     * @param wag - tail vertical offset in sprite pixels (-1 | 0 | 1).
     * @param scale - sprite pixel size in canvas pixels.
     * @returns the offscreen canvas holding the frame.
     */
    function buildSprite(species, wag, scale) {
      const canvas = document.createElement('canvas')
      canvas.width = GRID_W * scale
      canvas.height = GRID_H * scale
      const g = canvas.getContext('2d')
      const tailY = Math.floor(GRID_H / 2) - Math.floor(TAIL_MAP.length / 2)
      const cell = (ch, x, y) => {
        if (ch === undefined || ch === '.') return
        const color = species.palette[ch]
        if (color === undefined) return
        g.fillStyle = color
        g.fillRect(x * scale, y * scale, scale, scale)
      }
      for (let y = 0; y < species.map.length; y += 1) {
        const row = species.map[y].padEnd(GRID_W, '.')
        for (let x = 3; x < GRID_W; x += 1) cell(row[x], x, y)
      }
      for (let y = 0; y < TAIL_MAP.length; y += 1) {
        for (let x = 0; x < 4; x += 1) cell(TAIL_MAP[y][x], x, y + tailY + wag)
      }
      return canvas
    }

    /**
     * Get (and cache) one sprite frame.
     * @param id - species id.
     * @param wag - tail offset (-1 | 0 | 1).
     * @param scale - sprite pixel size in canvas pixels.
     * @returns the cached offscreen canvas.
     */
    function getSprite(id, wag, scale) {
      const key = id + ':' + wag + ':' + scale
      let sprite = spriteCache.get(key)
      if (sprite === undefined) {
        sprite = buildSprite(SPECIES[id], wag, scale)
        spriteCache.set(key, sprite)
      }
      return sprite
    }

    /** Draw the entry-button icon (a resting clownfish at 2x). */
    function drawFishIcon(canvas) {
      const g = canvas.getContext('2d')
      g.imageSmoothingEnabled = false
      g.clearRect(0, 0, canvas.width, canvas.height)
      g.drawImage(getSprite('clownfish', 0, 2), 0, 0)
    }

    // ---- engine -----------------------------------------------------------

    const SURFACE_Y = 30
    const SAND_H = 30
    const EDGE = 26
    const SENSE_R = 300
    const FLEE_R = 150
    const EAT_R = 16
    const MAX_FISH = 12
    const MAX_PELLETS = 50
    const MAX_BUBBLES = 130
    const MAX_PARTICLES = 240

    const rand = (a, b) => a + Math.random() * (b - a)
    const pick = (list) => list[(Math.random() * list.length) | 0]
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value))
    const clamp01 = (value) => clamp(value, 0, 1)
    const dist2 = (x1, y1, x2, y2) => (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2)

    const CORAL_COLORS = [
      { dark: '#8e365f', bright: '#f472b6' },
      { dark: '#5d3a91', bright: '#c084fc' },
      { dark: '#9a5018', bright: '#fb923c' },
    ]

    /**
     * Create the aquarium engine bound to one canvas.
     * @param options
     * @param options.canvas - the canvas to draw on (sized via resize()).
     * @param options.onStatus - optional callback for {fish, fed} snapshots.
     * @returns the engine handle: start, dispose, resize, setBackground,
     * feed, blow, poke, save, stats, snapshot.
     */
    function createEngine({ canvas, onStatus }) {
      const ctx = canvas.getContext('2d')
      let width = 800
      let height = 600
      let dpr = 1
      let running = false
      let rafId = 0
      let lastTs = -1
      let elapsed = 0
      let saveAcc = 0
      let statusAcc = 0
      let ambientBubbleAt = 0
      let background = null
      let fed = 0
      let lastStatus = { fish: -1, fed: -1 }

      const fish = []
      const pellets = []
      const bubbles = []
      const particles = []

      // Scenery is seeded once in fractional coordinates so every resize
      // re-places it without regenerating the scene.
      const rays = [0.14, 0.36, 0.6, 0.84].map((fx) => ({
        fx, phase: rand(0, Math.PI * 2), top: rand(26, 55), drift: rand(18, 42),
      }))
      const weeds = []
      for (let i = 0; i < 6; i += 1) {
        weeds.push({ far: true, fx: rand(0.06, 0.94), segs: 6 + (i % 3), segH: 11, amp: rand(5, 11), speed: rand(0.5, 1.0), phase: rand(0, Math.PI * 2) })
      }
      for (let i = 0; i < 3; i += 1) {
        weeds.push({ far: false, fx: rand(0.02, 0.1), segs: 7 + (i % 2), segH: 13, amp: rand(7, 13), speed: rand(0.6, 1.1), phase: rand(0, Math.PI * 2) })
        weeds.push({ far: false, fx: rand(0.9, 0.98), segs: 7 + (i % 2), segH: 13, amp: rand(7, 13), speed: rand(0.6, 1.1), phase: rand(0, Math.PI * 2) })
      }
      const corals = []
      for (let i = 0; i < 6; i += 1) {
        corals.push({ fx: rand(0.08, 0.92), size: rand(18, 34), phase: rand(0, Math.PI * 2), ...pick(CORAL_COLORS) })
      }
      const speckles = []
      for (let i = 0; i < 44; i += 1) {
        speckles.push({ fx: Math.random(), fy: Math.random(), s: Math.random() < 0.6 ? 1 : 2, c: Math.random() < 0.5 ? '#1d466b' : '#24507d' })
      }

      const floorY = () => height - SAND_H - 6

      /**
       * Restore the tank from localStorage, or seed the default population.
       * A `v: 1` payload holds {fed, fish: [{sp, fx, fy, dir, sat}]}; anything
       * unparsable or empty starts a fresh default tank.
       */
      function loadState() {
        let restored = null
        try {
          const raw = localStorage.getItem(STORAGE_KEY)
          if (raw !== null) restored = JSON.parse(raw)
        } catch {
          // unparsable payload: start fresh rather than crash the tank
          restored = null
        }
        const usable = restored !== null && typeof restored === 'object'
          && Array.isArray(restored.fish) && restored.fish.length > 0
        fed = usable && Number.isFinite(restored.fed) ? clamp(Math.round(restored.fed), 0, 999999) : 0
        const list = usable ? restored.fish.slice(0, MAX_FISH) : DEFAULT_POPULATION.slice()
        for (const item of list) {
          const asObject = typeof item === 'object' && item !== null ? item : null
          const sp = asObject !== null
            ? (SPECIES[item.sp] !== undefined ? item.sp : 'clownfish')
            : (SPECIES[item] !== undefined ? item : 'clownfish')
          const fx = asObject !== null && Number.isFinite(asObject.fx) ? clamp01(asObject.fx) : Math.random()
          const fy = asObject !== null && Number.isFinite(asObject.fy) ? clamp01(asObject.fy) : rand(0.25, 0.7)
          const dir = asObject !== null && asObject.dir === -1 ? -1 : 1
          const sat = asObject !== null && Number.isFinite(asObject.sat) ? clamp(Math.round(asObject.sat), 0, 9) : 0
          spawnFish(sp, fx * width, fy * height, dir, sat)
        }
      }

      /** Persist the tank (fractional positions survive resolution changes). */
      function save() {
        try {
          const payload = {
            v: 1,
            fed,
            fish: fish.map((f) => ({
              sp: f.sp, fx: clamp01(f.x / width), fy: clamp01(f.y / height), dir: f.dir, sat: f.sat,
            })),
          }
          localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
        } catch {
          // storage unavailable (private mode / quota): the tank starts fresh next time
        }
      }

      function spawnFish(sp, x, y, dir, sat) {
        fish.push({
          sp,
          x: clamp(x, EDGE, width - EDGE),
          y: clamp(y, SURFACE_Y + 24, floorY() - 10),
          vx: rand(-22, 22), vy: rand(-6, 6),
          dir,
          targetX: rand(EDGE + 40, width - EDGE - 40),
          targetY: rand(SURFACE_Y + 40, floorY() - 30),
          retargetAt: rand(3, 8),
          state: 'wander', fleeUntil: 0, fleeX: 0, fleeY: 0,
          wag: rand(0, Math.PI * 2), bob: rand(0, Math.PI * 2),
          sat,
        })
      }

      /** Nearest pellet within sense range, or null. */
      function nearestPellet(f) {
        let best = null
        let bestD = SENSE_R * SENSE_R
        for (const p of pellets) {
          if (p.landed) continue
          const d = dist2(f.x, f.y, p.x, p.y)
          if (d < bestD) { bestD = d; best = p }
        }
        return best
      }

      /** Spawn `n` crumb particles (eat burst, pop sparkle). */
      function burst(x, y, color, n) {
        for (let i = 0; i < n; i += 1) {
          if (particles.length >= MAX_PARTICLES) return
          particles.push({
            kind: 'px', x, y, vx: rand(-42, 42), vy: rand(-52, 10),
            life: rand(0.4, 0.8), max: 0.8, color, size: Math.random() < 0.5 ? 2 : 3,
          })
        }
      }

      /** Spawn one expanding pop ring. */
      function ring(x, y, r, sparkle) {
        if (particles.length >= MAX_PARTICLES) return
        particles.push({
          kind: 'ring', x, y, r, life: 0.38, max: 0.38,
          color: sparkle ? 'rgba(215,245,255,0.9)' : 'rgba(170,225,250,0.8)',
        })
      }

      function makeBubble(x, y, r, vy, sway, sparkle) {
        return { x, y, r, vy, sway, phase: rand(0, Math.PI * 2), sparkle }
      }

      /**
       * Advance one fish: state selection (flee > seek > wander), steering,
       * bounds, facing, tail/bob phases, eating.
       */
      function stepFish(f, dt) {
        const def = SPECIES[f.sp]
        let tx = f.targetX
        let ty = f.targetY
        let maxSpeed = def.cruise

        if (elapsed < f.fleeUntil) {
          tx = f.fleeX
          ty = f.fleeY
          maxSpeed = def.flee
        } else {
          const target = nearestPellet(f)
          if (target !== null) {
            f.state = 'seek'
            tx = target.x
            ty = target.y
            maxSpeed = def.seek
          } else {
            if (f.state !== 'wander') {
              f.state = 'wander'
              f.retargetAt = elapsed + rand(2, 6)
            }
            if (elapsed > f.retargetAt || dist2(f.x, f.y, f.targetX, f.targetY) < 24 * 24) {
              f.targetX = rand(EDGE + 40, width - EDGE - 40)
              f.targetY = rand(SURFACE_Y + 36, floorY() - 26)
              f.retargetAt = elapsed + rand(3, 9)
            }
            tx = f.targetX
            ty = f.targetY
          }
        }

        tx = clamp(tx, EDGE, width - EDGE)
        ty = clamp(ty, SURFACE_Y + 16, floorY() - 8)
        const dx = tx - f.x
        const dy = ty - f.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const desired = Math.min(maxSpeed, d * 2.4)
        const approach = Math.min(1, dt * 3.2)
        f.vx += (dx / d * desired - f.vx) * approach
        f.vy += (dy / d * desired - f.vy) * approach
        // fish pitch gently: vertical motion decays a little faster
        f.vy *= 1 - Math.min(1, dt * 0.4)
        f.x += f.vx * dt
        f.y += f.vy * dt

        if (f.x < EDGE) { f.x = EDGE; f.vx = Math.abs(f.vx) }
        if (f.x > width - EDGE) { f.x = width - EDGE; f.vx = -Math.abs(f.vx) }
        const yMin = SURFACE_Y + 14
        const yMax = floorY() - 6
        if (f.y < yMin) { f.y = yMin; f.vy = Math.abs(f.vy) }
        if (f.y > yMax) { f.y = yMax; f.vy = -Math.abs(f.vy) }

        const speed = Math.sqrt(f.vx * f.vx + f.vy * f.vy)
        if (f.vx > 14) f.dir = 1
        else if (f.vx < -14) f.dir = -1
        f.wag += dt * (2.6 + speed * 0.045)
        f.bob += dt * 1.7

        if (f.state === 'seek') {
          for (let i = pellets.length - 1; i >= 0; i -= 1) {
            const p = pellets[i]
            if (dist2(f.x, f.y, p.x, p.y) < EAT_R * EAT_R) {
              pellets.splice(i, 1)
              fed += 1
              f.sat = Math.min(9, f.sat + 1)
              burst(p.x, p.y, '#ffd27d', 6)
              statusAcc = 999
              break
            }
          }
        }
      }

      /** Advance pellets: sink with water drag, land on the sand, dissolve. */
      function stepPellets(dt) {
        for (let i = pellets.length - 1; i >= 0; i -= 1) {
          const p = pellets[i]
          if (p.landed) {
            if (elapsed - p.landAt > 16) pellets.splice(i, 1)
            continue
          }
          p.vy = Math.min(p.vy + 46 * dt, 40)
          p.y += p.vy * dt
          p.x += Math.sin(elapsed * 2.1 + p.phase) * 9 * dt
          if (p.y >= floorY()) { p.y = floorY(); p.landed = true; p.landAt = elapsed }
        }
      }

      /** Advance bubbles: wavy rise, pop into rings at the surface. */
      function stepBubbles(dt) {
        for (let i = bubbles.length - 1; i >= 0; i -= 1) {
          const b = bubbles[i]
          b.y += b.vy * dt
          b.x += Math.sin(elapsed * 1.7 + b.phase) * b.sway * dt
          if (b.y <= SURFACE_Y + b.r) {
            bubbles.splice(i, 1)
            ring(b.x, SURFACE_Y + b.r, b.r + 3, b.sparkle)
          }
        }
        if (elapsed > ambientBubbleAt) {
          ambientBubbleAt = elapsed + rand(0.5, 1.4)
          if (bubbles.length < MAX_BUBBLES) {
            bubbles.push(makeBubble(rand(EDGE, width - EDGE), floorY() + rand(-4, 8), rand(2, 4.5), -rand(14, 26), rand(4, 10), false))
          }
        }
      }

      /** Advance particles: crumbs fall, rings expand, both fade out. */
      function stepParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i -= 1) {
          const p = particles[i]
          p.life -= dt
          if (p.life <= 0) { particles.splice(i, 1); continue }
          if (p.kind === 'px') {
            p.vy += 26 * dt
            p.x += p.vx * dt
            p.y += p.vy * dt
          } else {
            p.r += 44 * dt
          }
        }
      }

      function step(dt) {
        for (const f of fish) stepFish(f, dt)
        stepPellets(dt)
        stepBubbles(dt)
        stepParticles(dt)
      }

      // ---- drawing ---------------------------------------------------------

      function drawWeeds(far) {
        const base = height - SAND_H + (far ? 4 : 8)
        for (const blade of weeds) {
          if (blade.far !== far) continue
          const x0 = blade.fx * width
          for (let i = 0; i < blade.segs; i += 1) {
            const sway = Math.sin(elapsed * blade.speed + blade.phase + i * 0.55) * blade.amp * (i / blade.segs)
            const segW = Math.max(2, 7 - i)
            ctx.fillStyle = far ? (i % 2 === 0 ? '#0d5a50' : '#12706a') : (i % 2 === 0 ? '#149d82' : '#1fbfa0')
            ctx.globalAlpha = far ? 0.75 : 1
            ctx.fillRect(Math.round(x0 + sway - segW / 2), Math.round(base - (i + 1) * blade.segH), segW, blade.segH + 2)
          }
        }
        ctx.globalAlpha = 1
      }

      function drawFloor() {
        const sandY = height - SAND_H
        ctx.fillStyle = '#123252'
        ctx.fillRect(0, sandY, width, SAND_H)
        ctx.fillStyle = '#1c4468'
        ctx.fillRect(0, sandY, width, 3)
        for (const s of speckles) {
          ctx.fillStyle = s.c
          ctx.fillRect(Math.round(s.fx * width), Math.round(sandY + 4 + s.fy * (SAND_H - 8)), s.s, s.s)
        }
        for (const coral of corals) {
          const cx = coral.fx * width
          const breathe = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(elapsed * 0.8 + coral.phase))
          const hUnit = Math.max(3, Math.round(coral.size / 5))
          for (let i = 0; i < 4; i += 1) {
            const bw = Math.max(4, coral.size - i * Math.round(coral.size / 5))
            ctx.fillStyle = coral.dark
            ctx.fillRect(Math.round(cx - bw / 2), Math.round(sandY - (i + 1) * hUnit), bw, hUnit + 1)
            ctx.globalAlpha = breathe * 0.5
            ctx.fillStyle = coral.bright
            ctx.fillRect(Math.round(cx - bw / 2) + 1, Math.round(sandY - (i + 1) * hUnit) + 1, Math.max(2, bw - 2), Math.max(1, hUnit - 1))
            ctx.globalAlpha = 1
          }
        }
      }

      function drawRays() {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        const depth = height * 0.75
        for (const ray of rays) {
          const anchor = ray.fx * width + Math.sin(elapsed * 0.14 + ray.phase) * ray.drift
          const alpha = 0.05 + 0.035 * (0.5 + 0.5 * Math.sin(elapsed * 0.3 + ray.phase * 2))
          const grad = ctx.createLinearGradient(0, 0, 0, depth)
          grad.addColorStop(0, 'rgba(190,235,255,' + alpha.toFixed(3) + ')')
          grad.addColorStop(1, 'rgba(190,235,255,0)')
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.moveTo(anchor - ray.top, 0)
          ctx.lineTo(anchor + ray.top, 0)
          ctx.lineTo(anchor + ray.top * 3 + 30, depth)
          ctx.lineTo(anchor - ray.top * 3 - 30, depth)
          ctx.closePath()
          ctx.fill()
        }
        ctx.restore()
      }

      function drawFish(f) {
        const def = SPECIES[f.sp]
        const sin = Math.sin(f.wag)
        const wagState = sin > 0.35 ? 1 : sin < -0.35 ? -1 : 0
        const sprite = getSprite(f.sp, wagState, def.scale)
        ctx.save()
        ctx.translate(Math.round(f.x), Math.round(f.y + Math.sin(f.bob) * 3))
        if (f.dir < 0) ctx.scale(-1, 1)
        ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2)
        ctx.restore()
      }

      function draw() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.imageSmoothingEnabled = false

        if (background !== null && background.naturalWidth > 0) {
          const s = Math.max(width / background.naturalWidth, height / background.naturalHeight)
          const dw = background.naturalWidth * s
          const dh = background.naturalHeight * s
          ctx.drawImage(background, (width - dw) / 2, (height - dh) / 2, dw, dh)
          // tint the photo so drawn entities and UI stay readable on it
          ctx.fillStyle = 'rgba(4,20,40,0.42)'
          ctx.fillRect(0, 0, width, height)
        } else {
          const grad = ctx.createLinearGradient(0, 0, 0, height)
          grad.addColorStop(0, '#0a4d7a')
          grad.addColorStop(0.45, '#073a5e')
          grad.addColorStop(1, '#031c33')
          ctx.fillStyle = grad
          ctx.fillRect(0, 0, width, height)
        }

        drawRays()
        drawWeeds(true)
        drawFloor()

        for (const p of pellets) {
          const fade = p.landed ? Math.max(0, 1 - (elapsed - p.landAt - 14) / 2) : 1
          if (fade <= 0) continue
          ctx.globalAlpha = fade
          ctx.fillStyle = '#8a5a20'
          ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 5, 5)
          ctx.fillStyle = '#ffb84d'
          ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3)
          ctx.globalAlpha = 1
        }

        for (const f of fish) drawFish(f)
        drawWeeds(false)

        for (const b of bubbles) {
          ctx.strokeStyle = b.sparkle ? 'rgba(215,245,255,0.95)' : 'rgba(170,225,250,0.75)'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
          ctx.stroke()
          ctx.fillStyle = 'rgba(255,255,255,0.85)'
          ctx.fillRect(Math.round(b.x - b.r * 0.45), Math.round(b.y - b.r * 0.55), 2, 2)
        }

        for (const p of particles) {
          const a = Math.max(0, p.life / p.max)
          if (p.kind === 'px') {
            ctx.globalAlpha = a
            ctx.fillStyle = p.color
            ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size)
          } else {
            ctx.globalAlpha = a * 0.8
            ctx.strokeStyle = p.color
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
            ctx.stroke()
          }
        }
        ctx.globalAlpha = 1

        ctx.fillStyle = 'rgba(180,230,255,0.22)'
        ctx.fillRect(0, SURFACE_Y - 3, width, 3)
        ctx.fillStyle = 'rgba(140,215,255,0.10)'
        ctx.fillRect(0, SURFACE_Y, width, 4)
      }

      function publishStatus() {
        const next = { fish: fish.length, fed }
        if (next.fish === lastStatus.fish && next.fed === lastStatus.fed) return
        lastStatus = next
        if (typeof onStatus === 'function') onStatus(next)
      }

      function frame(ts) {
        if (!running) return
        if (lastTs < 0) lastTs = ts
        const dt = Math.min(0.05, Math.max(0, (ts - lastTs) / 1000))
        lastTs = ts
        elapsed += dt
        step(dt)
        draw()
        saveAcc += dt
        if (saveAcc >= 5) { saveAcc = 0; save() }
        statusAcc += dt
        if (statusAcc >= 0.5) { statusAcc = 0; publishStatus() }
        rafId = requestAnimationFrame(frame)
      }

      // ---- public handle ---------------------------------------------------

      return {
        /** Begin the animation loop (loads persisted state on first start). */
        start() {
          if (running) return
          if (fish.length === 0) loadState()
          running = true
          lastTs = -1
          rafId = requestAnimationFrame(frame)
        },
        /** Stop the loop and persist the tank. */
        dispose() {
          if (!running) return
          running = false
          cancelAnimationFrame(rafId)
          save()
        },
        /**
         * Size the world (CSS pixels) and the backing store (device pixels).
         * @param w - world width in CSS pixels.
         * @param h - world height in CSS pixels.
         * @param dprValue - device pixel ratio (clamped to 3).
         */
        resize(w, h, dprValue) {
          if (!(w > 0) || !(h > 0)) return
          width = w
          height = h
          dpr = dprValue > 0 ? Math.min(3, dprValue) : 1
          canvas.width = Math.round(width * dpr)
          canvas.height = Math.round(height * dpr)
          for (const f of fish) {
            f.x = clamp(f.x, EDGE, width - EDGE)
            f.y = clamp(f.y, SURFACE_Y + 14, floorY() - 6)
          }
        },
        /** Set the background photo (or null for the gradient seabed). */
        setBackground(image) { background = image },
        /**
         * Scatter food pellets.
         * @param x - spawn center x (undefined: screen-center top).
         * @param y - spawn center y (undefined: below the surface).
         */
        feed(x, y) {
          const cx = x === undefined ? width / 2 : clamp(x, EDGE, width - EDGE)
          const cy = y === undefined ? SURFACE_Y + 40 : clamp(y, SURFACE_Y + 16, floorY() - 30)
          for (let i = 0; i < 6; i += 1) {
            if (pellets.length >= MAX_PELLETS) break
            pellets.push({
              x: clamp(cx + rand(-46, 46), EDGE, width - EDGE),
              y: clamp(cy + rand(-16, 16), SURFACE_Y + 12, floorY() - 40),
              vy: rand(2, 10), phase: rand(0, Math.PI * 2), landed: false, landAt: 0,
            })
          }
        },
        /**
         * Blow a burst of bubbles.
         * @param x - burst center x (undefined: screen-center bottom).
         * @param y - burst center y (undefined: above the sand).
         */
        blow(x, y) {
          const bx = x === undefined ? width / 2 : clamp(x, EDGE, width - EDGE)
          const by = y === undefined ? floorY() - 20 : clamp(y, SURFACE_Y + 40, floorY())
          for (let i = 0; i < 16; i += 1) {
            if (bubbles.length >= MAX_BUBBLES) break
            bubbles.push(makeBubble(
              clamp(bx + rand(-60, 60), EDGE, width - EDGE),
              clamp(by + rand(-14, 10), SURFACE_Y + 30, floorY() + 6),
              rand(2.5, 8.5), -rand(46, 100), rand(8, 26), true,
            ))
          }
        },
        /**
         * Startle fish near a point (a click on the water).
         * @param x - click x.
         * @param y - click y.
         */
        poke(x, y) {
          if (!Number.isFinite(x) || !Number.isFinite(y)) return
          ring(x, y, 6, true)
          for (const f of fish) {
            if (dist2(f.x, f.y, x, y) >= FLEE_R * FLEE_R) continue
            const dx = f.x - x
            const dy = f.y - y
            const d = Math.sqrt(dx * dx + dy * dy) || 1
            f.state = 'flee'
            f.fleeUntil = elapsed + 1.15
            f.fleeX = clamp(f.x + dx / d * 340, EDGE, width - EDGE)
            f.fleeY = clamp(f.y + dy / d * 340, SURFACE_Y + 20, floorY() - 10)
            if (dx > 2) f.dir = 1
            else if (dx < -2) f.dir = -1
          }
        },
        /** Persist now (also automatic every 5 s and on dispose). */
        save,
        /** Live counters: {fish, fed, pellets, bubbles, particles}. */
        stats() {
          return { fish: fish.length, fed, pellets: pellets.length, bubbles: bubbles.length, particles: particles.length }
        },
        /** Fish positions/states (for tests and debugging). */
        snapshot() {
          return fish.map((f) => ({ sp: f.sp, x: f.x, y: f.y, dir: f.dir, state: f.state, sat: f.sat }))
        },
      }
    }

    // ---- styles -----------------------------------------------------------

    const STYLE_CSS = [
      '.dft-game{position:fixed;inset:0;z-index:1400;background:#03101f;overflow:hidden;}',
      '.dft-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:crosshair;}',
      '.dft-panel{position:absolute;right:16px;bottom:18px;display:flex;flex-direction:column;gap:8px;padding:12px;',
      'background:rgba(6,24,46,.62);border:2px solid rgba(80,200,255,.5);',
      'box-shadow:0 0 0 2px rgba(3,12,24,.65),4px 4px 0 2px rgba(2,10,20,.5);backdrop-filter:blur(5px);}',
      '.dft-btn{font-family:ui-monospace,Consolas,monospace;letter-spacing:2px;font-size:13px;color:#cbeeff;',
      'background:rgba(10,44,80,.9);border:2px solid #2fa8e0;',
      'box-shadow:0 0 0 2px #04101d,3px 3px 0 2px rgba(2,10,20,.55);padding:8px 14px;cursor:pointer;',
      'text-shadow:1px 1px 0 #06121f;transition:transform .12s,filter .12s;}',
      '.dft-btn:hover{transform:scale(1.06);filter:brightness(1.2);}',
      '.dft-btn:active{transform:scale(.95);}',
      '.dft-status{font-family:ui-monospace,Consolas,monospace;font-size:11px;letter-spacing:1px;color:#8fd4ff;',
      'text-shadow:1px 1px 0 #06121f;text-align:center;}',
      '.dft-entry{position:fixed;z-index:1500;display:flex;align-items:center;padding:7px 9px;',
      'background:rgba(7,26,48,.88);border:2px solid #37c8ff;',
      'box-shadow:0 0 0 2px #04101d,4px 4px 0 2px rgba(2,10,20,.6);cursor:pointer;image-rendering:pixelated;}',
      '.dft-entry:hover{filter:brightness(1.25);}',
      '.dft-entry:active{filter:brightness(.9);}',
      '.dft-icon{display:block;transform-origin:center;transition:transform .12s;}',
      '.dft-entry:hover .dft-icon{transform:scale(1.15);}',
    ].join('')

    /** Insert the plugin stylesheet once per document. */
    function injectStyles() {
      if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return
      if (document.getElementById('dsh-fish-tank-style') !== null) return
      const tag = document.createElement('style')
      tag.id = 'dsh-fish-tank-style'
      tag.textContent = STYLE_CSS
      document.head.appendChild(tag)
    }

    // ---- components ---------------------------------------------------------

    /** The floating pixel-fish button: entry handle when closed, corner exit when open. */
    function FishButton({ t, open, onClick }) {
      const canvasRef = React.useRef(null)
      React.useEffect(() => {
        if (canvasRef.current !== null) drawFishIcon(canvasRef.current)
      }, [])
      return h('button', {
        type: 'button',
        onClick,
        className: 'dft-entry',
        style: open ? { right: '12px', top: '12px' } : { right: '0px', top: '50%', transform: 'translateY(-50%)' },
        title: open ? t('exit') : t('enter'),
        'aria-label': open ? t('exit') : t('enter'),
      }, h('canvas', { ref: canvasRef, className: 'dft-icon', width: 40, height: 18 }))
    }

    /** The translucent action panel: feed, blow bubbles, tank status. */
    function FishTankPanel({ t, status, onFeed, onBlow }) {
      return h('div', { className: 'dft-panel' },
        h('button', { type: 'button', className: 'dft-btn', onClick: onFeed, 'aria-label': t('feed') }, t('feed')),
        h('button', { type: 'button', className: 'dft-btn', onClick: onBlow, 'aria-label': t('bubbles') }, t('bubbles')),
        h('div', { className: 'dft-status' }, status.fish + ' ' + t('fish') + ' \u00b7 ' + t('fed') + ' ' + status.fed),
      )
    }

    /** The fullscreen aquarium: canvas engine, ESC exit, action panel. */
    function FishTankGame({ t, onClose }) {
      const wrapRef = React.useRef(null)
      const canvasRef = React.useRef(null)
      const engineRef = React.useRef(null)
      const pointerRef = React.useRef(null)
      const [status, setStatus] = React.useState({ fish: 0, fed: 0 })

      React.useEffect(() => {
        const canvas = canvasRef.current
        if (canvas === null) return undefined
        const engine = createEngine({ canvas, onStatus: setStatus })
        engineRef.current = engine

        const image = new Image()
        image.onload = () => { engine.setBackground(image.naturalWidth > 0 ? image : null) }
        image.onerror = () => { engine.setBackground(null) }
        image.src = BACKGROUND_URL

        const applySize = () => {
          const rect = wrapRef.current.getBoundingClientRect()
          engine.resize(rect.width, rect.height, window.devicePixelRatio || 1)
        }
        applySize()
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(applySize) : null
        if (observer !== null) observer.observe(wrapRef.current)

        const onKey = (event) => { if (event.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        engine.start()

        return () => {
          window.removeEventListener('keydown', onKey)
          if (observer !== null) observer.disconnect()
          engine.dispose()
          engineRef.current = null
        }
      }, [])

      const engineAction = (name) => {
        const engine = engineRef.current
        if (engine === null) return
        const point = pointerRef.current
        engine[name](point === null ? undefined : point.x, point === null ? undefined : point.y)
      }

      return h('div', { ref: wrapRef, className: 'dft-game' },
        h('canvas', {
          ref: canvasRef,
          className: 'dft-canvas',
          onPointerMove: (event) => { pointerRef.current = { x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY } },
          onPointerDown: (event) => {
            const engine = engineRef.current
            if (engine !== null) engine.poke(event.nativeEvent.offsetX, event.nativeEvent.offsetY)
          },
        }),
        h(FishTankPanel, {
          t, status,
          onFeed: () => engineAction('feed'),
          onBlow: () => engineAction('blow'),
        }),
      )
    }

    /** The shell.overlay entry: entry button plus the open aquarium. */
    function FishTankEntry(props) {
      const [open, setOpen] = React.useState(false)
      const toggle = () => { setOpen((value) => !value) }
      return h(React.Fragment, null,
        h(FishButton, { key: 'button', t: props.t, open, onClick: toggle }),
        open ? h(FishTankGame, { key: 'game', t: props.t, onClose: () => { setOpen(false) } }) : null,
      )
    }

    // ---- plugin -------------------------------------------------------------

    const plugin = {
      name: 'fish-tank-client',
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'fish-tank: dictionaries')
        ctx.effect(() => {
          injectStyles()
          return () => {}
        }, 'fish-tank: stylesheet')
        ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'fish-tank',
          order: 300,
          locale: NS,
        }, FishTankEntry)), 'fish-tank: shell overlay entry')
      },
    }

    // Engine internals for the keyless smoke test (tests/smoke.mjs); the
    // browser path never touches these.
    plugin.__internals = { createEngine, SPECIES, DEFAULT_POPULATION }
    module.exports = plugin
    return module.exports
  },
})
