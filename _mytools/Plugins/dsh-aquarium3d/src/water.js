/**
 * The water surface.
 *
 * The surface is one plane at the resting water level. Its height and normal
 * come from the shared surface field — wind waves plus whatever the ripple
 * field holds — the interior seen through it comes from the refraction target
 * the pipeline rendered first, and the room it mirrors comes from the planar
 * reflection target. Fresnel decides how much of each is visible, so the view
 * flips from "looking into water" to "looking at reflected room" as the camera
 * rises.
 */
import * as THREE from '../vendor/three.module.js'
import { TANK } from './tank.js'
import { FX, SURFACE_GLSL } from './fx.js'

/**
 * Create the water mesh and its material.
 * @returns the mesh plus its material, whose uniforms the stage drives per frame.
 */
export function createWater() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uWindSpeed: { value: 0.45 },
      uWaterY: { value: TANK.waterY },
      uBedY: { value: -0.55 },
      uVP: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uReflTex: { value: null },
      uReflVP: { value: new THREE.Matrix4() },
      uReflAmt: { value: 1 },
      uReflStrength: { value: 0.8 },
      uReflDistort: { value: 0.055 },
      uReflBlur: { value: 0.35 },
      uRefrTex: { value: null },
      uRefrAmt: { value: 1 },
      uIOR: { value: 1.333 },
      uAbsorb: { value: new THREE.Vector3(0.30, 0.10, 0.065) },
      uDeep: { value: new THREE.Color(0x0a5570) },
      uShallow: { value: new THREE.Color(0x63d8c9) },
      uHoodDir: { value: new THREE.Vector3(0.2, 1, 0.12).normalize() },
      uHoodCol: { value: new THREE.Color(0xfff0d8) },
      uHoodI: { value: 1.4 },
      uEdge: { value: new THREE.Vector2(TANK.hx, TANK.hz) },
      uRes: { value: new THREE.Vector2(1, 1) },
      uFoamAmt: { value: 1 },
      // The ripple field is one fact for the whole scene: the water and every
      // injected material share these uniform objects.
      uRipTex: FX.uRipTex,
      uRipExt: FX.uRipExt,
      uRipNrm: FX.uRipNrm,
      uRipDisp: FX.uRipDisp,
    },
    vertexShader: /* glsl */`
      uniform float uTime, uWindSpeed;
      varying vec3 vWorld;
      varying float vFoam;
      ${SURFACE_GLSL}
      void main(){
        vec4 world = modelMatrix * vec4(position, 1.0);
        float h; vec2 g; float foam;
        aqSurface(world.xz, uTime, uWindSpeed, h, g, foam);
        world.y += h;
        vWorld = world.xyz;
        vFoam = foam;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D uReflTex, uRefrTex;
      uniform mat4 uVP, uReflVP;
      uniform vec3 uCamPos, uDeep, uShallow, uAbsorb, uHoodDir, uHoodCol;
      uniform vec2 uEdge, uRes;
      uniform float uTime, uWindSpeed, uWaterY, uBedY, uReflAmt, uReflStrength;
      uniform float uReflDistort, uReflBlur, uRefrAmt, uIOR, uHoodI, uFoamAmt;
      varying vec3 vWorld;
      varying float vFoam;
      ${SURFACE_GLSL}

      /* Screen coordinate of a world point under the main camera. */
      vec2 screenOf(vec3 p){
        vec4 clip = uVP * vec4(p, 1.0);
        return (clip.xy / max(clip.w, 1e-4)) * 0.5 + 0.5;
      }
      /* Mirrored-camera coordinate of a world point. */
      vec2 reflScreenOf(vec3 p){
        vec4 clip = uReflVP * vec4(p, 1.0);
        return (clip.xy / max(clip.w, 1e-4)) * 0.5 + 0.5;
      }
      /* Three taps along the normal keep the reflection soft without mips. */
      vec3 sampleReflection(vec2 uv, vec2 dir){
        vec3 sum = texture2D(uReflTex, clamp(uv, 0.001, 0.999)).rgb * 0.5;
        sum += texture2D(uReflTex, clamp(uv + dir * uReflBlur * 0.020, 0.001, 0.999)).rgb * 0.25;
        sum += texture2D(uReflTex, clamp(uv - dir * uReflBlur * 0.020, 0.001, 0.999)).rgb * 0.25;
        return sum * uReflStrength;
      }

      void main(){
        float h; vec2 g; float foam;
        aqSurface(vWorld.xz, uTime, uWindSpeed, h, g, foam);
        vec3 N = normalize(vec3(-g.x * 2.1, 1.0, -g.y * 2.1));
        vec3 V = normalize(uCamPos - vWorld);
        float ndv = max(dot(N, V), 0.0);

        /* Refraction: follow the refracted ray to the bed plane, then take the
           interior color already rendered at that pixel. */
        vec3 R = refract(-V, N, 1.0 / uIOR);
        float travel = clamp((uBedY - vWorld.y) / min(R.y, -0.08), 0.0, 6.0);
        vec3 hit = vWorld + R * travel;
        vec2 uvR = mix(screenOf(vWorld), screenOf(hit), clamp(uRefrAmt, 0.0, 1.4));
        vec3 refr = texture2D(uRefrTex, clamp(uvR, 0.001, 0.999)).rgb;

        /* Beer-Lambert absorption along the refracted path tints the interior. */
        vec3 trans = exp(-uAbsorb * travel);
        float depthMix = clamp(travel / max(uWaterY - uBedY, 0.05), 0.0, 1.0);
        vec3 body = mix(uShallow, uDeep, depthMix * 0.85);
        refr = refr * trans + body * (1.0 - trans) * 0.85;

        /* Reflection: the room above the surface, wobbled by the surface normal. */
        vec2 uvM = reflScreenOf(vWorld) + N.xz * uReflDistort;
        vec3 refl = sampleReflection(uvM, N.xz);

        float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
        float mixAmt = clamp(fres * 1.6 * uReflAmt, 0.0, 1.0);
        vec3 col = mix(refr, refl, mixAmt);

        /* Hood highlight: a tight, slightly stretched specular streak. */
        vec3 H = normalize(uHoodDir + V);
        float spec = pow(max(dot(N, H), 0.0), 190.0) * uHoodI;
        col += uHoodCol * spec;

        /* Foam: what a splash left on the surface, brighter than the water. */
        col += vec3(0.55, 0.72, 0.72) * clamp(vFoam + foam, 0.0, 1.5) * 0.35 * uFoamAmt;

        /* Meniscus: the surface darkens into the glass instead of ending flat. */
        float edge = 1.0 - smoothstep(0.86, 1.0, max(abs(vWorld.x) / uEdge.x, abs(vWorld.z) / uEdge.y));
        col = mix(col * 0.55, col, edge);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })

  const geometry = new THREE.PlaneGeometry(TANK.hx * 2 + 0.004, TANK.hz * 2 + 0.004, 96, 48)
  geometry.rotateX(-Math.PI / 2)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'water'
  mesh.position.y = TANK.waterY
  mesh.renderOrder = 1
  // Layer 1 marks the water so a pass can render it alone.
  mesh.layers.set(1)
  mesh.frustumCulled = false
  return { mesh, material }
}
