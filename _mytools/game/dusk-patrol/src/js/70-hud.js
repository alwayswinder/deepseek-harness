/* ============================================================
   Canvas 2D HUD and hand-drawn pixel cockpit
   ============================================================ */

const HUD = {
  canvas: null,
  ctx: null,
  W: 604,
  H: 340,
  panel: null,
  pctx: null,
  cursorX: 0,
  cursorY: 0,
  blink: 0,
};

const HC = {
  green: '#a9edb6',
  bright: '#e6ffd8',
  dim: '#5f8a6a',
  faint: '#33513e',
  amber: '#ffc76a',
  amberDim: '#8f6a2e',
  red: '#ff7452',
  panel: '#1b1d25',
  panelHi: '#4b5060',
  panelLo: '#0c0e13',
  ink: '#d9cfae',
};

function initHUD(canvas) {
  HUD.canvas = canvas;
  HUD.ctx = canvas.getContext('2d');
  HUD.ctx.imageSmoothingEnabled = false;
  HUD.panel = document.createElement('canvas');
  HUD.panel.width = 604;
  HUD.panel.height = 106;
  HUD.pctx = HUD.panel.getContext('2d');
  HUD.pctx.imageSmoothingEnabled = false;
  resizeHUD(604, 340);
}

function resizeHUD(w, h) {
  HUD.W = w;
  HUD.H = h;
  if (HUD.canvas.width !== w || HUD.canvas.height !== h) {
    HUD.canvas.width = w;
    HUD.canvas.height = h;
  }
  if (HUD.ctx) HUD.ctx.imageSmoothingEnabled = false;
}

function hudText(ctx, str, x, y, scale, color, align) {
  drawText(ctx, str, x, y, scale, color, align || 'left', 'rgba(4,10,7,0.8)');
}

function hudFrame(ctx, x, y, w, h) {
  const c = 'rgba(150,210,160,0.55)';
  pix(ctx, x, y, 5, 1, c);
  pix(ctx, x, y, 1, 5, c);
  pix(ctx, x + w - 5, y, 5, 1, c);
  pix(ctx, x + w - 1, y, 1, 5, c);
  pix(ctx, x, y + h - 1, 5, 1, c);
  pix(ctx, x, y + h - 5, 1, 5, c);
  pix(ctx, x + w - 5, y + h - 1, 5, 1, c);
  pix(ctx, x + w - 1, y + h - 5, 1, 5, c);
}

function hudProjectDir(d) {
  const r = qRot(Cam.q, { x: 1, y: 0, z: 0 });
  const u = qRot(Cam.q, { x: 0, y: 1, z: 0 });
  const b = qRot(Cam.q, { x: 0, y: 0, z: 1 });
  const x = vdot(d, r), y = vdot(d, u), z = -vdot(d, b);
  if (z < 0.04) return null;
  const tan = Math.tan(Cam.fov * 0.5);
  const aspect = HUD.W / HUD.H;
  const nx = x / (z * tan * aspect);
  const ny = y / (z * tan);
  return {
    x: HUD.W * 0.5 + nx * HUD.W * 0.5,
    y: HUD.H * 0.5 - ny * HUD.H * 0.5,
  };
}

const HUD_REF = /[?&]hudref=1/.test(location.search);

