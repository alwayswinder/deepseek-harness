/**
 * The fish school.
 *
 * Every fish is procedural: one merged geometry (swept body, fins, eyes) whose
 * colours are vertex data, and one material per fish so the swim wave can run
 * on its own clock. The wave itself is a vertex-shader travelling wave — the
 * body is not skinned and has no bones — and `aBody` (1 at the nose, 0 at the
 * tail) is what decides how much of it each vertex gets.
 *
 * The AI is deliberately cheap: each fish cruises its own ellipse, turns toward
 * whatever it wants (a pellet, away from a splash), and never leaves the glass.
 */
import * as THREE from '../vendor/three.module.js'
import { applyWaterFX } from './fx.js'

/** Species: size in meters, body/fin/belly colours, cruise speed, and appetite. */
const SPECIES = [
  { id: 'neon', length: 0.115, width: 0.020, height: 0.030, back: 0x2a5f9e, belly: 0xdfe9f2, fin: 0x9fd2e8, stripe: 0x63d6ff, speed: 0.16, eager: 1.5 },
  { id: 'ember', length: 0.135, width: 0.026, height: 0.040, back: 0xd97b3a, belly: 0xffe3c2, fin: 0xf2b06a, stripe: 0xfff0d8, speed: 0.13, eager: 1.2 },
  { id: 'silver', length: 0.165, width: 0.028, height: 0.048, back: 0x8d99a6, belly: 0xf2f6f8, fin: 0xb9c6cf, stripe: 0x6f7d8a, speed: 0.11, eager: 1.0 },
  { id: 'jade', length: 0.105, width: 0.022, height: 0.034, back: 0x2f7f5c, belly: 0xe4f4e6, fin: 0x86d6a4, stripe: 0xd8f2c8, speed: 0.18, eager: 1.8 },
]

/** Deterministic pseudo-random in [0,1) so a reload looks the same. */
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** Range helper. */
const range = (n, min, max) => min + (max - min) * hash(n)

/**
 * Build one fish geometry: a swept body, three fins, and two eyes.
 * @param spec - one entry of SPECIES.
 * @returns a geometry carrying position, colour, and `aBody` (1 nose, 0 tail).
 */
