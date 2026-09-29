/**
 * Shared underwater light effects for standard materials.
 *
 * The water surface, the sand, and everything inside the tank must agree on one
 * surface field, so the GLSL below is the single source all of them read: the
 * analytic wind waves, the ripple field a disturbance writes, and the height
 * and gradient the two add up to.
 *
 * Caustics are computed, not textured: for each fragment the shader walks the
 * light path lamp -> water surface -> fragment, refracts at the surface point
 * it found, and measures how much the refracted mapping compresses the surface
 * around that point (the area Jacobian). Compression means light is gathered,
 * so the fragment brightens; spreading darkens it. Because the surface it reads
 * includes the ripple field, a pellet landing on the water dents the light net
 * on the sand as well.
 */
import * as THREE from '../vendor/three.module.js'

/** World half-extent the ripple field covers, mirrored from `ripples.js`. */
export const RIPPLE_EXTENT = 4.2

/** GLSL shared by the water shader and the material injection. */
export const SURFACE_GLSL = /* glsl */`
  uniform sampler2D uRipTex;
  uniform float uRipExt, uRipNrm, uRipDisp;

  /* One directional wave added to the running height and gradient. */
  void aqWave(vec2 p, vec2 dir, float len, float amp, float spd, float t, inout float h, inout vec2 g){
    float k = 6.28318531 / max(len, 0.05);
    float ph = dot(p, dir) * k + t * spd * k * 0.5;
    h += amp * sin(ph);
    g += dir * (amp * k * cos(ph));
  }

  /* The wind waves alone: four directions, shortest last. */
  void waveHG(vec2 p, float t, float wind, out float h, out vec2 g){
    h = 0.0; g = vec2(0.0);
    float w = 0.35 + 0.65 * clamp(wind, 0.0, 1.0);
    aqWave(p, normalize(vec2( 0.86,  0.51)), 0.40, 0.0032 * w, 0.26, t, h, g);
    aqWave(p, normalize(vec2( 0.42, -0.90)), 0.22, 0.0018 * w, 0.40, t, h, g);
    aqWave(p, normalize(vec2(-0.66,  0.75)), 0.12, 0.0010 * w, 0.60, t, h, g);
    aqWave(p, normalize(vec2( 0.13,  0.99)), 0.062, 0.0005 * w, 0.85, t, h, g);
  }

  /* What a local disturbance left behind: extra height, extra gradient, foam. */
  void aqRipple(vec2 p, out float h, out vec2 g, out float foam){
    h = 0.0; g = vec2(0.0); foam = 0.0;
    if (uRipExt <= 0.0) return;
    vec2 uv = p / (2.0 * uRipExt) + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return;
    vec4 rip = texture2D(uRipTex, uv);
    h = (rip.b * 2.0 - 1.0) / 6.0 * uRipDisp;
    g = (rip.rg * 2.0 - 1.0) * uRipNrm;
    foam = rip.a;
  }

  /* The full surface: wind waves plus whatever the ripple field holds. */
  void aqSurface(vec2 p, float t, float wind, out float h, out vec2 g, out float foam){
    float rippleH; vec2 rippleG;
    waveHG(p, t, wind, h, g);
    aqRipple(p, rippleH, rippleG, foam);
    h += rippleH;
    g += rippleG;
  }
`

/** GLSL helpers for the caustics and the water-column tint. */
const CAUSTIC_GLSL = /* glsl */`
  /* Point where light entering at surface point q lands on the horizontal plane at height py. */
  vec2 aqRefractHit(vec2 q, vec3 lamp, float py, out float ok){
    float h; vec2 g; float foam;
    aqSurface(q, uFxTime, uWindSpeed, h, g, foam);
    vec3 N = normalize(vec3(-g.x * 3.0, 1.0, -g.y * 3.0));
    vec3 Q = vec3(q.x, uWaterY, q.y);
    vec3 R = refract(normalize(Q - lamp), N, 1.0 / 1.333);
    ok = (R.y < -0.12) ? 1.0 : 0.0;
    float t = (py - Q.y) / min(R.y, -0.12);
    return vec2(Q.x + R.x * t, Q.z + R.z * t);
  }
  /* Area compression of the refracted mapping, softened by the lamp's physical size. */
  float causticAt(vec3 P, float e, float soft){
    vec3 lamp = uLamp;
    vec3 up = normalize(lamp - P);
    float s0 = (uWaterY - P.y) / max(up.y, 0.06);
    vec2 q = P.xz + up.xz * s0;
    float o0, ox, oz;
    vec2 F0 = aqRefractHit(q, lamp, P.y, o0);
    vec2 Fx = aqRefractHit(q + vec2(e, 0.0), lamp, P.y, ox);
    vec2 Fz = aqRefractHit(q + vec2(0.0, e), lamp, P.y, oz);
    if (o0 * ox * oz < 0.5) return 0.0;
    float a = (Fx.x - F0.x) / e, b = (Fz.x - F0.x) / e;
    float c = (Fx.y - F0.y) / e, d = (Fz.y - F0.y) / e;
    float det = abs(a * d - b * c);
    return 1.0 / (clamp(det, 0.0, 6.0) + soft) - 1.0 / (1.0 + soft);
  }
`

