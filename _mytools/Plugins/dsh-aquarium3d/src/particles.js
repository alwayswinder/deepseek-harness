/**
 * Bubbles, pearls, and splashes: one additive point cloud.
 *
 * Every particle carries its own gravity sign, so the same buffer holds
 * bubbles that rise, oxygen pearls that drift up slowly, and droplets that fall
 * back. A bubble that reaches the surface does not vanish: it hangs there for a
 * moment and pops, which is what tells the surface to ripple.
 */
import * as THREE from '../vendor/three.module.js'

/** Particle count. Fixed, because the ring reuses slots instead of growing. */
const COUNT = 320

/** Interleaved helper: the small random range every emitter uses. */
const random = (min, max) => min + Math.random() * (max - min)

/** The point-cloud particle system. */
export class Particles {
  constructor() {
    this.positions = new Float32Array(COUNT * 3)
    this.colors = new Float32Array(COUNT * 3)
    this.sizes = new Float32Array(COUNT)
    this.lives = new Float32Array(COUNT)
    this.velocity = new Float32Array(COUNT * 3)
    this.gravity = new Float32Array(COUNT)
    this.maxLife = new Float32Array(COUNT)
    this.hold = new Float32Array(COUNT)
    this.head = 0

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1))
    geometry.setAttribute('aLife', new THREE.BufferAttribute(this.lives, 1))

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPix: { value: 900 } },
      vertexShader: [
        'attribute vec3 aColor;',
        'attribute float aSize;',
        'attribute float aLife;',
        'uniform float uPix;',
        'varying vec3 vColor;',
        'varying float vLife;',
        'void main(){',
        '  vColor = aColor;',
        '  vLife = aLife;',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  gl_PointSize = clamp(aSize * uPix / max(-mv.z, 0.4) * (0.5 + 0.8 * aLife), 1.0, 140.0);',
        '  gl_Position = projectionMatrix * mv;',
        '}',
      ].join('\n'),
      fragmentShader: [
        'precision highp float;',
        'varying vec3 vColor;',
        'varying float vLife;',
        'void main(){',
        // A bright core inside a soft edge reads as a bubble rather than a dot.
        '  float d = length(gl_PointCoord - 0.5);',
        '  float a = (smoothstep(0.5, 0.24, d) * 0.45 + smoothstep(0.30, 0.0, d) * 0.95) * vLife;',
        '  if (a < 0.01) discard;',
        '  gl_FragColor = vec4(vColor, a);',
        '}',
      ].join('\n'),
    })

    this.points = new THREE.Points(geometry, this.material)
    this.points.frustumCulled = false
    this.points.layers.set(0)
  }

  /**
   * Put one particle into the next slot.
   * @param spec - position, velocity, size in meters, life in seconds, colour, and gravity.
   */
  emit(spec) {
    const i = this.head
    this.head = (this.head + 1) % COUNT
    this.positions[i * 3] = spec.x
    this.positions[i * 3 + 1] = spec.y
    this.positions[i * 3 + 2] = spec.z
    this.velocity[i * 3] = spec.vx ?? 0
    this.velocity[i * 3 + 1] = spec.vy ?? 0
    this.velocity[i * 3 + 2] = spec.vz ?? 0
    this.gravity[i] = spec.gravity ?? 9.4
    this.hold[i] = 0
    this.sizes[i] = spec.size ?? 0.02
    this.lives[i] = 1
    this.maxLife[i] = spec.life ?? 1
    const color = spec.color ?? { r: 0.8, g: 0.95, b: 1 }
    this.colors[i * 3] = color.r
    this.colors[i * 3 + 1] = color.g
    this.colors[i * 3 + 2] = color.b
  }

  /** A splash at the surface: fast droplets that fall back down. */
  splash(x, y, z, scale = 1) {
    const count = Math.round(26 * scale)
    for (let i = 0; i < count; i++) {
      const angle = random(0, Math.PI * 2)
      const speed = random(0.5, 2.2) * scale
      this.emit({
        x, y: y + 0.02, z,
        vx: Math.cos(angle) * speed * random(0.4, 1),
        vy: random(1.4, 3.4) * scale,
        vz: Math.sin(angle) * speed * random(0.4, 1),
        size: random(0.02, 0.055) * Math.max(scale, 0.7),
        life: random(0.5, 1.0),
        color: { r: 0.86, g: 0.97, b: 1 },
      })
    }
  }

  /** A few bubbles released under the surface. */
  burst(x, y, z, count) {
    for (let i = 0; i < count; i++) {
      const angle = random(0, Math.PI * 2)
      const speed = random(0.1, 0.6)
      this.emit({
        x: x + random(-0.02, 0.02), y, z: z + random(-0.02, 0.02),
        vx: Math.cos(angle) * speed,
        vy: random(0.35, 0.9),
        vz: Math.sin(angle) * speed,
        size: random(0.012, 0.03),
        life: random(1.4, 2.6),
        color: { r: 0.78, g: 0.93, b: 0.95 },
        gravity: -1.0,
      })
    }
  }

  /**
   * Step every particle.
   * @param dt - seconds since the last frame.
   * @param context - `waterY` for the pop plane and `onPop` for what a pop does to the surface.
   */
  update(dt, context) {
    let dirty = false
    for (let i = 0; i < COUNT; i++) {
      if (this.lives[i] <= 0) continue
      dirty = true
      const i3 = i * 3
      const bubble = this.gravity[i] < 0
      this.lives[i] -= dt / this.maxLife[i]
      if (this.lives[i] < 0) this.lives[i] = 0
      this.velocity[i3 + 1] -= this.gravity[i] * dt
      if (bubble) {
        // Bubbles do not rise in a straight line.
        this.velocity[i3] += Math.sin((this.positions[i3 + 1] + i) * 9) * dt * 0.5
        this.velocity[i3 + 2] += Math.cos((this.positions[i3 + 1] + i) * 7) * dt * 0.5
        this.velocity[i3] *= 1 - dt * 0.7
        this.velocity[i3 + 2] *= 1 - dt * 0.7
      }
      this.positions[i3] += this.velocity[i3] * dt
      this.positions[i3 + 1] += this.velocity[i3 + 1] * dt
      this.positions[i3 + 2] += this.velocity[i3 + 2] * dt
      if (!bubble) continue
      if (this.hold[i] > 0 || this.positions[i3 + 1] >= context.waterY) {
        // A bubble reaching the surface floats there as foam for a moment, then pops.
        if (this.hold[i] <= 0) {
          this.hold[i] = random(0.25, 1.1)
          this.positions[i3 + 1] = context.waterY + 0.003
          this.velocity[i3] *= 0.2
          this.velocity[i3 + 1] = 0
          this.velocity[i3 + 2] *= 0.2
        }
        this.hold[i] -= dt
        this.positions[i3] += Math.sin(context.time * 1.9 + i) * dt * 0.01
        this.positions[i3 + 1] = context.waterY + 0.003
        this.lives[i] = Math.min(this.lives[i], Math.max(this.hold[i] / 0.2, 0))
        if (this.hold[i] <= 0) {
          this.lives[i] = 0
          context.onPop?.(this.positions[i3], this.positions[i3 + 2])
        }
      }
    }
    if (dirty) {
      const geometry = this.points.geometry
      geometry.attributes.position.needsUpdate = true
      geometry.attributes.aColor.needsUpdate = true
      geometry.attributes.aSize.needsUpdate = true
      geometry.attributes.aLife.needsUpdate = true
    }
  }

  /** Release the geometry and the material. */
  dispose() {
    this.points.geometry.dispose()
    this.material.dispose()
  }
}
