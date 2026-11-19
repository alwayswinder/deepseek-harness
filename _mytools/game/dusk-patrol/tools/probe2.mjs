import { launch, gameUrl } from './harness.mjs';
const browser = await launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.stack));
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
await page.goto(gameUrl('?fixed=1&autostart=1'));
await page.waitForFunction(() => window.__dusk && window.__dusk.Game.state === 'title', null, { timeout: 60000 });
console.log('boot', await page.evaluate(() => ({ t: __dusk.Game.time, pos: __dusk.Player.pos })));
await page.evaluate(() => window.__dusk.startGame());
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(400);
  console.log(i, await page.evaluate(() => ({
    gt: +__dusk.Game.time.toFixed(2),
    pos: { x: +__dusk.Player.pos.x.toFixed(1), y: +__dusk.Player.pos.y.toFixed(1), z: +__dusk.Player.pos.z.toFixed(1) },
    speed: +__dusk.Player.speed.toFixed(1),
    fps: __dusk.Game.fps,
    started: __dusk.Game.started,
    view: __dusk.Cam.view,
    quat: __dusk.Player.quat,
  })));
}
const n = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t = performance.now();
  function f() { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else res(n); }
  requestAnimationFrame(f);
}));
console.log('raf/s', n);
await browser.close();
