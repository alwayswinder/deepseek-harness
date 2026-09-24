---
description: "Local DSH appearance bundle for selecting eye-friendly color palettes and configuring URL or device-local background and lock-screen images."
kind: "package-bundle"
---

# @local/dsh-appearance-plus

English | [中文](README.zh.md)

## Summary

This profile layer adds five color themes, a background-image editor, and an idle lock screen to the Plugins page. Preferences are live fields in the bundle's active profile configuration; a selected local image stays in that browser or Desktop profile. The bundle changes presentation only and does not alter conversations or model requests.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Open **Plugins → Appearance Plus** after the bundle is active. Choose Default, Eye green, Warm paper, Ocean, Lavender, or Midnight. Every selection is applied immediately and saved automatically.

**Background image.** Paste an HTTP(S) image URL or choose a local image. The page previews the file immediately, converts it to a capacity-bounded WebP image, and rejects local input above 20 MB. Image visibility, interface overlay opacity, blur, and fit are saved automatically; slider and URL writes use a short delay so continuous edits are stored together. The image reaches the screen at `image visibility × (1 - interface overlay opacity)`, so the interface overlay decides how much of it survives. The default 0.62 keeps a wallpaper clearly visible while the surfaces stay readable; the slider reaches down to 0.15, which makes the sidebar, messages, composer, settings rows, and code blocks translucent together, so most of the image survives even stacked surfaces. Dropdowns and tips float directly over the image on their own floor of 0.82 so their text stays readable.

**Lock screen.** A second, independent image with its own fit. With **Enable when idle** on, the client locks once no task is running and nothing has been clicked, scrolled, keyed, or moved for the idle delay — 20 seconds by default — and that image then covers the page, conversation and sidebar included, over a 2.4-second fade. A click, a scroll, a key press, or a pointer move brings the interface back in 0.22 seconds; while the lock screen is opaque the click that dismisses it is consumed rather than reaching whatever it covers. A running task keeps the lock screen away, and the settings page never locks, so its controls stay reachable. In the Desktop application the lock screen also clears the window's own caption — the strip and the minimize, maximize, and close glyphs — through the two page colours the shell repaints it from, once that image has loaded and finished covering the window. The window itself is never resized, moved, or made fullscreen, and the caption returns as the interface comes back.

Web installs the bundle from a terminal:

```text
dsh plugin --profile web add file:<repo>/_mytools/Plugins/appearance-plus
```

Desktop owns its own profile (`$DSH_HOME/profiles/desktop`) and refuses `dsh plugin --profile desktop`, so install the bundle there once per machine from the application's **Plugins → Add plugin** dialog with the absolute path of this directory. Both a bare absolute path and a `file:` spec work: the plugin must resolve `@deepseek-ai/schemastery` from its own directory, and `build.bat`, `build-desktop.bat`, `start-dsh.bat` and `start-desktop.bat` link `_mytools/Plugins/node_modules/@deepseek-ai/schemastery` to the vendored copy before they run. Without that link the Host cannot import the plugin and reports the bundle as failed to enable.

Restart Desktop or reload the Web application after the first installation so the browser bundle enters the client graph.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[`index.js`](index.js) marks the bundle's Config as live and disables the automatically generated form because the bundle supplies its own page. [`client.js`](client.js) reads that form through `ctx.configForms`, applies palettes through a named `ctx.theme` token-override layer, projects both saved images onto its own stylesheets, and contributes the configuration page through `plugins.item`. The override keeps the built-in light or dark preference as its durable base, so configuration synchronization cannot replace the selected palette. [`cordis.patch.yml`](cordis.patch.yml) mounts the Host row.

Two owned stylesheets carry both images. One declares the background layer behind `#root` and the lock layer above everything — above every portalled menu, modal, and toast — with the single `@property`-registered fade factor the lock transition runs on; the other re-derives each surface token from the active theme as `color-mix(...)` over the saved overlay alpha, which is what lets a Color theme survive the background image instead of being replaced by a shipped colour table. The idle clock is a local 500 ms interval over the pointer, wheel, and key listeners, and "a task is running" is the `running` flag on any row of `ctx.sessions.list`, read through an optional injection, so a profile without the sessions service simply never locks. A pointer move counts as input only when the pointer actually moved, because resizing or moving the window makes the engine re-emit a move at the position the pointer already had. The Desktop caption is cleared by the same stylesheet, on an attribute the controller sets one fade after the lock screen covers the window and removes as it leaves; the lock layer counts as covering only once the browser has decoded its image, so the cleared caption colours and a lock screen on screen are one state. The shell is told to re-read those colours through a plugin-owned property, because it re-reads only when body's style attribute changes and the palette tokens the theme writes there must stay untouched. Surface colours are re-read on a short backoff while the stylesheet that defines them is still missing, and the root element paints the base surface itself, so a region the application leaves unpainted obeys the overlay instead of showing the raw image.

Each image slot keeps its own local-storage keys and its own durable sentinel: a chosen local image is stored as a compressed data URL in this browser profile, while the active profile configuration carries only the sentinel and never holds image bytes. A sentinel retires only on the origin that stored the image and then lost it; another origin reports that this device has no copy and leaves the shared preference alone, because profile configuration is shared while local storage is per origin.

</details>

-----

<a id="model-experience"></a>
## Model Experience

None. The bundle changes browser presentation and contributes no model-visible input, prompt content, tools, or session events.

## Known Limitations and Deferred Work

Local images do not synchronize between Desktop, Web, or another browser profile; select each image separately on each surface, and a surface without a copy says so on the page. The lock fade needs `@property` and the surface transparency needs `color-mix`; an engine without them applies state changes without the transition. Clearing the Desktop caption makes its strip and glyphs invisible, but their hit regions remain: the top-right corner of the wallpaper still minimizes, maximizes, or closes the window, and hovering there shows the system's own highlight. The caption is cleared from the page's label colour, so the two are one state: a lock image that is missing or never loads draws no lock screen, the caption keeps its colours, and the interface stays readable. While the caption is cleared, the page's own primary labels are transparent as well, invisible only because the lock screen is painted over them. Background transparency applies to theme-token surfaces, while embedded terminals, document previews, and remote web pages can retain their own opaque backgrounds — the lock screen covers those too, because it is drawn above the interface.

<a id="dev-note"></a>
### Dev Note

None.
