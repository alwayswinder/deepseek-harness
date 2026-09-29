/**
 * Aquarium scene — stage, render pipeline, and frame loop.
 *
 * One frame renders the world four times, because a glass tank is a stack of
 * things seen through other things:
 *   1. reflection  — the scene mirrored across the water plane, clipped to
 *                    what is above the water, into a half-resolution target;
 *   2. refraction  — the scene without the water and the glass, which is what
 *                    the water surface and the panes look through;
 *   3. water       — that same target with the water surface drawn on top, so
 *                    the panes see the surface as well as the interior;
 *   4. main        — the scene with everything visible, where the water samples
 *                    pass 2 and the glass samples pass 3.
 *
 * Layers, not visibility flags, select what each pass draws: layer 0 is the
 * world, layer 1 the water surface, layer 2 the glass.
 */
import * as THREE from '../vendor/three.module.js'
import { SAND_TOP, TANK, buildTank } from './tank.js'
import { HOOD_POINT, buildRoom } from './room.js'
import { createWater } from './water.js'
import { createGlass } from './glass.js'
import { FX } from './fx.js'

/** Resolution scale of the planar reflection target. */
const REFL_SCALE = 0.5
/** Resolution scale of the refraction and glass targets. */
const REFR_SCALE = 0.66
/** Layer holding the water surface. */
const WATER_LAYER = 1
/** Layer holding the glass panes. */
const GLASS_LAYER = 2

/** Sand reference height used as the bed plane for absorption and refraction. */
const BED_Y = SAND_TOP + 0.02

/** Fullscreen copy pass used to stack the refraction target into the glass target. */
function createBlit(convertColorSpace = false) {
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: { uTex: { value: null } },
    vertexShader: 'varying vec2 vUv;\nvoid main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D uTex;',
      'varying vec2 vUv;',
      'void main(){ gl_FragColor = texture2D(uTex, vUv);',
      convertColorSpace ? '#include <colorspace_fragment>' : '',
      '}',
    ].join('\n'),
  })
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))
  // A fullscreen quad sits on the ortho camera's near plane, so culling it is
  // never correct.
  scene.children[0].frustumCulled = false
  return { scene, camera, material }
}

/** One mounted aquarium: WebGL context, scene, targets, and frame loop. */
class AquariumStage {
  /** @param canvas - the overlay canvas the stage draws into. */
  constructor(canvas) {
    this.canvas = canvas
    this.clock = new THREE.Clock()
    this.elapsed = 0
    this.disposed = false

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.shadowMap.autoUpdate = false
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6)
    this.renderer.clippingPlanes = [this.clipPlane]

