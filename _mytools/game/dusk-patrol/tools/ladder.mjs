import { launch, gameUrl, shotPath } from './harness.mjs';
import { writeFileSync } from 'node:fs';

const browser = await launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const base = gameUrl('?fixed=1&autostart=1');
await page.goto(base + '&hudref=1');
await page.waitForFunction(() => window.__dusk && window.__dusk.Game.state === 'title', null, { timeout: 60000 });
await page.waitForTimeout(600);
await page.evaluate(() => { window.__dusk.startGame(); window.__dusk.setView(2); });
await page.waitForTimeout(1600);
const st = await page.evaluate(() => ({
  pitch: window.__dusk.Player.pitch,
  yaw: window.__dusk.Player.yaw,
  roll: window.__dusk.Player.roll,
  camPitch: Math.asin(window.__dusk.Cam.q && (1 - 2 * (window.__dusk.Cam.q.x * window.__dusk.Cam.q.x + window.__dusk.Cam.q.z * window.__dusk.Cam.q.z))),
  hud: { W: window.__dusk.HUD.W, H: window.__dusk.HUD.H, fov: window.__dusk.Cam.fov },
}));
console.log(st);
writeFileSync(shotPath('ladder.png'), await page.screenshot());
await browser.close();
