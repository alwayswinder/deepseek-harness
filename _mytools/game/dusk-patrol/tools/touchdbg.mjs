import { launch, gameUrl } from './harness.mjs';
const b = await launch({ headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, hasTouch: true });
await p.goto(gameUrl('?fixed=1'));
await p.waitForFunction(() => window.__dusk && __dusk.Game.state === 'title', null, { timeout: 60000 });
await p.evaluate(() => __dusk.startGame());
await p.waitForTimeout(300);
console.log(await p.evaluate(() => {
  const el = document.querySelector('.touch');
  return {
    count: document.querySelectorAll('.touch').length,
    bodyClass: document.body.className,
    matches: el.matches('body.touch .touch'),
    display: getComputedStyle(el).display,
    inline: el.getAttribute('style'),
    parent: el.parentElement && el.parentElement.id,
    rect: el.getBoundingClientRect(),
    rules: [...document.styleSheets].flatMap(s => { try { return [...s.cssRules].filter(r => r.selectorText && r.selectorText.includes('touch')).map(r => r.cssText); } catch { return []; } }),
  };
}));
await b.close();
