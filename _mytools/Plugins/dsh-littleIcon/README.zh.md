# dsh-little-icon

[English](README.md)

这是 DSH（DeepSeek Harness）Web 界面内的鲸鱼娘桌宠。它默认停靠在右侧边缘，悬停时淡入，并可拖到 DSH 窗口内的任意可见位置。

## 行为

- DSH 会话运行时显示提供的 `干活中.png` 精灵动画。
- 工作结束后短暂显示 `开心.png`；普通待机使用 `待机.png`，随后显示 `无聊.png` 和 `偷窥.png`，一分钟无操作后显示 `打盹.png`。
- 单击桌宠可与她打招呼。按住主指针按钮并拖动可移动位置；浏览器会用 `localStorage` 保存该位置。
- 宿主只通过同源 `/api/little-icon/` 路由提供随包的六张 3×2 PNG 精灵图，浏览器不会获取外部图片。

## 安装

`_mytools/start-dsh.bat` 会为 Web profile 注册此插件。也可以手动运行：

```sh
dsh plugin --profile web add file:<repo>/_mytools/Plugins/dsh-littleIcon
```

安装或修改源码后重启 DSH。

## 验证

```sh
cd <repo>/_mytools/Plugins/dsh-littleIcon
node --check client.js
node --check index.js
node tests/smoke.mjs
```

## 限制

这是公开的 DSH Web 客户端插件。外部插件没有 Electron 原生窗口控制权限，因此不能创建独立置顶窗口、最小化或还原 DSH 窗口，也不能添加原生托盘菜单。

## 模型体验

插件不添加工具、提示词或会话事件。位置和动画状态仅保存在浏览器本地。