function drawPitchLadder(ctx) {
  const cockpit = Cam.view === 2;
  const top = 34;
  const bottom = HUD.H - (cockpit ? 112 : 8);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, HUD.W, Math.max(0, bottom - top));
  ctx.clip();

  const camF = qRot(Cam.q, { x: 0, y: 0, z: -1 });
  const camYaw = Math.atan2(camF.x, -camF.z);
  const tan = Math.tan(Cam.fov * 0.5);
  const aspect = HUD.W / HUD.H;
  const r = qRot(Cam.q, { x: 1, y: 0, z: 0 });
  const u = qRot(Cam.q, { x: 0, y: 1, z: 0 });
  const b = qRot(Cam.q, { x: 0, y: 0, z: 1 });
  const project = (pitch, az) => {
    const d = dirFromYawPitch(camYaw + az, pitch);
    const vx = vdot(d, r), vy = vdot(d, u), vz = -vdot(d, b);
    if (vz < 0.04) return null;
    return {
      x: HUD.W * 0.5 + (vx / (vz * tan * aspect)) * HUD.W * 0.5,
      y: HUD.H * 0.5 - (vy / (vz * tan)) * HUD.H * 0.5,
    };
  };
  const seg = (pitch, a0, a1, pts, color, dashed) => {
    const arr = [];
    for (let i = 0; i <= pts; i++) {
      const az = a0 + ((a1 - a0) * i) / pts;
      const p = project(pitch, az);
      if (!p) return;
      arr.push(p);
    }
    ctx.fillStyle = color;
    for (let i = 0; i < arr.length - 1; i++) {
      if (dashed && i % 2 === 1) continue;
      pixLine(ctx, arr[i].x + 1, arr[i].y + 1, arr[i + 1].x + 1, arr[i + 1].y + 1, 'rgba(3,8,5,0.92)');
      pixLine(ctx, arr[i].x + 1, arr[i].y + 2, arr[i + 1].x + 1, arr[i + 1].y + 2, 'rgba(3,8,5,0.75)');
      pixLine(ctx, arr[i].x, arr[i].y, arr[i + 1].x, arr[i + 1].y, color);
      pixLine(ctx, arr[i].x, arr[i].y + 1, arr[i + 1].x, arr[i + 1].y + 1, color);
    }
    return arr;
  };
  const line = (pitch, half, pts, color, dashed, gap) => {
    const g = gap === undefined ? 0.05 : gap;
    seg(pitch, -half, -g, pts, color, dashed);
    seg(pitch, g, half, pts, color, dashed);
  };

  // true horizon: long, bright, broken at the centre
  line(0, 0.44, 30, HC.bright, false, 0.045);

  // pitch rungs: short conformal bars with readable end labels
  for (let a = -30; a <= 30; a += 10) {
    if (a === 0) continue;
    const rad = (a * Math.PI) / 180;
    const positive = a > 0;
    line(rad, 0.17, 10, positive ? HC.green : HC.dim, !positive, 0.028);
    const lp = project(rad, -0.205);
    const rp = project(rad, 0.205);
    if (lp && lp.y > 36 && lp.y < bottom - 2) {
      hudText(ctx, String(Math.abs(a)), lp.x - 3, lp.y - 3, 1, positive ? HC.green : HC.dim, 'right');
    }
    if (rp && rp.y > 36 && rp.y < bottom - 2) {
      hudText(ctx, String(Math.abs(a)), rp.x + 3, rp.y - 3, 1, positive ? HC.green : HC.dim, 'left');
    }
  }

  // optical centre / flight path marker
  pix(ctx, HUD.W / 2 - 5, HUD.H / 2, 3, 1, HC.green);
  pix(ctx, HUD.W / 2 + 3, HUD.H / 2, 3, 1, HC.green);
  pix(ctx, HUD.W / 2, HUD.H / 2 - 1, 1, 3, HC.green);

  // debug reference: true horizon (magenta) and +10 deg (cyan)
  if (HUD_REF) {
    line(0, 0.52, 24, '#ff00ff', false, 0.02);
    line(0.1745, 0.52, 24, '#00ffff', false, 0.02);
  }
  ctx.restore();
}

function drawHeadingTape(ctx) {
  const w = 232;
  const x = HUD.W / 2 - w / 2;
  const y = 26;
  const h = 20;
  ctx.fillStyle = 'rgba(7,13,10,0.42)';
  ctx.fillRect(x, y, w, h);
  pix(ctx, x, y + h - 1, w, 1, 'rgba(140,200,150,0.45)');
  pix(ctx, x, y, w, 1, 'rgba(140,200,150,0.25)');
  const hdg = ((Player.yaw * 180) / Math.PI + 360) % 360;
  const span = 110;
  const ppd = w / span;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let d = Math.floor((hdg - span / 2) / 5) * 5; d <= hdg + span / 2; d += 5) {
    const px = x + w / 2 + (d - hdg) * ppd;
    const dd = ((d % 360) + 360) % 360;
    const major = dd % 30 === 0;
    const mid = dd % 10 === 0;
    const th = major ? 0 : mid ? 3 : 2;
    pix(ctx, px, y + 2, 1, 3 + th, major ? HC.green : HC.dim);
    if (major) {
      let label = padNum(dd === 0 ? 360 : dd, 3);
      if (dd === 0) label = 'N';
      else if (dd === 90) label = 'E';
      else if (dd === 180) label = 'S';
      else if (dd === 270) label = 'W';
      hudText(ctx, label, px, y + 8, 1, dd === 0 ? HC.bright : HC.green, 'center');
    }
  }
  ctx.restore();
  // caret
  pix(ctx, x + w / 2 - 1, y + h, 3, 1, HC.amber);
  pix(ctx, x + w / 2, y + h + 1, 1, 2, HC.amber);
  hudText(ctx, padNum(Math.round(hdg) % 360, 3), x + w / 2, y - 8, 1, HC.amber, 'center');
}

