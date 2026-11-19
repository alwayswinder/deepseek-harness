import { launch, gameUrl, shotPath } from './harness.mjs';
import { writeFileSync } from 'node:fs';

const browser = await launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() !== 'log') console.log('[console]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(gameUrl('?fixed=1'));
await page.waitForFunction(() => window.__dusk && window.__dusk.Game.state === 'title', null, { timeout: 60000 });
await page.waitForTimeout(2200);
await page.evaluate(() => window.__dusk.startGame());
await page.waitForTimeout(800);
writeFileSync(shotPath('02-chase.png'), await page.screenshot());
console.log('chase', await page.evaluate(() => ({ view: __dusk.Cam.view, pos: __dusk.Player.pos, alt: __dusk.Player.radAlt, speed: __dusk.Player.speed, fps: __dusk.Game.fps })));
await page.evaluate(() => __dusk.setView(0));
await page.waitForTimeout(250);
await page.evaluate(() => __dusk.snapCamera());
await page.waitForTimeout(150);
writeFileSync(shotPath('03-top.png'), await page.screenshot());
await page.evaluate(() => __dusk.setView(2));
await page.waitForTimeout(250);
await page.evaluate(() => __dusk.snapCamera());
await page.waitForTimeout(150);
writeFileSync(shotPath('04-cockpit.png'), await page.screenshot());
console.log('cockpit', await page.evaluate(() => ({ view: __dusk.Cam.view, alt: __dusk.Player.radAlt, pitch: __dusk.Player.pitch, roll: __dusk.Player.roll })));
await browser.close();
