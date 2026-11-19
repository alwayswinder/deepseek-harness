import { launch, gameUrl, shotPath } from './harness.mjs';
import { writeFileSync } from 'node:fs';

const browser = await launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() !== 'log') console.log('[console]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

const base = gameUrl('?fixed=1&autostart=1');
async function run(query, name) {
  await page.goto(base + query);
  await page.waitForFunction(() => window.__dusk && window.__dusk.Game.state === 'title', null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__dusk.startGame());
  await page.waitForTimeout(700);
  writeFileSync(shotPath(`${name}.png`), await page.screenshot());
  console.log(name, await page.evaluate(() => ({ alt: __dusk.Player.radAlt, speed: __dusk.Player.speed, fps: __dusk.Game.fps })));
}
await run('&orbit=45', 'o-45');
await run('&orbit=150&noshadow=1&notrail=1', 'o-150-clean');
await run('&orbit=150', 'o-150');
await browser.close();