    this.scene = new THREE.Scene()
    // The clear color lives on the renderer, not on `scene.background`: a Color
    // background forces a clear even when `autoClear` is off, which would wipe
    // the glass target while the water surface is being stacked into it.
    this.renderer.setClearColor(0x080f13, 1)

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.08, 60)
    this.camera.layers.enable(WATER_LAYER)
    this.camera.layers.enable(GLASS_LAYER)

    this.room = buildRoom(this.scene)
    this.tank = buildTank()
    this.scene.add(this.tank.group)
    this.water = createWater()
    this.scene.add(this.water.mesh)
    this.glass = createGlass(this.tank.glass)

    FX.uWaterY.value = TANK.waterY
    FX.uBedY.value = BED_Y
    FX.uLamp.value.copy(HOOD_POINT)
    this.water.material.uniforms.uBedY.value = BED_Y

    this.reflCam = new THREE.PerspectiveCamera(34, 1, 0.08, 60)
    this.reflVP = new THREE.Matrix4()
    this.viewProjection = new THREE.Matrix4()
    this.blit = createBlit()
    this.debugBlit = createBlit(true)
    this.reflReady = false

    this.orbit = { theta: 0.0, phi: 1.34, radius: 4.5, target: new THREE.Vector3(0, 0.22, 0) }
    this.drag = { active: false, x: 0, y: 0 }

    this.targets = { refl: null, refr: null, glass: null }
    this.debugTarget = null
    this.bindEvents()
    this.resize()
    this.applyOrbit()

    this.loop = this.loop.bind(this)
    this.animationFrame = requestAnimationFrame(this.loop)
  }

  /** Attach input, resize, and context listeners. */
  bindEvents() {
    this.onPointerDown = (event) => {
      this.drag.active = true
      this.drag.x = event.clientX
      this.drag.y = event.clientY
      try { this.canvas.setPointerCapture(event.pointerId) } catch { /* capture is an optimization only */ }
    }
    this.onPointerMove = (event) => {
      if (!this.drag.active) return
      const dx = (event.clientX - this.drag.x) / Math.max(this.canvas.clientWidth, 1)
      const dy = (event.clientY - this.drag.y) / Math.max(this.canvas.clientHeight, 1)
      this.drag.x = event.clientX
      this.drag.y = event.clientY
      this.orbit.theta -= dx * 2.6
      this.orbit.phi = Math.min(1.60, Math.max(0.18, this.orbit.phi - dy * 1.9))
      this.applyOrbit()
    }
    this.onPointerUp = () => { this.drag.active = false }
    this.onWheel = (event) => {
      event.preventDefault()
      this.orbit.radius = Math.min(12, Math.max(2.2, this.orbit.radius * (1 + Math.sign(event.deltaY) * 0.08)))
      this.applyOrbit()
    }
    this.onContextLost = (event) => {
      event.preventDefault()
      console.warn('aquarium3d: WebGL context lost')
    }
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerUp)
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false })
    this.canvas.addEventListener('webglcontextlost', this.onContextLost)
    this.resizeObserver = new ResizeObserver(() => { this.resize() })
    this.resizeObserver.observe(this.canvas)
  }

  /** Place the camera on the orbit around the tank. */
  applyOrbit() {
    const { theta, phi, radius, target } = this.orbit
    const sinPhi = Math.sin(phi)
    this.camera.position.set(
      target.x + Math.sin(theta) * sinPhi * radius,
      target.y + Math.cos(phi) * radius,
      target.z + Math.cos(theta) * sinPhi * radius,
    )
    this.camera.lookAt(target)
  }

  /** Match every target to the current canvas size. */
  resize() {
    const width = Math.max(1, this.canvas.clientWidth)
    const height = Math.max(1, this.canvas.clientHeight)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    const buffer = this.renderer.getDrawingBufferSize(new THREE.Vector2())
    const scale = (rt, factor) => {
      if (rt !== null) rt.dispose()
      return new THREE.WebGLRenderTarget(
        Math.max(2, Math.floor(buffer.x * factor)),
        Math.max(2, Math.floor(buffer.y * factor)),
        {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          type: THREE.HalfFloatType,
          depthBuffer: true,
          stencilBuffer: false,
        },
      )
    }
    this.targets.refl = scale(this.targets.refl, REFL_SCALE)
    this.targets.refr = scale(this.targets.refr, REFR_SCALE)
    this.targets.glass = scale(this.targets.glass, REFR_SCALE)
    this.water.material.uniforms.uRes.value.set(this.targets.refr.width, this.targets.refr.height)
  }

  /** Mirror the camera across the water and render what sits above it. */
  renderReflection() {
    const waterY = TANK.waterY
    if (this.camera.position.y < waterY - 0.02) {
      this.reflReady = false
      return
    }
    const cam = this.reflCam
    cam.fov = this.camera.fov
    cam.aspect = this.camera.aspect
    cam.near = this.camera.near
    cam.far = this.camera.far
    cam.updateProjectionMatrix()
    cam.position.set(this.camera.position.x, 2 * waterY - this.camera.position.y, this.camera.position.z)
    const dir = this.camera.getWorldDirection(new THREE.Vector3())
    cam.up.set(0, -1, 0)
    cam.lookAt(
      this.camera.position.x + dir.x,
      2 * waterY - (this.camera.position.y + dir.y),
      this.camera.position.z + dir.z,
    )
    cam.updateMatrixWorld(true)
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert()
    this.reflVP.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)

    this.clipPlane.constant = -waterY
    const savedMask = this.camera.layers.mask
    this.camera.layers.mask = 1 << 0
    this.renderer.setRenderTarget(this.targets.refl)
    this.renderer.render(this.scene, cam)
    this.camera.layers.mask = savedMask
    this.renderer.setRenderTarget(null)
    this.clipPlane.constant = 1e6
    this.reflReady = true
  }

  /** Render the interior, then the water surface on top of it. */
  renderRefraction() {
    const savedMask = this.camera.layers.mask
    // Interior: everything except the water surface and the panes.
    this.camera.layers.mask = 1 << 0
    this.renderer.shadowMap.needsUpdate = true
    this.renderer.setRenderTarget(this.targets.refr)
    this.renderer.render(this.scene, this.camera)
    // Stack the interior into the glass target, then draw the water over it.
    this.blit.material.uniforms.uTex.value = this.targets.refr.texture
    this.renderer.setRenderTarget(this.targets.glass)
    this.renderer.render(this.blit.scene, this.blit.camera)
    this.camera.layers.mask = 1 << WATER_LAYER
    this.renderer.autoClear = false
    this.renderer.render(this.scene, this.camera)
    this.renderer.autoClear = true
    this.camera.layers.mask = savedMask
    this.renderer.setRenderTarget(null)
  }

  /** Update the uniforms the frame's passes read. */
  updateUniforms() {
    const water = this.water.material.uniforms
    const glass = this.glass.material.uniforms
    FX.uFxTime.value = this.elapsed
    water.uTime.value = this.elapsed
    water.uCamPos.value.copy(this.camera.position)
    water.uVP.value.copy(this.viewProjection)
    water.uReflVP.value.copy(this.reflVP)
    water.uReflTex.value = this.targets.refl.texture
    water.uReflAmt.value = this.reflReady ? 1 : 0
    water.uRefrTex.value = this.targets.refr.texture
    glass.uCamPos.value.copy(this.camera.position)
    glass.uVP.value.copy(this.viewProjection)
    glass.uGlassRT.value = this.targets.glass.texture
    glass.uHoodDir.value.copy(HOOD_POINT).sub(new THREE.Vector3(0, TANK.waterY, 0)).normalize()
  }

  /** One frame: reflection, refraction, then the composited main render. */
  loop() {
    if (this.disposed) return
    const dt = Math.min(this.clock.getDelta(), 0.05)
    this.elapsed += dt
    this.renderer.shadowMap.needsUpdate = false
    this.camera.updateMatrixWorld(true)
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert()
    this.viewProjection.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)
    this.updateUniforms()
    this.renderReflection()
    this.renderRefraction()
    this.renderer.setRenderTarget(null)
    if (this.debugTarget !== null) {
      // Development view: one pipeline target straight onto the canvas.
      this.debugBlit.material.uniforms.uTex.value = this.debugTarget.texture
      this.renderer.render(this.debugBlit.scene, this.debugBlit.camera)
    } else {
      this.renderer.render(this.scene, this.camera)
    }
    this.animationFrame = requestAnimationFrame(this.loop)
  }

  /**
   * Development helper: show one pipeline target on the canvas instead of the scene.
   * @param name - `refl`, `refr`, `glass`, or null to resume the normal render.
   * @returns whether the named target exists.
   */
  debugShow(name) {
    if (name === null) {
      this.debugTarget = null
      return true
    }
    const target = this.targets[name]
    if (target === undefined) return false
    this.debugTarget = target
    return true
  }

  /**
   * Development helper: read one pixel of a target as linear RGB.
   * @param name - `refl`, `refr`, or `glass`.
   * @param u - horizontal texture coordinate in [0,1].
   * @param v - vertical texture coordinate in [0,1], 0 at the bottom.
   * @returns the three channels, or null when the target is missing.
   */
  probeTarget(name, u, v) {
    const target = this.targets[name]
    if (target === undefined || target === null) return null
    const x = Math.min(target.width - 1, Math.max(0, Math.round(u * target.width)))
    const y = Math.min(target.height - 1, Math.max(0, Math.round(v * target.height)))
    const buffer = new Uint16Array(4)
    this.renderer.readRenderTargetPixels(target, x, y, 1, 1, buffer)
    const decode = (half) => {
      const sign = (half & 0x8000) >> 15
      const exponent = (half & 0x7c00) >> 10
      const fraction = half & 0x03ff
      if (exponent === 0) return (sign ? -1 : 1) * Math.pow(2, -14) * (fraction / 1024)
      if (exponent === 31) return fraction ? Number.NaN : (sign ? -Infinity : Infinity)
      return (sign ? -1 : 1) * Math.pow(2, exponent - 15) * (1 + fraction / 1024)
    }
    return [decode(buffer[0]), decode(buffer[1]), decode(buffer[2])].map((value) => Number(value.toFixed(4)))
  }

  /** Release every resource this stage owns. */
  dispose() {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.animationFrame)
    this.resizeObserver.disconnect()
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerUp)
    this.canvas.removeEventListener('wheel', this.onWheel)
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    for (const rt of Object.values(this.targets)) if (rt !== null) rt.dispose()
    this.scene.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose()
        const material = child.material
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose())
        else material?.dispose()
      }
    })
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}

/**
 * Mount the aquarium onto a canvas.
 * @param canvas - the canvas element the overlay provides.
 * @returns the mounted stage, whose `dispose` releases it.
 */
export function mount(canvas) {
  const stage = new AquariumStage(canvas)
  // Development handle: the screenshot loop drives the live stage through it.
  window.__AQUARIUM__ = stage
  return stage
}
