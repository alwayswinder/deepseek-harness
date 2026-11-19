/* ============================================================
   WebGL2 renderer: raymarched world, clouds, meshes, effects
   ============================================================ */

const SCENE_VS = `#version 300 es
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const SCENE_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCamPos;
uniform mat3 uCamBasis;
uniform float uTanFov;
uniform vec3 uSun;
uniform float uNear;
uniform float uFar;
uniform sampler2D uHeight;
uniform sampler2D uMask;
uniform sampler2D uShadow;
uniform sampler2D uCloud;
uniform sampler2D uMax;
uniform int uDebug;

const float TILE = 12288.0;
const float NT = 1024.0;
const float BAYER[16] = float[16](
   0.0,  8.0,  2.0, 10.0,
  12.0,  4.0, 14.0,  6.0,
   3.0, 11.0,  1.0,  9.0,
  15.0,  7.0, 13.0,  5.0);

float bayer4(vec2 p) {
  int i = int(mod(p.x, 4.0)) + int(mod(p.y, 4.0)) * 4;
  return BAYER[i] / 16.0;
}

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float hRaw(vec2 p) {
  return texture(uHeight, p / TILE).r;
}

float hBil(vec2 p) {
  vec2 g = p / TILE * NT - 0.5;
  vec2 i = floor(g);
  vec2 f = g - i;
  vec2 uv00 = (i + 0.5) / NT;
  vec2 uv10 = (i + vec2(1.0, 0.0) + 0.5) / NT;
  vec2 uv01 = (i + vec2(0.0, 1.0) + 0.5) / NT;
  vec2 uv11 = (i + vec2(1.0, 1.0) + 0.5) / NT;
  float a = mix(texture(uHeight, uv00).r, texture(uHeight, uv10).r, f.x);
  float b = mix(texture(uHeight, uv01).r, texture(uHeight, uv11).r, f.x);
  return mix(a, b, f.y);
}

vec3 terrainNormal(vec2 p) {
  float e = 13.0;
  float hl = hBil(p - vec2(e, 0.0));
  float hr = hBil(p + vec2(e, 0.0));
  float hd = hBil(p - vec2(0.0, e));
  float hu = hBil(p + vec2(0.0, e));
  return normalize(vec3(hl - hr, 2.0 * e, hd - hu));
}

vec2 sunAzimuth() { return normalize(uSun.xz); }

float sunSide(vec3 dir) {
  vec2 d = normalize(dir.xz + vec2(1e-5));
  return pow(dot(d, sunAzimuth()) * 0.5 + 0.5, 2.0);
}

vec3 hazeColor(vec3 dir) {
  float side = sunSide(dir);
  return mix(vec3(0.56, 0.44, 0.60), vec3(1.02, 0.66, 0.38), side);
}

vec3 skyBase(vec3 rd) {
  float y = rd.y;
  float side = sunSide(rd);
  vec3 horizon = mix(vec3(0.66, 0.48, 0.62), vec3(1.02, 0.62, 0.30), side);
  vec3 mid = mix(vec3(0.34, 0.27, 0.47), vec3(0.88, 0.42, 0.40), pow(side, 0.8));
  vec3 zenith = vec3(0.075, 0.095, 0.245);

  vec3 c = mix(horizon, mid, smoothstep(0.0, 0.16, y));
  c = mix(c, zenith, smoothstep(0.12, 0.72, y));
  c += vec3(0.30, 0.13, 0.03) * exp(-abs(y) * 16.0) * pow(side, 2.5);

  float sd = max(dot(rd, uSun), 0.0);
  c += vec3(1.0, 0.62, 0.28) * pow(sd, 5.0) * 0.11;
  c += vec3(1.0, 0.80, 0.52) * pow(sd, 70.0) * 0.55;
  c += vec3(1.0, 0.62, 0.28) * pow(sd, 500.0) * 0.16;
  float disc = smoothstep(0.9962, 0.9972, sd);
  vec3 sunCol = mix(vec3(1.0, 0.88, 0.66), vec3(1.0, 0.995, 0.95), smoothstep(0.9958, 0.9988, sd));
  c = mix(c, sunCol, disc);

  // high cirrus
  if (y > 0.015) {
    vec2 cuv = (uCamPos.xz + rd.xz * (2400.0 / y)) / 8200.0;
    float ci = texture(uCloud, cuv + vec2(uTime * 0.0012, uTime * 0.0002)).r;
    float ci2 = texture(uCloud, cuv * 2.7 + 0.31).r;
    float wisp = smoothstep(0.56, 0.84, ci * 0.62 + ci2 * 0.38);
    wisp *= smoothstep(0.015, 0.10, y) * smoothstep(0.62, 0.22, y);
    vec3 wc = mix(vec3(0.78, 0.56, 0.66), vec3(1.0, 0.80, 0.56), side);
    c = mix(c, wc, wisp * 0.55);
  }
  return c;
}

void main() {
  vec2 ndc = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  float aspect = uRes.x / uRes.y;
  vec3 rd = normalize(uCamBasis * vec3(ndc.x * uTanFov * aspect, ndc.y * uTanFov, -1.0));
  vec3 ro = uCamPos;

  if (uDebug == 4) {
    float hh = hRaw(vec2(3318.0, 4758.0));
    fragColor = vec4(step(0.0, hh), step(1.0, abs(hh)), step(100.0, abs(hh)), 1.0);
    gl_FragDepth = 0.5;
    return;
  }

  // ---- heightfield ray march (quadratic steps + bisection) ----
  float hitT = -1.0;
  float tPrev = 0.0;
  for (int i = 0; i < 158; i++) {
    float f = float(i) / 157.0;
    float t = 1.2 + f * f * 27000.0;
    vec3 p = ro + rd * t;
    if (p.y > 1180.0 && rd.y > 0.0) break;
    float h = hRaw(p.xz);
    if (p.y < h) {
      float a = tPrev, b = t;
      for (int k = 0; k < 7; k++) {
        float m = (a + b) * 0.5;
        vec3 q = ro + rd * m;
        if (q.y < hRaw(q.xz)) b = m; else a = m;
      }
      hitT = (a + b) * 0.5;
      break;
    }
    tPrev = t;
    if (t > 27000.0) break;
  }

  float waterT = 1e9;
  if (rd.y < -1e-4 && ro.y > 0.0) waterT = -ro.y / rd.y;
  bool water = waterT < hitT || (hitT < 0.0 && waterT < 27000.0);

  vec3 col;
  float depthOut = 1.0;

  if (water) {
    float t = waterT;
    vec3 p = ro + rd * t;
    depthOut = (uFar + uNear) / (uFar - uNear) - (2.0 * uFar * uNear) / ((uFar - uNear) * t);
    depthOut = depthOut * 0.5 + 0.5;

    float depth = clamp(-hBil(p.xz), 0.0, 44.0);
    vec3 wbase = mix(vec3(0.17, 0.60, 0.54), vec3(0.025, 0.085, 0.19), smoothstep(0.6, 14.0, depth));
    wbase = mix(wbase, vec3(0.34, 0.72, 0.62), smoothstep(1.6, 0.0, depth) * 0.85);

    float w1 = sin(dot(p.xz, vec2(0.073, 0.041)) + uTime * 1.15);
    float w2 = sin(dot(p.xz, vec2(-0.049, 0.091)) - uTime * 0.9);
    vec3 wn = normalize(vec3(w1 * 0.024 + w2 * 0.011, 1.0, w2 * 0.027 - w1 * 0.013));

    vec3 rfd = reflect(rd, wn);
    rfd.y = abs(rfd.y);
    vec3 refl = skyBase(normalize(rfd));
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-rd, wn), 0.0), 4.5);
    fres = clamp(fres, 0.0, 0.88);

    float wl = max(dot(wn, uSun), 0.0);
    vec3 amb = vec3(0.34, 0.28, 0.38);
    vec3 wcol = wbase * (amb + vec3(1.30, 0.82, 0.50) * wl * 0.9);

    // cloud shadow on the lake
    float cs = texture(uCloud, p.xz / TILE * 2.0 + sunAzimuth() * 0.115).r;
    wcol *= mix(1.0, 0.76, smoothstep(0.44, 0.64, cs));

    col = mix(wcol, refl, fres);

    // sun glitter band, broken into pixel shimmer
    vec3 halfV = normalize(uSun - rd);
    float spec = pow(max(dot(wn, halfV), 0.0), 150.0);
    float broad = pow(max(dot(rfd, uSun), 0.0), 9.0);
    float shimmer = texture(uCloud, p.xz / 640.0 + vec2(uTime * 0.004, -uTime * 0.003)).r;
    vec3 glint = vec3(1.0, 0.82, 0.55) * (spec * 0.95 + broad * 0.24) * (0.55 + 0.75 * shimmer);
    glint *= 1.0 - smoothstep(900.0, 3800.0, t) * 0.55;
    col += glint;

    // pin-prick white glints wandering across the wavelets
    float cell = hash12(floor(p.xz * 1.35) + floor(uTime * 9.0) * 1.7);
    float spark = step(0.986, cell) * smoothstep(1.2, 6.0, depth);
    spark *= 1.0 - smoothstep(1600.0, 4200.0, t);
    col += vec3(1.0, 0.96, 0.84) * spark * 0.55;

    // foam near shores
    float fn = texture(uMask, p.xz / TILE * 4.0).a;
    float surf = sin(p.x * 0.23 + p.z * 0.19 + uTime * 1.4 + fn * 9.0);
    float bandA = smoothstep(1.6, 0.04, depth) * (0.50 + 0.50 * surf);
    bandA = max(bandA, smoothstep(0.88, 0.97, fn) * smoothstep(1.2, 0.0, depth) * 0.5);
    float foam = smoothstep(0.55, 0.95, bandA);
    col = mix(col, vec3(0.95, 0.92, 0.83), foam * 0.29);

    float dist = t;
    col = mix(col, hazeColor(rd), 1.0 - exp(-dist * 0.000075));
    if (uDebug == 1) col = vec3(0.0, 1.0, 0.0);
    if (uDebug == 2) col = vec3(fres, depth / 44.0, 0.0);
  } else if (hitT > 0.0) {
    float t = hitT;
    vec3 p = ro + rd * t;
    depthOut = (uFar + uNear) / (uFar - uNear) - (2.0 * uFar * uNear) / ((uFar - uNear) * t);
    depthOut = depthOut * 0.5 + 0.5;

    vec4 mk = texture(uMask, p.xz / TILE);
    float h = hBil(p.xz);
    vec3 n = terrainNormal(p.xz);
    float forest = mk.r;
    float var = mk.g;
    float rock = mk.b;
    float det = mk.a;

    vec3 meadow = mix(vec3(0.50, 0.58, 0.34), vec3(0.64, 0.67, 0.42), var);
    meadow = mix(meadow, vec3(0.44, 0.49, 0.27), smoothstep(0.55, 0.85, det) * 0.30);

    vec3 canopy = mix(vec3(0.66, 0.34, 0.11), vec3(0.42, 0.15, 0.10), smoothstep(0.30, 0.72, var));
    canopy = mix(canopy, vec3(0.84, 0.62, 0.22), smoothstep(0.58, 0.84, fract(var * 4.7 + det * 0.2)));
    float det2 = texture(uMask, p.xz / TILE * 11.0).a;
    float det3 = texture(uMask, p.xz / TILE * 29.0).a;
    float fine = texture(uMask, p.xz / TILE * 97.0).a;
    float conifer = smoothstep(0.55, 0.66, det2) * 0.55 + smoothstep(0.64, 0.76, det3) * 0.45;
    conifer = max(conifer, smoothstep(0.58, 0.72, fine) * 0.8);
    canopy = mix(canopy, vec3(0.13, 0.17, 0.10), conifer * 0.32);
    float tree = step(0.62, hash12(floor(p.xz / 9.0) + 3.0));
    canopy = mix(canopy, vec3(0.11, 0.15, 0.08), tree * smoothstep(0.35, 0.75, forest) * 0.28);
    float clump = hash12(floor(p.xz / 34.0) + 11.0);
    canopy = mix(canopy, vec3(0.86, 0.62, 0.18), step(0.86, clump) * smoothstep(0.3, 0.7, forest) * 0.20);
    vec3 base = mix(meadow, canopy, smoothstep(0.44, 0.66, forest));
    base = mix(base, vec3(0.13, 0.16, 0.09), smoothstep(0.55, 0.85, conifer) * smoothstep(0.40, 0.70, forest) * 0.55);

    float rockAmt = smoothstep(0.42, 0.74, rock) * 0.9 + smoothstep(620.0, 780.0, h) * 0.25;
    rockAmt = clamp(rockAmt, 0.0, 1.0);
    vec3 rockCol = mix(vec3(0.40, 0.36, 0.44), vec3(0.56, 0.51, 0.57), det);
    base = mix(base, rockCol, rockAmt);

    float sand = smoothstep(2.8, 0.6, h + (det - 0.5) * 2.5);
    base = mix(base, mix(vec3(0.76, 0.67, 0.46), vec3(0.86, 0.75, 0.54), det), sand);
    base = mix(base, vec3(0.56, 0.48, 0.35), smoothstep(1.0, 0.0, h) * 0.55);

    float snow = smoothstep(600.0, 690.0, h + (var - 0.5) * 90.0) * smoothstep(0.50, 0.74, n.y);
    base = mix(base, vec3(0.94, 0.90, 0.88), snow);
    base *= 0.90 + 0.12 * fine + 0.05 * det3;
    float blades = hash12(floor(p.xz / 4.0) + 7.0);
    base *= 0.96 + 0.06 * blades * (1.0 - smoothstep(0.40, 0.80, forest));

    float hx = hBil(p.xz + vec2(85.0, 0.0)) - hBil(p.xz - vec2(85.0, 0.0));
    float hz = hBil(p.xz + vec2(0.0, 85.0)) - hBil(p.xz - vec2(0.0, 85.0));
    vec3 nL = normalize(vec3(-hx * 3.2, 240.0, -hz * 3.2));
    float ndl = max(dot(nL, uSun), 0.0);
    float slope = clamp(length(vec2(hx, hz)) / 240.0, 0.0, 1.0);
    float band = ndl > 0.34 ? 1.0 : ndl > 0.21 ? 0.80 : ndl > 0.09 ? 0.58 : 0.40;
    float sh = texture(uShadow, p.xz / TILE).r;
    sh = floor(sh * 3.999 + 0.5) / 4.0;
    vec3 amb = mix(vec3(0.30, 0.30, 0.44), vec3(0.42, 0.38, 0.50), n.y);
    vec3 col2 = base * (amb + vec3(1.12, 0.94, 0.70) * band * mix(0.46, 1.0, sh));
    col2 *= 1.0 - slope * 0.30;
    col2 += base * vec3(0.22, 0.09, 0.02) * pow(ndl, 7.0) * sh;

    // dappled tree shadow texture on meadows
    col2 *= 0.96 + 0.06 * det;

    float cs = texture(uCloud, p.xz / TILE * 2.0 + sunAzimuth() * 0.115).r;
    col2 *= mix(1.0, 0.72, smoothstep(0.44, 0.64, cs));

    col = col2;
    float dist = t;
    col = mix(col, hazeColor(rd), 1.0 - exp(-dist * 0.000072));
    col = mix(col, vec3(0.86, 0.70, 0.58), smoothstep(1200.0, 4000.0, h) * 0.12);
    if (uDebug == 1) col = vec3(1.0, 0.0, 0.0);
    if (uDebug == 3) col = vec3(fract(p.xz / TILE * 8.0), 0.0);
  } else {
    col = skyBase(rd);
    if (rd.y < 0.02) {
      col = mix(col, hazeColor(rd), smoothstep(0.02, -0.04, rd.y) * 0.65);
    }
    depthOut = 1.0;
    if (uDebug == 1) col = vec3(0.0, 0.0, 1.0);
  }

  // ordered-dither palette crush
  float b = bayer4(gl_FragCoord.xy);
  col = clamp(col, 0.0, 1.0);
  float sunMask = (depthOut > 0.999 ? 1.0 : 0.0) * smoothstep(0.9960, 0.9972, dot(rd, uSun));
  if (uDebug == 0) {
    vec3 crushed = floor(col * 8.0 + b) / 8.0;
    vec3 flatSun = floor(col * 24.0) / 24.0;
    col = mix(crushed, flatSun, sunMask);
  }

  gl_FragDepth = depthOut;
  fragColor = vec4(col, 1.0);
}`;

