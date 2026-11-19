import { launch, gameUrl } from './harness.mjs';
const browser = await launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(gameUrl('?fixed=1'));
await page.waitForFunction(() => window.__dusk && window.__dusk.Game.state === 'title', null, { timeout: 60000 });
await page.touchscreen.tap(422, 160);
await page.waitForTimeout(400);
console.log('started', await page.evaluate(() => ({
  started: __dusk.Game.started,
  touchClass: document.body.classList.contains('touch'),
  touchDisplay: getComputedStyle(document.getElementById('touch')).display,
  canvas: [__dusk.GL.canvas.width, __dusk.GL.canvas.height],
})));
const box = async (sel) => page.locator(sel).boundingBox();
let b = await box('[data-act="view"]');
await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
await page.waitForTimeout(250);
console.log('view after tap', await page.evaluate(() => __dusk.Cam.view));
b = await box('[data-act="roll"]');
await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
await page.waitForTimeout(120);
console.log('barrel', await page.evaluate(() => ({ barrel: __dusk.Player.barrel, roll: __dusk.Player.roll })));
b = await box('[data-act="missile"]');
await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
await page.waitForTimeout(150);
console.log('ammo', await page.evaluate(() => __dusk.MissileSys.ammo));
b = await box('[data-act="ab"]');
await page.locator('[data-act="ab"]').dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: true });
await page.waitForTimeout(500);
console.log('ab', await page.evaluate(() => __dusk.Player.ab));
await page.locator('[data-act="ab"]').dispatchEvent('pointerup', { pointerId: 9, pointerType: 'touch', isPrimary: true });
const sb = await box('#stick');
await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
await page.mouse.down();
await page.mouse.move(sb.x + sb.width * 0.85, sb.y + sb.height * 0.3, { steps: 4 });
await page.waitForTimeout(200);
console.log('stick', await page.evaluate(() => ({ nx: +__dusk.Input.nx.toFixed(2), ny: +__dusk.Input.ny.toFixed(2), roll: +__dusk.Player.roll.toFixed(2) })));
await page.mouse.up();
await page.waitForTimeout(400);
console.log('errors', errors);
await browser.close();