function buildFishGeometry(spec) {
  const positions = []
  const colors = []
  const bodies = []
  const indices = []
  const back = new THREE.Color(spec.back)
  const belly = new THREE.Color(spec.belly)
  const fin = new THREE.Color(spec.fin)
  const stripe = new THREE.Color(spec.stripe)
  const color = new THREE.Color()

  /** How thick the body is at `t` (0 tail, 1 nose). */
  const profile = (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.85)
  /** Add one vertex and return its index. */
  const push = (x, y, z, c, body) => {
    positions.push(x, y, z)
    colors.push(c.r, c.g, c.b)
    bodies.push(body)
    return positions.length / 3 - 1
  }

  const rings = 20
  const radial = 10
  const half = spec.length / 2
  for (let i = 0; i <= rings; i++) {
    const t = i / rings
    const z = -half * 0.88 + t * spec.length * 0.94
    const thick = profile(t)
    const centerY = spec.height * 0.12 * (t - 0.45)
    for (let j = 0; j < radial; j++) {
      const angle = (j / radial) * Math.PI * 2
      const ny = Math.cos(angle)
      const nx = Math.sin(angle)
      // Back is dark, belly is pale: the mix reads as a fish without a texture.
      color.copy(belly).lerp(back, THREE.MathUtils.clamp(0.5 + ny * 0.75, 0, 1))
      if (spec.stripe > 0) {
        const band = Math.abs(Math.sin(t * 9.0 + nx * 0.4))
        color.lerp(stripe, THREE.MathUtils.clamp((band - 0.72) * 2.4, 0, 0.55))
      }
      push(
        nx * spec.width * thick,
        centerY + ny * spec.height * thick,
        z,
        color,
        t,
      )
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j
      const b = i * radial + ((j + 1) % radial)
      const c = a + radial
      const d = b + radial
      indices.push(a, c, b, b, c, d)
    }
  }
  // Nose and tail caps: one point each, so the silhouette closes.
  color.copy(belly).lerp(back, 0.35)
  const nose = push(0, spec.height * 0.055, half * 1.03, color, 1)
  for (let j = 0; j < radial; j++) {
    indices.push(rings * radial + j, nose, rings * radial + ((j + 1) % radial))
  }
  color.copy(back).lerp(belly, 0.25)
  const tail = push(0, 0, -half * 0.95, color, 0)
  for (let j = 0; j < radial; j++) {
    indices.push(j, ((j + 1) % radial), tail)
  }

  /** Add a flat fin from a triangle fan around `apex`. */
  const addFin = (apex, points, shade) => {
    const c = fin.clone().lerp(belly, shade)
    const a = push(apex[0], apex[1], apex[2], c, apex[3] ?? 0.2)
    const ring = points.map((p) => push(p[0], p[1], p[2], c, p[3] ?? 0.2))
    for (let i = 0; i < ring.length - 1; i++) indices.push(a, ring[i], ring[i + 1])
  }
  const tailZ = -half * 0.95
  addFin([0, 0, tailZ, 0.02], [
    [0, spec.height * 1.5, tailZ - spec.length * 0.30, 0.0],
    [0, spec.height * 0.25, tailZ - spec.length * 0.14, 0.0],
    [0, -spec.height * 0.25, tailZ - spec.length * 0.14, 0.0],
    [0, -spec.height * 1.5, tailZ - spec.length * 0.30, 0.0],
  ], 0.1)
  addFin([0, spec.height * 0.9, half * 0.15, 0.35], [
    [0, spec.height * 1.9, -half * 0.05, 0.3],
    [0, spec.height * 1.7, -half * 0.45, 0.1],
    [0, spec.height * 0.9, -half * 0.55, 0.05],
  ], 0.25)
  for (const side of [-1, 1]) {
    addFin([side * spec.width * 0.9, -spec.height * 0.15, half * 0.18, 0.72], [
      [side * spec.width * 2.4, -spec.height * 0.55, -half * 0.20, 0.6],
      [side * spec.width * 2.0, -spec.height * 0.95, -half * 0.05, 0.58],
      [side * spec.width * 0.9, -spec.height * 0.55, -half * 0.02, 0.62],
    ], 0.45)
  }
  // Eyes: a small dark blob each side, at the head.
  for (const side of [-1, 1]) {
    const ex = side * spec.width * 0.95
    const ey = spec.height * 0.28
    const ez = half * 0.62
    const c = new THREE.Color(0x1b1f26)
    const r = spec.height * 0.16
    const a = push(ex, ey + r, ez, c, 0.95)
    const b = push(ex, ey - r, ez, c, 0.95)
    const cc = push(ex, ey, ez + r, c, 0.95)
    const d = push(ex * 1.6, ey, ez - r, c, 0.95)
    indices.push(a, b, cc, b, d, cc, d, a, cc, a, d, b)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('aBody', new THREE.Float32BufferAttribute(bodies, 1))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** One species' geometry, built once and shared by every fish of that species. */
const geometryCache = new Map()
function geometryFor(spec) {
  let geometry = geometryCache.get(spec.id)
  if (geometry === undefined) {
    geometry = buildFishGeometry(spec)
    geometryCache.set(spec.id, geometry)
  }
  return geometry
}

/** One fish: its material (own swim clock), its place, and what it wants. */
class Fish {
  constructor(spec, index) {
    this.spec = spec
    this.material = applyWaterFX(new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.42,
      metalness: 0.18,
      side: THREE.DoubleSide,
    }), {
      strength: 0.7,
      inject: {
        declare: 'attribute float aBody;\nuniform float uFishPhase, uFishSpeed, uFishAmp;',
        uniforms: {
          uFishPhase: { value: range(index * 3.7, 0, 6.28) },
          uFishSpeed: { value: 7.5 + range(index * 1.3, 0, 3) },
          uFishAmp: { value: spec.length * 0.055 },
        },
        vertex: [
          '  float aqTail = 1.0 - aBody;',
          '  transformed.x += sin(uFxTime * uFishSpeed + uFishPhase - aqTail * 4.5) * uFishAmp * pow(aqTail, 1.4);',
        ].join('\n'),
      },
    })
    this.mesh = new THREE.Mesh(geometryFor(spec), this.material)
    this.mesh.castShadow = false
    this.mesh.receiveShadow = false
    this.mesh.frustumCulled = false

    this.phase = range(index * 5.1, 0, Math.PI * 2)
    this.speed = spec.speed * range(index * 2.9, 0.85, 1.25)
    this.yaw = range(index * 7.3, 0, Math.PI * 2)
    this.pitch = 0
    this.seek = 0
    this.fright = 0
    this.position = new THREE.Vector3()
    this.velocity = new THREE.Vector3()
  }
}