const MESH_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform mat3 uNormalMat;
uniform vec3 uCamPos;
uniform float uLinePush;
uniform float uExpand;
out vec3 vNormal;
out vec3 vColor;
out vec3 vWorld;
void main() {
  vec3 wn = normalize(uNormalMat * aNormal);
  vec3 wp = (uModel * vec4(aPos, 1.0)).xyz + wn * uExpand;
  vec4 clip = uViewProj * vec4(wp, 1.0);
  if (uLinePush > 0.0) {
    vec3 toCam = normalize(uCamPos - wp);
    clip = uViewProj * vec4(wp + toCam * uLinePush, 1.0);
  }
  gl_Position = clip;
  vNormal = wn;
  vColor = aColor;
  vWorld = wp;
}`;

const MESH_FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vColor;
in vec3 vWorld;
uniform vec3 uSun;
uniform vec3 uCamPos;
uniform vec3 uHaze;
uniform vec4 uOverride;
uniform float uAlpha;
uniform float uFlash;
uniform float uEmit;
out vec4 fragColor;
void main() {
  vec3 n = normalize(vNormal);
  float ndl = max(dot(n, uSun), 0.0);
  float band = ndl > 0.68 ? 1.0 : ndl > 0.40 ? 0.80 : ndl > 0.16 ? 0.60 : 0.44;
  vec3 base = vColor;
  vec3 amb = mix(vec3(0.35, 0.30, 0.44), vec3(0.50, 0.42, 0.52), n.y * 0.5 + 0.5);
  vec3 col = base * (amb + vec3(1.45, 1.02, 0.72) * band);
  vec3 V = normalize(uCamPos - vWorld);
  float rim = pow(1.0 - max(dot(n, V), 0.0), 2.6);
  col += vec3(1.0, 0.58, 0.32) * rim * 0.55 * (0.35 + 0.65 * max(dot(-n, uSun), 0.0));
  vec3 H = normalize(uSun + V);
  float spec = pow(max(dot(n, H), 0.0), 48.0);
  col += vec3(1.0, 0.85, 0.55) * spec * 0.30;
  col = mix(col, uOverride.rgb, uOverride.a);
  col += base * uEmit;
  col = mix(col, vec3(1.0), uFlash);
  float fog = 1.0 - exp(-length(uCamPos - vWorld) * 0.000035);
  col = mix(col, uHaze, fog * 0.7);
  fragColor = vec4(col, uAlpha);
}`;

