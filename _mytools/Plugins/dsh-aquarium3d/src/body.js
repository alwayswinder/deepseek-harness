/**
 * The water column itself.
 *
 * Everything else in the tank is *in* the water, but nothing yet *is* the
 * water: without this box the middle of the tank is empty space and reads as a
 * dark hole. The box is tinted and made translucent by how far the view ray
 * travels through it, which is what gives the tank its depth — a thin pale
 * green at the top, a heavier blue-green toward the sand, and denser still when
 * looking along the long axis.
 *
 * The light shafts are the same idea from the other side: tall additive quads
 * under the hood that read as the lamp cutting through the water.
 */
import * as THREE from '../vendor/three.module.js'
import { SAND_TOP, TANK } from './tank.js'

/**
 * Build the water volume and the light shafts.
 * @param options - the water level, and the deep/shallow colours to tint with.
 * @returns the group plus the uniforms the stage drives (the water level moves).
 */
export function createWaterBody(options) {
  const group = new THREE.Group()
  group.name = 'waterBody'
  const uniforms = {
    uWaterY: { value: options.waterY },
    uBedY: { value: SAND_TOP },
    uDeep: { value: new THREE.Color(0x0d5a72) },
    uShallow: { value: new THREE.Color(0x2f9ea8) },
    uDensity: { value: 0.62 },
  }

  const height = Math.max(0.05, options.waterY - SAND_TOP)
  const geometry = new THREE.BoxGeometry(TANK.hx * 2 - 0.01, height, TANK.hz * 2 - 0.01)
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main(){
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform vec3 uDeep, uShallow;
      uniform float uWaterY, uBedY, uDensity;
      varying vec3 vWorld;
      void main(){
        float depth = clamp((uWaterY - vWorld.y) / max(uWaterY - uBedY, 0.05), 0.0, 1.0);
        vec3 colour = mix(uShallow, uDeep, depth * 0.9);
        vec3 view = normalize(cameraPosition - vWorld);
        // Looking along the tank crosses more water than looking at the pane.
        float travel = 0.35 + 0.65 * (1.0 - abs(view.z));
        float alpha = clamp(uDensity * (0.18 + 0.72 * depth) * travel, 0.0, 0.82);
        gl_FragColor = vec4(colour, alpha);
        #include <colorspace_fragment>
      }
    `,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = SAND_TOP + height / 2
  // After the interior it tints, before the water surface it sits under.
  mesh.renderOrder = 0.5
  group.add(mesh)

  // Light shafts: a handful of thin additive wedges under each hood.
  const shaftMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uWaterY: uniforms.uWaterY,
      uIntensity: { value: 0.085 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vWorld;
      void main(){
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uWaterY, uIntensity;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main(){
        // Fades out at both ends and to both sides, so no edge is ever visible.
        float along = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
        across *= across;
        float above = smoothstep(uWaterY + 0.02, uWaterY - 0.35, vWorld.y);
        gl_FragColor = vec4(vec3(0.52, 0.86, 0.86) * uIntensity * along * across * above, 1.0);
      }
    `,
  })
  const shaftGeometry = new THREE.PlaneGeometry(0.26, 1.6)
  for (const lampX of [-0.62, 0.62]) {
    for (const offset of [-0.22, 0.05, 0.28]) {
      const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial)
      // Slanted outward from the hood, like the light that leaves it.
      shaft.position.set(lampX + offset * 0.5, options.waterY - 0.35, 0.3 + offset)
      shaft.rotation.set(0.14, offset * 0.9, offset * 0.24)
      shaft.renderOrder = 0.6
      group.add(shaft)
    }
  }

  return {
    group,
    uniforms,
    material,
    shaftMaterial,
    shaftGeometry,
    /**
     * Follow the water level: the volume grows and shrinks with the surface
     * instead of sticking out of the water when the level is lowered.
     * @param waterY - the new surface height.
     */
    setWaterLevel(waterY) {
      const span = Math.max(0.05, waterY - SAND_TOP)
      mesh.scale.y = span / height
      mesh.position.y = SAND_TOP + span / 2
    },
  }
}
