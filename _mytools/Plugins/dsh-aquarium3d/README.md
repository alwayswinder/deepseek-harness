# `dsh-aquarium3d` — DSH 3D 玻璃鱼缸插件

桌宠右键菜单的 **小游戏 ▸ 玻璃鱼缸** 打开一整屏 WebGL 玻璃鱼缸：真的玻璃折射、水面倒影、水底焦散。
本插件自己不画任何常驻入口，浮层只在被调用时挂上来（见下面「从别处打开」）。
纯源码插件，无构建步骤（宿主半边是普通 ESM，浏览器半边是手写 CJS bundle + 同源 ES 模块）。

## 现在做到哪一步

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 0 | 插件骨架、宿主静态路由、overlay 壳、three.js 动态导入、截图闭环 | ✅ |
| 1 | 玻璃缸体（折射/菲涅尔/水线/边缘高光）、水面（四向波 + 倒影 + 折射 + 吸收）、平面倒影、屏幕空间折射两段管线、砂床（起伏 + 颗粒 + 焦散注入）、石头/沉木/水草 | ✅ |
| 2 | 涟漪场（波源写入的水面法线/高度/白花，水面与焦散同读）、水体着色盒、水下光柱、后处理（SSAO + 辉光 + 色散 + 胶片颗粒 + 抖动） | ✅ |
| 3 | 鱼群程序化建模与游动 AI（寻食/受惊/避让）、气泡与植物氧气、点水面投食、控制面板（9 个滑杆 + 画质档位 + 投喂） | ✅ |
| 4 | 画质档位（高/中/低：分辨率、后处理强度、鱼群数量）、帧率自适应降档、页面隐藏停渲染、关闭即释放 WebGL 上下文 | ✅ |

实测（本机 Intel UHD 集显，1580×900 无头窗口）：**≈68 fps**；四遍管线 + 后处理 + 14 条鱼 + 320 颗粒子。

## 目录

```
index.js            宿主半边：把插件目录挂成同源前缀路由 /api/aquarium3d
client.js           浏览器半边：shell.overlay 浮层（全屏 canvas + 控制面板）+ `aquarium3d` 服务
cordis.patch.yml    bundle patch：一行 insert 挂载插件包
src/main.js         舞台：四遍渲染管线、图层、轨道相机、设置项、投喂、帧率自适应、dispose
src/room.js         房间、吊灯、灯光装置（顶灯是唯一的阴影光源）
src/tank.js         缸体几何：玻璃面、底柜、砂床（terrainHeight）、石头、沉木、水草
src/water.js        水面材质（波/涟漪/倒影/折射/吸收/高光/白花/水线）
src/glass.js        玻璃材质（折射采样 + 反射 + 水线 + 边缘）
src/body.js         水体着色盒（水体吸收与光柱）
src/ripples.js      涟漪场：波源环形缓冲 + 一张 384² 的法线/高度/白花贴图
src/particles.js    气泡、植物氧气、水花（同一套加法混合点云）
src/fish.js         鱼群：程序化几何 + 顶点行波 + 游动/寻食/受惊/避让
src/food.js         鱼食：投下、下沉、被吃掉
src/post.js         后处理：SSAO + 辉光 + 色散 + 胶片颗粒 + 抖动
src/fx.js           水下光影：共享 uniform、波/涟漪 GLSL、焦散与水体染色注入标准材质
vendor/             three.js r169（MIT，见 LICENSE-three.txt）
tools/shoot.mjs     开发用无头截图工具（见下）
```

## 鱼缸里的东西怎么动

- **水面**：四个方向的解析长波 + 涟漪场的局部扰动。两者合成同一个高度场，
  `aqSurface()` 是唯一来源——水面用它算法线，焦散用它算折射，所以「鱼食落水」这一件事
  会同时出现在水面波纹和缸底光网上。
- **涟漪场**：`RippleField` 是一个 12 槽的环形缓冲，每个槽是一次扰动（位置、出生时间、振幅）
  加一组参数（波数、寿命、波前速度、白花量）。片元着色器把活着的扰动叠成一张贴图，
  跑完就丢，所以开销与「发生过多少事」无关。
- **焦散**：不是贴图，是按灯→水面→片元的光路折射后求面积雅可比（有限差分），
  压缩就变亮、摊开就变暗，再注入到缸内所有标准材质上（`applyWaterFX`）。
- **鱼**：几何是程序化扫掠体 + 三片鳍 + 眼睛，游动是顶点着色器里的行波（`aBody` 决定
  尾巴摆多少，没有骨骼）；AI 只做三件事——巡自己的椭圆、追最近的鱼食、躲开最近的落水点。
- **后处理**：半浮点目标带深度贴图，一遍合成做 SSAO、四分之一分辨率辉光、镜头色散、
  胶片颗粒与抖动；面板上的「画质增强」就是把它们一起关掉。

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
- `window.__AQUARIUM__`：当前舞台（`orbit` / `camera` / `targets` / `water` / `glass` / `tank` / `room` /
  `school` / `food` / `particles` / `ripples` / `settings`）。
- `stage.setSetting(key, value)`：面板走的就是这一个入口（`hood` / `waterLevel` / `wind` / `caustics` /
  `reflection` / `refraction` / `glassThickness` / `bubbles` / `post` / `quality` / `fishCount`）。
- `stage.feedAt(clientX, clientY)`：在屏幕坐标处投食，点在缸外返回 `false`。
- `stage.addRipple(x, z, amplitude, kind)`：`kind` 取 `drop` / `splash` / `fish` / `paw`。
- `stage.debugShow('refr' | 'glass' | 'refl' | null)`：把某个渲染目标直接铺到屏幕上（带色彩空间转换），用来判断某一遍到底画出了什么。
- `stage.probeTarget(name, u, v)`：读回某个目标单个像素的线性 RGB，用来定位「采样到的是不是我以为的东西」。
- 水面/玻璃材质的 `uDebug`：`1` 显示折射 UV，`2` 显示原始折射采样（`glass` 材质）。

## 已知限制

- 水下视角（相机沉到水面以下）没有专门处理：光柱和水体的常数是按「相机在水面上方」调的，
  进缸内巡游会显得偏亮，还没有做缸内机位。
- 鱼只有四条程序化鱼种，没有生长/繁殖/死亡，也没有「离屏后台推算」；关掉浮层就是完全停止。
- 帧率自适应只降不升：机器变快了不会自动升档，要手动在面板里选。
- 水面还是单层高度场，没有做水下全反射（TIR）与泡沫破碎后的消散尾迹。
- 移植的三方素材为零：几何全部程序化生成，贴图（砂粒、水草明暗、气泡）用顶点色/程序图形，
  `vendor/` 只有 MIT 的 three.js。