const LINE_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in float aAlpha;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform vec3 uCamPos;
uniform float uPush;
out float vAlpha;
void main() {
  vec3 wp = (uModel * vec4(aPos, 1.0)).xyz;
  wp += normalize(uCamPos - wp) * uPush;
  gl_Position = uViewProj * vec4(wp, 1.0);
  vAlpha = aAlpha;
}`;

const LINE_FS = `#version 300 es
precision highp float;
in float vAlpha;
uniform vec4 uColor;
out vec4 fragColor;
void main() { fragColor = vec4(uColor.rgb, uColor.a * vAlpha); }`;

const CLOUD_VS = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec3 aCenter;
layout(location = 2) in vec2 aSize;
layout(location = 3) in float aShade;
uniform mat4 uViewProj;
uniform vec3 uCamRight;
uniform vec3 uCamPos;
out vec2 vUV;
out float vShade;
out float vDist;
out vec3 vWorld;
void main() {
  vec3 wp = aCenter + uCamRight * (aCorner.x * aSize.x) + vec3(0.0, 1.0, 0.0) * (aCorner.y * aSize.y + aSize.y * 0.35);
  gl_Position = uViewProj * vec4(wp, 1.0);
  vUV = vec2(aCorner.x * 0.5 + 0.5, 1.0 - (aCorner.y * 0.5 + 0.5));
  vShade = aShade;
  vDist = length(wp - uCamPos);
  vWorld = wp;
}`;

