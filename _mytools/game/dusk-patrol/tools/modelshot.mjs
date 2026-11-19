import { launch, gameUrl, shotPath } from './harness.mjs';
import { writeFileSync } from "node:fs";
const browser = await launch({ headless: true, args: ["--use-angle=swiftshader","--enable-unsafe-swiftshader","--disable-gpu-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", e => console.log("[pageerror]", e.message));
await page.goto(gameUrl('?fixed=1&noshadow=1&notrail=1&noeffects=1'));
await page.waitForFunction(() => window.__dusk && window.__dusk.Game.state === "title", null, { timeout: 60000 });
await page.evaluate(() => { window.__dusk.startGame(); document.getElementById("loading").style.display="none"; document.getElementById("title").style.display="none"; document.getElementById("hud").style.display="none"; });
await page.waitForTimeout(700);
async function shot(name, pos, yaw, pitch, fov) {
  await page.evaluate(({pos,yaw,pitch,fov}) => { const p=__dusk.Player.pos; window.__dusk.camOverride={pos:{x:p.x+pos[0],y:p.y+pos[1],z:p.z+pos[2]},q:__dusk.headingQuat(yaw,pitch,0),fov}; __dusk.snapCamera(); __dusk.Game.started=false; }, {pos,yaw,pitch,fov});
  await page.waitForTimeout(900);
  writeFileSync(shotPath(`${name}.png`), await page.screenshot());
  await page.evaluate(()=>{ __dusk.Game.started=true; });
}
await shot("model-top", [0, 38, 4], 0, -1.47, 0.8);
await shot("model-side", [30, 2, 0], Math.PI/2, -0.02, 0.8);
await shot("model-rear", [0, 3, 24], 0, 0.07, 0.8);
await browser.close();
