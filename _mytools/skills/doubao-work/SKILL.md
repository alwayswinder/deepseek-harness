---
name: doubao-work
description: 通过 Windows 的 CUA 通道驱动「豆包工作」桌面客户端（DoubaoWork.ChatApp）做一次对话——输入提示词、发送、等回复、截图确认，典型用途是让它生成图片或回答需要登录态的问题。用户说「用豆包生成一张图」「让豆包做…」「去豆包里问一下」时使用。
---

# 驱动豆包工作

豆包工作是 Electron 客户端，**它的 UIA 控件树是空的**（只返回三层空 Pane），所以不能按元素定位，只能靠窗口级键盘输入加截图判断。下面每一步都按这个前提写。

## 前置检查

1. `cua.getCapabilities()`：`platform` 应为 `windows`，`sessionLocked` 为 `false`。不满足就看文末的「故障」。
2. **防锁屏**：跑 `_mytools\build\keep-awake.ps1 -Action start`。本机 `InactivityTimeoutSecs=1200`，20 分钟没有真实键鼠输入就自动锁屏，锁屏后 CUA 的输入与截图全部失效。脚本每 25 秒发一次零位移鼠标事件重置空闲计时，任务做完跑 `-Action stop` 关掉。
3. `cua.getApp('DoubaoWork.ChatApp')` → `getWindows()`。有多个窗口时挑 `isOnScreen` 为 true 的那个。
4. **窗口尺寸每轮都可能不同，不要写死坐标。** 需要坐标时用当次 `getWindows()` 返回的 `bounds` 现算。

## 一次对话

1. `app.activate()`。失败（`FOREGROUND_DENIED`）再试一次；仍失败说明前台锁，请用户点一下豆包窗口再继续，不要反复重试。
2. `window.typeText(prompt)`。激活后输入框默认就有焦点，不需要先点击。
3. `window.pressKey('Return')` 发送。
4. 等结果：`getWindows()` 里的标题会从「豆包工作」变成对话主题（例如「柴犬宇航员月球遛弯插画 - 豆包工作」）。每 5 秒查一次，最多等 90 秒。
5. `window.getScreenshot()` 确认：回复正文里出现「图片已生成」或具体内容即成功。

## 回报

- 把截图里豆包的回复**转述出来**，不要只说「已发送」。
- 生图会扣点（每次约 2.5 点），回复里带「消耗 N 点」。用户没要求就别连发。
- 提示词会真的发出去并扣点，**发之前先说清楚要发什么**，尤其是带具体文案的。

## 拿原图

豆包没有下载入口：点缩略图不打开大图、悬停没有下载浮层、右键被页面禁用、下载目录里也不落文件。但渲染用的 PNG 会进 Chromium 缓存，而且缓存条目从文件偏移 0 起就是完整的 PNG：

```
%LOCALAPPDATA%\DoubaoWork\User Data\Default\Cache\Cache_Data\f_*
```

生图固定 1536x1536（提示词写 1024x1024 也一样），界面图标是 320x320 之流，按尺寸一筛就分开了。跑 `_mytools\build\grab-doubao-image.ps1 -Count 1 -OutDir <目录>` 捞最新一张，脚本只读缓存、不动缓存本身。缓存会被浏览器回收，要长期保存就尽早复制出来。

右下角的「豆包AI生成」角标烙在像素里，没有无水印版本可取。要去掉就跑 `_mytools\build\remove-doubao-watermark.ps1 -Path <图片或目录> -OutDir <目录>`：它按固定字形模板把字盖住，再用周围画面补回来。背景均匀（天空、地面、桌面）时基本无痕，压在人脸或密集细节上会糊一块。

## 已知限制

- `windowId` 与窗口尺寸都会变，**每轮重新取**，不要跨轮复用。
- 图片带「豆包AI生成」水印。

## 故障

| 报错 | 处理 |
| --- | --- |
| `NATIVE_CLEANUP: Windows pipe ended without native cleanup acknowledgement` | helper 刚重启或刚重编时的第一次调用会这样，**原样再调一次**即可 |
| `PERMISSION_DENIED`（截图） | helper 完整性低于目标窗口，被 UIPI 挡住。跑 `_mytools\build\fix-cua-integrity.ps1`，再 `Get-Process dsh-cua-windows \| Stop-Process -Force`，重试 |
| `WINDOW_CHANGED` | 窗口真的变了，重新 `getWindows()` 再截 |
| `FOREGROUND_REQUIRED` | 先 `activate()` 再输入 |
| `NATIVE_STARTUP` + `0x80070005` | helper 的 ShellBroker 补丁丢了（合并上游后可能），见 `_mytools\Plugins\dsh-littleIcon\UPSTREAM.md` 的「CUA helper 的两处 Windows 补丁」 |
| `SESSION_LOCKED` / `sessionLocked: true` | 已经锁屏：桌面切到 Winlogon 安全桌面，点击、键盘、截图都到不了用户会话，只能请用户解锁。想避免中途锁屏，任务前跑 `keep-awake.ps1 -Action start` |

## 边界

这是给「豆包工作」这一个应用的操作手册。通用的 CUA 用法（怎么用 `cua_run_code`、有哪些方法）在工具描述里，不在这里重复。