const CLOUD_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in float vShade;
in float vDist;
in vec3 vWorld;
uniform sampler2D uTex;
uniform vec3 uHaze;
uniform vec3 uSun;
uniform vec3 uCamPos;
uniform vec3 uShadowPos;
uniform float uShadowOn;
out vec4 fragColor;
void main() {
  vec4 t = texture(uTex, vUV);
  if (t.a < 0.5) discard;
  vec3 col = t.rgb * (0.72 + 0.28 * vShade);
  float sd = length(vWorld.xz - uShadowPos.xz);
  float sh = 1.0 - 0.38 * uShadowOn * smoothstep(26.0, 2.0, sd);
  col *= sh;
  col = mix(col, uHaze, clamp(1.0 - exp(-vDist * 0.00006), 0.0, 0.55));
  fragColor = vec4(col, 1.0);
}`;

const SPRITE_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in float aSize;
layout(location = 2) in vec4 aColor;
uniform mat4 uViewProj;
uniform float uPixelScale;
uniform float uMaxPoint;
out vec4 vColor;
void main() {
  vec4 clip = uViewProj * vec4(aPos, 1.0);
  gl_Position = clip;
  gl_PointSize = clamp(aSize * uPixelScale / max(clip.w, 1.0), 1.0, uMaxPoint);
  vColor = aColor;
}`;

