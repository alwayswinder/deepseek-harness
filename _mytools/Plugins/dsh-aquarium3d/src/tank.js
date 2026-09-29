/**
 * Tank geometry: the glass shell, the stand, the sand bed, and the hardscape.
 *
 * Everything here is procedural — no model or texture file — so the plugin
 * ships as source. `terrainHeight` is the single source of truth for the sand
 * surface: the sand mesh, the rock placement, and the water shader's bed depth
 * all read it.
 */
import * as THREE from '../vendor/three.module.js'
import { applyWaterFX } from './fx.js'

/** Tank metrics in meters, shared by every module that reasons about the box. */
export const TANK = {
  hx: 1.25,
  hz: 0.62,
  /** Top edge of the glass. */
  rim: 1.02,
  /** Underside of the glass bottom pane (the stand starts here). */
  base: -0.62,
  glass: 0.016,
  /** Resting water level, a little below the rim. */
  waterY: 0.62,
  /** Stand top and the floor of the room. */
  standBottom: -1.34,
}

/** Resting height of the sand bed, in world space. */
export const SAND_TOP = TANK.base + 0.06

/** Sand height at one XZ point, in meters. */
export function terrainHeight(x, z) {
  const mound = Math.exp(-(x * x * 1.1 + (z - 0.12) * (z - 0.12) * 2.4) * 1.6) * 0.075
  const dune = Math.sin(x * 1.55 + 0.7) * 0.022 + Math.cos(z * 2.15 - 0.5) * 0.018
  const grain = valueNoise(x * 4.2 + 11.3, z * 4.2 - 7.1) * 0.045
  const fine = valueNoise(x * 11.0 - 3.7, z * 11.0 + 5.2) * 0.014
  // Sand piles up against the glass instead of ending on a hard edge.
  const rimLift = Math.max(0, (Math.abs(x) / TANK.hx - 0.72)) * 0.16 + Math.max(0, (Math.abs(z) / TANK.hz - 0.72)) * 0.16
  return SAND_TOP + mound + dune + grain + fine + rimLift
}

/** Deterministic hash in [0,1) for the procedural noise below. */
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** Bilinear value noise with a smoothstep fade. */
function valueNoise(x, z) {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const xf = x - xi
  const zf = z - zi
  const u = xf * xf * (3 - 2 * xf)
  const v = zf * zf * (3 - 2 * zf)
  const a = hash2(xi, zi)
  const b = hash2(xi + 1, zi)
  const c = hash2(xi, zi + 1)
  const d = hash2(xi + 1, zi + 1)
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}

/** Clamp helper used across the scene builders. */
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

/**
 * Build the sand bed as a displaced plane so the shader sees the same surface
 * the placement code does.
 * @returns the sand mesh, positioned in world space.
 */
function buildSand() {
  const geometry = new THREE.PlaneGeometry(TANK.hx * 2, TANK.hz * 2, 110, 64)
  geometry.rotateX(-Math.PI / 2)
  const position = geometry.attributes.position
  const colors = new Float32Array(position.count * 3)
  const tint = new THREE.Color()
  const pale = new THREE.Color(0xf0e2c2)
  const dark = new THREE.Color(0x9c7f52)
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const z = position.getZ(i)
    position.setY(i, terrainHeight(x, z))
    // Grain, ripples, and darker sand in the hollows keep the bed from reading as one flat slab.
    const grain = valueNoise(x * 26.0 + 5.1, z * 26.0 - 2.3)
    const ripple = 0.5 + 0.5 * Math.sin(x * 22.0 + valueNoise(x * 6.0, z * 6.0) * 5.0)
    tint.copy(pale).lerp(dark, clamp(grain * 0.75 + ripple * 0.35 - 0.22, 0, 1))
    colors[i * 3] = tint.r
    colors[i * 3 + 1] = tint.g
    colors[i * 3 + 2] = tint.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  position.needsUpdate = true
  geometry.computeVertexNormals()
  const material = applyWaterFX(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.92,
  }), { strength: 1.15 })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'sand'
  mesh.receiveShadow = true
  return mesh
}

/**
 * Build one rock: a subdivided icosahedron pushed around by noise.
 * @param radius - base radius in meters.
 * @param seed - changes the noise phase so rocks differ.
 */
function buildRock(radius, seed) {
  const geometry = new THREE.IcosahedronGeometry(radius, 2)
  const position = geometry.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i)
    const n = valueNoise(v.x * 4.5 + seed * 13.1, v.z * 4.5 - seed * 7.7) - 0.5
    const m = valueNoise(v.y * 6.2 - seed * 3.3, v.x * 5.1 + seed * 9.4) - 0.5
    v.multiplyScalar(1 + n * 0.42 + m * 0.22)
    v.y *= 0.72
    position.setXYZ(i, v.x, v.y, v.z)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

