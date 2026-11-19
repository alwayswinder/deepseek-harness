import { launch, gameUrl } from './harness.mjs';
const b = await launch({ headless:true, args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const p = await b.newPage({ viewport:{width:1280,height:720} });
p.on('pageerror', e=>console.log('ERR', e.message));
await p.goto(gameUrl('?fixed=1'));
await p.waitForFunction(()=>window.__dusk && __dusk.Game.state==='title', null, {timeout:60000});
await p.waitForTimeout(2200);
console.log('pre', await p.evaluate(()=>({state:__dusk.Game.state, started:__dusk.Game.started, t:__dusk.Game.time, pos:__dusk.Player.pos})));
console.log('start', await p.evaluate(()=>{ __dusk.startGame(); return {state:__dusk.Game.state, started:__dusk.Game.started}; }));
for (let i=0;i<5;i++){ await p.waitForTimeout(200); console.log(i, await p.evaluate(()=>({t:+__dusk.Game.time.toFixed(2), mt:+__dusk.Player.missionTime.toFixed(2), pos:__dusk.Player.pos, speed:+__dusk.Player.speed.toFixed(1)}))); }
await b.close();