const SPRITE_FS = `#version 300 es
precision highp float;
in vec4 vColor;
uniform int uShape;
out vec4 fragColor;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = length(q);
  if (r > 1.0) discard;
  float a;
  if (uShape == 1) {
    a = smoothstep(0.62, 0.82, r) * smoothstep(1.0, 0.9, r);
  } else if (uShape == 2) {
    a = smoothstep(1.0, 0.1, r);
    a *= a;
  } else {
    a = smoothstep(1.0, 0.0, r);
  }
  fragColor = vec4(vColor.rgb, vColor.a * a);
}`;

const GL = {
  canvas: null,
  gl: null,
  w: 0,
  h: 0,
  baseW: 604,
  baseH: 340,
  scale: 1,
  prog: {},
  tex: {},
  cloudInstances: null,
  cloudBuffer: null,
  cloudVAO: null,
  cloudQuad: null,
  cloudCount: 0,
  spriteVAO: null,
  spriteBuffer: null,
  cloudSprites: [],
};

function glCompile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    throw new Error('shader: ' + log);
  }
  return s;
}
function glProgram(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, glCompile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, glCompile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('link: ' + gl.getProgramInfoLog(p));
  }
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

function makeTex(gl, w, h, internal, format, type, data, filter) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return t;
}

function glInit(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error('WebGL2 not available');
  GL.canvas = canvas;
  GL.gl = gl;
  gl.disable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearColor(0.08, 0.07, 0.14, 1);

  GL.prog.scene = glProgram(gl, SCENE_VS, SCENE_FS);
  GL.prog.mesh = glProgram(gl, MESH_VS, MESH_FS);
  GL.prog.line = glProgram(gl, LINE_VS, LINE_FS);
  GL.prog.cloud = glProgram(gl, CLOUD_VS, CLOUD_FS);
  GL.prog.sprite = glProgram(gl, SPRITE_VS, SPRITE_FS);

  const triVAO = gl.createVertexArray();
  gl.bindVertexArray(triVAO);
  GL.triVAO = triVAO;

  // cloud quad corners
  const corners = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
  GL.cloudQuad = quad;

  GL.cloudVAO = gl.createVertexArray();
  gl.bindVertexArray(GL.cloudVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  GL.cloudBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, GL.cloudBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, 4 * 6 * 600, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 24, 12);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 24, 20);
  gl.vertexAttribDivisor(1, 1);
  gl.vertexAttribDivisor(2, 1);
  gl.vertexAttribDivisor(3, 1);
  gl.bindVertexArray(null);

  // dynamic sprite buffer
  GL.spriteVAO = gl.createVertexArray();
  gl.bindVertexArray(GL.spriteVAO);
  GL.spriteBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, GL.spriteBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, 8 * 6000, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 32, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
  gl.bindVertexArray(null);

  GL.cloudSprites = makeCloudSprites();
  return gl;
}

