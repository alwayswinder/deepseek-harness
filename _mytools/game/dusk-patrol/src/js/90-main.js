/* ============================================================
   Boot, input, adaptive resolution and the main render loop
   ============================================================ */

const Game = {
  state: 'loading',
  started: false,
  time: 0,
  last: 0,
  renderScale: 1,
  fpsAcc: 0,
  fpsN: 0,
  fps: 60,
  goodT: 0,
};

const PARAMS = new URLSearchParams(location.search);
const ADAPTIVE = !PARAMS.has('fixed');

function $(id) { return document.getElementById(id); }

function fatal(err) {
  const box = $('fatal');
  const msg = $('fatalmsg');
  if (msg) msg.textContent = String((err && (err.message || err)) || 'Unknown renderer error.');
  if (box) box.classList.remove('hidden');
  const load = $('loading');
  if (load) load.classList.add('gone');
  console.error(err);
}

function setProgress(value, stage) {
  const v = clamp(value || 0, 0, 1);
  const fill = $('loadfill');
  const pct = $('loadpct');
  const st = $('loadstage');
  if (fill) fill.style.width = (v * 100).toFixed(0) + '%';
  if (pct) pct.textContent = Math.round(v * 100) + '%';
  if (stage && st) st.textContent = stage;
}

function startGame() {
  if (Game.started || Game.state !== 'title') return;
  Cam.from = { pos: vcopy(Cam.pos), q: Cam.q, fov: Cam.fov };
  Cam.blend = 0;
  Game.started = true;
  Game.state = 'playing';
  Input.nx = 0; Input.ny = 0;
  Input.lastMove = Game.time;
  const title = $('title');
  if (title) title.classList.add('gone');
  refreshBar();
  if (Sound.enabled) Sound.click();
}

function setView(i) {
  const v = ((i % 3) + 3) % 3;
  if (v === Cam.view) return;
  Cam.from = { pos: vcopy(Cam.pos), q: Cam.q, fov: Cam.fov };
  Cam.view = v;
  Cam.blend = 0;
  refreshBar();
  if (Sound.enabled) Sound.click();
}

function toggleSound() {
  const on = Sound.toggle();
  const b = $('soundbtn');
  if (b) {
    b.textContent = on ? 'SOUND ON' : 'SOUND OFF';
    b.classList.toggle('on', on);
  }
  return on;
}

function refreshBar() {
  const vn = $('viewname');
  if (vn) vn.textContent = 'VIEW \u00b7 ' + viewName();
  const wrap = $('missilepips');
  if (wrap) {
    let pips = wrap.querySelectorAll('.pip');
    if (pips.length !== 4) {
      wrap.innerHTML = '<span class="lbl">MSL</span>';
      for (let i = 0; i < 4; i++) {
        const p = document.createElement('span');
        p.className = 'pip';
        wrap.appendChild(p);
      }
      pips = wrap.querySelectorAll('.pip');
    }
    for (let i = 0; i < 4; i++) {
      if (pips[i]) pips[i].classList.toggle('empty', !MissileSys.mounted[i]);
    }
  }
}

function updatePointer(e) {
  const gl = $('gl');
  if (!gl) return;
  const r = gl.getBoundingClientRect();
  Input.nx = clamp(((e.clientX - r.left) / Math.max(r.width, 1)) * 2 - 1, -1, 1);
  Input.ny = clamp(((e.clientY - r.top) / Math.max(r.height, 1)) * 2 - 1, -1, 1);
  Input.mouseX = e.clientX;
  Input.mouseY = e.clientY;
  Input.lastMove = Game.time;
  HUD.cursorX = ((e.clientX - r.left) / Math.max(r.width, 1)) * HUD.W;
  HUD.cursorY = ((e.clientY - r.top) / Math.max(r.height, 1)) * HUD.H;
}

