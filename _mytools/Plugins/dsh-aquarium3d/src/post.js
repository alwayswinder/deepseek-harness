/**
 * The post pass: screen-space ambient occlusion, bloom, dispersion, grain.
 *
 * The scene is drawn into a half-float target that also carries depth, then
 * one fullscreen pass composites it: depth-neighbour occlusion darkens the
 * contact points (a rock sitting *in* the sand rather than on it), a
 * quarter-resolution bright pass blooms the hood highlights and the caustics,
 * and a little chromatic aberration, grain, and dithering make the result read
 * as a photograph instead of clean CG. Every one of those moves is what the
 * "enhanced" switch in the panel turns off.
 */
import * as THREE from '../vendor/three.module.js'

/** Vertex shader every fullscreen pass shares. */
const FULLSCREEN_VS = [
  'varying vec2 vUv;',
  'void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
].join('\n')

/** Bright-pass + blur, run at a quarter resolution. */
const BLOOM_FS = [
  'precision highp float;',
  'uniform sampler2D tTex;',
  'uniform vec2 uRes;',
  'uniform float uThresh, uKnee;',
  'varying vec2 vUv;',
  'void main(){',
  '  vec3 sum = vec3(0.0); float weight = 0.0;',
  '  for (int i = 0; i < 13; i++){',
  '    float angle = float(i) * 2.39996;',
  '    float radius = float(i) / 12.0;',
  '    vec2 offset = vec2(cos(angle), sin(angle)) * radius * 2.6 / uRes;',
  '    vec3 sampleColor = texture2D(tTex, vUv + offset).rgb;',
  '    float luma = max(max(sampleColor.r, sampleColor.g), sampleColor.b);',
  '    float w = smoothstep(uThresh - uKnee, uThresh + uKnee, luma);',
  '    sum += sampleColor * w;',
  '    weight += 1.0;',
  '  }',
  '  gl_FragColor = vec4(sum / max(weight, 1.0) * 1.3, 1.0);',
  '}',
].join('\n')

/** The composite: occlusion, bloom, dispersion, grain, dither. */
const COMPOSITE_FS = [
  'precision highp float;',
  'varying vec2 vUv;',
  'uniform sampler2D tDiffuse, tDepth, tBloom;',
  'uniform vec2 uRes;',
  'uniform float uNear, uFar, uAO, uBloomAmt, uGrain, uTime, uDispersion;',
  /* Window-space depth back to a view distance. */
  'float linearDepth(float d){',
  '  float z = d * 2.0 - 1.0;',
  '  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));',
  '}',
  'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
  'void main(){',
  '  float z0 = linearDepth(texture2D(tDepth, vUv).x);',
  /* Ten taps on a spiral: a neighbour nearer than this pixel is occluding it. */
  '  float occ = 0.0;',
  '  for (int i = 0; i < 10; i++){',
  '    float angle = float(i) * 2.39996;',
  '    float radius = (1.4 + fract(float(i) * 0.618) * 5.2) / uRes.y;',
  '    vec2 offset = vec2(cos(angle), sin(angle)) * radius * 2.4;',
  '    float zs = linearDepth(texture2D(tDepth, vUv + offset).x);',
  '    float diff = (z0 - zs) / max(z0, 0.6);',
  /* The threshold widens with distance, so a wall seen edge-on is not a crease. */
  '    float thr = mix(0.008, 0.030, clamp(z0 / 16.0, 0.0, 1.0));',
  '    occ += smoothstep(thr, thr * 3.0, diff) * (1.0 - smoothstep(0.08, 0.26, diff));',
  '  }',
  '  float ao = 1.0 - (occ / 10.0) * uAO;',
  /* Dispersion grows toward the corners, the way a lens does. */
  '  vec2 centred = vUv - 0.5;',
  '  vec2 split = centred * (0.0009 + 0.0026 * length(centred)) * uDispersion;',
  '  vec3 color;',
  '  color.r = texture2D(tDiffuse, vUv + split).r;',
  '  color.g = texture2D(tDiffuse, vUv).g;',
  '  color.b = texture2D(tDiffuse, vUv - split).b;',
  '  color *= ao;',
  '  color += texture2D(tBloom, vUv).rgb * uBloomAmt;',
  /* Grain is weighted by luminance: film grain lives in the midtones. */
  '  float luma = dot(color, vec3(0.299, 0.587, 0.114));',
  '  float grainWeight = 4.0 * luma * (1.0 - luma);',
  '  color += (hash(vUv * uRes + fract(uTime) * 97.0) - 0.5) * uGrain * (0.15 + 0.85 * grainWeight);',
  /* One last dither before 8-bit output kills banding in the dark room. */
  '  color += (hash(vUv * uRes * 1.37 + 11.3) - 0.5) * (1.0 / 255.0);',
  '  gl_FragColor = vec4(color, 1.0);',
  '  #include <colorspace_fragment>',
  '}',
].join('\n')

