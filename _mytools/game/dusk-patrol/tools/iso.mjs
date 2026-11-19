import { launch, gameUrl, shotPath } from './harness.mjs';
import { writeFileSync } from 'node:fs';

const browser = await launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const base = gameUrl('?fixed=1&autostart=1');
const tests = [
  ['&orbit=150&noshadow=1&notrail=1&noflames=1&nomissiles=1&noeffects=1', 'iso-air'],
  ['&orbit=150&noshadow=1&notrail=1&noflames=1&nomissiles=1&noeffects=1&noair=1', 'iso-none'],
  ['&orbit=150&noshadow=1&notrail=1&nomissiles=1&noeffects=1', 'iso-airflame'],
];
for (const [q, n] of tests) {
  await page.goto(base + q);
  await page.waitForFunction(() => window.__dusk && window.__dusk.Game.state === 'title', null, { timeout: 60000 });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__dusk.startGame());
  await page.waitForTimeout(500);
  writeFileSync(shotPath(`${n}.png`), await page.screenshot());
  console.log(n);
}
await browser.close();
