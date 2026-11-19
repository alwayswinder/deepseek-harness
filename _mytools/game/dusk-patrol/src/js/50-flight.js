/* ============================================================
   Flight model, arcade assists, camera rig and view transitions
   ============================================================ */

const Input = {
  nx: 0, ny: 0,
  mouseX: -1, mouseY: -1,
  lastMove: -999,
  afterburner: false,
  lmb: false, rmb: false,
  touch: false,
};

const Player = {
  pos: { x: 0, y: 540, z: 0 },
  yaw: -Math.PI * 0.25,
  pitch: 0,
  roll: 0,
  quat: qIdent(),
  speed: 172,
  ab: 0,
  gLoad: 1,
  vs: 0,
  radAlt: 540,
  barrel: 0,
  barrelDir: 1,
  barrelCool: 0,
  missionTime: 0,
  overWater: false,
  pullUp: false,
  lowAlt: false,
  stall: false,
};

const Cam = {
  pos: { x: 0, y: 600, z: 0 },
  q: qIdent(),
  fov: 1.05,
  view: 1,
  blend: 1,
  from: null,
  shake: 0,
};

function resetPlayer() {
  const s = World.spawn;
  Player.pos = { x: s.x, y: s.alt, z: s.z };
  Player.yaw = s.yaw;
  Player.pitch = 0;
  Player.roll = 0;
  Player.speed = 172;
  Player.ab = 0;
  Player.barrel = 0;
  Player.missionTime = 0;
  Player.quat = headingQuat(Player.yaw, Player.pitch, Player.roll);
  Contrails.L.length = 0;
  Contrails.R.length = 0;
  Cam.view = 1;
  Cam.blend = 1;
  Cam.from = null;
  updateCamera(0, 0.016, true);
}

function startBarrel() {
  if (Player.barrel > 0 || Player.barrelCool > 0) return;
  Player.barrel = 0.0001;
  Player.barrelDir = Input.nx < -0.05 ? -1 : 1;
  Player.barrelCool = 1.0;
}

function switchView() {
  const from = { pos: vcopy(Cam.pos), q: Cam.q, fov: Cam.fov };
  Cam.view = (Cam.view + 1) % 3;
  Cam.from = from;
  Cam.blend = 0;
}

function viewName() {
  return ['TOP', 'CHASE', 'COCKPIT'][Cam.view];
}

function cameraRig(view) {
  const orb = new URLSearchParams(location.search).get('orbit');
  if (orb) {
    const a = (parseFloat(orb) * Math.PI) / 180;
    const r = 28;
    const pos = {
      x: Player.pos.x + Math.sin(a) * r,
      y: Player.pos.y + 8.5,
      z: Player.pos.z + Math.cos(a) * r,
    };
    const dx = Player.pos.x - pos.x, dy = Player.pos.y - pos.y, dz = Player.pos.z - pos.z;
    const yaw = Math.atan2(dx, -dz);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    return { pos, q: headingQuat(yaw, pitch, 0), fov: 0.8 };
  }
  if (view === 0) {
    const pos = { x: Player.pos.x, y: Player.pos.y + 620, z: Player.pos.z + 380 };
    const g = groundAt(pos.x, pos.z);
    if (pos.y < g + 140) pos.y = g + 140;
    return { pos, q: headingQuat(0, -1.05, 0), fov: 1.0 };
  }
  if (view === 1) {
    if (!Game.started) {
      const pos = vadd(Player.pos, qRot(Player.quat, { x: 0, y: 13, z: 52 }));
      return {
        pos,
        q: headingQuat(Player.yaw - 0.23, 0.06, 0.10),
        fov: 1.0,
      };
    }
    const pos = vadd(Player.pos, qRot(Player.quat, { x: 0, y: 6.2, z: 27 }));
    const g = groundAt(pos.x, pos.z);
    if (pos.y < g + 4) pos.y = g + 4;
    return {
      pos,
      q: headingQuat(Player.yaw, Player.pitch * 0.72 - 0.055, Player.roll * 0.38),
      fov: 1.02,
    };
  }
  const eye = vadd(Player.pos, qRot(Player.quat, { x: 0, y: 1.12, z: -3.15 }));
  const shake = Player.ab * 0.0009 + Player.speed * 0.0000055;
  const t = GL.time;
  return {
    pos: {
      x: eye.x + Math.sin(t * 37.1) * shake,
      y: eye.y + Math.sin(t * 41.7) * shake,
      z: eye.z + Math.cos(t * 29.3) * shake,
    },
    q: Player.quat,
    fov: 1.16,
  };
}

