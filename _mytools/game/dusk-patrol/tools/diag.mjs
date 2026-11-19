import { launch, gameUrl } from './harness.mjs';
const browser = await launch({ headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport:{width:1280,height:720} });
await page.goto(gameUrl('?fixed=1'));
await page.waitForFunction(() => window.__dusk && __dusk.Game.state === 'title', null, {timeout:60000});
console.log(await page.evaluate(() => {
  const W=__dusk.World, s=W.spawn;
  const at=(x,z)=>W.heights? (function(){const N=W.N,T=W.TILE;const u=x/T*N,v=z/T*N;const i=Math.floor(u),j=Math.floor(v);return W.heights[((j%N+N)%N)*N+((i%N+N)%N)];})() : null;
  const hs=[];
  for(let dz=-60;dz<=60;dz+=20) for(let dx=-60;dx<=60;dx+=20) hs.push(Math.round(at(s.x+dx,s.z+dz)));
  let water=0,total=0; for(let j=0;j<W.N;j+=64) for(let i=0;i<W.N;i+=64){ if(W.heights[j*W.N+i]<=0) water++; total++; }
  return {spawn:s, waterFrac:water/total, hs, heightAtSpawn: __dusk.World.heights? (window.heightAt? null:null):null, gl:__dusk.Game.state};
}));
await browser.close();
