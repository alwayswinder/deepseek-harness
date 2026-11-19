/* ============================================================
   Missiles, explosions, water spray, wakes and ground decals
   ============================================================ */

const FX = {
  parts: [],
  decals: [],
  flash: 0,
  sprayAcc: 0,
  wakeAcc: 0,
};

function addPart(o) {
  FX.parts.push({
    x: o.x, y: o.y, z: o.z,
    vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
    life: o.life || 1, max: o.life || 1,
    s0: o.s0 === undefined ? 1 : o.s0,
    s1: o.s1 === undefined ? o.s0 : o.s1,
    r: o.r, g: o.g, b: o.b, a: o.a,
    shape: o.shape || 0,
    add: !!o.add,
    grav: o.grav || 0,
    drag: o.drag === undefined ? 0.6 : o.drag,
    ring: !!o.ring,
  });
}

function updateEffects(dt) {
  for (let i = FX.parts.length - 1; i >= 0; i--) {
    const p = FX.parts[i];
    p.life -= dt;
    if (p.life <= 0) { FX.parts.splice(i, 1); continue; }
    const d = Math.max(0, 1 - p.drag * dt);
    p.vx *= d; p.vz *= d;
    p.vy = p.vy * d - p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.ring) {
      p.s0 += (p.s1 - p.s0) * Math.min(1, dt * 2.2);
    }
    if (p.y < 0.3 && !p.ring) p.y = 0.3;
  }
  for (let i = FX.decals.length - 1; i >= 0; i--) {
    const d = FX.decals[i];
    d.age += dt;
    if (d.age > d.life) FX.decals.splice(i, 1);
  }
  if (FX.parts.length > 300) FX.parts.splice(0, FX.parts.length - 300);
  if (FX.decals.length > 48) FX.decals.splice(0, FX.decals.length - 48);
  FX.flash = Math.max(0, FX.flash - dt * 3.4);
}

