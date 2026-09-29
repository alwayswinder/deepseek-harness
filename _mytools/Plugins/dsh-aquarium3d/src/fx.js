/**
 * Shared underwater light effects for standard materials.
 *
 * The water surface, the sand, and everything inside the tank must agree on
 * one wave field, so the wave function below is the single source both the
 * water shader and the caustics use.
 *
 * Caustics are computed, not textured: for each fragment the shader walks the
 * light path lamp -> water surface -> fragment, refracts at the surface point
 * it found, and measures how much the refracted mapping compresses the surface
 * around that point (the area Jacobian). Compression means light is gathered,
 * so the fragment brightens; spreading darkens it. That is the moving light
 * net on the sand, and it stays in step with the surface because both read the
 * same `waveHG`.
 */
import * as THREE from '../vendor/three.module.js'

/** GLSL shared by the water shader and the material injection. */
export const WAVE_GLSL = /* glsl */`
  /* One directional wave added to the running height and gradient. */
  void aqWave(vec2 p, vec2 dir, float len, float amp, float spd, float t, inout float h, inout vec2 g){
    float k = 6.28318531 / max(len, 0.05);
    float ph = dot(p, dir) * k + t * spd * k * 0.5;
    h += amp * sin(ph);
    g += dir * (amp * k * cos(ph));
  }
  /* Surface height and height gradient at a world XZ point. */
  void waveHG(vec2 p, float t, float wind, out float h, out vec2 g){
    h = 0.0; g = vec2(0.0);
    float w = 0.35 + 0.65 * clamp(wind, 0.0, 1.0);
    aqWave(p, normalize(vec2( 0.86,  0.51)), 0.40, 0.0032 * w, 0.26, t, h, g);
    aqWave(p, normalize(vec2( 0.42, -0.90)), 0.22, 0.0018 * w, 0.40, t, h, g);
    aqWave(p, normalize(vec2(-0.66,  0.75)), 0.12, 0.0010 * w, 0.60, t, h, g);
    aqWave(p, normalize(vec2( 0.13,  0.99)), 0.062, 0.0005 * w, 0.85, t, h, g);
  }
`

/** GLSL helpers for the caustics and the water-column tint. */
const CAUSTIC_GLSL = /* glsl */`
  /* Point where light entering at surface point q lands on the horizontal plane at height py. */
  vec2 aqRefractHit(vec2 q, vec3 lamp, float py, out float ok){
    float h; vec2 g;
    waveHG(q, uFxTime, uWindSpeed, h, g);
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
}

/**
 * Add the underwater tint and moving caustics to one standard material.
 * @param material - a MeshStandardMaterial inside or under the tank.
 * @param options - `strength` scales the caustics; `tint` at 0 keeps the material's own color;
 *   `sway` is a per-meter horizontal drift for rooted geometry, so plants move with the water.
 * @returns the same material, so callers can wrap a constructor call.
 */
export function applyWaterFX(material, options = {}) {
  const strength = options.strength ?? 1
  const tint = options.tint ?? 1
  const sway = options.sway ?? 0
  material.defines = Object.assign(material.defines ?? {}, { AQ_WATER_FX: '' }, sway > 0 ? { AQ_SWAY: '' } : {})
  material.customProgramCacheKey = () => `aqfx${strength}${tint}${sway}`
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, FX, {
      uStrength: { value: strength },
      uTintMix: { value: tint },
      uSway: { value: sway },
    })
    shader.vertexShader = [
      'varying vec3 vAqPos;',
      'uniform float uFxTime, uSway;',
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
        '  vAqPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      ].join('\n'),
    )
    shader.fragmentShader = [
      'varying vec3 vAqPos;',
      'uniform float uFxTime, uWaterY, uBedY, uWindSpeed, uCauAmt, uStrength, uTintMix, uLampI;',
      'uniform vec3 uCauCol, uDeep, uShallow, uLamp;',
      'uniform vec2 uTankXZ;',
      WAVE_GLSL,
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
