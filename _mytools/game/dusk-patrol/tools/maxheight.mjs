import { launch, gameUrl } from './harness.mjs';
const b = await launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } });
await p.goto(gameUrl('?fixed=1'));
await p.waitForFunction(() => window.__dusk && __dusk.Game.state === 'title', null, { timeout: 60000 });
console.log(await p.evaluate(() => {
  const W = __dusk.World, N = W.N, T = W.TILE, hs = W.heights;
  let mx = -999, mi = 0, water = 0, snow = 0;
  for (let i = 0; i < N * N; i++) { if (hs[i] > mx) { mx = hs[i]; mi = i; } if (hs[i] < 0) water++; if (hs[i] > 600) snow++; }
  return { max: Math.round(mx), maxCell: [mi % N, Math.floor(mi / N)], waterPct: (water / (N * N) * 100).toFixed(1), snowCells: snow };
}));
await b.close();