function glUploadWorld(data) {
  const gl = GL.gl;
  const N = data.N || data.n, MN = data.MN || data.mn, CN = data.CN || data.cn;
  GL.tex.height = makeTex(gl, N, N, gl.R32F, gl.RED, gl.FLOAT, data.heights, gl.NEAREST);
  GL.tex.mask = makeTex(gl, MN, MN, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, data.mask, gl.LINEAR);
  GL.tex.shadow = makeTex(gl, N, N, gl.R8, gl.RED, gl.UNSIGNED_BYTE, data.shadow, gl.LINEAR);
  GL.tex.cloud = makeTex(gl, CN, CN, gl.R8, gl.RED, gl.UNSIGNED_BYTE, data.cloud, gl.LINEAR);

  // coarse max-height map for empty-space skipping and horizon tests
  const M = 128;
  const step = N / M;
  const mx = new Float32Array(M * M);
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < M; i++) {
      let m = -999;
      for (let z = 0; z < step; z += 4) {
        for (let x = 0; x < step; x += 4) {
          const v = data.heights[((j * step + z) % N) * N + ((i * step + x) % N)];
          if (v > m) m = v;
        }
      }
      mx[j * M + i] = m;
    }
  }
  GL.tex.max = makeTex(gl, M, M, gl.R32F, gl.RED, gl.FLOAT, mx, gl.NEAREST);
  GL.maskN = MN;
  GL.cloudN = CN;
}

/* --- cumulus sprite atlas: sunlit cream tops, violet bases, ragged edges --- */
function makeCloudSprites() {
  const sprites = [];
  const W = 128, H = 84;
  for (let s = 0; s < 4; s++) {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const c = cv.getContext('2d');
    const rng = mulberry32(900 + s * 77);
    const lobes = [];
    const n = 9 + (s % 3) * 3;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = 16 + t * (W - 32) + (rng() - 0.5) * 8;
      const base = H * 0.76;
      const bulge = Math.sin(t * Math.PI);
      const r = (10 + rng() * 12) * (0.45 + bulge * 0.9);
      const y = base - r * (0.35 + rng() * 0.85);
      lobes.push({ x, y, r });
    }
    // main flat base, then a taller crown
    lobes.push({ x: W * 0.5, y: H * 0.80, r: 30 });
    lobes.push({ x: W * 0.38, y: H * 0.46, r: 19 });
    lobes.push({ x: W * 0.62, y: H * 0.40, r: 17 });

    // silhouette in warm mid-tone (no dark outline)
    c.fillStyle = '#d9a88e';
    for (const l of lobes) {
      c.beginPath(); c.arc(l.x, l.y, l.r, 0, TAU); c.fill();
    }
    c.beginPath(); c.ellipse(W * 0.5, H * 0.76, W * 0.40, H * 0.16, 0, 0, TAU); c.fill();

    c.save();
    c.beginPath();
    for (const l of lobes) { c.moveTo(l.x + l.r, l.y); c.arc(l.x, l.y, l.r, 0, TAU); }
    c.ellipse(W * 0.5, H * 0.76, W * 0.40, H * 0.16, 0, 0, TAU);
    c.clip();
    // violet underside, peach body, cream top
    c.fillStyle = '#9b7386';
    c.fillRect(0, H * 0.66, W, H * 0.34);
    c.fillStyle = '#c08e91';
    c.fillRect(0, H * 0.48, W, H * 0.22);
    c.fillStyle = '#d9a88e';
    c.fillRect(0, H * 0.22, W, H * 0.28);
    c.fillStyle = '#f2d2ae';
    c.fillRect(0, 0, W, H * 0.24);
    // soft sunlit crowns offset up-left
    c.fillStyle = '#f7d7b0';
    for (const l of lobes) {
      if (l.r < 12) continue;
      c.beginPath(); c.arc(l.x - l.r * 0.16, l.y - l.r * 0.34, l.r * 0.58, 0, TAU); c.fill();
    }
    // raggedy shoulders: punch a few transparent notches near the base
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 5; i++) {
      const x = 18 + rng() * (W - 36);
      c.beginPath(); c.arc(x, H * (0.72 + rng() * 0.1), 2 + rng() * 4, 0, TAU); c.fill();
    }
    c.restore();

    const img = c.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.round(d[i] / 16) * 16;
      d[i + 1] = Math.round(d[i + 1] / 16) * 16;
      d[i + 2] = Math.round(d[i + 2] / 16) * 16;
      d[i + 3] = d[i + 3] > 100 ? 255 : 0;
    }
    c.putImageData(img, 0, 0);
    const gl = GL.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    sprites.push(t);
  }
  return sprites;
}