function drawDecals() {
  if (!FX.decals.length) return;
  const gl = GL.gl;
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  for (const d of FX.decals) {
    const t = d.age / d.life;
    const fade = d.fadeIn ? Math.min(1, d.age / 0.25) : 1;
    const alpha = d.alpha * fade * (1 - t * t);
    const s = d.size * (d.grow || 1) * (1 + t * (d.expand || 0));
    const c = Math.cos(d.angle), sn = Math.sin(d.angle);
    const model = new Float32Array([
      c * s, 0, -sn * s * (d.stretch || 1), 0,
      0, 1, 0, 0,
      sn * s, 0, c * s * (d.stretch || 1), 0,
      d.x, d.y, d.z, 1,
    ]);
    drawMesh(Meshes.decal, model, {
      outline: false,
      override: [d.r, d.g, d.b, 1],
      alpha,
    });
  }
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

function drawEffects() {
  const smoke = [];
  const glow = [];
  const rings = [];
  for (const p of FX.parts) {
    const t = 1 - p.life / p.max;
    const size = lerp(p.s0, p.s1, t);
    const alpha = p.a * (p.ring ? 1 - t : Math.pow(1 - t, 1.4));
    const item = { x: p.x, y: p.y, z: p.z, size, r: p.r, g: p.g, b: p.b, a: alpha };
    if (p.ring) rings.push(item);
    else if (p.add) glow.push(item);
    else smoke.push(item);
  }
  drawSpriteBatch(smoke, 2, false);
  drawSpriteBatch(glow, 0, true);
  drawSpriteBatch(rings, 1, true);
  drawDecals();
  if (FX.flash > 0.001) {
    // brief screen-space impact flash is drawn by the HUD pass
  }
}

/* ---------------- missiles ---------------- */

const PYLONS = [
  { x: -4.55, y: -0.82, z: 2.55 },
  { x: -2.95, y: -0.84, z: 2.15 },
  { x: 2.95, y: -0.84, z: 2.15 },
  { x: 4.55, y: -0.82, z: 2.55 },
];

const MissileSys = {
  ammo: 4,
  max: 4,
  mounted: [true, true, true, true],
  reload: 0,
  reloadTime: 3.4,
  live: [],
  cooldown: 0,
};

function missileTarget(pos, dir) {
  let d = dir;
  if (d.y > -0.06) {
    d = vnorm({ x: dir.x, y: dir.y - 0.10, z: dir.z });
  }
  for (let t = 90; t < 4200; t += 45) {    const x = pos.x + d.x * t;
    const y = pos.y + d.y * t;
    const z = pos.z + d.z * t;
    const h = heightAt(x, z);
    if (y <= Math.max(h, 0) + 1.5) {
      return { x, y: Math.max(h, 0) + 1.5, z, water: h < 0 };
    }
  }
  const ex = pos.x + d.x * 4200;
  const ez = pos.z + d.z * 4200;
  const hEnd = heightAt(ex, ez);
  return {
    x: ex,
    y: Math.max(0, hEnd) + 1.5,
    z: ez,
    water: hEnd < 0,
  };
}

function fireMissile() {
  if (MissileSys.cooldown > 0) return false;
  const order = [2, 1, 3, 0];
  let slot = -1;
  for (const s of order) {
    if (MissileSys.mounted[s]) { slot = s; break; }
  }
  if (slot < 0) {
    MissileSys.cooldown = 0.35;
    if (typeof Sound !== 'undefined') Sound.dry();
    return false;
  }
  const p = PYLONS[slot];
  const origin = localToWorld(Player, { x: p.x, y: p.y - 0.25, z: p.z });
  const fwd = qRot(Player.quat, { x: 0, y: 0, z: -1 });
  const target = missileTarget(Player.pos, fwd);
  MissileSys.mounted[slot] = false;
  MissileSys.ammo--;
  MissileSys.cooldown = 0.28;
  MissileSys.reload = MissileSys.reloadTime;
  MissileSys.live.push({
    pos: origin,
    quat: Player.quat,
    speed: Player.speed + 80,
    target,
    life: 10.0,
    smoke: 0,
    armed: 0,
    slot,
  });
  // launch flash & smoke burst at the rail
  for (let i = 0; i < 7; i++) {
    addPart({
      x: origin.x, y: origin.y, z: origin.z,
      vx: fwd.x * -12 + (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.4) * 9,
      vz: fwd.z * -12 + (Math.random() - 0.5) * 14,
      life: 0.8 + Math.random() * 0.8, s0: 1.6, s1: 5.5,
      r: 0.72, g: 0.68, b: 0.62, a: 0.32, shape: 2,
    });
  }
  addPart({ x: origin.x, y: origin.y, z: origin.z, life: 0.16, s0: 7, s1: 3, r: 1, g: 0.7, b: 0.32, a: 0.9, add: true });
  if (typeof Sound !== 'undefined') Sound.launch();
  return true;
}

function missileImpact(x, y, z, water) {
  FX.flash = 0.55;
  if (!water) {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * TAU;
      const r = Math.random();
      const sp = 12 + Math.random() * 48;
      addPart({
        x, y: y + 1, z,
        vx: Math.cos(a) * sp * (0.3 + r),
        vy: 8 + Math.random() * 38,
        vz: Math.sin(a) * sp * (0.3 + r),
        life: 0.35 + Math.random() * 0.55,
        s0: 4 + Math.random() * 5, s1: 12 + Math.random() * 12,
        r: 1, g: 0.45 + Math.random() * 0.25, b: 0.12, a: 0.9, add: true,
        drag: 1.6,
      });
    }
    for (let k = 0; k < 7; k++) {
      addPart({
        x: x + (Math.random() - 0.5) * 7, y: y + 2, z: z + (Math.random() - 0.5) * 7,
        vx: (Math.random() - 0.5) * 8, vy: 6 + Math.random() * 16, vz: (Math.random() - 0.5) * 8,
        life: 0.55 + Math.random() * 0.55,
        s0: 8 + Math.random() * 6, s1: 22 + Math.random() * 14,
        r: 1, g: 0.55 + Math.random() * 0.2, b: 0.14, a: 0.85, add: true,
        drag: 1.1, grav: -6,
      });
    }
  }
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * TAU;
    addPart({
      x, y: y + (water ? 7 : 2), z,
      vx: Math.cos(a) * (5 + Math.random() * 16),
      vy: 5 + Math.random() * 14,
      vz: Math.sin(a) * (5 + Math.random() * 16),
      life: 2.2 + Math.random() * 2.8,
      s0: 4, s1: 15 + Math.random() * 10,
      r: water ? 0.95 : 0.24, g: water ? 0.99 : 0.21, b: water ? 1.0 : 0.22,
      a: water ? 0.24 : 0.42, shape: 2, drag: 0.9, grav: -1.2,
    });
  }
  if (!water) {
    addPart({ x, y: y + 12, z, life: 1.0, s0: 16, s1: 92, r: 1, g: 0.78, b: 0.50, a: 0.45, add: true, ring: true, shape: 1 });
    addPart({ x, y: y + 12, z, life: 1.35, s0: 8, s1: 122, r: 0.95, g: 0.62, b: 0.34, a: 0.15, add: true, ring: true, shape: 1 });
    for (let k = 0; k < 6; k++) {
      addPart({
        x: x + (Math.random() - 0.5) * 9, y: y + 2 + Math.random() * 4, z: z + (Math.random() - 0.5) * 9,
        vx: (Math.random() - 0.5) * 12, vy: 8 + Math.random() * 18, vz: (Math.random() - 0.5) * 12,
        life: 0.95 + Math.random() * 0.85, s0: 12 + Math.random() * 6, s1: 48 + Math.random() * 26,
        r: 1, g: 0.48 + Math.random() * 0.18, b: 0.10, a: 0.88, add: true, shape: 0,
        drag: 0.9, grav: -4,
      });
    }
    for (let k = 0; k < 8; k++) {
      addPart({
        x: x + (Math.random() - 0.5) * 14, y: y + 4 + Math.random() * 6, z: z + (Math.random() - 0.5) * 14,
        vx: (Math.random() - 0.5) * 8, vy: 11 + Math.random() * 17, vz: (Math.random() - 0.5) * 8,
        life: 3.2 + Math.random() * 2.6, s0: 8, s1: 26 + Math.random() * 16,
        r: 0.17, g: 0.16, b: 0.15, a: 0.48, shape: 2, drag: 0.55, grav: -1.5,
      });
    }
  }

  if (water) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * TAU;
      const sp = 2 + Math.random() * 10;
      addPart({
        x: x + Math.cos(a) * Math.random() * 5, y: 1 + Math.random() * 4, z: z + Math.sin(a) * Math.random() * 5,
        vx: Math.cos(a) * sp, vy: 60 + Math.random() * 60, vz: Math.sin(a) * sp,
        life: 1.9 + Math.random() * 1.3,
        s0: 8 + Math.random() * 5, s1: 28 + Math.random() * 22,
        r: 0.94, g: 0.99, b: 0.97, a: 0.9, shape: 0, drag: 0.3, grav: 16,
      });
    }
    for (let k = 0; k < 7; k++) {
      addPart({
        x: x + (Math.random() - 0.5) * 5, y: 8 + k * 8, z: z + (Math.random() - 0.5) * 5,
        vx: (Math.random() - 0.5) * 2, vy: 9 + Math.random() * 6, vz: (Math.random() - 0.5) * 2,
        life: 1.7 + k * 0.05, s0: 19 - k * 1.4, s1: 25 - k * 1.4,
        r: 0.96, g: 1, b: 0.99, a: 0.5, shape: 2, drag: 0.35, grav: -1.5,
      });
    }
    for (let k = 0; k < 6; k++) {
      addPart({
        x: x + (Math.random() - 0.5) * 4, y: 2 + k * 3, z: z + (Math.random() - 0.5) * 4,
        vx: (Math.random() - 0.5) * 2, vy: 38 + Math.random() * 18, vz: (Math.random() - 0.5) * 2,
        life: 1.5 + k * 0.08, s0: 16, s1: 42 + k * 4,
        r: 0.96, g: 1, b: 0.99, a: 0.65, shape: 0, drag: 0.25, grav: 8,
      });
    }
    addPart({ x, y: 3, z, life: 1.1, s0: 10, s1: 52, r: 0.9, g: 1, b: 0.98, a: 0.55, add: true, ring: true, shape: 1 });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU;
      addPart({
        x: x + Math.cos(a) * Math.random() * 7, y: 1.2, z: z + Math.sin(a) * Math.random() * 7,
        vx: Math.cos(a) * 5, vy: 1 + Math.random() * 2, vz: Math.sin(a) * 5,
        life: 3 + Math.random() * 3, s0: 4, s1: 16, r: 0.95, g: 0.99, b: 0.98, a: 0.5, shape: 2, drag: 0.7,
      });
    }
    FX.decals.push({ x, y: 0.5, z, size: 16, grow: 1, expand: 1.8, age: 0, life: 9, angle: Math.random() * TAU, stretch: 1.3, r: 0.92, g: 0.98, b: 0.98, alpha: 0.45 });
    FX.decals.push({ x, y: 0.6, z, size: 22, grow: 1, expand: 3.0, age: 0, life: 2.6, angle: Math.random() * TAU, stretch: 1, r: 0.95, g: 1, b: 1, alpha: 0.22 });
  } else {
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * TAU;
      addPart({
        x, y: y + 1, z,
        vx: Math.cos(a) * (2 + Math.random() * 9),
        vy: 12 + Math.random() * 28,
        vz: Math.sin(a) * (2 + Math.random() * 9),
        life: 1.2 + Math.random() * 2.2,
        s0: 0.9, s1: 0.5, r: 1, g: 0.55 + Math.random() * 0.3, b: 0.12, a: 1, add: true,
        grav: 34, drag: 0.35,
      });
    }
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * TAU;
      const r = Math.random() * 12;
      FX.decals.push({
        x: x + Math.cos(a) * r, y: groundAt(x, z) + 0.55, z: z + Math.sin(a) * r,
        size: 4 + Math.random() * 10, grow: 1, expand: 0.5, age: 0, life: 30 + Math.random() * 30,
        angle: Math.random() * TAU, stretch: 0.8 + Math.random() * 0.6,
        r: 0.16, g: 0.12, b: 0.12, alpha: 0.55, fadeIn: true,
      });
    }
  }
  if (typeof Sound !== 'undefined') Sound.boom(water);
}

