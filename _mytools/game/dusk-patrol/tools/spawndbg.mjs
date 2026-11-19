import { launch, gameUrl } from './harness.mjs';
const b = await launch({ headless: true, args: ["--use-angle=swiftshader","--enable-unsafe-swiftshader","--disable-gpu-sandbox"] });
for (let k=0;k<3;k++){ const p = await b.newPage({viewport:{width:1280,height:720}}); await p.goto(gameUrl('?fixed=1')); await p.waitForFunction(()=>window.__dusk&&__dusk.Game.state==="title",null,{timeout:60000}); console.log(k, await p.evaluate(()=>__dusk.World.spawn)); await p.close(); }
await b.close();
