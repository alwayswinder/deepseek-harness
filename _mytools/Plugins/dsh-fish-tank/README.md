# dsh-fish-tank

English | [中文](README.zh.md)

A pixel-art aquarium overlay for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). The desktop pet's **mini games ▸ pixel fish tank** entry opens a fullscreen underwater world: fish wander with a small AI, seaweed sways, corals breathe, bubbles rise, and light rays fall from the surface. Feed the fish, blow bubbles, or tap the water to startle them — then press `Esc` or the close button in the top-right corner to get back to work. This plugin draws no entry of its own: the overlay mounts only when it is asked for (see "Opening it from the pet menu" below).

Implements milestones 1–3 of the PRD in this directory (`PRD.md`); milestone 4 (hand-drawn spritesheets, sound, pixel font) is deferred — see [Known Limitations and Deferred Work](#known-limitations-and-deferred-work).

## How it works

- **Entry & exit** — the entry is the desktop pet's **mini games ▸ pixel fish tank**. The aquarium opens fullscreen; `Esc` or the **Leave the aquarium** button in the top-right corner closes it. The plugin ships no button of its own.
- **Rendering** — one HTML5 canvas, native 2D context, `requestAnimationFrame` with clamped `deltaTime`, so motion is identical at 60 Hz and 144 Hz. Entity caps (12 fish, 50 pellets, 130 bubbles, 240 particles) keep the frame budget flat; the background photo is cover-fitted once per frame and tinted so drawn entities stay readable.
- **Fish** — four procedurally drawn pixel species (clownfish, blue tang, pink fairy, yellow tang) sharing two body grids through palettes; the tail is a separate sprite pass shifted up/down for the wag. Each fish runs a wander → seek → flee state machine with steering, smooth edge turn-around, and eating.
- **Interactions** — Feed scatters six sinking pellets around the last pointer position (screen-center top when the pointer has not touched the water); fish within sense range break off wandering and chase them, eating on contact with a crumb-particle burst. Blow Bubbles spawns a burst of rising, waving bubbles that pop into rings at the surface. Clicking the water startles fish within range into a short fast flee.
- **Persistence** — the tank (species, fractional positions, direction, satiety, pellets eaten) is saved to `localStorage` (`dsh.fish-tank.v1`) every 5 seconds and on exit, and restored on the next open. Fractional coordinates survive resolution changes between machines.
- **Background** — the host half serves the packaged concept image (`bg.jpg`, the PRD artwork, renamed from the mislabeled `.png` — the bytes are JPEG) at `/api/fish-tank/background` with a one-hour cache. When the route is absent the client draws a procedural gradient seabed, so the plugin never breaks.

## Opening it from the pet menu

The browser half registers the overlay's open state as the client service **`fishTank`**: `open()` / `close()` / `toggle()` write, `isOpen()` and `subscribe(listener)` read (the component subscribes to it too, so one owner holds the state across `shell.overlay` re-renders). The desktop pet plugin (`_mytools/Plugins/dsh-littleIcon`) reaches it from its **mini games ▸ pixel fish tank** entry: the pet sends the `fish-tank` command to the page, whose `client.js` looks the service up with `ctx.get('fishTank')` and calls `open()`, logging a warning instead of opening a blank screen when the plugin is absent.

That service is the **only** entry: this plugin has no button, so nothing belonging to the tank appears on the page until someone calls it. Closing the overlay only unmounts it; the service and its state remain, so the next call opens it again.

## Installation

`_mytools/build/start-dsh.bat` registers this plugin into the web profile on every launch (`build/sync-plugins.bat` refreshes the profile's installed copy from this directory). After editing the plugin, restart `dsh web` for changes to take effect.

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

`tests/smoke.mjs` loads the client bundle through a stub module loader, asserts the plugin shape, the `fishTank` service, and its `shell.overlay` registration, then drives the engine headlessly (fake canvas, manual `requestAnimationFrame` stepping, stubbed `localStorage`) through movement, feeding, bubbles, startle, and a persistence round-trip, and finally exercises the host half's background route against a fake response.

## Model Experience

No model impact: the plugin adds no tools, prompts, or session events. It touches nothing model-visible; all state is browser-local (`localStorage`).

## Known Limitations and Deferred Work

- The only entry is the desktop pet's menu: a build without the pet shows no floating button, so the tank opens only through the `fishTank` service.
- PRD milestone 4 is open: swapping in hand-drawn spritesheet assets (the sprite builder already centralizes drawing), optional sound, a pixel font for panel copy (currently monospace), and a pixel-net cursor skin (currently `crosshair`).
- Satiety is tracked per fish and persisted but not yet surfaced in the UI.
- The concept photo is a JPEG renamed to `bg.jpg`; a future true pixel-art background would remove the tint overlay.