function updateMissiles(dt) {
  MissileSys.cooldown = Math.max(0, MissileSys.cooldown - dt);
  if (MissileSys.reload > 0) {
    MissileSys.reload -= dt;
    if (MissileSys.reload <= 0) {
      const missing = MissileSys.mounted.indexOf(false);
      if (missing >= 0) {
        MissileSys.mounted[missing] = true;
        MissileSys.ammo++;
        if (MissileSys.ammo < 4) MissileSys.reload = 1.6;
      }
    }
  }
  for (let i = MissileSys.live.length - 1; i >= 0; i--) {
    const m = MissileSys.live[i];
    m.life -= dt;
    m.armed += dt;
    const dir = qRot(m.quat, { x: 0, y: 0, z: -1 });
    const want = vnorm(vsub(m.target, m.pos));
    const yaw = Math.atan2(want.x, -want.z);
    const pitch = Math.asin(clamp(want.y, -1, 1));
    const wantQ = headingQuat(yaw, pitch, 0);
    m.quat = qSlerp(m.quat, wantQ, Math.min(1, dt * 3.4));
    const spd = Math.min(520, m.speed + dt * 200);
    m.speed = spd;
    m.pos.x += dir.x * spd * dt;
    m.pos.y += dir.y * spd * dt;
    m.pos.z += dir.z * spd * dt;

    // smoke & flame
    m.smoke += dt;
    if (m.smoke > 0.022) {
      m.smoke = 0;
      addPart({
        x: m.pos.x - dir.x * 1.3, y: m.pos.y - dir.y * 1.3, z: m.pos.z - dir.z * 1.3,
        vx: -dir.x * 6 + (Math.random() - 0.5) * 4,
        vy: -dir.y * 6 + 1.5 + Math.random() * 2,
        vz: -dir.z * 6 + (Math.random() - 0.5) * 4,
        life: 1.4 + Math.random() * 1.4, s0: 1.4, s1: 5.5 + Math.random() * 2,
        r: 0.72, g: 0.68, b: 0.64, a: 0.34, shape: 2, drag: 1.0, grav: -0.8,
      });
    }
    addPart({
      x: m.pos.x - dir.x * 1.35, y: m.pos.y - dir.y * 1.35, z: m.pos.z - dir.z * 1.35,
      life: 0.1, s0: 2.6, s1: 1.2, r: 1, g: 0.62, b: 0.2, a: 0.9, add: true, drag: 0,
    });

    const gh = heightAt(m.pos.x, m.pos.z);
    const water = gh < 0;
    if (m.pos.y <= Math.max(gh, 0) + 1.0) {
      missileImpact(m.pos.x, Math.max(gh, 0), m.pos.z, water);
      MissileSys.live.splice(i, 1);
      continue;
    }
    if (m.life <= 0) {
      missileImpact(m.pos.x, Math.max(gh, 0), m.pos.z, water);
      MissileSys.live.splice(i, 1);
    }
  }
}