/** The school: the meshes, their AI, and the one place they are stepped. */
export class School {
  /**
   * @param options - `count`, the tank bounds, the terrain height function, and the water level.
   */
  constructor(options) {
    this.bounds = options.bounds
    this.terrainHeight = options.terrainHeight
    this.waterY = options.waterY
    this.group = new THREE.Group()
    this.group.name = 'school'
    this.fish = []
    this.setCount(options.count ?? 14)
    this.scare = { x: 0, z: 0, at: -99 }
  }

  /**
   * Grow or shrink the school to `count` fish.
   * @param count - how many fish should exist.
   */
  setCount(count) {
    while (this.fish.length > count) {
      const fish = this.fish.pop()
      this.group.remove(fish.mesh)
      fish.material.dispose()
    }
    while (this.fish.length < count) {
      const index = this.fish.length
      const spec = SPECIES[index % SPECIES.length]
      const fish = new Fish(spec, index * 1.618)
      const rx = this.bounds.hx * range(index * 1.7, 0.35, 0.82)
      const rz = this.bounds.hz * range(index * 2.3, 0.35, 0.85)
      fish.orbit = {
        cx: (range(index * 3.1, -1, 1)) * this.bounds.hx * 0.35,
        cz: (range(index * 4.3, -1, 1)) * this.bounds.hz * 0.25,
        rx,
        rz,
        depth: range(index * 5.7, 0.18, 0.85) * (this.waterY - this.bounds.sandY),
        bob: range(index * 6.1, 0.01, 0.05),
      }
      fish.position.set(fish.orbit.cx + rx, this.waterY - fish.orbit.depth, fish.orbit.cz)
      this.fish.push(fish)
      this.group.add(fish.mesh)
    }
  }

  /**
   * Report a disturbance the fish should swim away from.
   * @param x - world X of the splash.
   * @param z - world Z of the splash.
   * @param time - the stage clock when it happened.
   */
  startle(x, z, time) {
    this.scare.x = x
    this.scare.z = z
    this.scare.at = time
  }

