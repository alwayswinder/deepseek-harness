# Dusk Patrol

A pixel-art fighter-jet flight demo through an autumn lake district at last light.

Everything is generated in code: the world is a seamless 1024² heightfield ray-marched in a WebGL2 fragment shader, the instruments are drawn with Canvas 2D, and the sound is synthesised with Web Audio. The only external resource is Google Fonts.

## Run

Open `index.html` in a current Chrome, Edge or Firefox. WebGL2 is required.

```powershell
start index.html
```

## Controls

| Input | Action |
| --- | --- |
| Mouse | Fly / steer; offset from centre sets turn, climb and dive |
| Hold left button | Afterburner |
| Click left | Barrel roll |
| Right click or `F` | Fire missile (four rounds, auto-reload) |
| `Space` | Cycle top / chase / cockpit view |
| `Enter` | Start |
| `M` | Sound on / off (off by default) |

Touch devices get an on-screen stick plus VIEW, ROLL, MSL and AB buttons.

## Notes

- Internal render height is 340 px, upscaled with nearest-neighbour filtering.
- The heightfield is built in a Web Worker; loading progress is shown on screen.
- Terrain, water, sky, clouds and the baked sun shadow all come from generated noise; no image assets are used.
- Render resolution drops automatically if the frame rate falls below target. Append `?fixed=1` to lock full resolution.
- The cockpit instruments are live: airspeed, attitude, altimeter, radar, slip, heading, VSI, engine, clock, caution lamps, throttle and missile stores.

## Files

- `index.html` — the standalone game.
- `src/` — editable source parts (HTML shell, CSS, Canvas UI and JavaScript modules).
- `tools/` — build script and headless-browser verification scripts. `harness.mjs` locates the repository's Playwright install, a Chrome or Edge executable, and the capture paths, so the scripts run from any checkout.
- `shots/` — reference captures from the headless run.

Build from source:

```powershell
node tools\build.mjs
```

## Verification

Captured headlessly at 1280×720 with Chrome/SwiftShader:

- `shots/01-title.png`
- `shots/02-chase.png`
- `shots/03-top.png`
- `shots/04-cockpit.png`
- `shots/land-impact-1.png`
- `shots/water-impact-1.png`

A 110-second randomised input soak (248 actions across all three views, missiles, rolls, afterburner and sound) completed with zero page errors.