function drawMissiles(cam) {
  if (Cam.view === 2) return;
  for (let i = 0; i < 4; i++) {
    if (!MissileSys.mounted[i]) continue;
    const p = PYLONS[i];
    const world = localToWorld(Player, { x: p.x, y: p.y, z: p.z });
    const dist = vlen(vsub(cam.pos, world));
    drawMesh(Meshes.missile, modelMatrix(world, Player.quat, 1), {
      outline: dist < 260,
      outlineWidth: 0.2,
    });
  }
  for (const m of MissileSys.live) {
    const dist = vlen(vsub(cam.pos, m.pos));
    drawMesh(Meshes.missile, modelMatrix(m.pos, m.quat, 1), {
      outline: dist < 260,
      outlineWidth: 0.2,
    });
  }
}

/* ---------------- water interaction ---------------- */

function spawnWaterSpray(player, dt) {
  FX.sprayAcc += dt * 70;
  FX.wakeAcc += dt;
  const fwd = qRot(player.quat, { x: 0, y: 0, z: -1 });
  const right = qRot(player.quat, { x: 1, y: 0, z: 0 });
  while (FX.sprayAcc >= 1) {
    FX.sprayAcc -= 1;
    const side = Math.random() < 0.5 ? -1 : 1;
    const p = vadd(player.pos, { x: right.x * side * 4.5, y: -player.radAlt + 0.6, z: right.z * side * 4.5 });
    addPart({
      x: p.x + (Math.random() - 0.5) * 6, y: 0.8 + Math.random() * 2,
      z: p.z + (Math.random() - 0.5) * 6,
      vx: fwd.x * -10 + (Math.random() - 0.5) * 8,
      vy: 5 + Math.random() * 12,
      vz: fwd.z * -10 + (Math.random() - 0.5) * 8,
      life: 0.7 + Math.random() * 0.9, s0: 1.2, s1: 5 + Math.random() * 4,
      r: 0.92, g: 0.97, b: 0.96, a: 0.5, shape: 0, drag: 0.7, grav: 22,
    });
  }
  if (FX.wakeAcc > 0.055) {
    FX.wakeAcc = 0;
    FX.decals.push({
      x: player.pos.x - fwd.x * 12, y: 0.45, z: player.pos.z - fwd.z * 12,
      size: 7, grow: 1, expand: 1.2, age: 0, life: 5.5,
      angle: Math.atan2(fwd.x, fwd.z), stretch: 2.6,
      r: 0.9, g: 0.97, b: 0.96, alpha: 0.32,
    });
  }
}

function initEffects() {
  const B = MeshBuilder();
  const N = 14;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * TAU, a1 = ((i + 1) / N) * TAU;
    B.poly([
      [0, 0, 0],
      [Math.cos(a0), 0, Math.sin(a0)],
      [Math.cos(a1), 0, Math.sin(a1)],
    ], [1, 1, 1]);
  }
  Meshes.decal = B.build();
}
