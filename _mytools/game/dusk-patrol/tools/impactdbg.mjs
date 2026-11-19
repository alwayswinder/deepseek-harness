import { launch, gameUrl } from './harness.mjs';
const browser = await launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(gameUrl('?fixed=1'));
await page.waitForFunction(() => window.__dusk && window.__dusk.Game.state === 'title', null, { timeout: 60000 });
await page.evaluate(() => { __dusk.startGame(); __dusk.setView(1); });
await page.waitForTimeout(400);
const info = await page.evaluate(() => {
  __dusk.fireMissile();
  const m = __dusk.MissileSys.live[0];
  const t = m.target;
  const cam = { x: t.x + Math.sin(0.7) * 420, y: t.y + 165, z: t.z - Math.cos(0.7) * 420 };
  const dx = t.x - cam.x, dy = t.y - cam.y, dz = t.z - cam.z;
  const yaw = Math.atan2(dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
  __dusk.camOverride = { pos: cam, q: __dusk.headingQuat(yaw, pitch, 0), fov: 0.82 };
  return { t, cam, yaw, pitch, q: __dusk.camOverride.q };
});
console.log('info', info);
await page.waitForTimeout(200);
for (let i = 0; i < 120; i++) {
  await page.waitForTimeout(100);
  const st = await page.evaluate(() => {
    const m = __dusk.MissileSys.live[0];
    return {
      live: !!m,
      mpos: m ? { x: +m.pos.x.toFixed(1), y: +m.pos.y.toFixed(1), z: +m.pos.z.toFixed(1) } : null,
      decals: __dusk.FX.decals.length,
      parts: __dusk.FX.parts.length,
      flash: +__dusk.FX.flash.toFixed(2),
      cam: { x: +__dusk.Cam.pos.x.toFixed(1), y: +__dusk.Cam.pos.y.toFixed(1), z: +__dusk.Cam.pos.z.toFixed(1) },
      fwd: (() => { const f = __dusk.dirFromYawPitch(__dusk.Player.yaw, 0); return { x: +f.x.toFixed(2), y: +f.y.toFixed(2), z: +f.z.toFixed(2) }; })(),
    };
  });
  if (i % 10 === 0 || st.decals) console.log(i, st);
  if (st.decals > 0) {
    const e = await page.evaluate(() => {
      const c = __dusk.Cam;
      const f = __dusk.qRot ? null : null;
      const p = __dusk.FX.parts[0];
      return { p0: p ? { x: p.x, y: p.y, z: p.z, s: p.s0 } : null, cam: c.pos, q: c.q, fov: c.fov };
    });
    console.log('effect', e);
    break;
  }
}
await browser.close();
