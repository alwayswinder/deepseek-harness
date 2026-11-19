import { launch, gameUrl, shotPath } from './harness.mjs';
import { writeFileSync } from 'node:fs';
const browser = await launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(gameUrl('?fixed=1&noshadow=1'));
await page.waitForFunction(() => window.__dusk && window.__dusk.Game.state === 'title', null, { timeout: 60000 });
const setup = await page.evaluate(() => {
  const W = __dusk.World;
  let best = null;
  for (let z = 200; z < W.TILE - 200; z += 140) {
    for (let x = 200; x < W.TILE - 200; x += 140) {
      const h = __dusk.heightAt(x, z);
      if (h < 35 || h > 180) continue;
      if (__dusk.heightAt(x + 600, z) < 5 || __dusk.heightAt(x - 600, z) < 5 || __dusk.heightAt(x, z + 600) < 5 || __dusk.heightAt(x, z - 600) < 5) continue;
      const mi = ((Math.floor(z / W.TILE * W.MN) % W.MN) * W.MN + (Math.floor(x / W.TILE * W.MN) % W.MN)) * 4;
      if (W.mask[mi] > 70) continue;
      const h2 = __dusk.heightAt(x + 300, z);
      const h3 = __dusk.heightAt(x, z + 300);
      if (Math.abs(h2 - h) > 25 || Math.abs(h3 - h) > 25) continue;
      const d = Math.hypot(x - 10182, z - 1350);
      if (!best || d < best.d) best = { x, z, h, d };
    }
  }
  const p = best;
  __dusk.startGame();
  __dusk.setView(1);
  __dusk.Player.pos = { x: p.x, y: p.h + 600, z: p.z };
  __dusk.Player.yaw = 0;
  __dusk.Player.pitch = -1.0;
  __dusk.Player.quat = __dusk.headingQuat(0, -1.0, 0);
  __dusk.fireMissile();
  const m = __dusk.MissileSys.live[0];
  const t = m.target;
  const ang = 0.7;
  const dist = 360;
  const cam = { x: t.x + Math.sin(ang) * dist, y: t.y + 140, z: t.z - Math.cos(ang) * dist };
  const dx = t.x - cam.x, dy = t.y - cam.y, dz = t.z - cam.z;
  const yaw = Math.atan2(dx, -dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  __dusk.camOverride = { pos: cam, q: __dusk.headingQuat(yaw, pitch, 0), fov: 0.82 };
  return { p, target: t };
});
console.log('launch', setup);
await page.waitForTimeout(400);
for (let i = 0; i < 90; i++) {
  await page.waitForTimeout(120);
  const s = await page.evaluate(() => ({
    live: __dusk.MissileSys.live.length,
    decals: __dusk.FX.decals.length,
    flash: +__dusk.FX.flash.toFixed(2),
    parts: __dusk.FX.parts.length,
    t: +__dusk.Game.time.toFixed(2),
  }));
  if (i % 8 === 0) console.log(i, s);
  if (s.decals > 0 || s.flash > 0) {
    console.log('IMPACT', s);
    await page.waitForTimeout(450);
    writeFileSync(shotPath('land-impact-1.png'), await page.screenshot());
    await page.waitForTimeout(220);
    writeFileSync(shotPath('land-impact-2.png'), await page.screenshot());
    await page.waitForTimeout(900);
    writeFileSync(shotPath('land-impact-3.png'), await page.screenshot());
    break;
  }
}
await browser.close();
