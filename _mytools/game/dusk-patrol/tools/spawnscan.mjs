import { launch, gameUrl } from './harness.mjs';
const b = await launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } });
await p.goto(gameUrl('?fixed=1'));
await p.waitForFunction(() => window.__dusk && __dusk.Game.state === 'title', null, { timeout: 60000 });
console.log(await p.evaluate(() => {
  const W = __dusk.World, N = W.N, T = W.TILE, cell = T / N;
  const hs = W.heights;
  const at = (x, z) => {
    const i = ((Math.round(z / cell) % N) + N) % N, j = ((Math.round(x / cell) % N) + N) % N;
    return hs[i * N + j];
  };
  const best = [];
  for (let z = 0; z < T; z += cell * 20) {
    for (let x = 0; x < T; x += cell * 20) {
      const h = at(x, z);
      if (h > -7 || h < -30) continue;
      let peak = -999, pdir = 0, pdist = 0;
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2;
        for (let d = 3000; d <= 8000; d += 500) {
          const hh = at(x + Math.sin(a) * d, z - Math.cos(a) * d);
          if (hh > peak) { peak = hh; pdir = a; pdist = d; }
        }
      }
      if (peak < 380) continue;
      const near = at(x + 400, z) > 2 || at(x - 400, z) > 2 || at(x, z + 400) > 2 || at(x, z - 400) > 2;
      const score = peak + (near ? 80 : 0) - Math.abs(pdist - 5200) * 0.02;
      best.push({ x: Math.round(x), z: Math.round(z), h: Math.round(h), peak: Math.round(peak), pdir: Math.round(pdir * 180 / Math.PI), pdist, score: Math.round(score) });
    }
  }
  best.sort((a, b) => b.score - a.score);
  return best.slice(0, 8);
}));
await b.close();
