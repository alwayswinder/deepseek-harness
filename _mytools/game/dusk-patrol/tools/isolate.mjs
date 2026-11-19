import { launch, gameUrl, shotPath } from './harness.mjs';
import { writeFileSync } from 'node:fs';
const browser = await launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(gameUrl('?fixed=1&noshadow=1'));
await page.waitForFunction(() => window.__dusk && window.__dusk.Game.state === 'title', null, { timeout: 60000 });
await page.evaluate(() => { __dusk.startGame(); __dusk.setView(1); });
await page.waitForTimeout(400);
await page.evaluate(() => {
  __dusk.fireMissile();
  const t = __dusk.MissileSys.live[0].target;
  const ang = 0.7, dist = 340;
  const cam = { x: t.x + Math.sin(ang) * dist, y: t.y + 38, z: t.z - Math.cos(ang) * dist };
  const dx = t.x - cam.x, dy = t.y - cam.y, dz = t.z - cam.z;
  const yaw = Math.atan2(dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
  __dusk.camOverride = { pos: cam, q: __dusk.headingQuat(yaw, pitch, 0), fov: 0.8 };
});
for (let i = 0; i < 100; i++) {
  await page.waitForTimeout(120);
  const s = await page.evaluate(() => ({ live: __dusk.MissileSys.live.length, decals: __dusk.FX.decals.length, flash: __dusk.FX.flash, parts: __dusk.FX.parts.length }));
  if (s.decals > 0) {
    await page.waitForTimeout(500);
    writeFileSync(shotPath('iso-all.png'), await page.screenshot());
    await page.evaluate(() => { __dusk.FX.parts.length = 0; });
    await page.waitForTimeout(80);
    writeFileSync(shotPath('iso-noparts.png'), await page.screenshot());
    await page.evaluate(() => { __dusk.FX.decals.length = 0; __dusk.FX.flash = 0; });
    await page.waitForTimeout(80);
    writeFileSync(shotPath('iso-none.png'), await page.screenshot());
    break;
  }
}
await browser.close();
