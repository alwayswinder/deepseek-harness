---
description: "Local DSH appearance bundle for selecting eye-friendly color palettes and configuring URL or device-local image backgrounds."
kind: "package-bundle"
---

# @local/dsh-appearance-plus

English | [中文](README.zh.md)

## Summary

This profile layer adds five color themes and a background-image editor to the Plugins page. Preferences are stored in the active DSH settings document; a selected local image stays in that browser or Desktop profile. The bundle changes presentation only and does not alter conversations or model requests.

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

Paste an HTTP(S) image URL or choose a local image. The page previews the file immediately, converts it to a capacity-bounded WebP image, and rejects local input above 20 MB. Image visibility, interface overlay opacity, blur, and fit are also saved automatically; slider and URL writes use a short delay so continuous edits are stored together.

The source bundle is installed into a profile with the standard file-package form:

```text
dsh plugin --profile desktop add file:E:/AI/DSH/_mytools/Plugins/appearance-plus
dsh plugin --profile web add file:E:/AI/DSH/_mytools/Plugins/appearance-plus
```

Restart Desktop or reload the Web application after the first installation so the browser bundle enters the client graph.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[`index.js`](index.js) registers the `appearance-plus` settings namespace. [`client.js`](client.js) applies palettes through a named `ctx.theme` token-override layer, projects saved background settings onto one owned stylesheet, and contributes the configuration page through `plugins.item`. The override keeps the built-in light or dark preference as its durable base, so settings synchronization cannot replace the selected palette. [`cordis.patch.yml`](cordis.patch.yml) mounts the Host row.

Network image addresses live in the Host settings document. A chosen local image is stored as a compressed data URL in this browser profile's local storage, and the durable setting carries only a sentinel, so `settings.yaml` does not contain the image bytes. A missing local image clears a stale sentinel instead of displaying an empty background.

</details>

-----

<a id="model-experience"></a>
## Model Experience

None. The bundle changes browser presentation and contributes no model-visible input, prompt content, tools, or session events.

## Known Limitations and Deferred Work

Local images do not synchronize between Desktop, Web, or another browser profile; select the image separately on each surface. Background transparency applies to theme-token surfaces, while embedded terminals, document previews, and remote web pages can retain their own opaque backgrounds.

<a id="dev-note"></a>
### Dev Note

None.
