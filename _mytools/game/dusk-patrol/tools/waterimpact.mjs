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
await page.evaluate(() => window.__dusk.startGame());
await page.waitForTimeout(300);

const spot = await page.evaluate(() => {
  const W = window.__dusk.World;
  const T = W.TILE, N = W.N;
  let best = null;
  for (let z = 600; z < T - 600; z += 110) {
    for (let x = 600; x < T - 600; x += 110) {
      const h = window.__dusk.heightAt(x, z);
      if (h > -9) continue;
      let wet = 0, minH = h;
      for (let k = 1; k <= 5; k++) {
        const hh = window.__dusk.heightAt(x + k * 260, z + k * 260);
        if (hh < 0) wet++;
        minH = Math.min(minH, hh);
      }
      const score = wet * 3 - h * 0.25;
      if (!best || score > best.score) best = { x, z, h, wet, score };
    }
  }
  return best;
});
console.log('spot', spot);

await page.evaluate((s) => {
  const d = window.__dusk;
  d.Player.pos = { x: s.x, y: 460, z: s.z };
  d.Player.yaw = -Math.PI / 4;
  d.Player.pitch = -0.62;
  d.Player.roll = 0;
  d.Player.quat = d.headingQuat(d.Player.yaw, d.Player.pitch, 0);
  d.snapCamera();
  d.fireMissile();
}, spot);

const target = await page.evaluate(() => window.__dusk.MissileSys.live[0] && window.__dusk.MissileSys.live[0].target);
console.log('target', target);
if (!target || !target.water) {
  console.log('NOT WATER TARGET');
}
if (target) {
  await page.evaluate((t) => {
    const d = window.__dusk;
    const dx = t.x - d.Player.pos.x, dz = t.z - d.Player.pos.z;
    const yaw = Math.atan2(dx, -dz) + Math.PI;
    d.camOverride = {
      pos: { x: t.x + Math.sin(yaw) * 250, y: t.y + 95, z: t.z + Math.cos(yaw) * 250 },
      q: d.headingQuat(yaw, -0.38, 0),
      fov: 0.78,
    };
    d.snapCamera();
  }, target);
}
await page.waitForTimeout(1200);
writeFileSync(shotPath('water-pre.png'), await page.screenshot());
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(120);
  const s = await page.evaluate(() => ({ live: __dusk.MissileSys.live.length, decals: __dusk.FX.decals.length, parts: __dusk.FX.parts.length }));
  if (s.decals > 0) {
    console.log('impact', s, 'at', i);
    const d0 = await page.evaluate(() => {
      const d = window.__dusk;
      const dec = d.FX.decals[d.FX.decals.length - 1];
      const yaw = 0.6;
      d.camOverride = {
        pos: { x: dec.x + Math.sin(yaw) * 260, y: dec.y + 90, z: dec.z + Math.cos(yaw) * 260 },
        q: d.headingQuat(-yaw, -0.34, 0),
        fov: 0.8,
      };
      d.snapCamera();
      return { x: dec.x, y: dec.y, z: dec.z };
    });
    console.log('decal', d0);
    await page.waitForTimeout(90);
    writeFileSync(shotPath('water-impact-1.png'), await page.screenshot());
    await page.waitForTimeout(260);
    writeFileSync(shotPath('water-impact-2.png'), await page.screenshot());
    await page.waitForTimeout(700);
    writeFileSync(shotPath('water-impact-3.png'), await page.screenshot());
    break;
  }
}
await browser.close();
