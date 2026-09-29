/**
 * The ripple field: one small render target holding what local disturbances do
 * to the surface — a fish food pellet landing, a splash, a finger touching the
 * water — as a normal (rg), a height (b), and foam (a).
 *
 * The surface and the caustics both sample it, so one pellet landing here also
 * wobbles the light net on the sand. It is a fixed ring of sources rather than
 * a growing list: a disturbance fades out and its slot is reused, so the cost
 * per frame never depends on how much has happened.
 */
import * as THREE from '../vendor/three.module.js'

/** World half-extent the field covers, in meters. */
export const RIPPLE_EXTENT = 4.2

/** Resolution of the field texture. */
const FIELD_SIZE = 384

/** How many disturbances can be alive at once. */
const SOURCE_COUNT = 12

/** Per-kind source parameters: wavenumber, life in seconds, front speed, foam gain. */
const KINDS = {
  // A pellet landing: small, tight, gone quickly.
  drop: [26.0, 1.5, 0.55, 0.5],
  // A splash or a thrown object: wider, slower, much foamier.
  splash: [13.0, 3.4, 0.85, 1.25],
  // A fish brushing the surface: almost nothing.
  fish: [22.0, 1.1, 0.5, 0.35],
  // Something large pressed into the surface.
  paw: [9.0, 2.6, 0.7, 0.9],
}

/** The ripple field: sources, their texture, and the pass that renders it. */
export class RippleField {
  constructor() {
    this.target = new THREE.WebGLRenderTarget(FIELD_SIZE, FIELD_SIZE, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    })
    this.target.texture.generateMipmaps = false

    this.sources = []
    this.parameters = []
    for (let i = 0; i < SOURCE_COUNT; i++) {
      this.sources.push(new THREE.Vector4(0, 0, -999, 0))
      this.parameters.push(new THREE.Vector4(...KINDS.splash))
    }
    this.head = 0
    this.time = 0

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uT: { value: 0 },
        uRip: { value: this.sources },
        uRipP: { value: this.parameters },
        uExt: { value: RIPPLE_EXTENT },
      },
      vertexShader: [
        'varying vec2 vClip;',
        'void main(){ vClip = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      ].join('\n'),
      fragmentShader: [
        'precision highp float;',
        'uniform float uT, uExt;',
        `uniform vec4 uRip[${SOURCE_COUNT}];`,
        `uniform vec4 uRipP[${SOURCE_COUNT}];`,
        'varying vec2 vClip;',
        'void main(){',
        '  vec2 wp = vClip * uExt;',
        '  float h = 0.0; vec2 g = vec2(0.0); float foam = 0.0;',
        `  for (int i = 0; i < ${SOURCE_COUNT}; i++){`,
        '    vec4 R = uRip[i];',
        '    vec4 Q = uRipP[i];',
        '    if (R.w <= 0.001) continue;',
        '    float age = uT - R.z;',
        '    float life = max(Q.y, 0.4);',
        '    if (age < 0.0 || age > life) continue;',
        '    float k = clamp(age / life, 0.0, 1.0);',
        '    float decay = (1.0 - k) * (1.0 - k);',
        '    vec2 d = wp - R.xy;',
        '    float r = length(d);',
        // The front travels outward and the packet widens as it goes, so a
        // disturbance starts as a tight ring and ends as a soft swell.
        '    float front = r - Q.z * age;',
        '    float width = 0.085 + 0.30 * age + 0.05 * r;',
        '    float env = exp(-(front * front) / (width * width)) / (1.0 + r * 0.55);',
        '    float phase = Q.x * front;',
        '    float s = sin(phase);',
        '    float amp = R.w * env * decay;',
        '    h += amp * s;',
        '    g += normalize(d + vec2(1e-4, 0.0)) * (amp * Q.x * cos(phase) * (front < 0.0 ? -1.0 : 1.0));',
        '    foam += Q.w * max(0.0, s - 0.30) * env * decay;',
        '  }',
        '  g *= 1.7;',
        '  gl_FragColor = vec4(clamp(g, -1.0, 1.0) * 0.5 + 0.5,',
        '                      clamp(h * 6.0 + 0.5, 0.0, 1.0),',
        '                      clamp(foam, 0.0, 1.0));',
        '}',
      ].join('\n'),
    })

    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    quad.frustumCulled = false
    this.scene.add(quad)
  }

  /**
   * Drop one disturbance into the next free slot.
   * @param x - world X of the disturbance.
   * @param z - world Z of the disturbance.
   * @param amplitude - surface displacement in meters before the envelope.
   * @param kind - `drop`, `splash`, `fish`, or `paw`.
   */
  add(x, z, amplitude, kind = 'splash') {
    const index = this.head
    this.head = (this.head + 1) % SOURCE_COUNT
    this.sources[index].set(x, z, this.time, amplitude)
    this.parameters[index].set(...(KINDS[kind] ?? KINDS.splash))
  }

  /** How many sources are alive right now (never more than the ring size). */
  get activeCount() {
    let alive = 0
    for (const source of this.sources) if (source.w > 0.001 && this.time - source.z <= 60) alive++
    return alive
  }

  /**
   * Advance the field's clock and render it.
   * @param renderer - the WebGL renderer the pass runs on.
   * @param time - elapsed seconds, the same clock the water shader reads.
   */
  update(renderer, time) {
    this.time = time
    this.material.uniforms.uT.value = time
    const previous = renderer.getRenderTarget()
    renderer.setRenderTarget(this.target)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(previous)
  }

  /** Release the target and the pass. */
  dispose() {
    this.target.dispose()
    this.material.dispose()
    this.scene.traverse((child) => { if (child.isMesh) child.geometry.dispose() })
  }
}
