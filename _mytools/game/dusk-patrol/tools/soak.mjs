import { launch, gameUrl } from './harness.mjs';

const browser = await launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(gameUrl('?fixed=1'));
await page.waitForFunction(() => window.__dusk && window.__dusk.Game.state === 'title', null, { timeout: 60000 });
await page.waitForTimeout(1200);
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
console.log('started', await page.evaluate(() => __dusk.Game.started));

const t0 = Date.now();
let n = 0;
let lastLog = 0;
const buttons = ['left', 'right'];
while (Date.now() - t0 < 110000) {
  const r = Math.random();
  const x = 100 + Math.random() * 1080;
  const y = 80 + Math.random() * 560;
  if (r < 0.42) {
    await page.mouse.move(x, y, { steps: 2 });
  } else if (r < 0.56) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(80 + Math.random() * 500);
    await page.mouse.up();
  } else if (r < 0.66) {
    await page.mouse.click(x, y, { button: 'right' });
  } else if (r < 0.74) {
    await page.keyboard.press('f');
  } else if (r < 0.82) {
    await page.keyboard.press(' ');
  } else if (r < 0.88) {
    await page.keyboard.press('m');
  } else if (r < 0.94) {
    await page.mouse.click(x, y);
  } else {
    await page.keyboard.press('Enter');
  }
  n++;
  const elapsed = Date.now() - t0;
  if (elapsed - lastLog > 15000) {
    lastLog = elapsed;
    console.log('t+' + (elapsed / 1000).toFixed(0) + 's', await page.evaluate(() => ({
      game: +__dusk.Game.time.toFixed(1),
      view: __dusk.Cam.view,
      pos: [Math.round(__dusk.Player.pos.x), Math.round(__dusk.Player.pos.y), Math.round(__dusk.Player.pos.z)],
      speed: Math.round(__dusk.Player.speed),
      ab: +__dusk.Player.ab.toFixed(2),
      ammo: __dusk.MissileSys.ammo,
      fx: __dusk.FX.parts.length,
      fps: Math.round(__dusk.Game.fps),
      scale: __dusk.Game.renderScale,
    })));
  }
  await page.waitForTimeout(60 + Math.random() * 120);
}
const final = await page.evaluate(() => ({
  time: __dusk.Game.time,
  pos: __dusk.Player.pos,
  quat: __dusk.Player.quat,
  speed: __dusk.Player.speed,
  view: __dusk.Cam.view,
  ammo: __dusk.MissileSys.ammo,
  parts: __dusk.FX.parts.length,
  decals: __dusk.FX.decals.length,
  fps: __dusk.Game.fps,
  scale: __dusk.Game.renderScale,
}));
console.log('actions', n);
console.log('final', final);
console.log('errors', errors);
await browser.close();
