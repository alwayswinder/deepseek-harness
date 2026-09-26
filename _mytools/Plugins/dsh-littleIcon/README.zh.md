---
description: "DSH 桌宠：一个独立于 DSH 窗口的像素小挂件，悬浮置顶、可拖动、按 agent 状态换表情，点击收起/恢复 DSH 主窗口，并带托盘菜单。"
kind: "package-bundle"
---

# @local/dsh-little-icon

[English](README.md) | 中文

## Summary

桌宠是**独立于 DSH 窗口的进程**（PowerShell + WPF），不是画在窗口里的浮层：它有自己的无边框、透明、置顶小窗，所以 DSH 最小化或被收起后它依然留在桌面上。宿主半边（`index.js`）采样 agent 状态写进状态文件，桌宠读它切换表情动画；点击桌宠用 user32 的 `ShowWindow` 把 DSH 主窗口收起或恢复，托盘图标提供同样的动作、归位与退出。插件不改变对话、模型请求或会话日志。

## Table of Contents

- [使用本包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

**桌面端安装。** Desktop 拥有自己的配置（`$DSH_HOME/profiles/desktop`），并且拒绝 `dsh plugin --profile desktop`；在应用的**插件 → 添加插件**对话框里填本目录的绝对路径即可，每台机器装一次。装好后必须重启 Desktop：宿主半边（`index.js`）不参与客户端热更新，只有重启才会加载它。

**网页版安装**（可选；此时桌宠只悬浮，不控制任何窗口）。`start-dsh.bat` 的 `DSH_LOCAL_PLUGINS` 里已经列了本插件，每次启动会幂等地把本目录以 `file:` 装进 web profile，`sync-plugins.bat` 随之刷新 `index.js`、`pet/` 与 `assets/`。要手动装：

```text
dsh plugin --profile web add file:<repo>/_mytools/Plugins/dsh-littleIcon
```

**调节大小与虚化。** 打开**插件**页，点标题为**桌宠**的卡片：设置卡片画在这张卡片的详情页上（在描述与「包含的组件」之间），不用再点进 `little-icon` 那一行。顶部是常用项：

- **大小**：96–320 像素的滑块，改完桌宠当帧就变；
- **闲置时虚化**：开关，关掉就是始终不透明；
- **虚化程度**：开启虚化时可用，15%–100%；
- 另外还有启用开关、始终置顶、点击行为、表情节奏，以及折叠在**更多**里的空闲节奏、开心/惊讶时长和状态采样间隔。

控件即时写回 profile 配置（`$DSH_HOME/profiles/<profile>/cordis.patch.yml` 里那一行 `little-icon`），不需要重启：宿主半改配置会重新发布状态文件，桌宠一秒内套用。把**启用桌宠**关掉再打开也能立刻结束/重新拉起桌宠进程。这张卡片由插件的浏览器半边（`client.js`）提供，所以重启后不会再出现第二份自动生成的表单。

**交互。** 桌宠默认贴在主屏右下角，闲置时按上面的设置半透明，鼠标移上去变清晰。按住左键拖动会移动位置（松开即记住，下次启动还原，并夹在当前虚拟屏幕内）。**单击**（没有拖动的那一次按下）执行配置里的 `clickAction`：`toggle`（默认）在 DSH 显示时把它收起、再点恢复并置顶；`minimize` 只最小化；`none` 什么也不做。托盘图标右键提供「收起/显示 DSH」「回到右下角」「退出桌宠」，双击托盘图标等同单击桌宠。

**配置字段。** 插件页的控件写的都是这些字段，全部即时生效（宿主改配置会重发状态文件并重排定时器，桌宠读状态文件，都不需要重启）：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 关掉会结束桌宠进程；再打开会重新拉起 |
| `size` | `160` | 窗口边长（像素），素材按 256 像素生成，缩小显示 |
| `translucent` | `true` | 指针不在桌宠上时是否虚化 |
| `idleOpacity` | `0.45` | 虚化到什么程度；悬停恒为 1。`translucent` 关掉时它被忽略 |
| `frameMs` | `600` | 每帧停留毫秒数 |
| `pollMs` | `800` | 宿主采样间隔；改小更跟手，改大更省 |
| `alertMs` | `1500` | 任务开始时先「惊讶」多久，然后进入干活中 |
| `happyMs` | `3000` | 一轮活干完后「开心」保持多久，然后回到待机 |
| `boredEverySeconds` | `60` | 没有任务在跑时，每隔这么久插一次「无聊」 |
| `boredMs` | `5000` | 每次「无聊」持续多久 |
| `sleepAfterSeconds` | `600` | DSH 显示着时，无操作多久「打盹」 |
| `sleepWhenHiddenSeconds` | `20` | 收起 DSH 后，多久「打盹」（此时只有拖动桌宠算操作） |
| `topmost` | `true` | 是否始终置顶 |
| `clickAction` | `toggle` | `toggle` / `minimize` / `none` |

**表情与状态的对应。** 一轮任务读起来是：任务开始 `alert`（惊讶）→ 运行期间 `working`（干活中）→ 结束 `happy`（开心）→ `idle`（待机）。

- **无聊**跟着「有没有任务在跑」走，不看鼠标：没有任务时每隔 `boredEverySeconds` 插一段 `boredMs` 的「无聊」，所以读长回复时也会偶尔看到；一旦有操作，当前这段无聊立刻结束。
- **打盹**跟着「有没有操作」走，而且分两种计时：DSH 显示着时用 `sleepAfterSeconds`，操作包括鼠标、滚轮、键盘在 DSH 页面上的动作、拖动桌宠、单击桌宠；**收起 DSH 之后**改用 `sleepWhenHiddenSeconds`（默认 20 秒），此时唯一可能的操作就是拖动桌宠，或者点桌宠 / 用托盘把 DSH 放回来。两种情况下一有操作都立刻醒来回到待机。

桌宠把「DSH 现在在不在屏幕上」写进 `window.json`，宿主据此选用哪个计时器；显示/收起这个动作本身也算一次操作。

每套表情都是四帧循环。

本机数据写在 `$DSH_HOME/little-icon/`：`state.json`（宿主写、桌宠读）、`position.json`（桌宠写的位置）与 `window.json`（桌宠写的「DSH 在不在屏幕上」）。它们按机器独立，不随仓库同步，删掉即回到默认位置与默认状态。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现细节——点击展开</summary>

**浏览器半边。** `client.js` 做两件事。一是把手写设置卡片注册进 `plugins.bundle.config`（插件页给「某个 bundle 自己的配置」留的位置），键是包名 `@local/dsh-little-icon`——卡片就画在插件列表里那张卡片的详情页上，比藏在 `little-icon` 行页面里少一次点击。卡片不直接读配置：`ctx.configForms.get('little-icon')` 拿到该行的表单，订阅它、把接受的 section 折进一个快照 store，再经注册的 `inject` 面（`hooks.petSettings` 钩子 + `write` 回调）交给组件；值的唯一拥有者仍是宿主 schema。滑块拖动时先本地回显、停手 250 毫秒合并成一次写入，开关与下拉立即写。宿主侧因此调用 `settings.configure({ auto: false })`，避免同一批字段出现第二份自动生成的英文表单。二是上面那条活动上报。文案都走 `ctx.locale` 字典（中英各一份）；`tests/smoke.mjs` 会断言两边键一致、页面用到的键都存在，驱动一次开关写入与一次拖动合并，并断言活动上报确实注册了那四个监听器且被节流。

**为什么必须是独立进程。** 桌面壳没有向插件开放任何窗口能力：`apps/desktop` 里没有 `Tray`，主窗口的 `BrowserWindow` 也没有 `transparent`/`alwaysOnTop`/`skipTaskbar`；`apps/desktop/src/ipc.ts` 的通道表里没有最小化/隐藏/恢复，`preload-app.ts` 只暴露 `dshDesktop`（浏览器视图与更新）、`dshPlatform`（仅用量/充值内嵌页）、目录选择、宿主路径与语言。渲染进程是 `sandbox: true` + `contextIsolation: true`，`window.open` 一律被拒。更关键的是插件的宿主代码跑在 `ELECTRON_RUN_AS_NODE=1` 的 Node 子进程里（`apps/desktop/src/host-process.ts` + `node-environment.ts`），那里 `require('electron')` 只能拿到二进制路径。窗口一旦隐藏，窗口内的 DOM 也不再绘制。所以「收起 DSH 后桌宠还在」只能靠插件自己起一个进程。

**宿主半边。** `index.js` 每 `pollMs` 采样一次：用 `ctx.get('agents')` 看是否有 agent `running` 或 inbox 里有下一轮/下一步，用 `ctx.get('jobs')` 看是否有 `running`/`stopping` 的 job（判据与 `apps/desktop-host/src/update-tasks.ts` 一致）。状态机是纯函数 `sampleState`，`tests/smoke.mjs` 直接压它；它接收「有没有活」「最近一次操作」「现在该用哪个打盹计时器」三个输入——计时器由桌宠报告的窗口可见性决定（收起后用短的那条）。采样结果写进 `$DSH_HOME/little-icon/state.json`：内容变化才写盘，另外每 4 秒补写一次心跳，桌宠据此判断宿主是否还活着。配置里的 `translucent` 与 `idleOpacity` 在这里合并成一个 `opacity` 字段，桌宠不需要知道这个开关。桌宠由 `child_process.spawn` 拉起（`powershell.exe -NoProfile -NonInteractive -STA -ExecutionPolicy Bypass -File pet/pet.ps1`），参数里带素材目录、状态与位置文件、以及要控制的窗口进程号；`ctx.effect` 的清理函数会结束它，DSH 不会留下孤儿窗口。桌面壳里宿主的父进程就是 Electron 主进程，所以这个进程号直接取自 `process.ppid`；网页版没有可控制的窗口，传 0。

**「操作」这个信号从哪来。** 宿主只看得到 agent 和 job，「没人动过」和「没有任务在跑」是两回事——没有输入信号的话，人一直在用 DSH，桌宠照样会睡。所以浏览器半边在 `pointerdown`/`pointermove`/`wheel`/`keydown` 上打点，节流到 15 秒一次，`POST /api/little-icon/activity`（同源路由，按仓库惯例先过 `connection.requestRejection`，非 POST 回 405）；宿主再和 `position.json` 的修改时间取最大值——拖动桌宠、托盘里「回到右下角」同样算操作。收起 DSH 之后页面收不到任何输入（这正是想要的），所以改由桌宠每秒把自己看到的窗口可见性写进 `window.json`，宿主在两种计时器之间切换，并且把「显示/收起」这个变化本身也算作一次操作。于是打盹只在真的一段时间没人碰过任何东西之后才出现，而任务开始本身也算操作。

**桌宠进程。** `pet/pet.ps1` 是 WPF 无边框透明置顶窗口（`WindowStyle=None` + `AllowsTransparency` + `Topmost` + `ShowActivated=false`，不抢焦点）。脚本开头先把进程声明为 DPI 感知（`SetProcessDpiAwarenessContext` 逐级回退）：PowerShell 没有 DPI 清单，非感知进程里的分层窗口会被系统按虚拟化尺寸渲染再拉伸，桌宠会画成 2×2 平铺且比设定尺寸大。随后用 `WindowInteropHelper.EnsureHandle()` 拿到句柄补上 `WS_EX_TOOLWINDOW`——WPF 的 `ShowInTaskbar=false` 并不会真的加上这个样式，否则任务栏和 Alt+Tab 里会多一项。定时器每 200 毫秒按状态文件的修改时间决定是否重读，套用表情、尺寸、不透明度、点击行为与置顶；帧动画按 `frameMs` 轮播，帧数由脚本自己数素材文件（多数表情 4 帧、`干活中` 6 帧）。拖动用 `DragMove()`。激活桌宠窗口的那次按下会被 WPF 报告两次（一次随激活、一次是普通鼠标消息），而前一次还起不了拖动，所以按下只做记录，松开时才判定是点击还是拖动：否则第一次点击会刚把 DSH 收起又立刻放回来，只想拖桌宠时也会把 DSH 收起。窗口位置存在 `position.json`，启动时读回并夹进屏幕范围。

**几何单位。** 位置与夹取一律用 WPF 自己的 `SystemParameters.WorkArea` / `VirtualScreen*`，它们和 `Window.Left/Top` 同为设备无关单位；WinForms 的 `Screen`/`SystemInformation` 给的是物理像素，在 150% 缩放之类的情况下混用会把桌宠推到屏幕外（右下角被乘 1.5 倍）。`tests/smoke.mjs --pet` 会用 DPI 感知的探针量出窗口矩形，断言它确实落在屏幕内。

**窗口控制。** 目标窗口先取 `Process.MainWindowHandle`（这正是主窗口，不会被无标题的辅助窗口误判，所以优先信它），拿不到时枚举该进程的顶层窗口并跳过 `IME`/`CandidateWindow`/`MSCTFIME UI` 一类输入法辅助窗口；句柄找到后缓存，因为 `SW_HIDE` 之后 `MainWindowHandle` 会变成 0。收起用 `SW_HIDE`（从屏幕和任务栏一起消失，桌宠与托盘是回来的入口），恢复用 `SW_RESTORE` + `SetForegroundWindow`。

**编码。** `pet.ps1` 保持纯 ASCII：Windows PowerShell 5.1 在没有 BOM 时按 ANSI 解码 `.ps1`，UTF-8 的中文会变乱码，甚至可能吞掉引号破坏语法。中文托盘文案放在 `pet/labels.json`，脚本按 UTF-8 读它；读不到就用英文兜底。`tests/smoke.mjs` 会断言脚本里没有非 ASCII 字符。

**素材。** `assets/<state>/1.png … N.png` 由 `tools/build-assets.py` 从 `IconImage/transparent/*.png` 生成。每张源图是若干角色排在一张 2048×2048 上的精灵表，但排版不统一：多数表情是 2×2 共 4 个，`干活中` 是 3 列 2 行共 6 个，`打盹` 两行之间只有 14 像素空隙。脚本因此不假设网格，而是按透明投影找角色：行投影里找空行分带（空行不足 8 像素不算分隔；过矮的段并入相邻角色，免得把 Zzz 气泡、齿轮当成角色），再在每条带内按列投影分人物段（列投影低于峰值 12% 算人物之间的浅谷），段内按实际不透明像素收紧包围盒。所有角色按自上而下、自左而右成帧，底部居中放进统一画布，并按所有表情里最大的角色算一个全局缩放，因此同一表情内不跳帧、表情之间角色大小一致。帧数由版面决定并写进 `assets/frames.json`，桌宠自己数文件而不是读固定值——换素材不必改代码。`assets/tray.ico` 是给托盘用的多尺寸图标。

</details>

-----

<a id="model-experience"></a>
## 模型体验

无。插件不增加模型可见输入、提示词、工具或会话事件，只读取 agent 与 job 的运行状态。

## <a id="known-limitations-and-deferred-work"></a>已知限制与延后工作

**出错没有单独的表情。** `agent/error` 还在事件表里，但按现在的规则 `alert` 只表示「任务刚开始」。要让报错也露个脸，可以在宿主半再监听它、给状态机加一个输入即可。同理「等待用户确认」（客户端有 `pendingInteraction`，宿主侧只有 waterfall 的 `approval/request`，没有只读查询）也还没接。

**「收起」不是真正的系统托盘。** 桌面壳没有 `Tray`，托盘图标是桌宠进程自己用 `NotifyIcon` 建的；收起动作是 `SW_HIDE`，DSH 窗口从屏幕和任务栏一起消失，但不会在托盘区留下 DSH 自己的图标。DSH 若被别的方式退出，桌宠最多 45 秒后（或发现宿主进程消失时）自行退出。

**活动只来自 DSH 页面和桌宠本身。** 上报来自 DSH 页面的输入事件，所以 DSH 被收起、最小化或被别的程序盖住时没有输入：收起状态按 `sleepWhenHiddenSeconds` 打盹（默认 20 秒，只有拖动桌宠能续命），这正是想要的；在别的程序里操作不会让它醒着，只有回到 DSH 打字点鼠标、拖动桌宠，或者把 DSH 放回来才会。

**桌宠被关掉后不会自动重启。** 从托盘退出后，改别的设置不会把它拉回来——只有把**启用桌宠**关掉再打开，或下次启动 DSH，才会重新出现。这样才不会撤销用户刚做的退出。

**位置只按虚拟屏幕夹取。** 换显示器布局后窗口会被拉回可见范围，但不按显示器记忆位置。

**动画只有四帧。** 素材决定了表情切换是 4 帧循环；更细的动作（敲键盘、Zzz 气泡）需要重做素材并放进对应的状态目录。

**网页版是二等公民。** 那里没有可控制的 DSH 窗口，所以托盘菜单只留「回到右下角」与「退出桌宠」，单击桌宠不做任何事；窗口、表情、拖动等行为与桌面端一致。

<a id="dev-note"></a>
### 开发备注

```text
python tools/build-assets.py          # 重新生成 assets/（用 DSH 自带 Python：Pillow + numpy）
node tests/smoke.mjs                  # 状态机、素材、pet.ps1 -SelfTest（不显示窗口）
node tests/smoke.mjs --pet            # 额外跑 apply() 生命周期：起桌宠、量窗口是否在屏幕内、切状态、清理
```

`--pet` 会在桌面上**真显示一只桌宠窗口**（左上角、约 25 秒，用的是自己的临时 `$DSH_HOME`，所以能和正在使用的那只并存），运行时也会打印一行说明。它故意放在左上角而不是默认的右下角：万一你看到一只陌生的桌宠，那就是这个测试的，而不是插件多起了一只。

改了 `index.js` 或 `package.json` 要重启 DSH 才生效（宿主半边不热更新）；改 `pet/pet.ps1`、`pet/labels.json` 或 `assets/` 只需重启桌宠进程（从托盘退出，或重启 DSH）。
