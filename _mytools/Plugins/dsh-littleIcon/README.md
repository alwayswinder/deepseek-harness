---
description: "DSH desktop pet: a pixel widget living in its own window, floating on top, draggable, switching expression with agent state, tucking the DSH window away on click, with a tray menu."
kind: "package-bundle"
---

# @local/dsh-little-icon

English | [中文](README.zh.md)

## Summary

The pet is a **process of its own** (PowerShell + WPF), not an overlay inside the DSH window: it owns a frameless, transparent, always-on-top window, so it stays on the desktop while the DSH window is minimized or tucked away. The host half (`index.js`) samples agent state into a state file; the pet switches its animation from it. Clicking the pet calls user32 `ShowWindow` to tuck the DSH window away or bring it back, and the tray icon offers the same action plus a position reset and quit. The plugin changes no conversation, model request, or session log.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model experience](#model-experience)
- [Known limitations and deferred work](#known-limitations-and-deferred-work)
- [Dev note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

**Desktop install.** Desktop owns its own configuration (`$DSH_HOME/profiles/desktop`) and refuses `dsh plugin --profile desktop`; fill this directory's absolute path into the application's **Plugins → Add plugin** dialog once per machine. Desktop must then be restarted: the host half (`index.js`) takes no part in client hot reload, so only a restart loads it.

**Web install** (optional; there the pet only floats and controls no window). `start-dsh.bat` already lists this plugin in `DSH_LOCAL_PLUGINS`, so every start idempotently installs this directory into the web profile as a `file:` copy, and `sync-plugins.bat` refreshes `index.js`, `pet/`, and `assets/` with it. To install it by hand:

```text
dsh plugin --profile web add file:<repo>/_mytools/Plugins/dsh-littleIcon
```

**Size and translucency.** Open the **Plugins** list and click the **Desktop Pet** card: the settings card is drawn on that card's page, between the description and the parts list, so nothing hides behind the `little-icon` row. It leads with:

- **Size** — a 96–320 pixel slider; the pet takes the new size within a frame;
- **Translucent while idle** — a switch; turn it off and the pet never fades;
- **Translucency** — available while that switch is on, 15%–100%;
- **Tuck DSH away when idle** — on by default, with its **tuck away after** slider (20 seconds) greyed out while the switch is off;
- plus enable, always-on-top, click behaviour, and animation pace, with idle pacing, happy/startled durations, and the state sampling interval folded under **More**.

Controls write straight to the profile configuration (the `little-icon` entry in `$DSH_HOME/profiles/<profile>/cordis.patch.yml`) and need no restart: the host republishes the state file on a config change and the pet applies it within a second. Toggling **Enable the pet** off and on also ends and restarts the pet process at once. The card comes from the plugin's own browser half (`client.js`), so no second, automatically generated form appears after a restart.

**Interaction.** The pet starts in the bottom-right corner of the primary screen, as translucent as configured, and fully visible under the pointer. Dragging with the left button moves it (the position is stored on release, restored on the next start, and clamped onto the current virtual screen). A **click** — a press that did not move the window — performs the configured `clickAction`: `toggle` (default) tucks a shown DSH window away and restores plus foregrounds it on the next click, `minimize` only minimizes, `none` does nothing. The tray icon's context menu offers "tuck/show DSH", "move to corner", and "quit pet"; double-clicking the tray icon is the same as clicking the pet. Besides your own clicks, the pet tucks DSH away on its own when you leave it alone — see "Tuck DSH away when idle" below.

**Right-click menu.** Right-clicking the pet opens the same menu the tray icon shows, and its first entry is **Chat**: it opens <https://chat.deepseek.com> in DSH's own **right-Sidebar Browser tab**, never in the system browser — the same embedded surface DSH uses for chat links in a conversation when the link preference selects "In-App Sidebar". The remaining entries act on the pet itself: tuck/show DSH, move to corner, quit. The pet process draws the menu and the page performs what it chooses, with the Host carrying the choice between them; where the page has no Browser tab to open (a Web profile leaves it disabled), the entry only logs a warning instead of failing.

**Configuration fields.** The card's controls write these; every field applies live (a config change republishes the state file and reschedules the sampling timer, and the pet re-reads the state file, so nothing needs a restart):

| Field | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Turning it off ends the pet process; turning it back on starts one |
| `size` | `160` | Window edge in pixels; the frames are built at 256px and scaled down |
| `translucent` | `true` | Whether the pet fades while the pointer is away |
| `idleOpacity` | `0.45` | How far it fades; hover is always 1. Ignored while `translucent` is off |
| `frameMs` | `600` | Milliseconds each animation frame stays on screen |
| `pollMs` | `800` | Host sampling interval; lower follows the agent sooner, higher costs less |
| `alertMs` | `1500` | How long a new task startles the pet before it works |
| `happyMs` | `3000` | How long a finished task keeps it happy before it idles again |
| `boredEverySeconds` | `60` | While the agent is idle, how often a bored interruption comes around |
| `boredMs` | `5000` | How long each bored interruption lasts |
| `sleepAfterSeconds` | `600` | Seconds without activity before it sleeps, while DSH is on screen |
| `sleepWhenHiddenSeconds` | `20` | The same once DSH is tucked away, where dragging the pet is the only activity |
| `autoHide` | `true` | Whether the pet tucks DSH away on its own while it is on screen and you stop touching it |
| `autoHideSeconds` | `20` | How long that takes; a window behind another one counts, and a running task does not postpone it |
| `topmost` | `true` | Whether the pet stays above other windows |
| `clickAction` | `toggle` | `toggle` / `minimize` / `none` |

**State to expression.** One task reads as `alert` (startled) → `working` → `happy` → `idle`.

- **Boredom** follows whether a task is running rather than the mouse: while the agent is idle, `bored` interrupts every `boredEverySeconds` for `boredMs`, so a long answer still shows it now and then, and any activity ends the current interruption.
- **Sleep** follows activity, on two timers. While DSH is on screen it takes `sleepAfterSeconds` without pointer, wheel, or keyboard input on the page, a drag of the pet, or a click on it — any of those wakes the pet into idle at once. Once DSH is **tucked away**, the `sleepWhenHiddenSeconds` timer applies (20 seconds by default), where the only possible activity is dragging the pet or bringing DSH back by clicking the pet or through its tray entry.
- **Tucking DSH away when idle** (`autoHide`, on by default) follows the same activity but on its own short timer: while DSH is still on screen and `autoHideSeconds` (20 seconds by default) passes without any activity, the pet tucks it away, **whether or not a task is running** — the task keeps going, the window goes first. Sitting behind another window counts as unused, which makes it exactly the window worth tidying away, so a covered DSH is tucked away too. The activity it counts is the one sleep counts, including showing, hiding, or foregrounding DSH itself, so the tucked sleep timer starts when the auto-tuck lands, and any activity — or bringing DSH to the front — restarts those 20 seconds. Only a minimized or already tucked window is left alone: there is no window on screen to tidy up.

The pet writes whether DSH is on screen and whether it is the window in front into `window.json`: the first selects the sleep timer and decides the auto-tuck, the second is only a "someone did something" signal (bringing it forward is an action too), as are showing and hiding it. Each state is a four-frame loop.

Local data lives under `$DSH_HOME/little-icon/`: `state.json` (written by the host, read by the pet), `position.json` (written by the pet), `window.json` (the pet's report of whether DSH is on screen and whether it is in front), and `command.json` (the pet's right-click menu choice, which the host reads and relays to the page). It is per machine and never syncs with the repository; deleting it restores the default position and state.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

**Why a separate process is required.** The desktop shell exposes no window capability to plugins: `apps/desktop` has no `Tray`, the main window's `BrowserWindow` sets neither `transparent` nor `alwaysOnTop` nor `skipTaskbar`, `apps/desktop/src/ipc.ts` lists no minimize/hide/restore channel, and `preload-app.ts` exposes only `dshDesktop` (browser views and updates), `dshPlatform` (the usage/top-up embedded page), the directory picker, host paths, and the locale. The renderer runs with `sandbox: true` and `contextIsolation: true`, and `window.open` is denied outright. Decisively, plugin host code runs in the `ELECTRON_RUN_AS_NODE=1` Node child process (`apps/desktop/src/host-process.ts` plus `node-environment.ts`), where `require('electron')` yields the binary path and nothing more. A hidden window stops painting its DOM as well. "The pet stays after DSH is tucked away" therefore needs a process the plugin starts itself.

**Browser half.** `client.js` does three things. It registers a hand-written settings card into `plugins.bundle.config`, the seat the Plugins page keeps for one bundle's own configuration, keyed by the package name `@local/dsh-little-icon` — drawn right on the plugin list's card page, one click shallower than the `little-icon` row's own page. The card reads no configuration itself: `ctx.configForms.get('little-icon')` yields the row's form, whose accepted sections are mirrored into a snapshot store and handed to the component through the registration's inject face (`hooks.petSettings` plus a `write` callback), so the Host schema stays the single owner of every value. Sliders echo locally while dragging and collapse into one write 250ms after the drag settles; switches and the select write at once. The host half therefore calls `settings.configure({ auto: false })`, so the same fields never appear twice in a generated English form. Second, it reports user activity (next paragraph). Third, it performs the pet's right-click menu commands: it subscribes with `new EventSource('/api/little-icon/commands')` and, on `chat`, calls `ctx.sidebarRight.openTab('browser', { params: { url: 'https://chat.deepseek.com' } })` — the right-Sidebar Browser tab is the only way a plugin opens a site inside DSH, and it is what `ui-chat` uses for conversation links. `sidebarRight` and `sidebarRightTabs` are looked up through `ctx.get` rather than injected (a Web profile may leave the `browser` type disabled, and a build without the right Sidebar provides no service at all); when either is missing the command only logs a `console.warn`, because this card has to load in every profile. All copy lives in `ctx.locale` dictionaries (Chinese and English); `tests/smoke.mjs` asserts the two cover the same keys, that the card asks for nothing else, drives one immediate write and one merged drag through the real form API, checks that the activity listeners register and throttle, and drives a `chat` command plus both unavailable-service paths and the `EventSource.close()` that disposal performs.

**Where "activity" comes from.** The Host sees agents and jobs, and "nobody has touched anything" is not the same as "no task is running" — without an input signal the pet would sleep while the person keeps using DSH. The browser half therefore pings `POST /api/little-icon/activity` on `pointerdown`, `pointermove`, `wheel`, and `keydown`, throttled to one every 15 seconds. That route is same-origin, checks `connection.requestRejection` first like the repository's own routes, and answers 405 to anything but POST. The Host takes the newest of that timestamp and the pet's `position.json` modification time, so dragging the pet or using the tray's "move to corner" counts too. A tucked DSH window produces no page input at all — which is the point — so there the pet reports the window state it alone can see into `window.json` once a second (on screen, in front), and the Host switches timers on it and decides the auto-tuck from it, counting showing, hiding, or foregrounding the window as activity, so bringing DSH forward always wins those 20 seconds back. Sleep therefore arrives only after a stretch in which nothing at all happened, and starting a task counts as activity as well.

**Host half.** `index.js` samples every `pollMs`: `ctx.get('agents')` for an agent that is `running` or holds queued next-turn/next-step work, and `ctx.get('jobs')` for a `running` or `stopping` job (the same test `apps/desktop-host/src/update-tasks.ts` uses). The decision itself is the pure `sampleState`, which `tests/smoke.mjs` drives directly; it takes "is anything running", "when did anything last happen", and the sleep timer currently in force, which the reported window visibility selects. A second pure function, `shouldTuck`, decides whether DSH should be tucked away: it sees only whether the window is on screen, how long the activity clock has run, and `autoHide`/`autoHideSeconds` — "is a task running" is deliberately not an input, so a running task is tucked away with the window, and neither is "is it in front", so a covered window goes too. Its answer is published as `tuck` in `$DSH_HOME/little-icon/state.json`, which is a command rather than a state: the visibility the pet reports back turns it off on the next sample, and a repeat of the same request in between is harmless because the pet's own window setter is idempotent. The file is written on change, plus a four-second heartbeat the pet uses to tell whether the host is still alive. `translucent` and `idleOpacity` collapse into one `opacity` field here, so the pet needs no notion of the switch. The pet is started with `child_process.spawn` (`powershell.exe -NoProfile -NonInteractive -STA -ExecutionPolicy Bypass -File pet/pet.ps1`) carrying the asset directory, the state and position files, and the process id of the window to control; the `ctx.effect` disposer ends it, so DSH leaves no orphan window. In the desktop shell the host's parent is the Electron main process, so that id is simply `process.ppid`; the web profile has no window to control and passes 0. Menu commands take another route: the pet writes its choice to `command.json`, the host reads that file once per tick (only a strictly newer `at` counts as a new command, so a record left by a previous run is never replayed) and pushes it to the page over the `GET /api/little-icon/commands` SSE stream. That stream passes the same `connection.requestRejection` check as the activity route, answers with nothing but the event stream (`text/event-stream`, opening with a comment frame so a subscriber is live at once), and is dropped from the subscriber set and `end()`ed when the client disconnects or the plugin is disposed. A command chosen while no page is listening is dropped: the page is what performs it, so with no page there is nothing to perform it.

**Pet process.** `pet/pet.ps1` is a WPF frameless transparent topmost window (`WindowStyle=None`, `AllowsTransparency`, `Topmost`, `ShowActivated=false` so it never steals focus). The script declares the process DPI aware first (`SetProcessDpiAwarenessContext`, falling back a step at a time): PowerShell has no DPI manifest, and a layered window in an unaware process is rendered into a surface at the virtualized size and then stretched by the system, which tiled the pet two-by-two and drew it larger than asked. After `WindowInteropHelper.EnsureHandle()` it adds `WS_EX_TOOLWINDOW` to the handle, because WPF's `ShowInTaskbar=false` does not actually set that style and the pet would otherwise appear in the taskbar and Alt+Tab. A 200ms timer re-reads the state file when its write time moves, applying expression, size, opacity, click action, and topmost; frames advance every `frameMs`, and the script counts the frames on disk instead of reading a constant (most states have four, `working` has six). Dragging uses `DragMove()`. The press that activates the pet window is reported twice — once while WPF handles the activation, once as the ordinary mouse message — and that first report cannot start a drag, so a press only latches and the release decides click or drag; acting on the first report would run the click action twice and tuck DSH on a press that only dragged the pet. The position is stored in `position.json`, restored at start, and clamped onto a screen. The right-click menu (`New-PetMenu`) and the tray menu are two instances of one definition, both WinForms `ContextMenuStrip`s: on Desktop the first entry is **Chat**, which writes `{"command":"chat","at":…}` to `command.json` for the host to relay, while the remaining entries act on this process; the web profile has no system window to control, so its menu carries no tuck/show entry. Every label is read from `pet/labels.json` as UTF-8, with English defaults inside the script, which itself stays pure ASCII.

**Geometry units.** Position and clamping use WPF's own `SystemParameters.WorkArea` and `VirtualScreen*`, which share the device-independent units of `Window.Left/Top`. WinForms reports the work area and virtual screen in physical pixels, and mixing the two pushes the pet off-screen at any display scaling other than 100% — a bottom-right position lands 1.5x too far right and down at 150%. `tests/smoke.mjs --pet` measures the window from a DPI-aware probe and asserts it is inside the screen.

**Window control.** The target starts as `Process.MainWindowHandle` — the real main window, which the untitled helper windows cannot confuse, so it is trusted first. When that reports 0 (a hidden window), the pet enumerates the process's top-level windows and skips IME helpers such as `IME`, `CandidateWindow`, and `MSCTFIME UI`. The handle is cached, because `MainWindowHandle` becomes 0 after `SW_HIDE`. Tucking uses `SW_HIDE` (gone from both the screen and the taskbar, leaving the pet and the tray as the way back); restoring uses `SW_RESTORE` plus `SetForegroundWindow`. Every change goes through one `Set-DshWindowShown`: a click, the tray entry, and the host's `tuck` request all use it, and it returns when the window is already where it was asked to be, so a repeated `tuck` never brings a just-tucked window back; `clickAction`'s `minimize` still uses `SW_MINIMIZE` on its own.

**Encoding.** `pet.ps1` stays pure ASCII: without a BOM, Windows PowerShell 5.1 decodes a `.ps1` as ANSI, which turns UTF-8 Chinese into mojibake and can even swallow quotes into a syntax error. The localized tray labels live in `pet/labels.json`, read as UTF-8, with English defaults when it is missing. `tests/smoke.mjs` asserts the script contains no non-ASCII character.

**Art.** `assets/<state>/1.png … N.png` come from `tools/build-assets.py`, which reads `IconImage/transparent/*.png`. Each source sheet packs several figures onto one 2048×2048 canvas, and the layouts differ: most states are two-by-two (four figures), `working` is three columns by two rows (six), and `sleep` leaves only 14 transparent pixels between its rows. The script therefore assumes no grid and finds figures by alpha projection: empty rows split the sheet into bands (a gap under 8 pixels does not split, and bands too short to be a figure are absorbed into their neighbour so Zzz bubbles and gear icons stay attached), column valleys below 12% of the band's peak split each band into figures, and each region is then cropped to its actual opaque pixels. Figures run top-to-bottom, left-to-right, are pasted bottom-centered onto one shared canvas per state, and share a single global scale taken from the largest figure in the set, so a state never jumps between frames and the character keeps its size across expressions. The artwork decides the frame count, recorded in `assets/frames.json`; the pet counts files rather than reading a constant, so new art needs no code change. `assets/tray.ico` is the multi-size tray icon.

</details>

-----

<a id="model-experience"></a>
## Model experience

None. The plugin adds no model-visible input, prompt, tool, or session event; it only reads agent and job status.

## <a id="known-limitations-and-deferred-work"></a>Known limitations and deferred work

**Errors have no expression of their own.** `agent/error` is still in the event table, but under the current rules `alert` means "a task just started". Giving failures a face again is a matter of listening for that event in the host half and feeding the state machine one more input. "Waiting for your answer" is unwired for the same reason: the client-side `ui-session` status carries `pendingInteraction` (approvals, questions, plan review), while the host offers only the `approval/request` waterfall and no read-only query, and a decorative listener on the approval path is not worth it.

**Activity comes only from the DSH page and the pet itself.** The report is built from input events on the DSH page, so a tucked, minimized, or covered DSH window produces none: while tucked the pet sleeps on `sleepWhenHiddenSeconds`, which is the point. Working in another application does not keep it awake; typing or clicking back in DSH, dragging the pet, or using the tray's move-home entry does.

**"Tuck away" is not a real system tray.** The desktop shell has no `Tray`, so the tray icon belongs to the pet process (`NotifyIcon`), and the action is `SW_HIDE`: the DSH window leaves the screen and the taskbar but leaves no DSH icon in the notification area. If DSH exits some other way, the pet quits on its own within 45 seconds or as soon as the host process is gone.

**The in-app browser asks for a login again after every restart.** **Chat** opens DSH's right-Sidebar Browser tab, and that embedded session is process-lifetime: `apps/desktop/src/browser-guests.ts` creates the partition as `dsh-sidebar-browser-<uuid>` without the `persist:` prefix, so cookies and Web storage do not survive a DSH restart and chat.deepseek.com has to be signed into again. The official usage page behaves differently because it takes another route — `apps/desktop/src/platform-view.ts` injects the account's own cookies — but that route accepts only `/usage` and `/top_up`, which a plugin cannot reach. Keeping that login would mean editing upstream `apps/desktop/src/browser-guests.ts` (a `persist:` partition), which is outside `_mytools/` and needs separate consent.

**A Web profile may have no Browser tab.** The right-Sidebar `browser` type is disabled by default in Web profiles, and a build without the right Sidebar provides no `ctx.sidebarRight` at all; **Chat** then does nothing (the page only logs a `console.warn`). Desktop ships that tab, so it works there.

**A pet that exits stays exited.** After quitting from the tray, no other settings write brings it back — only switching **Enable the pet** off and on, or the next DSH start. That way the quit a user just asked for is not undone.

**The position only clamps to the virtual screen.** A changed monitor layout pulls the window back into view but does not remember a position per display.

**Four frames per expression.** The art fixes each state to a four-frame loop; finer motion (typing, a Zzz bubble) needs new art dropped into the matching state directory.

**The web profile is second class.** There the pet has no DSH window to control, so its tray menu keeps only position reset and quit, and a click does nothing; everything else — the window, expressions, dragging — behaves the same.

<a id="dev-note"></a>
### Dev note

```text
python tools/build-assets.py          # regenerate assets/ (bundled DSH Python: Pillow + numpy)
node tests/smoke.mjs                  # state machine, art, and pet.ps1 -SelfTest (shows no window)
node tests/smoke.mjs --pet            # additionally runs the apply() lifecycle: start the pet, measure
                                      # that its window is on screen, change state, dispose
                                      # (a real pet window appears for about 25 seconds)
```

`--pet` genuinely shows a pet window, in the top-left corner and in its own temporary `$DSH_HOME`, so it can run beside a pet somebody is actually using; the run prints a line saying so. The corner placement is deliberate: a strange pet in the top-left is this test, not a second pet some plugin started.

Changing `index.js` or `package.json` needs a DSH restart (the host half does not hot reload); changing `pet/pet.ps1`, `pet/labels.json`, or `assets/` needs only a pet restart (quit it from the tray, or restart DSH).