/** Sand-toned stones plus one darker boulder, sitting on the terrain. */
function buildRocks() {
  const group = new THREE.Group()
  group.name = 'rocks'
  const palette = [0x8d8377, 0x7d7469, 0x6d6a66, 0x9a8f7d]
  const specs = [
    { x: -0.72, z: -0.16, r: 0.17, seed: 1 },
    { x: -0.48, z: 0.20, r: 0.12, seed: 2 },
    { x: 0.10, z: -0.26, r: 0.14, seed: 3 },
    { x: 0.62, z: 0.14, r: 0.10, seed: 4 },
    { x: 0.86, z: -0.28, r: 0.16, seed: 5 },
    { x: 0.34, z: 0.34, r: 0.075, seed: 6 },
  ]
  specs.forEach((spec, index) => {
    const material = applyWaterFX(new THREE.MeshStandardMaterial({
      color: palette[index % palette.length],
      roughness: 0.88,
      metalness: 0.02,
    }), { strength: 1.0 })
    const mesh = new THREE.Mesh(buildRock(spec.r, spec.seed), material)
    mesh.position.set(spec.x, terrainHeight(spec.x, spec.z) + spec.r * 0.42, spec.z)
    mesh.rotation.set(0.1 * spec.seed, spec.seed * 1.7, 0.06 * spec.seed)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  })
  return group
}

/** A piece of driftwood: one bent tube plus a stub branch. */
function buildDriftwood() {
  const group = new THREE.Group()
  group.name = 'driftwood'
  const material = applyWaterFX(new THREE.MeshStandardMaterial({ color: 0x6b4b32, roughness: 0.82 }), { strength: 0.9 })
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.95, 0.04, 0.26),
    new THREE.Vector3(-0.42, 0.16, 0.10),
    new THREE.Vector3(0.12, 0.20, -0.02),
    new THREE.Vector3(0.58, 0.13, -0.16),
    new THREE.Vector3(0.92, 0.05, -0.22),
  ])
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.055, 8, false), material)
  trunk.castShadow = true
  trunk.receiveShadow = true
  group.add(trunk)
  const branch = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.12, 0.20, -0.02),
    new THREE.Vector3(0.20, 0.34, 0.06),
    new THREE.Vector3(0.30, 0.44, 0.14),
  ]), 16, 0.028, 7, false), material)
  branch.castShadow = true
  group.add(branch)
  group.position.y = terrainHeight(0.0, 0.05)
  return group
}

/**
 * Build one tapered blade with a dark base and a bright tip.
 * @param height - blade length in meters.
 * @param width - half width at the base.
 * @param bend - sideways lean of the tip.
 * @param segments - rows along the blade; more rows bend more smoothly.
 */
function buildBlade(height, width, bend, segments = 6) {
  const positions = []
  const colors = []
  const uvs = []
  const indices = []
  const base = new THREE.Color(0x1d5a2c)
  const tip = new THREE.Color(0x86d06a)
  const color = new THREE.Color()
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const w = width * (1 - t * 0.92) * (1 + Math.sin(t * 3.1) * 0.12)
    const x = Math.sin(t * 1.5) * bend
    const y = height * t * (1 - t * 0.12)
    const z = Math.cos(t * 1.1) * bend * 0.5
    color.copy(base).lerp(tip, t * t * 0.85 + t * 0.15)
    positions.push(x - w, y, z, x + w, y, z)
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
    uvs.push(0, t, 1, t)
    if (i < segments) {
      const a = i * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** A cluster of blades standing on the terrain. */
function buildPlantCluster(spec, material) {
  const group = new THREE.Group()
  group.name = 'plants'
  for (let i = 0; i < spec.blades; i++) {
    const angle = (i / spec.blades) * Math.PI * 2 + spec.seed
    const radius = spec.spread * (0.35 + hash2(i + spec.seed, spec.seed) * 0.65)
    const height = spec.height * (0.62 + hash2(i * 3.1 + spec.seed, 1.7) * 0.75)
    const blade = new THREE.Mesh(
      buildBlade(height, spec.width * (0.7 + hash2(i, spec.seed * 2) * 0.6), spec.bend * (hash2(i + 4, spec.seed) - 0.5) * 2),
      material,
    )
    blade.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
    blade.rotation.y = angle
    blade.castShadow = true
    group.add(blade)
  }
  group.position.set(spec.x, terrainHeight(spec.x, spec.z) - 0.01, spec.z)
  return group
}

/** Every plant cluster in the tank. */
function buildPlants() {
  const group = new THREE.Group()
  group.name = 'plantBed'
  const material = applyWaterFX(new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.72,
    metalness: 0.0,
  }), { strength: 0.8, sway: 0.055 })
  const specs = [
    { x: -1.02, z: -0.30, blades: 13, height: 0.42, width: 0.020, spread: 0.16, bend: 0.30, seed: 1.1 },
    { x: -0.62, z: 0.34, blades: 9, height: 0.30, width: 0.017, spread: 0.13, bend: 0.24, seed: 2.7 },
    { x: 0.46, z: -0.36, blades: 11, height: 0.50, width: 0.018, spread: 0.15, bend: 0.34, seed: 3.9 },
    { x: 0.94, z: 0.22, blades: 8, height: 0.36, width: 0.016, spread: 0.12, bend: 0.26, seed: 5.3 },
    { x: 0.06, z: 0.42, blades: 6, height: 0.22, width: 0.014, spread: 0.10, bend: 0.22, seed: 6.8 },
  ]
  specs.forEach((spec) => { group.add(buildPlantCluster(spec, material)) })
  return group
}

