import { launch, gameUrl, shotPath } from './harness.mjs';
import { writeFileSync } from 'node:fs';

const browser = await launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
await page.goto(gameUrl('?fixed=1&autostart=1'));
await page.waitForFunction(() => window.__dusk && window.__dusk.Game.state === 'title', null, { timeout: 60000 });
await page.evaluate(() => { window.__dusk.startGame(); window.__dusk.setView(1); });
await page.waitForTimeout(900);
console.log('before', await page.evaluate(() => ({ ammo: __dusk.MissileSys.ammo, live: __dusk.MissileSys.live.length })));
await page.evaluate(() => { window.__dusk.fireMissile(); });
await page.waitForTimeout(500);
console.log('fired', await page.evaluate(() => ({ ammo: __dusk.MissileSys.ammo, live: __dusk.MissileSys.live.length, parts: __dusk.FX.parts.length })));
writeFileSync(shotPath('strike-launch.png'), await page.screenshot());
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(500);
  const s = await page.evaluate(() => ({
    live: __dusk.MissileSys.live.length,
    decals: __dusk.FX.decals.length,
    flash: __dusk.FX.flash,
    ammo: __dusk.MissileSys.ammo,
    parts: __dusk.FX.parts.length,
    t: __dusk.Game.time.toFixed(1),
  }));
  if (i % 4 === 0) console.log(i, s);
  if (s.decals > 0 || s.flash > 0) {
    console.log('IMPACT', s);
    await page.waitForTimeout(160);
    writeFileSync(shotPath('strike-impact.png'), await page.screenshot());
    await page.waitForTimeout(700);
    writeFileSync(shotPath('strike-after.png'), await page.screenshot());
    break;
  }
}
await browser.close();