function fillPoly(ctx, pts, color) {
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  ctx.fillStyle = color;
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.round(xs[i]), x1 = Math.round(xs[i + 1]);
      if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, 1);
    }
  }
}

function drawTopMarker(ctx) {
  const cx = HUD.W / 2, cy = HUD.H / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Player.yaw);
  // soft dark halo so the marker reads over water or land
  ctx.globalAlpha = 0.65;
  pixCircle(ctx, 0, 0, 22, '#070908');
  ctx.globalAlpha = 1;
  pixCircle(ctx, 0, 0, 20, '#ffe4ad');
  const pts = [
    [0, -22], [2.2, -12], [3.2, -3], [18, 5], [18, 9], [3.6, 6],
    [3.2, 11], [10, 15], [2.4, 14.5], [-2.4, 14.5], [-10, 15], [-3.2, 11],
    [-3.6, 6], [-18, 9], [-18, 5], [-3.2, -3], [-2.2, -12],
  ];
  const shifted = pts.map((p) => [p[0] + 1, p[1] + 2]);
  fillPoly(ctx, shifted, 'rgba(4,6,5,0.9)');
  fillPoly(ctx, pts, HC.amber);
  ctx.strokeStyle = '#14120c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    pixLine(ctx, a[0], a[1], b[0], b[1], '#14120c');
  }
  pix(ctx, 0, -19, 1, 4, HC.bright);
  pixDisc(ctx, 0, 2, 2, HC.amber);
  ctx.restore();
  // heading readout under the tape slot
  const hdg = ((Player.yaw * 180) / Math.PI + 360) % 360;
  hudText(ctx, 'HDG ' + padNum(Math.round(hdg) % 360, 3), HUD.W / 2, 30, 1, HC.amber, 'center');
  hudText(ctx, 'NORTH UP', HUD.W / 2, 41, 1, HC.dim, 'center');
}

