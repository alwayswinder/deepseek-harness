import { launch, gameUrl, shotPath } from './harness.mjs';
import { writeFileSync } from 'node:fs';
const browser = await launch({ headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport:{width:800,height:800} });
await page.goto(gameUrl('?fixed=1'));
await page.waitForFunction(() => window.__dusk && __dusk.Game.state === 'title', null, {timeout:60000});
const dataUrl = await page.evaluate(() => {
  const W = __dusk.World, N = W.N, hs = W.heights;
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const ctx = c.getContext('2d'); const img = ctx.createImageData(512,512);
  for (let y=0;y<512;y++) for (let x=0;x<512;x++) {
    const h = hs[(y*2)*N + x*2];
    let r,g,b;
    if (h <= 0) { const d=Math.min(1,-h/48); r=10; g=60+120*(1-d); b=120+100*(1-d); }
    else { const t=Math.min(1,h/800); r=60+195*t; g=100+80*t; b=60+120*t; }
    const i=(y*512+x)*4; img.data[i]=r; img.data[i+1]=g; img.data[i+2]=b; img.data[i+3]=255;
  }
  ctx.putImageData(img,0,0);
  return c.toDataURL();
});
writeFileSync(shotPath('heightmap.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
await browser.close();
