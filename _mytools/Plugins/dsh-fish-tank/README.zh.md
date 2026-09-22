# dsh-fish-tank

[English](README.md) | 中文

DSH（[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)）Web 界面的像素风养鱼插件。屏幕右缘有一个像素小鱼悬浮按钮，点击进入全屏海底世界：鱼群按小 AI 自由游动、水草摆动、珊瑚呼吸、气泡上浮、光柱从水面洒下。可以投喂、吹泡泡，或点水面吓跑附近的鱼；按 `Esc` 随时回到工作界面。

实现了本目录 PRD（`PRD.md`）的第 1–3 阶段；第 4 阶段（精绘素材、音效、像素字体）留待后续，见[已知限制与后续工作](#已知限制与后续工作)。

## 工作方式

- **入口与退出** — 右屏缘固定的像素鱼按钮。点击全屏进入；再次点击同一按钮（此时停靠在右上角）、按 `Esc`，或点击右上角按钮离开。对应 PRD 的三种退出方式。
- **渲染** — 单个 HTML5 Canvas、原生 2D 上下文、`requestAnimationFrame` 加钳制的 `deltaTime`，60 Hz 与 144 Hz 下速度一致。实体数量封顶（鱼 12、鱼食 50、气泡 130、粒子 240），帧预算平稳；背景照片每帧按 cover 适配并叠加压暗层，保证绘制元素可读。
- **鱼类** — 四种程序化绘制的像素鱼（小丑鱼、蓝吊、粉紫仙女、黄金吊），两个身体网格共用四套调色板；尾巴是独立的 sprite 绘制过程，上下偏移形成摆尾动画。每条鱼运行 游荡 → 追食 → 受惊 状态机，带转向平滑、边缘平滑掉头和进食判定。
- **互动** — 「投喂」在最近一次指针位置（未触碰水面时为画面中上方）撒下六粒下沉鱼食；感知范围内的鱼会中断游动前去抢食，吃到时产生碎屑粒子。「吹泡泡」生成一批波浪上升的气泡，到水面破裂成环。「点击水面」会惊吓范围内的鱼短促加速逃离。
- **持久化** — 鱼缸状态（鱼种、分数坐标、朝向、饱食度、累计吃掉）每 5 秒及退出时写入 `localStorage`（键 `dsh.fish-tank.v1`），下次进入恢复。分数坐标在换分辨率/换机器后仍然有效。
- **背景** — 宿主半边把随包概念图（`bg.jpg`，即 PRD 概念图；原文件扩展名 `.png` 有误，字节实为 JPEG，故改名）以 `/api/fish-tank/background` 路由伺服并缓存一小时。路由缺失时客户端绘制程序化渐变海底，插件不会因此失效。

## 安装

`start-dsh.bat` 每次启动都会把本插件注册进 web profile（见 `_mytools/start-dsh.bat`），`sync-plugins.bat` 会把 profile 内安装副本刷新为本目录的最新源码。改完插件需要重启 `dsh web` 才生效。

手动等价命令：

```sh
dsh plugin --profile web add file:E:/AI/DSH/_mytools/Plugins/dsh-fish-tank
```

## 验证

无需浏览器：

```sh
cd _mytools/Plugins/dsh-fish-tank
node --check client.js && node --check index.js
node tests/smoke.mjs
```

`tests/smoke.mjs` 通过桩模块加载器装入客户端 bundle，断言插件形状与 `shell.overlay` 注册，再以无头方式驱动引擎（假 canvas、手动步进 `requestAnimationFrame`、桩 `localStorage`）验证游动、觅食、气泡、受惊与持久化往返，最后对宿主半边的背景路由做假响应验证。

## Model Experience

无模型影响：插件不新增工具、提示词或会话事件，不触碰任何模型可见内容；全部状态都在浏览器本地（`localStorage`）。

## 已知限制与后续工作

- PRD 第 4 阶段未做：接入精绘 spritesheet（sprite 构建已集中在一处，随时可换）、可选音效、面板文案的像素字体（当前等宽字体）、像素鱼网指针皮肤（当前 `crosshair`）。
- 每条鱼的饱食度已跟踪并持久化，但尚未在 UI 展示。
- 概念图是改名为 `bg.jpg` 的 JPEG；将来换成真像素背景后可去掉压暗层。
