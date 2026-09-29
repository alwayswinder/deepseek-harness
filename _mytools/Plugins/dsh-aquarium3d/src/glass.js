/**
 * The glass shell material.
 *
 * One shader serves all five panes. What the viewer sees through the glass is
 * the refraction target the pipeline prepared first (interior plus the water
 * surface drawn on top of it), sampled along the refracted ray; what the glass
 * reflects is the room and the hood lamps. Fresnel mixes the two, so the panes
 * read as almost invisible head-on and as bright sheets at a grazing angle.
 */
import * as THREE from '../vendor/three.module.js'
import { TANK } from './tank.js'

/**
 * Create the glass material and hang it on every pane mesh.
 * @param panes - the group of pane meshes built by the tank.
 * @returns the material and that group.
 */
export function createGlass(panes) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: THREE.FrontSide,
    uniforms: {
      uGlassRT: { value: null },
      uVP: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uThick: { value: 0.045 },
      uIOR: { value: 1.52 },
      uWaterY: { value: TANK.waterY },
      uRoomCol: { value: new THREE.Color(0x263034) },
      uSkyCol: { value: new THREE.Color(0x8fb4c4) },
      uHoodDir: { value: new THREE.Vector3(0.2, 1, 0.12).normalize() },
      uHoodCol: { value: new THREE.Color(0xfff2dc) },
      uHoodI: { value: 1.5 },
      uOpacity: { value: 1 },
      /** 0 renders normally; 1 shows the refraction UV, 2 the raw refracted sample (development). */
      uDebug: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying vec2 vPaneUv;
      void main(){
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormalW = mat3(modelMatrix) * normal;
        vPaneUv = uv;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D uGlassRT;
      uniform mat4 uVP;
      uniform vec3 uCamPos, uRoomCol, uSkyCol, uHoodDir, uHoodCol;
      uniform float uThick, uIOR, uWaterY, uHoodI, uOpacity, uDebug;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying vec2 vPaneUv;

      void main(){
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(uCamPos - vWorld);
        if (dot(N, V) < 0.0) N = -N;
        float ndv = clamp(dot(N, V), 0.0, 1.0);
        float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);

        /* Look through the pane: follow the refracted ray a plate thickness in. */
        vec3 R = refract(-V, N, 1.0 / uIOR);
        vec3 hit = vWorld + R * uThick;
        vec4 clip = uVP * vec4(hit, 1.0);
        vec2 uv = clamp((clip.xy / max(clip.w, 1e-4)) * 0.5 + 0.5, 0.002, 0.998);
        vec3 through = texture2D(uGlassRT, uv).rgb;

        /* Reflect the room: a cheap vertical gradient plus the hood highlight. */
        vec3 M = reflect(-V, N);
        vec3 env = mix(uRoomCol, uSkyCol, clamp(M.y * 0.75 + 0.30, 0.0, 1.0));
        vec3 H = normalize(uHoodDir + V);
        float spec = pow(max(dot(N, H), 0.0), 320.0) * uHoodI;
        vec3 refl = env + uHoodCol * spec;

        vec3 col = mix(through, refl, clamp(fres * 0.85, 0.0, 0.7));
        /* A touch of green in the body, a bright rim at grazing angles, and the
           waterline: the band where the surface meets the pane, which is what
           tells the eye how deep the water sits. */
        col = mix(col, col * vec3(0.95, 1.0, 0.99), 0.5);
        col += vec3(0.22, 0.46, 0.44) * pow(1.0 - ndv, 9.0) * 0.6;
        float waterline = 1.0 - smoothstep(0.003, 0.012, abs(vWorld.y - uWaterY));
        col = mix(col, col * 0.78 + vec3(0.02, 0.06, 0.055), waterline * 0.6);
        float paneEdge = min(min(vPaneUv.x, 1.0 - vPaneUv.x), min(vPaneUv.y, 1.0 - vPaneUv.y));
        col += vec3(0.30, 0.60, 0.58) * (1.0 - smoothstep(0.0, 0.03, paneEdge)) * 0.35;
        if (uDebug > 0.5 && uDebug < 1.5) col = vec3(uv, 0.0);
        if (uDebug > 1.5) col = through * 6.0;
        gl_FragColor = vec4(col, uOpacity);
        #include <colorspace_fragment>
      }
    `,
  })

  panes.traverse((child) => {
    if (!child.isMesh) return
    child.material = material
    child.renderOrder = 2
  })
  return { material, group: panes }
}
