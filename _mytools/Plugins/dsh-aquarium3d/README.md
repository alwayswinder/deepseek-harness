# `dsh-aquarium3d` — DSH 3D 玻璃鱼缸插件

桌宠右键菜单的 **小游戏 ▸ 玻璃鱼缸** 打开一整屏 WebGL 玻璃鱼缸：真的玻璃折射、水面倒影、水底焦散。
本插件自己不画任何常驻入口，浮层只在被调用时挂上来（见下面「从别处打开」）。
纯源码插件，无构建步骤（宿主半边是普通 ESM，浏览器半边是手写 CJS bundle + 同源 ES 模块）。

## 现在做到哪一步

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 0 | 插件骨架、宿主静态路由、overlay 壳、three.js 动态导入、截图闭环 | ✅ |
| 1 | 玻璃缸体（折射/菲涅尔/水线/边缘高光）、水面（四向波 + 倒影 + 折射 + 吸收）、平面倒影、屏幕空间折射两段管线、砂床（起伏 + 颗粒 + 焦散注入）、石头/沉木/水草 | ✅ |
| 2 | 涟漪场贴图、后处理（AO/辉光/色散/颗粒）、光柱 | ⏳ |
| 3 | 鱼群程序化建模与游动 AI、气泡、投食、控制面板 | ⏳ |
| 4 | 画质档位、帧率自适应、关闭时停渲染 | ⏳ |

实测（本机 Intel UHD 集显，1580×900 无头窗口）：**≈88 fps，72 次 draw call，1.9 万三角形**。

## 目录

```
index.js            宿主半边：把插件目录挂成同源前缀路由 /api/aquarium3d
client.js           浏览器半边：shell.overlay 浮层（全屏 canvas）+ `aquarium3d` 服务，动态 import 场景模块
cordis.patch.yml    bundle patch：一行 insert 挂载插件包
src/main.js         舞台与渲染管线（4 个 pass、图层、轨道相机、dispose）
src/room.js         房间、吊灯、灯光装置（顶灯是唯一的阴影光源）
src/tank.js         缸体几何：玻璃面、底柜、砂床（terrainHeight）、石头、沉木、水草
src/water.js        水面材质（波/倒影/折射/吸收/高光/水线）
src/glass.js        玻璃材质（折射采样 + 反射 + 水线 + 边缘）
src/fx.js           水下光影：共享 uniform、波形 GLSL、焦散与水体染色注入标准材质
vendor/             three.js r169（MIT，见 LICENSE-three.txt）
tools/shoot.mjs     开发用无头截图工具（见下）
```

## 从别处打开（桌宠的「小游戏」菜单）

浏览器半边把浮层的开关注册成客户端服务 **`aquarium3d`**：写侧是 `open()` / `close()` / `toggle()`，
读侧是 `isOpen()` 与 `subscribe(listener)`（组件本身也订的是它，所以浮层的开合只有一个所有者，
不随 `shell.overlay` 的重新渲染丢掉）。桌宠插件（`_mytools/Plugins/dsh-littleIcon`）右键菜单的
**小游戏 ▸ 玻璃鱼缸** 就走这条路：桌宠把 `aquarium` 命令交给页面，那边的 `client.js` 取
`ctx.get('aquarium3d')` 调 `open()`；没装本插件时它只记一条警告，不会开出一块空白。

这个服务是**唯一**的入口：本插件没有自己的按钮，所以没人调用它时，
页面上不出现任何属于鱼缸的东西；关掉浮层（右上角按钮或 Esc）只是卸载浮层，
服务和状态仍在，下一次调用同样能开。

## 渲染管线

一帧把世界画四次——玻璃鱼缸本来就是「隔着一层看另一层」：

1. **倒影** `refl`：相机沿水面镜像、裁剪面切掉水下部分，渲染到半分辨率目标；
2. **折射** `refr`：把水和玻璃藏起来渲染一遍，这是水面和玻璃要「看穿」的内容；
3. **玻璃目标** `glass`：把 `refr` 整屏拷进去，再把水面画在它上面，于是玻璃既看到缸内也看到水面；
4. **主画面**：全部可见，水面采样 `refr`，玻璃采样 `glass`。

用**图层**而不是 `visible` 开关来分流：层 0 = 世界，层 1 = 水面，层 2 = 玻璃。
`scene.background` 故意留空、清屏色设在 renderer 上——`Color` 背景会强制清屏，即使 `autoClear=false`，
那会把正在叠加水面的玻璃目标整张擦掉。

## 装到 profile

插件按 `link:` 装进 profile（源码改动立刻生效，不需要重新安装）：

```bat
:: 网页版（默认 profile: web）
node apps\cli\lib\bin.js plugin --profile web add link:<仓库>\_mytools\Plugins\dsh-aquarium3d

:: 桌面端（desktop profile 由 Electron 应用独占管理，用应用里的插件管理界面装，
:: 或手改 %DSH_HOME%\profiles\desktop\package.json 的依赖与 dsh.profile.bundles 后 pnpm install）
```

装完**必须重启 `dsh web` / 桌面端**：bundle 行是启动时读的，客户端 bundle 也是启动时扫的。

## 开发闭环

改 `src/*.js` 只是静态文件，**刷新页面即生效**（宿主路由带 `Cache-Control: no-store`）；
改 `client.js`、`index.js` 或 `package.json` 需要重启 DSH。

`tools/shoot.mjs` 自己拉一个无头 Chrome，打开指定 URL、按顺序执行页面里的步骤、截图并打印 console 错误：

```bat
node tools\shoot.mjs --url "http://127.0.0.1:3099/?token=<token>" --out shot.png --wait 9000 ^
  --step "window.__AQUARIUM_UI__.open()" ^
  --step "(() => { const s = window.__AQUARIUM__; s.orbit.phi = 1.34; s.applyOrbit(); return 'view' })()"
```

页面里可以直接用的调试钩子：

- `window.__AQUARIUM_UI__`：浮层的控制对象（`open` / `close` / `toggle` / `isOpen`），和桌宠菜单拿到的是同一个。
  插件销毁时会被删掉。
- `window.__AQUARIUM__`：当前舞台（`orbit` / `camera` / `targets` / `water` / `glass` / `tank` / `room`）。
- `stage.debugShow('refr' | 'glass' | 'refl' | null)`：把某个渲染目标直接铺到屏幕上（带色彩空间转换），用来判断某一遍到底画出了什么。
- `stage.probeTarget(name, u, v)`：读回某个目标单个像素的线性 RGB，用来定位「采样到的是不是我以为的东西」。
- 水面/玻璃材质的 `uDebug`：`1` 显示折射 UV，`2` 显示原始折射采样（`glass` 材质）。

## 已知限制

- 水下视角（相机沉到水面以下）没有专门处理，只有水面上方的机位是对的。
- 缸内没有鱼群/气泡/投食，也没有控制面板；这些是阶段 2–3。
- 水面只做解析波，没有涟漪场贴图，所以没有「猫爪拍水」「投食落水」那种局部扰动。
- 移植的三方素材为零：几何全部程序化生成，贴图（砂粒、水草明暗）用顶点色/程序噪声，`vendor/` 只有 MIT 的 three.js。
