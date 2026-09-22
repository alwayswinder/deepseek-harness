# dsh-fish-tank

English | [中文](README.zh.md)

A pixel-art aquarium overlay for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) web GUI. A floating pixel-fish button on the right edge opens a fullscreen underwater world: fish wander with a small AI, seaweed sways, corals breathe, bubbles rise, and light rays fall from the surface. Feed the fish, blow bubbles, or tap the water to startle them — then press `Esc` to get back to work.

Implements milestones 1–3 of the PRD in this directory (`PRD.md`); milestone 4 (hand-drawn spritesheets, sound, pixel font) is deferred — see [Known Limitations and Deferred Work](#known-limitations-and-deferred-work).

## How it works

- **Entry & exit** — a fixed pixel-fish button on the right screen edge. Click to open the aquarium fullscreen; click the same button again (it docks to the top-right corner), press `Esc`, or click anywhere on the canvas with the corner button to leave. The panel and keyboard routes are the PRD's three exits.
- **Rendering** — one HTML5 canvas, native 2D context, `requestAnimationFrame` with clamped `deltaTime`, so motion is identical at 60 Hz and 144 Hz. Entity caps (12 fish, 50 pellets, 130 bubbles, 240 particles) keep the frame budget flat; the background photo is cover-fitted once per frame and tinted so drawn entities stay readable.
- **Fish** — four procedurally drawn pixel species (clownfish, blue tang, pink fairy, yellow tang) sharing two body grids through palettes; the tail is a separate sprite pass shifted up/down for the wag. Each fish runs a wander → seek → flee state machine with steering, smooth edge turn-around, and eating.
- **Interactions** — Feed scatters six sinking pellets around the last pointer position (screen-center top when the pointer has not touched the water); fish within sense range break off wandering and chase them, eating on contact with a crumb-particle burst. Blow Bubbles spawns a burst of rising, waving bubbles that pop into rings at the surface. Clicking the water startles fish within range into a short fast flee.
- **Persistence** — the tank (species, fractional positions, direction, satiety, pellets eaten) is saved to `localStorage` (`dsh.fish-tank.v1`) every 5 seconds and on exit, and restored on the next open. Fractional coordinates survive resolution changes between machines.
- **Background** — the host half serves the packaged concept image (`bg.jpg`, the PRD artwork, renamed from the mislabeled `.png` — the bytes are JPEG) at `/api/fish-tank/background` with a one-hour cache. When the route is absent the client draws a procedural gradient seabed, so the plugin never breaks.

## Installation

`start-dsh.bat` registers this plugin into the web profile on every launch (see `_mytools/start-dsh.bat`), and `sync-plugins.bat` refreshes the profile's installed copy from this directory. After editing the plugin, restart `dsh web` for changes to take effect.

Manual equivalent:

```sh
dsh plugin --profile web add file:E:/AI/DSH/_mytools/Plugins/dsh-fish-tank
```

## Verification

No browser needed:

```sh
cd _mytools/Plugins/dsh-fish-tank
node --check client.js && node --check index.js
node tests/smoke.mjs
```

`tests/smoke.mjs` loads the client bundle through a stub module loader, asserts the plugin shape and its `shell.overlay` registration, then drives the engine headlessly (fake canvas, manual `requestAnimationFrame` stepping, stubbed `localStorage`) through movement, feeding, bubbles, startle, and a persistence round-trip, and finally exercises the host half's background route against a fake response.

## Model Experience

No model impact: the plugin adds no tools, prompts, or session events. It touches nothing model-visible; all state is browser-local (`localStorage`).

## Known Limitations and Deferred Work

- PRD milestone 4 is open: swapping in hand-drawn spritesheet assets (the sprite builder already centralizes drawing), optional sound, a pixel font for panel copy (currently monospace), and a pixel-net cursor skin (currently `crosshair`).
- Satiety is tracked per fish and persisted but not yet surfaced in the UI.
- The concept photo is a JPEG renamed to `bg.jpg`; a future true pixel-art background would remove the tint overlay.