function updateCamera(dt, time, snap) {
  if (window.__dusk && window.__dusk.camOverride) {
    const o = window.__dusk.camOverride;
    Cam.pos = o.pos;
    Cam.q = o.q;
    Cam.fov = o.fov || 1.0;
    Cam.blend = 1;
    Cam.from = null;
    return;
  }
  Cam.blend = Math.min(1, Cam.blend + dt / 0.95);
  const rig = cameraRig(Cam.view);
  if (snap || !Cam.from) {
    Cam.pos = rig.pos;
    Cam.q = rig.q;
    Cam.fov = rig.fov;
    Cam.blend = 1;
    Cam.from = null;
    return;
  }
  const t = smoothstep(0, 1, Cam.blend);
  if (Cam.blend >= 1) {
    Cam.pos = rig.pos;
    Cam.q = rig.q;
    Cam.fov = rig.fov;
    Cam.from = null;
  } else {
    Cam.pos = vlerp(Cam.from.pos, rig.pos, t);
    Cam.q = qSlerp(Cam.from.q, rig.q, t);
    Cam.fov = lerp(Cam.from.fov, rig.fov, t);
  }
}

function updatePlayer(dt, time) {
  Player.missionTime += dt;
  Player.barrelCool = Math.max(0, Player.barrelCool - dt);

  const idle = time - Input.lastMove > 3.2;
  let nx = Input.nx;
  let ny = Input.ny;
  if (idle && Cam.view !== 2) {
    nx = Math.sin(time * 0.37) * 0.5;
    ny = Math.sin(time * 0.23 + 1.7) * 0.22;
  }
  const dead = 0.05;
  if (Math.abs(nx) < dead) nx = 0;
  if (Math.abs(ny) < dead) ny = 0;

  // --- top-down: steer toward the cursor's ground point ---
  if (Cam.view === 0 && !idle) {
    const aspect = GL.baseW / GL.baseH;
    const tan = Math.tan(Cam.fov * 0.5);
    const px = Input.nx * tan * aspect;
    const py = -Input.ny * tan;
    const fwd = qRot(Cam.q, { x: 0, y: 0, z: -1 });
    const right = qRot(Cam.q, { x: 1, y: 0, z: 0 });
    const up = qRot(Cam.q, { x: 0, y: 1, z: 0 });
    const dir = vnorm(vadd(vadd(vmul(right, px), vmul(up, py)), fwd));
    const dy = dir.y;
    if (dy < -0.08) {
      const t = (Player.pos.y - 0) / -dy;
      const wx = Cam.pos.x + dir.x * t;
      const wz = Cam.pos.z + dir.z * t;
      const dx = wx - Player.pos.x, dz = wz - Player.pos.z;
      if (Math.hypot(dx, dz) > 70) {
        const want = Math.atan2(dx, -dz);
        let diff = want - Player.yaw;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        const maxTurn = 1.15 * dt;
        const turn = clamp(diff, -maxTurn, maxTurn);
        Player.yaw += turn;
        const targetRoll = clamp(diff * 1.6, -1.15, 1.15);
        Player.roll = damp(Player.roll, targetRoll, 4.5, dt);
        ny = clamp(Player.pitch * -0.6, -0.3, 0.3);
      }
    }
  } else {
    const targetRoll = clamp(nx * 1.25, -1.2, 1.2);
    Player.roll = damp(Player.roll, targetRoll, 3.6, dt);
  }

  // --- pitch ---
  if (Cam.view !== 0 || idle) {
    let pr = clamp(-ny * 1.15, -0.85, 0.85);
    if (Math.abs(ny) < 0.06) pr += -Player.pitch * 0.55;
    Player.pitch += pr * dt;
  } else {
    Player.pitch = damp(Player.pitch, 0, 0.9, dt);
  }
  Player.pitch = clamp(Player.pitch, -1.05, 1.05);

  // --- turn from bank ---
  const bankTurn = Math.sin(Player.roll) * 1.35 * clamp(Player.speed / 175, 0.55, 1.5);
  Player.yaw += bankTurn * dt;
  Player.yaw = mod(Player.yaw + Math.PI, TAU) - Math.PI;

  // --- afterburner / speed ---
  Player.ab = damp(Player.ab, Input.afterburner ? 1 : 0, 3.2, dt);
  const targetSpeed = 158 + Player.ab * 118 - Math.sin(Player.pitch) * 26;
  Player.speed = damp(Player.speed, targetSpeed, 0.7, dt);
  Player.speed = clamp(Player.speed, 105, 320);

  // --- barrel roll ---
  let extraRoll = 0;
  if (Player.barrel > 0) {
    Player.barrel += dt / 0.88;
    if (Player.barrel >= 1) {
      Player.barrel = 0;
    } else {
      const t = Player.barrel;
      const eased = t * t * (3 - 2 * t);
      extraRoll = Player.barrelDir * TAU * eased;
    }
  }
  Player.quat = headingQuat(Player.yaw, Player.pitch, Player.roll + extraRoll);

  // --- integrate ---
  const fwd = qRot(Player.quat, { x: 0, y: 0, z: -1 });
  const prevY = Player.pos.y;
  Player.pos.x += fwd.x * Player.speed * dt;
  Player.pos.y += fwd.y * Player.speed * dt;
  Player.pos.z += fwd.z * Player.speed * dt;

  // --- terrain avoidance ---
  const gh = groundAt(Player.pos.x, Player.pos.z);
  Player.overWater = heightAt(Player.pos.x, Player.pos.z) <= 0;
  const look = 1.7 + Player.speed * 0.008;
  const fx = Player.pos.x + fwd.x * Player.speed * look;
  const fz = Player.pos.z + fwd.z * Player.speed * look;
  const aheadGround = groundAt(fx, fz);
  const aheadY = Player.pos.y + fwd.y * Player.speed * look;
  Player.pullUp = aheadY < aheadGround + 95;
  if (Player.pullUp) {
    Player.pitch = Math.min(1.05, Player.pitch + dt * 1.7);
    Player.quat = headingQuat(Player.yaw, Player.pitch, Player.roll + extraRoll);
  }
  const floor = gh + 34;
  if (Player.pos.y < floor) {
    Player.pos.y = floor;
    if (Player.pitch < 0.2) Player.pitch = Math.min(1.05, Player.pitch + dt * 3.2);
  }
  Player.radAlt = Player.pos.y - gh;
  Player.lowAlt = Player.radAlt < 120;
  Player.vs = (Player.pos.y - prevY) / Math.max(dt, 1e-4);
  const pitchRate = clamp((Player.pitch - (Player.lastPitch === undefined ? Player.pitch : Player.lastPitch)) / Math.max(dt, 1e-4), -2, 2);
  Player.lastPitch = Player.pitch;
  Player.gLoad = clamp(1 + Math.abs(Math.sin(Player.roll)) * 1.1 + Math.abs(pitchRate) * 0.9 + Player.ab * 0.2, 1, 8.5);
  Player.stall = Player.speed < 120;

  updateContrails(Player, dt);

  // water spray when skimming
  if (Player.overWater && Player.radAlt < 26 && Player.speed > 120) {
    spawnWaterSpray(Player, dt);
  }

  updateCamera(dt, time, false);
}
