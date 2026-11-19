import { launch, gameUrl, shotPath } from './harness.mjs';
import { writeFileSync } from 'node:fs';

const browser = await launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(gameUrl('?fixed=1'));
const t0 = Date.now();
try {
  await page.waitForFunction(() => window.__dusk && window.__dusk.Game.state === 'title', null, { timeout: 60000 });
  console.log('world ready in', ((Date.now() - t0) / 1000).toFixed(1), 's');
} catch (e) {
  console.log('did not become ready:', e.message);
  console.log(await page.evaluate(() => ({
    state: window.__dusk && window.__dusk.Game.state,
    load: document.getElementById('loadstage')?.textContent,
    pct: document.getElementById('loadpct')?.textContent,
    fatal: document.getElementById('fatal')?.className,
    fatalmsg: document.getElementById('fatalmsg')?.textContent,
  })));
}
await page.waitForTimeout(1500);
writeFileSync(shotPath('01-title.png'), await page.screenshot());
console.log(await page.evaluate(() => ({
  state: window.__dusk.Game.state,
  gl: window.__dusk.Game.started,
  view: window.__dusk.Cam.view,
  player: window.__dusk.Player.pos,
  spawn: window.__dusk.World.spawn,
  size: [window.__dusk.HUD.W, window.__dusk.HUD.H],
  fps: window.__dusk.Game.fps,
})));
await browser.close();
