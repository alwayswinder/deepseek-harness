---
description: "本地 DSH 外观组合包，用于选择护眼配色并配置网络地址或设备本地的背景图片。"
kind: "package-bundle"
---

# @local/dsh-appearance-plus

[English](README.md) | 中文

## Summary

该配置层在插件页增加五套颜色主题和背景图片编辑器。偏好保存在当前 DSH 设置文档中；选取的本地图片只保留在对应浏览器或 Desktop 配置中。组合包只改变显示效果，不改动对话或模型请求。

## Table of Contents

- [使用本包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

组合包启用后，打开**插件 → 外观增强**。可选择默认、护眼绿、暖纸、海蓝、柔紫或深夜。每项选择都会立即应用并自动保存。

可以粘贴 HTTP(S) 图片地址，也可以选择本地图片。页面会立即预览文件，把它转换为容量受限的 WebP 图片，并拒绝超过 20 MB 的本地输入。图片亮度、界面遮罩、模糊和铺放方式也会自动保存；滑块和图片地址使用短暂延迟，把连续修改合并后写入。

Web 端在终端安装：

```text
dsh plugin --profile web add file:<repo>/_mytools/Plugins/appearance-plus
```

Desktop 拥有自己的配置（`$DSH_HOME/profiles/desktop`），并拒绝 `dsh plugin --profile desktop`；因此要在应用的**插件 → 添加插件**对话框中填入本目录的绝对路径，每台机器安装一次。裸绝对路径和 `file:` 形式都可以：插件必须能从自身目录解析 `@deepseek-ai/schemastery`，而 `build.bat`、`build-desktop.bat`、`start-dsh.bat` 和 `start-desktop.bat` 都会在运行前把 `_mytools/Plugins/node_modules/@deepseek-ai/schemastery` 链接到 vendor 中的副本。缺少该链接时 Host 无法导入插件，会把组合包报告为启用失败。

首次安装后重启 Desktop 或重新加载 Web 应用，使浏览器包进入客户端图。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现细节——点击展开</summary>

[`index.js`](index.js) 注册 `appearance-plus` 设置命名空间。[`client.js`](client.js) 通过具名的 `ctx.theme` token 覆盖层应用配色，把已保存的背景设置投影到一份自有样式表，并通过 `plugins.item` 提供配置页。覆盖层以可持久保存的内置浅色或深色偏好为基础，因此设置同步不会替换已选配色。[`cordis.patch.yml`](cordis.patch.yml) 挂载 Host 行。

网络图片地址保存在 Host 设置文档中。选择的本地图片以压缩 Data URL 形式存储在当前浏览器配置的本地存储中，持久设置只携带一个标记，因此 `settings.yaml` 不包含图片字节。本地图片缺失时，插件会清除失效标记，而不是显示空背景。

</details>

-----

<a id="model-experience"></a>
## 模型体验

无。组合包只改变浏览器显示，不增加模型可见输入、提示词内容、工具或会话事件。

## 已知限制与延后工作

本地图片不会在 Desktop、Web 或其他浏览器配置之间同步；每个界面需要分别选择。背景透明度作用于使用主题 token 的界面，而嵌入式终端、文档预览和远程网页可以保留自己的不透明背景。

<a id="dev-note"></a>
### 开发备注

无。
