/* ============================================================
   DUSK PATROL — core: math, clock, pixel font, drawing helpers
   ============================================================ */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const mod = (a, n) => ((a % n) + n) % n;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a || 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
};
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const sign = (v) => (v < 0 ? -1 : 1);
const fract = (v) => v - Math.floor(v);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function v3(x = 0, y = 0, z = 0) { return { x, y, z }; }
function vadd(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function vsub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function vmul(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
function vmad(a, b, s) { return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s }; }
function vdot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function vcross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function vlen(a) { return Math.hypot(a.x, a.y, a.z); }
function vnorm(a) {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}
function vlerp(a, b, t) { return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) }; }
function vcopy(a) { return { x: a.x, y: a.y, z: a.z }; }

/* --- quaternion (x,y,z,w), right-handed, forward = -Z, up = +Y --- */
function qIdent() { return { x: 0, y: 0, z: 0, w: 1 }; }
function qMul(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
function qAxis(axis, ang) {
  const s = Math.sin(ang * 0.5), c = Math.cos(ang * 0.5);
  const l = vlen(axis) || 1;
  return { x: (axis.x / l) * s, y: (axis.y / l) * s, z: (axis.z / l) * s, w: c };
}
function qNormalize(q) {
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}
function qRot(q, v) {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y;
  const iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x;
  const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  };
}
function qFromYawPitchRoll(yaw, pitch, roll) {
  const qy = qAxis({ x: 0, y: 1, z: 0 }, yaw);
  const qp = qAxis({ x: 1, y: 0, z: 0 }, pitch);
  const qr = qAxis({ x: 0, y: 0, z: 1 }, roll);
  return qNormalize(qMul(qMul(qy, qp), qr));
}
function qSlerp(a, b, t) {
  let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let bb = b;
  if (cos < 0) { cos = -cos; bb = { x: -b.x, y: -b.y, z: -b.z, w: -b.w }; }
  if (cos > 0.9995) {
    return qNormalize({
      x: lerp(a.x, bb.x, t), y: lerp(a.y, bb.y, t),
      z: lerp(a.z, bb.z, t), w: lerp(a.w, bb.w, t),
    });
  }
  const th = Math.acos(clamp(cos, -1, 1));
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return qNormalize({
    x: a.x * wa + bb.x * wb, y: a.y * wa + bb.y * wb,
    z: a.z * wa + bb.z * wb, w: a.w * wa + bb.w * wb,
  });
}
function dirFromYawPitch(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

/* --- mat4 (column major) --- */
function m4() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
function m4Mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}
function m4Perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}
function m4LookAt(eye, target, up) {
  let f = vnorm(vsub(target, eye));
  let r = vcross(f, up);
  if (vlen(r) < 1e-5) r = vcross(f, { x: 0, y: 0, z: 1 });
  r = vnorm(r);
  const u = vcross(r, f);
  return new Float32Array([
    r.x, u.x, -f.x, 0,
    r.y, u.y, -f.y, 0,
    r.z, u.z, -f.z, 0,
    -vdot(r, eye), -vdot(u, eye), vdot(f, eye), 1,
  ]);
}
function projectPoint(m, p, w, h) {
  const x = p.x, y = p.y, z = p.z;
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (cw <= 1e-4) return null;
  return { x: (cx / cw * 0.5 + 0.5) * w, y: (1 - (cy / cw * 0.5 + 0.5)) * h, w: cw };
}