function drawFlightHUD(ctx) {
  const cockpit = Cam.view === 2;
  const W = HUD.W, H = HUD.H;
  if (!cockpit && Cam.view === 0) {
    drawTopMarker(ctx);
  } else {
    if (cockpit) drawPitchLadder(ctx);
    drawHeadingTape(ctx);
  }

  // speed
  const bx = 10, by = cockpit ? 96 : 112, bw = 60, bh = 46;
  hudFrame(ctx, bx, by, bw, bh);
  hudText(ctx, 'IAS', bx + 4, by + 4, 1, HC.dim);
  hudText(ctx, fmt(Math.round(Player.speed * 1.94384)), bx + bw / 2, by + 14, 3, HC.green, 'center');
  hudText(ctx, 'KT', bx + bw - 4, by + 4, 1, HC.dim, 'right');

  // altitude
  const ax = W - 70, ay = by, aw = 60, ah = 46;
  hudFrame(ctx, ax, ay, aw, ah);
  hudText(ctx, 'ALT', ax + 4, ay + 4, 1, HC.dim);
  hudText(ctx, fmt(Math.round(Player.pos.y * 3.28084)), ax + aw / 2, ay + 14, 2, HC.green, 'center');
  hudText(ctx, 'FT', ax + aw - 4, ay + 4, 1, HC.dim, 'right');

  // G + radar altitude
  hudFrame(ctx, ax, ay + 52, aw, 32);
  hudText(ctx, 'G ' + Player.gLoad.toFixed(1), ax + 4, ay + 58, 1, Player.gLoad > 6 ? HC.amber : HC.green);
  hudText(ctx, 'R ' + padNum(Math.round(Player.radAlt * 3.28084), 4), ax + 4, ay + 70, 1, Player.lowAlt ? HC.amber : HC.dim);

  // missiles
  const mx = bx, my = by + 54;
  hudText(ctx, 'MSL', mx, my, 1, HC.dim);
  for (let i = 0; i < 4; i++) {
    const px = mx + 24 + i * 10;
    const live = i < MissileSys.ammo;
    pix(ctx, px, my + 1, 2, 5, live ? HC.amber : HC.faint);
    pix(ctx, px, my + 1, 1, 1, live ? HC.amber : HC.faint);
    pix(ctx, px + 1, my + 6, 1, 2, live ? HC.amber : HC.faint);
  }
  if (MissileSys.reload > 0) hudText(ctx, 'RLD', mx, my + 10, 1, HC.amberDim);

  // afterburner indicator
  if (Player.ab > 0.35) {
    const blink = Math.sin(GL.time * 18) > -0.2;
    hudText(ctx, 'AB', bx + bw + 5, by + 2, 1, blink ? HC.amber : HC.amberDim);
  }

  // center reticle / top-view cursor
  if (cockpit || Cam.view === 1) {
    const cx = W / 2, cy = H / 2;
    pix(ctx, cx - 8, cy, 5, 1, HC.green);
    pix(ctx, cx + 4, cy, 5, 1, HC.green);
    pix(ctx, cx, cy - 8, 1, 5, HC.green);
    pix(ctx, cx, cy + 4, 1, 5, HC.green);
    pix(ctx, cx, cy, 1, 1, HC.bright);
  } else {
    const mxp = Input.hudX || W / 2, myp = Input.hudY || H / 2;
    pixCircle(ctx, mxp, myp, 5, HC.amber);
    pix(ctx, mxp - 7, myp, 3, 1, HC.amber);
    pix(ctx, mxp + 5, myp, 3, 1, HC.amber);
    pix(ctx, mxp, myp - 7, 1, 3, HC.amber);
    pix(ctx, mxp, myp + 5, 1, 3, HC.amber);
    pix(ctx, mxp, myp, 1, 1, HC.bright);
  }

  // warnings
  const warns = [];
  if (Player.pullUp || Player.radAlt < 55) warns.push(['PULL UP', HC.red]);
  if (Player.lowAlt) warns.push(['LOW ALT', HC.amber]);
  if (Player.stall) warns.push(['STALL', HC.red]);
  if (MissileSys.ammo === 0) warns.push(['NO MSL', HC.amber]);
  const wy = cockpit ? 50 : 48;
  const flash = Math.floor(GL.time * 5) % 2 === 0;
  for (let i = 0; i < warns.length; i++) {
    if (warns[i][1] === HC.red && !flash) continue;
    hudText(ctx, warns[i][0], W / 2, wy + i * 10, 1, warns[i][1], 'center');
  }

}

/* ---------------- canopy + cockpit panel ---------------- */

function drawCanopy(ctx) {
  const W = HUD.W, H = HUD.H;
  const top = H - 106;
  const dark = '#12141c';
  const edge = '#3a4050';
  // slim side rails, stepped so the silhouette stays pixel-hard
  for (let y = 0; y < top; y += 4) {
    const t = y / top;
    const w = Math.round(lerp(10, 5, t * t * 0.7 + t * 0.3));
    pix(ctx, 0, y, w, 4, dark);
    pix(ctx, w - 1, y, 1, 4, edge);
    pix(ctx, W - w, y, w, 4, dark);
    pix(ctx, W - w, y, 1, 4, edge);
    if (y % 36 === 0) {
      pix(ctx, Math.max(2, w - 3), y + 2, 2, 2, '#5a6072');
      pix(ctx, W - Math.max(4, w - 2), y + 2, 2, 2, '#5a6072');
    }
  }
  // shallow canopy bow
  for (let x = 10; x < W - 10; x += 4) {
    const s = Math.sin((Math.PI * (x - 10)) / (W - 20));
    const arch = Math.round(2 + 6 * s);
    pix(ctx, x, 0, 4, arch, dark);
    pix(ctx, x, arch - 1, 4, 1, edge);
  }
  // centre brace
  pix(ctx, W / 2 - 4, 0, 8, 7, '#0d0f16');
  pix(ctx, W / 2 - 4, 6, 8, 1, edge);
  // faint glass reflections
  ctx.globalAlpha = 0.04;
  for (let i = 0; i < 6; i++) {
    pix(ctx, 150 + i * 36, 3, 2, 34 - i * 3, '#ffe9cf');
    pix(ctx, W - 260 + i * 32, 8, 1, 26 - i * 2, '#ffe9cf');
  }
  ctx.globalAlpha = 1;
}

