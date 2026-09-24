# dsh-little-icon

[中文](README.zh.md)

A whale-girl companion inside the DeepSeek Harness (DSH) web interface. It stays near the right edge by default, fades in on hover, and can be dragged to any visible position in the DSH window.

## Behavior

- A running DSH Session shows the supplied `干活中.png` sprite animation.
- Stopping work shows `开心.png` briefly; normal inactivity uses `待机.png`, then `无聊.png` and `偷窥.png`, and after one minute `打盹.png`.
- Click the companion to greet it. Drag with the primary pointer button to move it; the browser keeps that position in `localStorage`.
- The host serves only the six packaged 3×2 PNG sprite sheets from same-origin `/api/little-icon/` routes. The browser does not fetch external images.

## Install

`_mytools/start-dsh.bat` registers this plugin with the Web profile. To install it manually, run:

```sh
dsh plugin --profile web add file:<repo>/_mytools/Plugins/dsh-littleIcon
```

Restart DSH after installation or a source edit.

## Verify

```sh
cd <repo>/_mytools/Plugins/dsh-littleIcon
node --check client.js
node --check index.js
node tests/smoke.mjs
```

## Limitation

This is a public DSH Web client plugin. It cannot create a separate always-on-top Electron window, minimize or restore the DSH window, or add a native tray menu because those operations are not exposed to external plugins.

## Model Experience

The plugin adds no tools, prompts, or Session events. Its position and animation state remain browser-local.
