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
await page.evaluate(() => {
  window.__dusk.startGame();
  window.__dusk.setView(1);
});
await page.waitForTimeout(500);
const setup = await page.evaluate(() => {
  window.__dusk.fireMissile();
  const m = window.__dusk.MissileSys.live[0];
  if (!m) return null;
  const t = m.target;
  const ang = 0.7;
  const dist = 340;
  const cam = { x: t.x + Math.sin(ang) * dist, y: t.y + 38, z: t.z - Math.cos(ang) * dist };
  const dx = t.x - cam.x, dy = t.y - cam.y, dz = t.z - cam.z;
  const yaw = Math.atan2(dx, -dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  window.__dusk.camOverride = { pos: cam, q: window.__dusk.headingQuat(yaw, pitch, 0), fov: 0.80 };
  return { target: t, cam, yaw, pitch, ammo: window.__dusk.MissileSys.ammo };
});
console.log('launch', setup);
await page.waitForTimeout(400);
for (let i = 0; i < 100; i++) {
  await page.waitForTimeout(120);
  const s = await page.evaluate(() => ({
    live: __dusk.MissileSys.live.length,
    decals: __dusk.FX.decals.length,
    flash: __dusk.FX.flash,
    parts: __dusk.FX.parts.length,
    t: +__dusk.Game.time.toFixed(2),
    ammo: __dusk.MissileSys.ammo,
  }));
  if (i % 10 === 0) console.log(i, s);
  if (s.decals > 0 || s.flash > 0) {
    console.log('IMPACT', s);
    writeFileSync(shotPath('impact-1.png'), await page.screenshot());
    await page.waitForTimeout(180);
    writeFileSync(shotPath('impact-2.png'), await page.screenshot());
    await page.waitForTimeout(700);
    writeFileSync(shotPath('impact-3.png'), await page.screenshot());
    break;
  }
}
await browser.close();