function panelBox(pctx, x, y, w, h, label) {
  bevel(pctx, x, y, w, h, '#262a36', '#4a5062', '#0b0d12');
  pix(pctx, x + 2, y + 2, w - 4, h - 4, '#151821');
  pixRect(pctx, x + 3, y + 3, w - 6, h - 6, '#2c3140');
  if (label) drawText(pctx, label, x + w / 2, y + h - 11, 1, '#8d9a86', 'center');
}

function drawAttitude(pctx, x, y, r) {
  const cx = x, cy = y;
  const roll = clamp(Player.roll, -1.5, 1.5);
  const pitch = clamp(Player.pitch, -1.2, 1.2);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  for (let by = -r; by <= r; by += 2) {
    for (let bx = -r; bx <= r; bx += 2) {
      const px = bx + 1, py = by + 1;
      if (px * px + py * py > r * r) continue;
      const d = px * sr + py * cr - pitch * 26;
      let col;
      if (Math.abs(d) < 1.4) col = '#f2d6a8';
      else if (d < 0) col = py < -8 ? '#8f7088' : '#b0837a';
      else col = px < 0 ? '#4c3b41' : '#5a4546';
      pix(pctx, cx + bx, cy + by, 2, 2, col);
    }
  }
  // pitch bars
  const c = Math.cos(roll), s = Math.sin(roll);
  for (const t of [-20, -10, 10, 20]) {
    const off = (pitch - (t * Math.PI) / 180) * 26;
    if (Math.abs(off) > r - 6) continue;
    for (const sx of [-1, 1]) {
      const x0 = sx * 12, x1 = sx * 5;
      const ax = cx + x0 * c - off * s, ay = cy + x0 * s + off * c;
      const bx2 = cx + x1 * c - off * s, by2 = cy + x1 * s + off * c;
      pixLine(pctx, ax, ay, bx2, by2, '#eadfbe');
    }
  }
  // bank marks
  for (let a = -60; a <= 60; a += 15) {
    const rad = (a * Math.PI) / 180 - Math.PI / 2;
    const x0 = cx + Math.cos(rad) * (r + 1), y0 = cy + Math.sin(rad) * (r + 1);
    const x1 = cx + Math.cos(rad) * (r + (a % 30 === 0 ? 5 : 3));
    const y1 = cy + Math.sin(rad) * (r + (a % 30 === 0 ? 5 : 3));
    pixLine(pctx, x0, y0, x1, y1, '#9aa48e');
  }
  const ptr = -roll - Math.PI / 2;
  pixLine(pctx, cx + Math.cos(ptr) * (r + 1), cy + Math.sin(ptr) * (r + 1),
    cx + Math.cos(ptr) * (r + 5), cy + Math.sin(ptr) * (r + 5), '#ffc76a');
  pixCircle(pctx, cx, cy, r + 1, '#0b0d12');
  pixCircle(pctx, cx, cy, r, '#404655');
}

function drawRadar(pctx, x, y, w, h) {
  const cx = x + w / 2, cy = y + h / 2;
  const R = Math.min(w, h) / 2 - 1;
  pix(pctx, x, y, w, h, '#1a1005');
  const range = 2600;
  const t = GL.time;
  const sweep = (t * 1.7) % TAU;
  const pxStep = 2;
  for (let sy = 0; sy < h; sy += pxStep) {
    for (let sx = 0; sx < w; sx += pxStep) {
      const dx = (sx - w / 2) / R;
      const dy = (sy - h / 2) / R;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const ang = Math.atan2(dy, dx);
      let diff = sweep - ang;
      while (diff < 0) diff += TAU;
      while (diff > TAU) diff -= TAU;
      const boost = diff < 0.55 ? 1 - diff / 0.55 : 0;
      const yaw = Player.yaw;
      const right = dx, fwd = -dy;
      const wx = Math.cos(yaw) * right + Math.sin(yaw) * fwd;
      const wz = Math.sin(yaw) * right - Math.cos(yaw) * fwd;
      const dist = Math.sqrt(d2) * range;
      const hgt = heightAt(Player.pos.x + wx * dist, Player.pos.z + wz * dist);
      let col;
      if (hgt <= 0) col = [30, 18, 6];
      else {
        const e = clamp(hgt / 520, 0, 1);
        col = [70 + e * 150, 46 + e * 96, 12 + e * 30];
      }
      const b = 1 + boost * 1.7;
      const r = Math.min(255, col[0] * b + boost * 40) | 0;
      const gg = Math.min(255, col[1] * b + boost * 30) | 0;
      const bb = Math.min(255, col[2] * b) | 0;
      pix(pctx, x + sx, y + sy, pxStep, pxStep, 'rgb(' + r + ',' + gg + ',' + bb + ')');
    }
  }
  // range rings and crosshair
  for (const rr of [R * 0.34, R * 0.67, R]) {
    pixCircle(pctx, cx, cy, rr, 'rgba(255,180,80,0.30)');
  }
  pixLine(pctx, cx - R, cy, cx + R, cy, 'rgba(255,180,80,0.20)');
  pixLine(pctx, cx, cy - R, cx, cy + R, 'rgba(255,180,80,0.20)');
  // sweep arm
  pixLine(pctx, cx, cy, cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R, '#ffd27a');
  pix(pctx, cx + Math.cos(sweep) * R - 1, cy + Math.sin(sweep) * R - 1, 2, 2, '#fff0c0');
  // aircraft symbol
  pix(pctx, cx, cy - 3, 1, 7, '#fff3c8');
  pix(pctx, cx - 2, cy + 1, 5, 1, '#fff3c8');
  pix(pctx, cx - 1, cy, 3, 3, '#ffcf76');
}

