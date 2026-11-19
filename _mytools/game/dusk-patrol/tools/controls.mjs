import { launch, gameUrl, shotPath } from './harness.mjs';

const browser = await launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(gameUrl('?fixed=1'));
await page.waitForFunction(() => window.__dusk && window.__dusk.Game.state === 'title', null, { timeout: 60000 });
console.log('sound default', await page.evaluate(() => ({ enabled: __dusk.Sound.enabled, btn: document.getElementById('soundbtn').textContent })));
await page.evaluate(() => __dusk.startGame());
await page.waitForTimeout(500);
console.log('sound on', await page.evaluate(() => {
  const on = __dusk.toggleSound();
  return { on, enabled: __dusk.Sound.enabled, ctx: __dusk.Sound.ctx && __dusk.Sound.ctx.state, btn: document.getElementById('soundbtn').textContent, gain: __dusk.Sound.master && __dusk.Sound.master.gain.value };
}));
await page.waitForTimeout(700);
await page.screenshot({ path: shotPath('sound-on.png') });
console.log('sound off', await page.evaluate(() => {
  const on = __dusk.toggleSound();
  return { on, enabled: __dusk.Sound.enabled, btn: document.getElementById('soundbtn').textContent };
}));

const touch = await page.evaluate(() => ({
  touchClass: document.body.classList.contains('touch'),
  stick: !!document.querySelector('.stick'),
  display: getComputedStyle(document.querySelector('.touch')).display,
}));
console.log('touch', touch);

const adaptive = await page.evaluate(() => {
  const before = { scale: __dusk.Game.renderScale, w: document.getElementById('gl').width, base: __dusk.GL.baseW };
  __dusk.Game.renderScale = 0.58;
  __dusk.resize();
  return before;
});
console.log('adaptive before', adaptive, 'after', await page.evaluate(() => ({ scale: __dusk.Game.renderScale, w: document.getElementById('gl').width })));
await page.evaluate(() => { __dusk.Game.renderScale = 1; __dusk.resize(); });
console.log('errors', errors);
await browser.close();