function resize() {
  const gl = $('gl');
  if (!gl) return;
  glResize(gl.clientWidth || window.innerWidth, gl.clientHeight || (window.innerHeight - 38), Game.renderScale);
  resizeHUD(GL.baseW, GL.baseH);
  HUD.cursorX = HUD.W * 0.5;
  HUD.cursorY = HUD.H * 0.5;
}

function bindInput() {
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));

  window.addEventListener('mousemove', (e) => {
    if (e.target && e.target.closest && e.target.closest('#hudbar, #touch')) return;
    updatePointer(e);
  }, { passive: true });

  window.addEventListener('mousedown', (e) => {
    if (!Game.started) return;
    if (e.target && e.target.closest && e.target.closest('#hudbar, #touch')) return;
    if (e.button === 0) {
      Input.lmb = true;
      Input.lmbTime = performance.now();
      Input.lastMove = Game.time;
    } else if (e.button === 2) {
      e.preventDefault();
      fireMissile();
      Input.lastMove = Game.time;
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (!Game.started) return;
    if (e.button === 0 && Input.lmb) {
      const held = performance.now() - (Input.lmbTime || 0);
      Input.lmb = false;
      if (held < 240) startBarrel();
    }
  });

  window.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!Game.started) startGame();
      else setView((Cam.view + 1) % 3);
      return;
    }
    if (e.code === 'Enter' && !Game.started) {
      e.preventDefault();
      startGame();
      return;
    }
    if (e.key === 'f' || e.key === 'F') {
      if (Game.started) fireMissile();
      return;
    }
    if (e.key === 'm' || e.key === 'M') {
      toggleSound();
    }
  });

  const title = $('title');
  if (title) title.addEventListener('pointerdown', (e) => {
    if (Game.state === 'title') {
      e.preventDefault();
      startGame();
    }
  });

  const soundBtn = $('soundbtn');
  if (soundBtn) soundBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSound();
  });

  // --- touch stick ---
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (isTouch) document.body.classList.add('touch');
  const stick = $('stick');
  let stickId = null;
  if (stick) {
    const knob = stick.querySelector('span');
    const moveStick = (e) => {
      const r = stick.getBoundingClientRect();
      let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      Input.nx = dx; Input.ny = dy;
      Input.lastMove = Game.time;
      if (knob) knob.style.transform = 'translate(' + (dx * 26).toFixed(0) + 'px,' + (dy * 26).toFixed(0) + 'px)';
    };
    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      stickId = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      moveStick(e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickId) return;
      e.preventDefault();
      moveStick(e);
    });
    const endStick = (e) => {
      if (e.pointerId !== stickId) return;
      stickId = null;
      Input.nx = 0; Input.ny = 0;
      if (knob) knob.style.transform = '';
    };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);
  }

  document.querySelectorAll('.tbtns button').forEach((btn) => {
    const act = btn.dataset.act;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!Game.started) return;
      if (act === 'view') setView((Cam.view + 1) % 3);
      else if (act === 'roll') startBarrel();
      else if (act === 'missile') fireMissile();
      else if (act === 'ab') { Input.touchAB = true; btn.classList.add('on'); }
    });
    const off = (e) => {
      if (act === 'ab') { Input.touchAB = false; btn.classList.remove('on'); }
    };
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('pointerleave', off);
  });

  window.addEventListener('blur', () => {
    Input.lmb = false;
    Input.touchAB = false;
    Input.afterburner = false;
  });
}

function updateAdaptive(dt) {
  Game.fpsAcc += dt;
  Game.fpsN++;
  if (Game.fpsAcc < 1.2) return;
  const fps = Game.fpsN / Game.fpsAcc;
  Game.fps = fps;
  Game.fpsAcc = 0;
  Game.fpsN = 0;
  if (!ADAPTIVE || !Game.started) return;
  if (fps < 46 && Game.renderScale > 0.58) {
    Game.renderScale = Math.max(0.58, Game.renderScale - 0.14);
    Game.goodT = 0;
    resize();
  } else if (fps > 57) {
    Game.goodT += 1.8;
    if (Game.goodT > 12 && Game.renderScale < 1) {
      Game.renderScale = Math.min(1, Game.renderScale + 0.1);
      Game.goodT = 0;
      resize();
    }
  } else {
    Game.goodT = 0;
  }
}