/** The wooden stand under the tank. */
function buildStand() {
  const group = new THREE.Group()
  group.name = 'stand'
  const wood = applyWaterFX(new THREE.MeshStandardMaterial({ color: 0x7a5636, roughness: 0.68 }), { strength: 0.25 })
  const dark = applyWaterFX(new THREE.MeshStandardMaterial({ color: 0x5c4029, roughness: 0.74 }), { strength: 0.25 })
  const height = TANK.base - TANK.glass - TANK.standBottom
  const top = new THREE.Mesh(new THREE.BoxGeometry(TANK.hx * 2 + 0.20, 0.06, TANK.hz * 2 + 0.20), dark)
  top.position.y = TANK.base - TANK.glass - 0.03
  top.castShadow = true
  top.receiveShadow = true
  group.add(top)
  const body = new THREE.Mesh(new THREE.BoxGeometry(TANK.hx * 2 + 0.12, height - 0.06, TANK.hz * 2 + 0.12), wood)
  body.position.y = TANK.standBottom + (height - 0.06) / 2
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)
  const door = new THREE.Mesh(new THREE.BoxGeometry(TANK.hx * 2 - 0.04, height - 0.24, 0.02), dark)
  door.position.set(0, TANK.standBottom + (height - 0.06) / 2 + 0.02, TANK.hz + 0.075)
  group.add(door)
  return group
}

/**
 * The five glass panes of the shell, as separate planes so each face gets a
 * clean normal for the refraction offset.
 */
function buildGlassPanes() {
  const group = new THREE.Group()
  group.name = 'glass'
  const width = TANK.hx * 2 + TANK.glass * 2
  const depth = TANK.hz * 2 + TANK.glass * 2
  const height = TANK.rim - TANK.base
  const panes = [
    { size: [width, height], position: [0, TANK.base + height / 2, TANK.hz + TANK.glass / 2], rotation: [0, 0, 0] },
    { size: [width, height], position: [0, TANK.base + height / 2, -TANK.hz - TANK.glass / 2], rotation: [0, Math.PI, 0] },
    { size: [depth, height], position: [TANK.hx + TANK.glass / 2, TANK.base + height / 2, 0], rotation: [0, Math.PI / 2, 0] },
    { size: [depth, height], position: [-TANK.hx - TANK.glass / 2, TANK.base + height / 2, 0], rotation: [0, -Math.PI / 2, 0] },
    { size: [width, depth], position: [0, TANK.base - TANK.glass / 2, 0], rotation: [-Math.PI / 2, 0, 0] },
  ]
  for (const pane of panes) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pane.size[0], pane.size[1]), null)
    mesh.position.fromArray(pane.position)
    mesh.rotation.fromArray(pane.rotation)
    mesh.layers.set(2)
    group.add(mesh)
  }
  return group
}

/**
 * Assemble the tank: stand, sand, hardscape, plants, and the glass shell.
 * @returns the group plus the pieces the render pipeline addresses by name.
 */
export function buildTank() {
  const group = new THREE.Group()
  group.name = 'tank'
  const glass = buildGlassPanes()
  group.add(buildStand())
  group.add(buildSand())
  group.add(buildRocks())
  group.add(buildDriftwood())
  group.add(buildPlants())
  group.add(glass)
  return { group, glass }
}

export { clamp }
