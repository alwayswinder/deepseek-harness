import { launch, gameUrl } from './harness.mjs';
const b = await launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } });
await p.goto(gameUrl('?fixed=1'));
await p.waitForFunction(() => window.__dusk && __dusk.Game.state === 'title', null, { timeout: 60000 });
console.log(await p.evaluate(() => {
  const s = __dusk.World.spawn;
  const out = [];
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2;
    let mx = -999, at = 0;
    for (let d = 2500; d <= 9000; d += 250) {
      const h = __dusk.heightAt(s.x + Math.sin(a) * d, s.z - Math.cos(a) * d);
      if (h > mx) { mx = h; at = d; }
    }
    out.push({ deg: Math.round(a * 180 / Math.PI), max: Math.round(mx), at });
  }
  return { spawn: s, out };
}));
await b.close();