function glResize(cssW, cssH, scale) {
  const gl = GL.gl;
  GL.scale = scale;
  GL.baseH = 340;
  GL.baseW = Math.min(820, Math.max(480, Math.round(340 * (cssW / Math.max(cssH, 1)))));
  GL.w = Math.max(240, Math.round(GL.baseW * scale));
  GL.h = Math.max(136, Math.round(GL.baseH * scale));
  if (GL.canvas.width !== GL.w || GL.canvas.height !== GL.h) {
    GL.canvas.width = GL.w;
    GL.canvas.height = GL.h;
  }
  GL.cssW = cssW;
  GL.cssH = cssH;
}

function cameraBasis(q) {
  const r = qRot(q, { x: 1, y: 0, z: 0 });
  const u = qRot(q, { x: 0, y: 1, z: 0 });
  const b = qRot(q, { x: 0, y: 0, z: 1 });
  return { r, u, b };
}

function cameraViewMatrix(cam) {
  const { r, u, b } = cameraBasis(cam.q);
  return new Float32Array([
    r.x, u.x, b.x, 0,
    r.y, u.y, b.y, 0,
    r.z, u.z, b.z, 0,
    -vdot(r, cam.pos), -vdot(u, cam.pos), -vdot(b, cam.pos), 1,
  ]);
}

function modelMatrix(pos, q, scale) {
  const s = scale === undefined ? 1 : scale;
  const r = qRot(q, { x: 1, y: 0, z: 0 });
  const u = qRot(q, { x: 0, y: 1, z: 0 });
  const b = qRot(q, { x: 0, y: 0, z: 1 });
  return new Float32Array([
    r.x * s, r.y * s, r.z * s, 0,
    u.x * s, u.y * s, u.z * s, 0,
    b.x * s, b.y * s, b.z * s, 0,
    pos.x, pos.y, pos.z, 1,
  ]);
}

function normalMatrixFromModel(m) {
  // uniform scale only: rotation columns are already orthonormal
  return new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]);
}

const SUN = vnorm({ x: -0.62, y: 0.18, z: -0.72 });
const HAZE = { x: 0.85, y: 0.61, z: 0.42 };

function buildCloudField() {
  const list = [];
  const rng = mulberry32(4242);
  const N = World.CN;
  const cells = 64;
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const u = (i + 0.5) / cells, v = (j + 0.5) / cells;
      const d = World.cloud[(Math.floor(v * N) % N) * N + (Math.floor(u * N) % N)] / 255;
      if (d > 0.58 && rng() < 0.50) {
        const x = u * World.TILE + (rng() - 0.5) * 120;
        const z = v * World.TILE + (rng() - 0.5) * 120;
        const s = 0.70 + rng() * 0.55;
        list.push({
          x, z,
          y: 455 + rng() * 65,
          sx: (80 + rng() * 65) * s,
          sy: (50 + rng() * 40) * s,
          sprite: Math.floor(rng() * 4),
          shade: 0.45 + rng() * 0.55,
        });
        if (rng() < 0.60) {
          list.push({
            x: x + (rng() - 0.5) * 130,
            z: z + (rng() - 0.5) * 130,
            y: 440 + rng() * 55,
            sx: (55 + rng() * 40) * s,
            sy: (36 + rng() * 24) * s,
            sprite: Math.floor(rng() * 4),
            shade: 0.3 + rng() * 0.5,
          });
        }
      }
    }
  }
  // a couple of hero cumulus in the opening view
  const sp = World.spawn;
  const fx = Math.sin(sp.yaw), fz = -Math.cos(sp.yaw);
  const rx = Math.cos(sp.yaw), rz = Math.sin(sp.yaw);
  const heroes = [
    [1650, -520, 500, 1.15],
    [1800, -360, 486, 0.85],
    [1560, -610, 470, 0.70],
    [2950, 620, 505, 1.30],
    [3150, 780, 492, 0.95],
    [2800, 500, 476, 0.70],
  ];
  for (const [f, s, y, k] of heroes) {
    const x = sp.x + fx * f + rx * s;
    const z = sp.z + fz * f + rz * s;
    list.push({
      x, z, y,
      sx: 158 * k, sy: 102 * k,
      sprite: Math.floor(rng() * 4),
      shade: 0.55 + rng() * 0.4,
    });
    list.push({
      x: x + (rng() - 0.5) * 120,
      z: z + (rng() - 0.5) * 120,
      y: y - 8,
      sx: 112 * k, sy: 70 * k,
      sprite: Math.floor(rng() * 4),
      shade: 0.35 + rng() * 0.4,
    });
  }
  GL.cloudClusters = list;
}