function render(now) {
  const gl = GL.gl;
  gl.viewport(0, 0, GL.w, GL.h);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.clearColor(0.07, 0.06, 0.13, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const view = cameraViewMatrix(Cam);
  const proj = m4Perspective(Cam.fov, GL.w / Math.max(GL.h, 1), Cam.near, Cam.far);
  const viewProj = m4Mul(proj, view);
  GL.cam = Cam;
  GL.viewProj = viewProj;

  renderWorld(Cam, Game.time);
  if (Game.started && Cam.view !== 2 && !PARAMS.has('noshadow')) drawGroundShadow(Cam, Player);
  renderClouds(Cam, viewProj, Game.started ? Player.pos : null);
  if (Game.started) {
    if (!PARAMS.has('noair')) drawAircraft(Cam, Player, Cam.view);
    if (!PARAMS.has('nomissiles')) drawMissiles(Cam);
    if (!PARAMS.has('notrail')) drawContrails();
    if (!PARAMS.has('noflames')) drawFlames(Cam, Player, Player.ab);
    if (!PARAMS.has('noeffects')) drawEffects();
  } else {
    drawAircraft(Cam, Player, Cam.view);
    if (!PARAMS.has('notrail')) drawContrails();
    drawFlames(Cam, Player, 0);
  }
  if (Game.started) drawHUD(Game.time);
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!Game.last) Game.last = now;
  let dt = (now - Game.last) / 1000;
  const realDt = dt;
  Game.last = now;
  dt = clamp(dt, 0, 0.05);
  Game.time += dt;
  GL.time = Game.time;

  if (Game.started) {
    Input.afterburner = Input.touchAB || (Input.lmb && performance.now() - (Input.lmbTime || 0) > 125);
    updatePlayer(dt, Game.time);
    updateMissiles(dt);
    updateEffects(dt);
    Sound.update(Player);
    refreshBar();
  }

  updateAdaptive(realDt);
  render(now);
}

async function boot() {
  try {
    glInit($('gl'));
  } catch (err) {
    fatal(err);
    return;
  }
  Cam.near = 0.6;
  Cam.far = 46000;
  GL.time = 0;
  initHUD($('hud'));
  initMeshes();
  initEffects();
  bindInput();
  resize();
  setProgress(0.01, 'INITIALISING');

  try {
    await loadWorld((v, stage) => setProgress(v, stage));
  } catch (err) {
    fatal(err);
    return;
  }

  glUploadWorld(World);
  buildCloudField();
  resizeHUD(GL.baseW, GL.baseH);
  resetPlayer();
  refreshBar();
  Game.state = 'title';
  setProgress(1, 'READY');
  requestAnimationFrame(frame);
  setTimeout(() => {
    const load = $('loading');
    if (load) load.classList.add('gone');
  }, 420);

  if (PARAMS.get('autostart') === '1') {
    setTimeout(startGame, 900);
    if (PARAMS.get('view')) setTimeout(() => setView(parseInt(PARAMS.get('view'), 10) || 0), 1400);
  }
}

window.addEventListener('error', (e) => {
  if (!Game.started && Game.state === 'loading') fatal(e.error || e.message);
});

window.__dusk = {
  Game, Player, Cam, World, MissileSys, FX, HUD, Sound, Input, GL,
  startGame, setView, switchView, startBarrel, fireMissile, toggleSound, resize,
  headingQuat, dirFromYawPitch, heightAt, groundAt,
  snapCamera: () => { Cam.blend = 1; Cam.from = null; updateCamera(0, Game.time, true); },
  get time() { return Game.time; },
};

boot();