/* --- 5x7 pixel font --- */
const FONT = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  '0': [0b01110, 0b10011, 0b10101, 0b10101, 0b10101, 0b11001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  '.': [0, 0, 0, 0, 0, 0b00110, 0b00110],
  ':': [0, 0b00110, 0b00110, 0, 0b00110, 0b00110, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  '/': [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  '\u00b0': [0b01100, 0b10010, 0b10010, 0b01100, 0, 0, 0],
  '%': [0b11001, 0b11010, 0b00010, 0b00100, 0b01000, 0b01011, 0b10011],
  '(': [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ')': [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  '<': [0b00010, 0b00100, 0b01000, 0b10000, 0b01000, 0b00100, 0b00010],
  '>': [0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0b01000],
  '=': [0, 0b11111, 0, 0b11111, 0, 0, 0],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
  '?': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0, 0b00100],
  '*': [0, 0b10101, 0b01110, 0b11111, 0b01110, 0b10101, 0],
  '^': [0b00100, 0b01110, 0b11111, 0b00100, 0b00100, 0b00100, 0],
  '_': [0, 0, 0, 0, 0, 0, 0b11111],
  "'": [0b00100, 0b00100, 0, 0, 0, 0, 0],
  '#': [0b01010, 0b11111, 0b01010, 0b01010, 0b11111, 0b01010, 0],
};
const FONT_CHARS = Object.keys(FONT);
const FONT_INDEX = {};
FONT_CHARS.forEach((c, i) => (FONT_INDEX[c] = i));
const GLYPH_W = 5, GLYPH_H = 7, GLYPH_ADV = 6, ATLAS_H = 8;

const atlasCache = new Map();
function fontAtlas(color) {
  let a = atlasCache.get(color);
  if (a) return a;
  const cv = document.createElement('canvas');
  cv.width = FONT_CHARS.length * GLYPH_ADV;
  cv.height = ATLAS_H;
  const c = cv.getContext('2d');
  c.fillStyle = color;
  for (let i = 0; i < FONT_CHARS.length; i++) {
    const g = FONT[FONT_CHARS[i]];
    for (let row = 0; row < 7; row++) {
      const bits = g[row];
      for (let col = 0; col < 5; col++) {
        if (bits & (1 << (4 - col))) c.fillRect(i * GLYPH_ADV + col, row, 1, 1);
      }
    }
  }
  atlasCache.set(color, cv);
  return cv;
}

function textWidth(str, scale = 1) {
  const s = String(str).toUpperCase();
  return s.length * GLYPH_ADV * scale - scale;
}

/**
 * Draw 5x7 pixel-font text. Coordinates and scale are integers.
 * align: 'left' | 'center' | 'right'
 */
function drawText(ctx, str, x, y, scale = 1, color = '#ffdaa8', align = 'left', shadow = null) {
  const s = String(str).toUpperCase();
  const atlas = fontAtlas(color);
  const w = s.length * GLYPH_ADV * scale - scale;
  let px = Math.round(x);
  const py = Math.round(y);
  if (align === 'center') px = Math.round(x - w / 2);
  else if (align === 'right') px = Math.round(x - w);
  if (shadow) {
    const sh = fontAtlas(shadow);
    for (let i = 0; i < s.length; i++) {
      const gi = FONT_INDEX[s[i]];
      if (gi === undefined) continue;
      ctx.drawImage(sh, gi * GLYPH_ADV, 0, GLYPH_W, GLYPH_H,
        px + i * GLYPH_ADV * scale + scale, py + scale, GLYPH_W * scale, GLYPH_H * scale);
    }
  }
  for (let i = 0; i < s.length; i++) {
    const gi = FONT_INDEX[s[i]];
    if (gi === undefined) continue;
    ctx.drawImage(atlas, gi * GLYPH_ADV, 0, GLYPH_W, GLYPH_H,
      px + i * GLYPH_ADV * scale, py, GLYPH_W * scale, GLYPH_H * scale);
  }
  return w;
}

/* --- 2D pixel drawing helpers --- */
function pix(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function pixLine(ctx, x0, y0, x1, y1, color) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = color;
  for (let i = 0; i < 4000; i++) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function pixRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), 1, Math.round(h));
  ctx.fillRect(Math.round(x + w - 1), Math.round(y), 1, Math.round(h));
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), 1);
  ctx.fillRect(Math.round(x), Math.round(y + h - 1), Math.round(w), 1);
}
function pixCircle(ctx, cx, cy, r, color, fill = false) {
  cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
  let x = r, y = 0, err = 1 - r;
  ctx.fillStyle = color;
  while (x >= y) {
    if (fill) {
      for (let i = -x; i <= x; i++) {
        ctx.fillRect(cx + i, cy + y, 1, 1);
        ctx.fillRect(cx + i, cy - y, 1, 1);
      }
      for (let i = -y; i <= y; i++) {
        ctx.fillRect(cx + i, cy + x, 1, 1);
        ctx.fillRect(cx + i, cy - x, 1, 1);
      }
    } else {
      ctx.fillRect(cx + x, cy + y, 1, 1); ctx.fillRect(cx + x, cy - y, 1, 1);
      ctx.fillRect(cx - x, cy + y, 1, 1); ctx.fillRect(cx - x, cy - y, 1, 1);
      ctx.fillRect(cx + y, cy + x, 1, 1); ctx.fillRect(cx + y, cy - x, 1, 1);
      ctx.fillRect(cx - y, cy + x, 1, 1); ctx.fillRect(cx - y, cy - x, 1, 1);
    }
    y++;
    if (err < 0) err += 2 * y + 1;
    else { x--; err += 2 * (y - x) + 1; }
  }
}
function pixDisc(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y));
    ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1);
  }
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
function bayer(x, y) { return BAYER4[y & 3][x & 3] / 16; }

/** Ordered 4x4 dither fill of a rectangle between two colors. */
function ditherRect(ctx, x, y, w, h, c1, c2, density = 0.5) {
  ctx.fillStyle = c2;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = c1;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      if (bayer(x + xx, y + yy) < density) ctx.fillRect(x + xx, y + yy, 1, 1);
    }
  }
}

/** Panel inset with 1px highlight + shadow bevel. */
function bevel(ctx, x, y, w, h, base, light, dark) {
  pix(ctx, x, y, w, h, base);
  pix(ctx, x, y, w, 1, light);
  pix(ctx, x, y, 1, h, light);
  pix(ctx, x, y + h - 1, w, 1, dark);
  pix(ctx, x + w - 1, y, 1, h, dark);
}

function fmt(n, pad = 0, sign = false) {
  let s = Math.abs(Math.round(n)).toString();
  while (s.length < pad) s = '0' + s;
  if (sign) return (n < 0 ? '-' : '+') + s;
  return s;
}
function fmt3(n) {
  const v = Math.round(n);
  return (v < 0 ? '-' : '') + Math.abs(v);
}
function padNum(n, len) {
  let s = Math.abs(Math.floor(n)).toString();
  while (s.length < len) s = '0' + s;
  return s;
}

const CSS = {
  cream: '#ffe4bd',
  creamDim: '#c7ab93',
  amber: '#ffb454',
  amberHot: '#ffd48a',
  hud: '#a8ffbe',
  hudDim: '#5c9c72',
  hudDark: '#203d2c',
  red: '#ff6b52',
  panel: '#22202a',
  panelDark: '#121016',
  panelMid: '#2e2a33',
  panelLight: '#4a424e',
  panelEdge: '#0a0810',
  ink: '#07060a',
  blue: '#78a8d8',
  water: '#2b7f86',
  '': '#000000',
};