function renderClouds(cam, viewProj, shadow) {
  if (!GL.cloudClusters) buildCloudField();
  const gl = GL.gl;
  const { r } = cameraBasis(cam.q);
  const fwd = qRot(cam.q, { x: 0, y: 0, z: -1 });
  const inst = [];
  const tile = World.TILE;
  const cx = cam.pos.x, cz = cam.pos.z;
  const baseI = Math.floor(cx / tile), baseJ = Math.floor(cz / tile);
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      for (const c of GL.cloudClusters) {
        const wx = c.x + (baseI + di) * tile;
        const wz = c.z + (baseJ + dj) * tile;
        const dx = wx - cx, dz = wz - cz;
        if (dx * dx + dz * dz > 15000 * 15000) continue;
        if (dx * fwd.x + dz * fwd.z < -600) continue;
        inst.push(wx, c.y, wz, c.sx, c.sy, c.shade, c.sprite);
      }
    }
  }
  // sort far to near, grouped by sprite
  const groups = [[], [], [], []];
  for (let i = 0; i < inst.length; i += 7) {
    const dx = inst[i] - cx, dz = inst[i + 2] - cz;
    groups[inst[i + 6]].push([dx * dx + dz * dz, inst[i], inst[i + 1], inst[i + 2], inst[i + 3], inst[i + 4], inst[i + 5]]);
  }
  const prog = GL.prog.cloud;
  gl.useProgram(prog.p);
  gl.uniformMatrix4fv(prog.u.uViewProj, false, viewProj);
  gl.uniform3f(prog.u.uCamRight, r.x, r.y, r.z);
  gl.uniform3f(prog.u.uCamPos, cam.pos.x, cam.pos.y, cam.pos.z);
  gl.uniform3f(prog.u.uHaze, HAZE.x, HAZE.y, HAZE.z);
  gl.uniform3f(prog.u.uSun, SUN.x, SUN.y, SUN.z);
  gl.uniform3f(prog.u.uShadowPos, shadow ? shadow.x : 0, shadow ? shadow.y : 0, shadow ? shadow.z : 0);
  gl.uniform1f(prog.u.uShadowOn, shadow ? 1 : 0);
  gl.bindVertexArray(GL.cloudVAO);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(true);
  for (let s = 0; s < 4; s++) {
    const g = groups[s];
    if (!g.length) continue;
    g.sort((a, b) => b[0] - a[0]);
    const arr = new Float32Array(g.length * 6);
    for (let i = 0; i < g.length; i++) {
      arr[i * 6] = g[i][1]; arr[i * 6 + 1] = g[i][2]; arr[i * 6 + 2] = g[i][3];
      arr[i * 6 + 3] = g[i][4]; arr[i * 6 + 4] = g[i][5]; arr[i * 6 + 5] = g[i][6];
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, GL.cloudSprites[s]);
    gl.uniform1i(prog.u.uTex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, GL.cloudBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, g.length);
  }
  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);
}

function renderWorld(cam, time) {
  const gl = GL.gl;
  const prog = GL.prog.scene;
  gl.useProgram(prog.p);
  const aspect = GL.w / GL.h;
  const tanFov = Math.tan(cam.fov * 0.5);
  const cb = cameraBasis(cam.q);
  gl.uniform2f(prog.u.uRes, GL.w, GL.h);
  gl.uniform1f(prog.u.uTime, time);
  gl.uniform3f(prog.u.uCamPos, cam.pos.x, cam.pos.y, cam.pos.z);
  gl.uniformMatrix3fv(prog.u.uCamBasis, false, new Float32Array([
    cb.r.x, cb.r.y, cb.r.z,
    cb.u.x, cb.u.y, cb.u.z,
    cb.b.x, cb.b.y, cb.b.z,
  ]));
  gl.uniform1f(prog.u.uTanFov, tanFov);
  gl.uniform3f(prog.u.uSun, SUN.x, SUN.y, SUN.z);
  gl.uniform1f(prog.u.uNear, cam.near);
  gl.uniform1f(prog.u.uFar, cam.far);

  const units = [['uHeight', GL.tex.height], ['uMask', GL.tex.mask], ['uShadow', GL.tex.shadow], ['uCloud', GL.tex.cloud], ['uMax', GL.tex.max]];
  units.forEach(([name, tex], i) => {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(prog.u[name], i);
  });
  gl.uniform1i(prog.u.uDebug, (window.__dusk && window.__dusk.debug) | 0);

  gl.bindVertexArray(GL.triVAO);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
}
