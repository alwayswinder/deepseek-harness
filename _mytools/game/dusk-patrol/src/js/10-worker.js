/* ============================================================
   Terrain worker: seamless heightfield, color masks, sun shadow
   bake, and cloud noise. Runs off the main thread.
   ============================================================ */

function terrainWorkerMain() {
  const N = 1024;
  const TILE = 12288;
  const MN = 512;
  const CN = 512;
  let SUN = { x: -0.62, y: 0.18, z: -0.72 };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a || 1e-9), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const mod = (a, n) => ((a % n) + n) % n;

  function hash2(ix, iy, seed) {
    let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // Periodic value noise: lattice wraps at `period`, so f(u+1,v) === f(u,v).
  function vnoise(x, y, period, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const x0 = mod(xi, period), y0 = mod(yi, period);
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed);
    const c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
    const ab = a + (b - a) * ux;
    const cd = c + (d - c) * ux;
    return ab + (cd - ab) * uy;
  }

  function fbm(u, v, freq, oct, seed, gain) {
    let amp = 1, sum = 0, norm = 0, f = freq, s = seed;
    const g = gain === undefined ? 0.5 : gain;
    for (let i = 0; i < oct; i++) {
      sum += amp * vnoise(u * f, v * f, f, s);
      norm += amp;
      amp *= g;
      f *= 2;
      s += 101;
    }
    return sum / norm;
  }

  function ridged(u, v, freq, oct, seed) {
    let amp = 0.55, sum = 0, norm = 0, f = freq, s = seed, weight = 1;
    for (let i = 0; i < oct; i++) {
      let n = vnoise(u * f, v * f, f, s);
      n = 1 - Math.abs(n * 2 - 1);
      n *= n * weight;
      sum += n * amp;
      norm += amp;
      weight = clamp(n * 2.2, 0.25, 1);
      amp *= 0.5;
      f *= 2;
      s += 211;
    }
    return sum / norm;
  }

  function heightAtUV(u, v) {
    const wx = (vnoise(u * 4, v * 4, 4, 11) - 0.5) * 0.062 +
               (vnoise(u * 13, v * 13, 13, 12) - 0.5) * 0.020;
    const wy = (vnoise(u * 4 + 3.1, v * 4 + 7.7, 4, 13) - 0.5) * 0.062 +
               (vnoise(u * 13 + 5.3, v * 13 + 1.9, 13, 14) - 0.5) * 0.020;
    const uu = u + wx, vv = v + wy;

    const cont = fbm(uu, vv, 3, 5, 21);
    const hills = fbm(uu, vv, 8, 5, 31);
    const range = fbm(uu, vv, 3, 4, 41);
    const ridge = ridged(uu, vv, 6, 5, 51);

    const land = smoothstep(0.40, 0.505, cont);
    const deep = 1 - smoothstep(0.16, 0.42, cont);
    const mm = smoothstep(0.40, 0.68, range);

    let h = -48 * deep;
    h += land * (12 + hills * 62);
    h += (0.22 + Math.pow(clamp(ridge, 0, 1), 1.15) * 0.96) * 1250 * mm * land;
    h += land * Math.max(0, hills - 0.56) * 70 * (0.4 + mm);
    h += land * smoothstep(0.52, 0.82, range) * 180;
    // rocky islets inside the lake
    h += Math.max(0, hills - 0.70) * 180 * smoothstep(0.23, 0.39, cont) * (1 - land);
    h += (fbm(uu, vv, 42, 3, 61) - 0.5) * 6 * land;
    return clamp(h, -50, 1100);
  }

  function generate(seed) {
    const heights = new Float32Array(N * N);
    const mask = new Uint8Array(MN * MN * 4);
    const shadow = new Uint8Array(N * N);
    const cloud = new Uint8Array(CN * CN);
    const rnd = (() => {
      let a = (seed | 0) + 1234567;
      return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })();

    const post = (stage, value) => self.postMessage({ type: 'progress', stage, value });

    // ---- 1. heightfield ----
    post('SHAPING THE BASIN', 0.02);
    for (let j = 0; j < N; j++) {
      const v = j / N;
      for (let i = 0; i < N; i++) {
        heights[j * N + i] = heightAtUV(i / N, v);
      }
      if ((j & 63) === 0) post('SHAPING THE BASIN', 0.02 + (j / N) * 0.55);
    }
    post('RAISING THE RIDGES', 0.58);

    // ---- 2. surface masks ----
    const at = (ix, iz) => heights[mod(iz, N) * N + mod(ix, N)];
    for (let j = 0; j < MN; j++) {
      const v = j / MN;
      for (let i = 0; i < MN; i++) {
        const u = i / MN;
        const h = at(i * 2, j * 2);
        const hx = at(i * 2 + 2, j * 2) - at(i * 2 - 2, j * 2);
        const hz = at(i * 2, j * 2 + 2) - at(i * 2, j * 2 - 2);
        const slope = Math.hypot(hx, hz) / 48;
        const ny = 1 / Math.sqrt(1 + slope * slope);

        const forestNoise = fbm(u, v, 13, 4, 71) * 0.66 + fbm(u, v, 33, 3, 72) * 0.34;
        let forest = smoothstep(0.470, 0.585, forestNoise);
        forest *= smoothstep(430, 205, h);
        forest *= smoothstep(0.50, 0.78, ny);
        forest *= smoothstep(2.0, 7.0, h);
        forest *= smoothstep(-12, 2, h);

        const variation = fbm(u, v, 9, 3, 81) * 0.6 + fbm(u, v, 27, 2, 82) * 0.4;
        const rock = clamp(
          smoothstep(0.52, 0.72, fbm(u, v, 21, 3, 91)) * 0.6 +
          smoothstep(360, 720, h) * 0.55 +
          (1 - ny) * 0.9, 0, 1);
        const detail = fbm(u, v, 70, 2, 95);
        const o = (j * MN + i) * 4;
        mask[o] = (forest * 255) | 0;
        mask[o + 1] = (clamp(variation, 0, 1) * 255) | 0;
        mask[o + 2] = (rock * 255) | 0;
        mask[o + 3] = (clamp(detail, 0, 1) * 255) | 0;
      }
      if ((j & 63) === 0) post('COLOURING THE FOREST', 0.58 + (j / MN) * 0.12);
    }
    post('BAKING THE LOW SUN', 0.71);

    // ---- 3. bake directional sun shadow (sun is fixed at dusk) ----
    const sl = Math.hypot(SUN.x, SUN.z) || 1;
    const sx = SUN.x / sl, sz = SUN.z / sl;
    const rise = SUN.y / sl;
    const STEPS = 54;
    const STEP = 96;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const idx = j * N + i;
        const h = heights[idx];
        if (h <= 0) { shadow[idx] = 255; continue; }
        let lit = 1;
        for (let k = 1; k <= STEPS; k++) {
          const d = k * STEP;
          const px = i + sx * (d / (TILE / N));
          const pz = j + sz * (d / (TILE / N));
          const h2 = heights[mod(Math.round(pz), N) * N + mod(Math.round(px), N)];
          const ray = h + rise * d + 2.5;
          if (h2 > ray) { lit = 0; break; }
          if (h2 > ray - 16) lit = Math.min(lit, 0.45);
        }
        shadow[idx] = (lit * 255) | 0;
      }
      if ((j & 31) === 0) post('BAKING THE LOW SUN', 0.71 + (j / N) * 0.22);
    }

    // ---- 4. cloud noise ----
    post('SEEDING THE CLOUDS', 0.94);
    for (let j = 0; j < CN; j++) {
      const v = j / CN;
      for (let i = 0; i < CN; i++) {
        const u = i / CN;
        const wx = (vnoise(u * 5, v * 5, 5, 121) - 0.5) * 0.14;
        const wy = (vnoise(u * 5 + 2.7, v * 5 + 9.1, 5, 122) - 0.5) * 0.14;
        let n = fbm(u + wx, v + wy, 5, 6, 131);
        n = clamp((n - 0.30) / 0.52, 0, 1);
        n = n * n * (3 - 2 * n);
        cloud[j * CN + i] = (n * 255) | 0;
      }
      if ((j & 127) === 0) post('SEEDING THE CLOUDS', 0.94 + (j / CN) * 0.06);
    }

    post('READY', 1);

    self.postMessage({
      type: 'done',
      heights: heights.buffer,
      mask: mask.buffer,
      shadow: shadow.buffer,
      cloud: cloud.buffer,
      n: N,
      mn: MN,
      cn: CN,
      seed,
    }, [heights.buffer, mask.buffer, shadow.buffer, cloud.buffer]);
  }

  self.onmessage = (ev) => {
    const d = ev.data || {};
    if (d.cmd === 'generate') {
      if (d.sun) SUN = d.sun;
      generate(d.seed | 0);
    }
  };
}