function drawPanel() {
  const p = HUD.pctx;
  const W = 604, H = 106;
  p.imageSmoothingEnabled = false;
  p.clearRect(0, 0, W, H);
  p.fillStyle = '#191b23';
  p.fillRect(0, 0, W, H);
  ditherRect(p, 0, 0, W, 3, 'rgba(90,96,112,0.35)', 'rgba(0,0,0,0)', 0.6);
  pix(p, 0, 0, W, 1, '#565c6e');
  pix(p, 0, 1, W, 1, '#2c303d');
  pix(p, 0, H - 2, W, 2, '#0a0c10');
  for (let x = 8; x < W; x += 24) {
    pix(p, x, 4, 2, 2, '#4a5060');
    pix(p, x + 1, 4, 1, 1, '#737a8c');
  }

  // ---- airspeed ----
  let bx = 6, by = 6, bw = 44, bh = 92;
  panelBox(p, bx, by, bw, bh, 'IAS');
  const ias = Player.speed * 1.94384;
  p.save();
  p.beginPath();
  p.rect(bx + 5, by + 6, bw - 10, 48);
  p.clip();
  for (let v = Math.floor((ias - 60) / 20) * 20; v <= ias + 60; v += 20) {
    if (v < 0) continue;
    const ty = by + 30 - (v - ias) * 0.9;
    pix(p, bx + 5, ty, 6, 1, '#7f8a7d');
    drawText(p, String(v), bx + 13, ty - 3, 1, '#8f9a8a');
  }
  pix(p, bx + bw - 12, by + 26, 7, 1, '#ffc76a');
  p.restore();
  pix(p, bx + 4, by + 54, bw - 8, 1, '#3c4250');
  drawText(p, String(Math.round(ias)), bx + bw / 2, by + 61, 2, '#d9e8cf', 'center', '#0a0d0c');
  drawText(p, 'KT', bx + bw / 2, by + 78, 1, '#77857a', 'center');

  // ---- attitude ----
  bx = 54; by = 6; bw = 62; bh = 92;
  panelBox(p, bx, by, bw, bh, 'ATT');
  drawAttitude(p, bx + bw / 2, by + 30, 22);
  drawText(p, 'STD', bx + bw / 2, by + 62, 1, '#6f7b6c', 'center');

  // ---- altimeter ----
  bx = 120; by = 6; bw = 54; bh = 92;
  panelBox(p, bx, by, bw, bh, 'ALT FT');
  drawText(p, fmt(Math.round(Player.pos.y * 3.28084)), bx + bw / 2, by + 8, 2, '#d9e8cf', 'center', '#0a0d0c');
  pix(p, bx + 6, by + 28, bw - 12, 1, '#3c4250');
  drawText(p, 'BARO', bx + bw / 2, by + 34, 1, '#6f7b6c', 'center');
  drawText(p, fmt3(Math.round(Player.pos.y * 3.28084)) + ' FT', bx + bw / 2, by + 45, 1, '#93a28e', 'center');
  drawText(p, 'R ' + padNum(Math.round(Player.radAlt * 3.28084), 4), bx + bw / 2, by + 57, 1, Player.lowAlt ? '#ffc76a' : '#6f7b6c', 'center');
  drawText(p, 'V/S ' + fmt(Player.vs * 196.85, 0, true), bx + bw / 2, by + 69, 1, '#93a28e', 'center');

  // ---- radar ----
  bx = 178; by = 6; bw = 100; bh = 92;
  panelBox(p, bx, by, bw, bh, 'GND MAP');
  drawRadar(p, bx + 4, by + 5, bw - 8, 60);
  drawText(p, '2.5KM', bx + bw - 4, by + 68, 1, '#b3863f', 'right');
  drawText(p, 'HDG-UP', bx + 4, by + 68, 1, '#6f5a38', 'left');

  // ---- slip ----
  bx = 282; by = 6; bw = 18; bh = 92;
  panelBox(p, bx, by, bw, bh, 'SLIP');
  const slip = clamp(Math.sin(Player.roll) * 0.55 + Player.gLoad * 0.02 - 0.02, -1, 1);
  pix(p, bx + 3, by + 32, bw - 6, 1, '#3c4250');
  pix(p, bx + 3, by + 39, bw - 6, 1, '#3c4250');
  pix(p, bx + 3, by + 32, 1, 8, '#3c4250');
  pix(p, bx + bw - 4, by + 32, 1, 8, '#3c4250');
  const ball = bx + bw / 2 + slip * 4;
  pixDisc(p, ball, by + 35, 2, '#d8c690');

  // ---- heading ----
  bx = 304; by = 6; bw = 52; bh = 92;
  panelBox(p, bx, by, bw, bh, 'HDG');
  const hdg = ((Player.yaw * 180) / Math.PI + 360) % 360;
  const ccx = bx + bw / 2, ccy = by + 30, cr = 18;
  pixCircle(p, ccx, ccy, cr + 1, '#0b0d12');
  pixCircle(p, ccx, ccy, cr, '#39404e');
  for (let d = 0; d < 360; d += 15) {
    const a = ((d - hdg) * Math.PI) / 180 - Math.PI / 2;
    const x0 = ccx + Math.cos(a) * (cr - 3), y0 = ccy + Math.sin(a) * (cr - 3);
    const x1 = ccx + Math.cos(a) * cr, y1 = ccy + Math.sin(a) * cr;
    pixLine(p, x0, y0, x1, y1, d % 90 === 0 ? '#d8c690' : '#6f7a68');
  }
  for (const [d, l] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
    const a = ((d - hdg) * Math.PI) / 180 - Math.PI / 2;
    const x = ccx + Math.cos(a) * (cr - 9), y = ccy + Math.sin(a) * (cr - 9);
    drawText(p, l, x, y - 3, 1, '#e6d8a8', 'center');
  }
  pix(p, ccx, ccy - 3, 1, 7, '#d8c690');
  pix(p, ccx - 3, ccy - 1, 7, 1, '#d8c690');
  drawText(p, padNum(Math.round(hdg) % 360, 3), bx + bw / 2, by + 57, 2, '#d9e8cf', 'center', '#0a0d0c');
  drawText(p, 'MAG', bx + bw / 2, by + 78, 1, '#77857a', 'center');

  // ---- VSI ----
  bx = 360; by = 6; bw = 34; bh = 92;
  panelBox(p, bx, by, bw, bh, 'VSI');
  const vsF = clamp(Player.vs * 196.85, -2000, 2000);
  pix(p, bx + 6, by + 8, 1, 56, '#3c4250');
  for (let v = -2000; v <= 2000; v += 500) {
    const ty = by + 36 - (v / 2000) * 26;
    pix(p, bx + 6, ty, v === 0 ? 13 : 7, 1, '#6f7a68');
    if (v % 1000 === 0) drawText(p, v === 0 ? '0' : (v > 0 ? '+' : '-') + Math.abs(v) / 100, bx + 15, ty - 3, 1, '#8f9a8a');
  }
  const ny = by + 36 - (vsF / 2000) * 26;
  pixLine(p, bx + 6, ny, bx + 24, ny, '#ffc76a');
  pix(p, bx + 24, ny - 1, 2, 3, '#ffc76a');

  // ---- engines ----
  bx = 398; by = 6; bw = 48; bh = 92;
  panelBox(p, bx, by, bw, bh, 'ENG %');
  const thr = 0.55 + Player.ab * 0.45;
  for (let e = 0; e < 2; e++) {
    const ex = bx + 8 + e * 18;
    pix(p, ex, by + 9, 10, 52, '#10131a');
    const fill = Math.round(thr * 50);
    for (let i = 0; i < fill; i += 2) {
      const c = i > 42 ? '#ffc76a' : '#9fd0a0';
      pix(p, ex + 1, by + 58 - i, 8, 2, c);
    }
    drawText(p, e === 0 ? 'L' : 'R', ex + 5, by + 64, 1, '#8f9a8a', 'center');
    drawText(p, String(Math.round(thr * 100 - e * 2)), ex + 5, by + 74, 1, '#c8d8c0', 'center');
  }

  // ---- throttle ----
  bx = 450; by = 6; bw = 18; bh = 92;
  panelBox(p, bx, by, bw, bh, 'THR');
  pix(p, bx + 5, by + 8, 8, 56, '#10131a');
  pix(p, bx + 4, by + 8, 10, 1, '#3c4250');
  const leverY = by + 58 - Math.round(thr * 48);
  pix(p, bx + 3, leverY, 12, 5, '#d8c690');
  pix(p, bx + 5, leverY + 1, 8, 1, '#8a7a4e');
  pix(p, bx + 4, by + 18, 10, 1, '#8f6a2e'); // AB detent
  drawText(p, 'AB', bx + bw / 2, by + 68, 1, Player.ab > 0.4 ? '#ffc76a' : '#6f7b6c', 'center');

  // ---- clock ----
  bx = 472; by = 6; bw = 56; bh = 30;
  panelBox(p, bx, by, bw, bh, '');
  const base = 18 * 3600 + 42 * 60 + Player.missionTime;
  const total = Math.floor(base) % 86400;
  const hh = padNum(Math.floor(total / 3600), 2), mm = padNum(Math.floor(total / 60) % 60, 2), ss = padNum(total % 60, 2);
  drawText(p, 'LOCAL', bx + 4, by + 4, 1, '#8d9a86');
  drawText(p, hh + ':' + mm + ':' + ss, bx + bw / 2, by + 14, 1, '#e0d6b4', 'center');

  // ---- stores ----
  bx = 532; by = 6; bw = 66; bh = 30;
  panelBox(p, bx, by, bw, bh, '');
  drawText(p, 'MSL', bx + 4, by + 4, 1, '#8d9a86');
  for (let i = 0; i < 4; i++) {
    const px = bx + 20 + i * 10;
    const live = i < MissileSys.ammo;
    pix(p, px, by + 12, 3, 8, live ? '#e8ddb8' : '#3a3f49');
    pix(p, px + 1, by + 10, 1, 2, live ? '#e8ddb8' : '#3a3f49');
    pix(p, px, by + 20, 3, 2, live ? '#ffc76a' : '#3a3f49');
  }

  // ---- caution lamps ----
  bx = 472; by = 40; bw = 126; bh = 58;
  panelBox(p, bx, by, bw, bh, '');
  const lamps = [
    ['PULL UP', Player.pullUp || Player.radAlt < 55],
    ['LOW ALT', Player.lowAlt],
    ['STALL', Player.stall],
    ['AB ON', Player.ab > 0.4],
    ['NO MSL', MissileSys.ammo === 0],
    ['RELOAD', MissileSys.reload > 0],
  ];
  for (let i = 0; i < lamps.length; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const lx = bx + 5 + col * 61, ly = by + 5 + row * 16;
    const on = lamps[i][1];
    const red = i === 0 || i === 2;
    pix(p, lx, ly, 56, 13, on ? (red ? '#b03a26' : '#8a6420') : '#14161d');
    pixRect(p, lx, ly, 56, 13, '#343a46');
    if (on) {
      pix(p, lx + 2, ly + 2, 3, 9, red ? '#ffd0b0' : '#ffe6a8');
    }
    drawText(p, lamps[i][0], lx + 8, ly + 3, 1, on ? '#fff3d2' : '#4f5562');
  }

  // stencil
}

function drawHUD(time) {
  const ctx = HUD.ctx;
  if (!ctx) return;
  const W = HUD.W, H = HUD.H;
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  HUD.blink = time;
  if (Cam.view === 2) drawCanopy(ctx);
  drawFlightHUD(ctx);
  if (Cam.view === 2) {
    drawPanel();
    ctx.drawImage(HUD.panel, 0, H - 106, W, 106);
  }
  if (FX.flash > 0.002) {
    ctx.fillStyle = 'rgba(255,214,170,' + (FX.flash * 0.20).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }
}
