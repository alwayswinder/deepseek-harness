import { launch, shotPath } from './harness.mjs';
import { writeFileSync } from 'node:fs';

const browser = await launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.setContent(`<!doctype html><style>html,body{margin:0;height:100%;background:#000}canvas{width:100vw;height:100vh;image-rendering:pixelated}</style>
<canvas id=c></canvas><script>
const c=document.getElementById('c'); c.width=604; c.height=340;
const gl=c.getContext('webgl2',{antialias:false,alpha:false,depth:true});
window.info={ok:!!gl};
if(gl){
 const vs=gl.createShader(gl.VERTEX_SHADER);gl.shaderSource(vs,'#version 300 es\\nin vec2 p;void main(){gl_Position=vec4(p,0,1);}');gl.compileShader(vs);
 const fs=gl.createShader(gl.FRAGMENT_SHADER);gl.shaderSource(fs,'#version 300 es\\nprecision highp float;out vec4 o;void main(){o=vec4(0.55,0.3,0.1,1);}');gl.compileShader(fs);
 const pr=gl.createProgram();gl.attachShader(pr,vs);gl.attachShader(pr,fs);gl.linkProgram(pr);gl.useProgram(pr);
 const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
 const l=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,2,gl.FLOAT,false,0,0);
 gl.clearColor(0.02,0.02,0.04,1);gl.clear(gl.COLOR_BUFFER_BIT);
 gl.drawArrays(gl.TRIANGLES,0,3);
 window.info.version=gl.getParameter(gl.VERSION);
 window.info.renderer=gl.getParameter(gl.RENDERER);
 window.info.floatTex=!!gl.getExtension('EXT_color_buffer_float');
 window.info.par=gl.getParameter(gl.MAX_TEXTURE_SIZE);
}
</script>`);
await page.waitForTimeout(500);
console.log(await page.evaluate(() => window.info));
const buf = await page.screenshot();
writeFileSync(shotPath('probe.png'), buf);
await browser.close();