/**
 * Uniform objects shared by every material carrying the underwater effect.
 * One object per fact keeps every material in step after a single write.
 */
export const FX = {
  uFxTime: { value: 0 },
  uWaterY: { value: 0.6 },
  uBedY: { value: -0.55 },
  uWindSpeed: { value: 0.45 },
  uCauAmt: { value: 1.0 },
  uCauCol: { value: new THREE.Color(0x9dfbdc) },
  uDeep: { value: new THREE.Color(0x0a5570) },
  uShallow: { value: new THREE.Color(0x5fd6c8) },
  uLamp: { value: new THREE.Vector3(0.62, 2.0, 0.35) },
  uLampI: { value: 1.0 },
  uTankXZ: { value: new THREE.Vector2(1.25, 0.62) },
  uRipTex: { value: null },
  uRipExt: { value: RIPPLE_EXTENT },
  uRipNrm: { value: 0.22 },
  uRipDisp: { value: 1.0 },
}

/**
 * Add the underwater tint and moving caustics to one standard material.
 * @param material - a MeshStandardMaterial inside or under the tank.
 * @param options - `strength` scales the caustics; `tint` at 0 keeps the material's own color;
 *   `sway` is a per-meter horizontal drift for rooted geometry, so plants move with the water;
 *   `inject` adds this material's own GLSL (`uniforms`, `vertex` after `begin_vertex`,
 *   `fragment` after `color_fragment`), which is how the fish get their swim wave without a
 *   second `onBeforeCompile` fighting this one.
 * @returns the same material, so callers can wrap a constructor call.
 */
export function applyWaterFX(material, options = {}) {
  const strength = options.strength ?? 1
  const tint = options.tint ?? 1
  const sway = options.sway ?? 0
  const inject = options.inject ?? {}
  material.defines = Object.assign(material.defines ?? {}, { AQ_WATER_FX: '' }, sway > 0 ? { AQ_SWAY: '' } : {})
  material.customProgramCacheKey = () => `aqfx${strength}${tint}${sway}`
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, FX, inject.uniforms ?? {}, {
      uStrength: { value: strength },
      uTintMix: { value: tint },
      uSway: { value: sway },
    })
    shader.vertexShader = [
      'varying vec3 vAqPos;',
      'uniform float uFxTime, uSway;',
      inject.declare ?? '',
      shader.vertexShader,
    ].join('\n').replace(
      '#include <begin_vertex>',
      [
        '#include <begin_vertex>',
        '  vec3 aqOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;',
        '  #ifdef AQ_SWAY',
        '  float aqSwayW = max(transformed.y, 0.0);',
        '  transformed.x += sin(uFxTime * 1.35 + aqOrigin.x * 2.1 + aqOrigin.z * 1.7) * uSway * aqSwayW;',
        '  transformed.z += cos(uFxTime * 1.05 + aqOrigin.z * 1.9 - aqOrigin.x * 1.3) * uSway * 0.6 * aqSwayW;',
        '  #endif',
        inject.vertex ?? '',
        '  vAqPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      ].join('\n'),
    )
    shader.fragmentShader = [
      'varying vec3 vAqPos;',
      'uniform float uFxTime, uWaterY, uBedY, uWindSpeed, uCauAmt, uStrength, uTintMix, uLampI;',
      'uniform vec3 uCauCol, uDeep, uShallow, uLamp;',
      'uniform vec2 uTankXZ;',
      SURFACE_GLSL,
      CAUSTIC_GLSL,
      shader.fragmentShader,
    ].join('\n').replace(
      '#include <color_fragment>',
      [
        '#include <color_fragment>',
        '  float aqAbove = step(vAqPos.y, uWaterY);',
        '  float aqDepth = clamp((uWaterY - vAqPos.y) / max(uWaterY - uBedY, 0.05), 0.0, 1.0);',
        '  float aqSide = (1.0 - smoothstep(uTankXZ.x - 0.05, uTankXZ.x + 0.35, abs(vAqPos.x)))',
        '               * (1.0 - smoothstep(uTankXZ.y - 0.05, uTankXZ.y + 0.35, abs(vAqPos.z)));',
        '  float aqIn = aqAbove * aqSide;',
        inject.fragment ?? '',
        '  float aqCau = causticAt(vAqPos, 0.05, 0.85) * uCauAmt * uStrength * uLampI;',
        '  aqCau = clamp(aqCau, -0.35, 1.1);',
        '  diffuseColor.rgb *= 1.0 + aqCau * 2.0 * aqIn;',
        '  float aqWet = aqIn * uTintMix;',
        '  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.66, 0.94, 0.95), aqWet * 0.55);',
        '  diffuseColor.rgb += mix(uShallow, uDeep, aqDepth) * (0.10 * aqWet * aqDepth);',
      ].join('\n'),
    )
  }
  return material
}