/** The post-processing chain: one scene target, one bloom target, two passes. */
export class Post {
  /** @param renderer - the renderer whose drawing buffer size the targets follow. */
  constructor(renderer) {
    this.renderer = renderer
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.quadScene = new THREE.Scene()
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
    quad.frustumCulled = false
    this.quadScene.add(quad)
    /** Strength of each effect, so the panel can turn them off by number. */
    this.params = { ao: 0.6, bloom: 0.34, grain: 0.014, dispersion: 1.0 }

    this.compositeMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        tBloom: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.1 },
        uFar: { value: 100 },
        uAO: { value: this.params.ao },
        uBloomAmt: { value: this.params.bloom },
        uGrain: { value: this.params.grain },
        uDispersion: { value: this.params.dispersion },
        uTime: { value: 0 },
      },
      vertexShader: FULLSCREEN_VS,
      fragmentShader: COMPOSITE_FS,
    })
    this.bloomMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tTex: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uThresh: { value: 0.86 },
        uKnee: { value: 0.28 },
      },
      vertexShader: FULLSCREEN_VS,
      fragmentShader: BLOOM_FS,
    })
    quad.material = this.compositeMaterial
    this.sceneTarget = null
    this.bloomTarget = null
    this.quad = quad
  }

  /**
   * Match the targets to the renderer's drawing buffer.
   * @param width - drawing buffer width in pixels.
   * @param height - drawing buffer height in pixels.
   */
  resize(width, height) {
    const w = Math.max(2, Math.floor(width))
    const h = Math.max(2, Math.floor(height))
    if (this.sceneTarget !== null && this.sceneTarget.width === w && this.sceneTarget.height === h) return
    this.sceneTarget?.dispose()
    this.bloomTarget?.dispose()
    const depth = new THREE.DepthTexture(w, h)
    depth.type = THREE.UnsignedIntType
    this.sceneTarget = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      // Half float: the dark room would band badly at 8 bits per channel.
      type: THREE.HalfFloatType,
      depthTexture: depth,
      depthBuffer: true,
      stencilBuffer: false,
    })
    this.sceneTarget.texture.generateMipmaps = false
    this.bloomTarget = new THREE.WebGLRenderTarget(Math.max(2, w >> 2), Math.max(2, h >> 2), {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    })
    this.bloomTarget.texture.generateMipmaps = false
  }

  /**
   * Draw the scene through the chain, ending on the canvas.
   * @param scene - the scene to draw.
   * @param camera - the camera to draw it with.
   * @param time - the stage clock, for the grain.
   */
  render(scene, camera, time) {
    const renderer = this.renderer
    const { sceneTarget, bloomTarget } = this
    renderer.setRenderTarget(sceneTarget)
    renderer.render(scene, camera)
    this.bloomMaterial.uniforms.tTex.value = sceneTarget.texture
    this.bloomMaterial.uniforms.uRes.value.set(bloomTarget.width, bloomTarget.height)
    renderer.setRenderTarget(bloomTarget)
    renderer.render(this.quadScene, this.quadCamera)
    renderer.setRenderTarget(null)
    const uniforms = this.compositeMaterial.uniforms
    uniforms.tDiffuse.value = sceneTarget.texture
    uniforms.tDepth.value = sceneTarget.depthTexture
    uniforms.tBloom.value = bloomTarget.texture
    uniforms.uRes.value.set(sceneTarget.width, sceneTarget.height)
    uniforms.uNear.value = camera.near
    uniforms.uFar.value = camera.far
    uniforms.uTime.value = time
    renderer.render(this.quadScene, this.quadCamera)
  }

  /**
   * Turn the chain down for a slower machine: bloom and grain off first, then
   * occlusion.
   * @param level - `full`, `lite`, or `off`.
   */
  setQuality(level) {
    const uniforms = this.compositeMaterial.uniforms
    if (level === 'off') {
      uniforms.uAO.value = 0
      uniforms.uBloomAmt.value = 0
      uniforms.uGrain.value = 0
      uniforms.uDispersion.value = 0
      return
    }
    if (level === 'lite') {
      uniforms.uAO.value = this.params.ao * 0.6
      uniforms.uBloomAmt.value = this.params.bloom * 0.7
      uniforms.uGrain.value = this.params.grain
      uniforms.uDispersion.value = this.params.dispersion
      return
    }
    uniforms.uAO.value = this.params.ao
    uniforms.uBloomAmt.value = this.params.bloom
    uniforms.uGrain.value = this.params.grain
    uniforms.uDispersion.value = this.params.dispersion
  }

  /** Release both targets and both materials. */
  dispose() {
    this.sceneTarget?.dispose()
    this.bloomTarget?.dispose()
    this.compositeMaterial.dispose()
    this.bloomMaterial.dispose()
    this.quad.geometry.dispose()
  }
}
