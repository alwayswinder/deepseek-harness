import { launch, gameUrl } from './harness.mjs';
const b = await launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(gameUrl('?fixed=1'));
await p.waitForFunction(() => window.__dusk && __dusk.Game.state === 'title', null, { timeout: 60000 });
await p.evaluate(() => { __dusk.startGame(); __dusk.setView(2); __dusk.snapCamera(); });
await p.waitForTimeout(500);
console.log(await p.evaluate(() => ({ radAlt: __dusk.Player.radAlt, low: __dusk.Player.lowAlt, pull: __dusk.Player.pullUp, ab: __dusk.Player.ab, ammo: __dusk.MissileSys.ammo, reload: __dusk.MissileSys.reload, stall: __dusk.Player.stall })));
await b.close();