  /**
   * Step every fish one frame.
   * @param dt - seconds since the last frame.
   * @param time - the stage clock.
   * @param context - `pellets` to chase, and the camera when it is inside the tank.
   */
  update(dt, time, context) {
    const { hx, hz } = this.bounds
    const pellets = context.pellets ?? []
    for (const fish of this.fish) {
      const orbit = fish.orbit
      fish.phase += dt * (0.9 + fish.seek * 2.4 + fish.fright * 2.0)
      const angle = fish.phase
      let tx = orbit.cx + Math.cos(angle) * orbit.rx
      let tz = orbit.cz + Math.sin(angle * 1.0) * orbit.rz * 0.8 + Math.sin(angle * 2.3) * 0.06
      let ty = this.waterY - orbit.depth + Math.sin(time * 0.7 + angle) * orbit.bob

      // Food wins over cruising, and the nearest pellet wins over the others.
      let target = null
      let best = Infinity
      for (const pellet of pellets) {
        if (pellet.eaten) continue
        const dx = pellet.x - fish.position.x
        const dz = pellet.z - fish.position.z
        const d2 = dx * dx + dz * dz
        if (d2 < best) { best = d2; target = pellet }
      }
      const want = target !== null && best < 2.4 ? 1 - Math.sqrt(best) / 2.4 : 0
      fish.seek += (want - fish.seek) * Math.min(1, dt * (want > fish.seek ? 2.6 : 1.1))
      if (target !== null && fish.seek > 0.02) {
        const k = Math.min(1, fish.seek * 0.95)
        tx = tx + (target.x - tx) * k
        tz = tz + (target.z - tz) * k
        ty = ty + (target.y + 0.03 - ty) * k
        if (best < 0.0055 * fish.spec.eager) {
          target.eaten = true
          fish.seek = 0.35
          context.onEat?.(target, fish)
        }
      }

      // A splash nearby pushes the fish away and makes it dive for a moment.
      fish.fright = Math.max(0, fish.fright - dt * 0.55)
      const age = time - this.scare.at
      if (age < 1.4) {
        const dx = fish.position.x - this.scare.x
        const dz = fish.position.z - this.scare.z
        const d = Math.hypot(dx, dz)
        if (d < 1.5) {
          const strength = (1 - age / 1.4) * (1 - d / 1.5)
          fish.fright = Math.max(fish.fright, strength)
          const push = strength * 0.9
          tx += (dx / Math.max(d, 0.05)) * push
          tz += (dz / Math.max(d, 0.05)) * push
          ty = Math.min(ty + strength * 0.06, this.waterY - 0.07)
        }
      }

      // Steer: turn toward the target, keep clear of the glass, the sand and the surface.
      const toX = tx - fish.position.x
      const toZ = tz - fish.position.z
      const desired = Math.atan2(toX, toZ)
      let delta = ((desired - fish.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      fish.yaw += delta * Math.min(1, dt * (2.6 + fish.seek * 3.4 + fish.fright * 3.0))
      const speed = fish.speed * (1 + fish.seek * 1.6 + fish.fright * 2.2)
      let vx = Math.sin(fish.yaw) * speed
      let vz = Math.cos(fish.yaw) * speed
      // The glass is a wall: a fish that reaches it turns along it instead of through it.
      const margin = 0.16
      if (fish.position.x > hx - margin && vx > 0) vx = -Math.abs(vx) * 0.6
      if (fish.position.x < -hx + margin && vx < 0) vx = Math.abs(vx) * 0.6
      if (fish.position.z > hz - margin && vz > 0) vz = -Math.abs(vz) * 0.6
      if (fish.position.z < -hz + margin && vz < 0) vz = Math.abs(vz) * 0.6
      const nextY = fish.position.y + (ty - fish.position.y) * Math.min(1, dt * 1.6)
      fish.position.set(
        THREE.MathUtils.clamp(fish.position.x + vx * dt, -hx + 0.08, hx - 0.08),
        THREE.MathUtils.clamp(nextY, this.terrainHeight(fish.position.x, fish.position.z) + 0.07, this.waterY - 0.045),
        THREE.MathUtils.clamp(fish.position.z + vz * dt, -hz + 0.06, hz - 0.06),
      )
      fish.pitch = THREE.MathUtils.clamp(fish.pitch + ((ty - fish.position.y) * 3.2 - fish.pitch) * Math.min(1, dt * 4), -0.5, 0.5)
      fish.mesh.position.copy(fish.position)
      fish.mesh.rotation.set(fish.pitch, fish.yaw, Math.sin(time * 3.4 + fish.phase) * 0.08)
    }
    this.separate()
  }

  /** Push fish that overlap apart, so a crowd never renders as one blob. */
  separate() {
    for (let a = 0; a < this.fish.length; a++) {
      for (let b = a + 1; b < this.fish.length; b++) {
        const A = this.fish[a].position
        const B = this.fish[b].position
        const dx = B.x - A.x
        const dy = (B.y - A.y) * 0.7
        const dz = B.z - A.z
        const d2 = dx * dx + dy * dy + dz * dz
        const want = 0.11
        if (d2 > want * want || d2 < 1e-8) continue
        const d = Math.sqrt(d2)
        const push = (want - d) * 0.5
        const ux = dx / d
        const uy = dy / d
        const uz = dz / d
        A.x -= ux * push; A.y -= uy * push * 0.5; A.z -= uz * push
        B.x += ux * push; B.y += uy * push * 0.5; B.z += uz * push
      }
    }
  }

  /** Release every material this school owns. */
  dispose() {
    for (const fish of this.fish) fish.material.dispose()
  }
}
