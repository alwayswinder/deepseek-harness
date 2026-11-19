/* ============================================================
   World data: worker loading, height sampling, spawn selection
   ============================================================ */

const World = {
  N: 1024,
  MN: 512,
  CN: 512,
  TILE: 12288,
  heights: null,
  mask: null,
  shadow: null,
  cloud: null,
  seed: 1,
  spawn: { x: 6144, z: 6144, yaw: -Math.PI * 0.25, alt: 560 },
  ready: false,
};

function loadWorld(onProgress) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      const src = ';(' + terrainWorkerMain.toString() + ')();';
      const blob = new Blob([src], { type: 'text/javascript' });
      worker = new Worker(URL.createObjectURL(blob));
    } catch (err) {
      reject(err);
      return;
    }
    const timer = setTimeout(() => {
      try { worker.terminate(); } catch (e) { /* already gone */ }
      reject(new Error('terrain generation timed out'));
    }, 30000);
    worker.onmessage = (ev) => {
      const d = ev.data;
      if (d.type === 'progress') {
        onProgress(d.value, d.stage);
        return;
      }
      if (d.type === 'done') {
        clearTimeout(timer);
        const data = {
          n: d.n, mn: d.mn, cn: d.cn,
          heights: new Float32Array(d.heights),
          mask: new Uint8Array(d.mask),
          shadow: new Uint8Array(d.shadow),
          cloud: new Uint8Array(d.cloud),
          seed: d.seed,
        };
        World.init(data);
        worker.terminate();
        resolve(data);
      }
    };
    worker.onerror = (err) => {
      clearTimeout(timer);
      reject(new Error('terrain worker: ' + (err.message || 'failed')));
    };
    worker.postMessage({ cmd: 'generate', seed: 20261118, sun: { x: SUN.x, y: SUN.y, z: SUN.z } });
  });
}

World.init = function (data) {
  World.heights = data.heights;
  World.mask = data.mask;
  World.shadow = data.shadow;
  World.cloud = data.cloud;
  World.N = data.n;
  World.MN = data.mn;
  World.CN = data.cn;
  World.TILE = 12288;
  World.seed = data.seed;
  World.spawn = pickSpawn();
  World.ready = true;
};

function pickSpawn() {
  const N = World.N, TILE = World.TILE, hs = World.heights;
  const cell = TILE / N;
  const at = (i, j) => hs[mod(j, N) * N + mod(i, N)];
  let best = { score: -1e9, i: N / 2, j: N / 2 };
  for (let j = 48; j < N - 48; j += 8) {
    for (let i = 48; i < N - 48; i += 8) {
      const h = at(i, j);
      if (h > -6 || h < -30) continue;
      let nearLand = 0, farLand = 0;
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * TAU;
        const rr = Math.round(520 / cell);
        if (at(i + Math.cos(ang) * rr, j + Math.sin(ang) * rr) > 2) nearLand++;
      }
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * TAU;
        const rr = Math.round(1250 / cell);
        if (at(i + Math.cos(ang) * rr, j + Math.sin(ang) * rr) > 4) farLand++;
      }
      if (nearLand === 0 && farLand < 3) continue;
      // look NW toward the mountain wall the sun sits over
      let relief = 0, near = 0;
      for (let k = 2; k <= 8; k++) {
        const d = Math.round((k * 950) / cell);
        const m = at(i - d, j - d);
        relief += Math.max(0, m) * (1.25 - k * 0.06);
        if (k <= 3) near = Math.max(near, m);
      }
      const score = -Math.abs(h + 11) * 1.6 + relief * 0.020 + nearLand * 18 +
        Math.min(farLand, 8) * 2.5 + Math.min(near, 80) * 0.05;
      if (score > best.score) best = { score, i, j };
    }
  }
  return {
    x: (best.i + 0.5) * cell,
    z: (best.j + 0.5) * cell,
    yaw: -Math.PI * 0.25,
    alt: 560,
  };
}

function heightAt(x, z) {
  const hs = World.heights;
  if (!hs) return 0;
  const N = World.N, TILE = World.TILE;
  const u = (x / TILE) * N;
  const v = (z / TILE) * N;
  const i0 = Math.floor(u), j0 = Math.floor(v);
  const fx = u - i0, fz = v - j0;
  const i0m = mod(i0, N), j0m = mod(j0, N);
  const i1m = (i0m + 1) % N, j1m = (j0m + 1) % N;
  const a = hs[j0m * N + i0m], b = hs[j0m * N + i1m];
  const c = hs[j1m * N + i0m], d = hs[j1m * N + i1m];
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
}

function groundAt(x, z) {
  return Math.max(0, heightAt(x, z));
}
