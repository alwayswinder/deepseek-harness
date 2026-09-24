/**
 * Appearance Plus browser plugin.
 *
 * This hand-built lazy-CJS bundle uses a public theme-token override layer for
 * palettes and the settings mirror for durable preferences. A small owned
 * stylesheet supplies the image layer because image backgrounds are not theme
 * tokens.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-appearance-plus',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }

    const React = require('react')
    const { createSnapshotStore } = require('@deepseek-ai/dsh-client-store')
    const h = React.createElement

    const NS = 'appearance-plus'
    // Two independent images: the background wallpaper behind the interface,
    // and the lock-screen wallpaper that replaces the interface while the
    // client is idle. Each local copy is device-local, so each slot keeps its
    // own storage keys and its own durable sentinel.
    const SLOTS = Object.freeze({
      background: Object.freeze({
        field: 'backgroundUrl',
        sentinel: 'local://appearance-plus-background',
        imageKey: 'dsh.appearance-plus.local-image.v1',
        seenKey: 'dsh.appearance-plus.local-image.seen.v1',
      }),
      lock: Object.freeze({
        field: 'lockUrl',
        sentinel: 'local://appearance-plus-lock',
        imageKey: 'dsh.appearance-plus.lock-image.v1',
        seenKey: 'dsh.appearance-plus.lock-image.seen.v1',
      }),
    })
    const SLOT_NAMES = Object.freeze(Object.keys(SLOTS))
    const LOCAL_IMAGE_MAX_DATA_URL = 1_800_000
    // The overlay slider drives every surface that the wallpaper shows through;
    // its lower bound decides how much of the image can survive a stack of
    // nested surfaces, because each one multiplies the opacity again.
    const SURFACE_OPACITY_MIN = 0.15
    // Dropdowns, menus, and tips float above the page with no surface of their
    // own behind the text, so their alpha keeps a readable floor.
    const FLOAT_OPACITY_MIN = 0.82
    const IMAGE_OPACITY_VAR = '--dsh-appearance-image-opacity'
    const SURFACE_OPACITY_VAR = '--dsh-appearance-surface-opacity'
    const FLOAT_OPACITY_VAR = '--dsh-appearance-float-opacity'
    // The lock-screen layer: the same viewport, drawn above the interface
    // instead of behind it. Only its fade factor is registered `@property` and
    // transitioned, so the rest of the settings stay instant.
    const COVER_FADE_VAR = '--dsh-appearance-cover-fade'
    const LOCK_ATTR = 'data-dsh-appearance-lock'
    const COVER_ATTR = 'data-dsh-appearance-cover'
    // Above every portalled menu, modal, and toast (the client tops out at
    // z-index 1100), so nothing floats over the lock screen.
    const COVER_Z_INDEX = 10000
    const LOCK_FADE_IN_SECONDS = 2.4
    const LOCK_FADE_OUT_SECONDS = 0.22
    // The Desktop shell mirrors two page variables into the window's own
    // caption: the fill behind its minimize, maximize, and close buttons and the
    // colour of their glyphs. Fully transparent values hide that caption while
    // the lock screen covers the window, and the window itself is never touched.
    const CAPTION_ATTR = 'data-dsh-appearance-caption'
    // Plugin-owned signal that the cleared colours are in effect; the Desktop
    // shell only re-reads the caption when body's style attribute changes.
    const CAPTION_STATE_VAR = '--dsh-appearance-caption'
    const CAPTION_FILL_VAR = '--dsw-specific-sidebar-fill'
    const CAPTION_SYMBOL_VAR = '--dsw-alias-label-primary'
    const CAPTION_TRANSPARENT = 'rgba(0, 0, 0, 0)'
    // The caption follows only once the lock screen has finished covering the
    // window, so the interface is never seen with an invisible label colour.
    const CAPTION_HIDE_DELAY_MS = LOCK_FADE_IN_SECONDS * 1000 + 200
    // Surface-token reads retry on this cadence, up to COLOR_RETRY_LIMIT times,
    // while the stylesheet that defines them is still missing.
    const COLOR_RETRY_MS = 400
    const COLOR_RETRY_LIMIT = 25
    // The Desktop application document; the Web client is served over http(s)
    // and has no caption of its own to hide.
    const DESKTOP_DOCUMENT = location.protocol === 'dsh-app:'
    const IDLE_SECONDS_MIN = 3
    const IDLE_SECONDS_MAX = 600
    // The idle clock ticks instead of re-arming a timeout per pointer event,
    // which arrives at pointer-device rate.
    const IDLE_TICK_MS = 500
    // `pointerdown` and `pointermove` are handled apart from these: the first is
    // the one event an opaque lock screen consumes, the second needs to ignore
    // engine re-emissions.
    const ACTIVITY_EVENTS = Object.freeze(['wheel', 'keydown'])

    const DEFAULTS = Object.freeze({
      preset: 'default',
      backgroundUrl: '',
      backgroundOpacity: 0.72,
      backgroundBlur: 0,
      backgroundFit: 'cover',
      // Surfaces keep the image visible: the image reaches the screen at
      // backgroundOpacity × (1 - surfaceOpacity), so the shipped 0.86 left a
      // chosen background at roughly a tenth of its strength and read as "the
      // image did not load".
      surfaceOpacity: 0.62,
      // The lock screen is what the idle clock drives: with `lockEnabled` on
      // and a lock image configured, no input for `lockSeconds` and no running
      // task put that image over the whole interface.
      lockUrl: '',
      lockEnabled: true,
      lockSeconds: 20,
      lockFit: 'cover',
    })

    const PALETTES = Object.freeze([
      Object.freeze({
        id: 'eye-green', labelKey: 'preset.eyeGreen', scheme: 'light', preview: '#eef6e9',
        tokens: Object.freeze({
          '--dsw-alias-bg-base': '#eef6e9',
          '--dsw-alias-bg-layer-1': '#f7fbf4',
          '--dsw-alias-bg-layer-2': '#e4f0de',
          '--dsw-alias-bg-layer-3': '#d9e9d2',
          '--dsw-alias-bg-overlay': '#f7fbf4',
          '--dsw-alias-bg-module-platform': '#deecd7',
          '--dsw-alias-border-l1': '#d2e3ca',
          '--dsw-alias-border-l2': '#bfd5b7',
          '--dsw-alias-border-l3': '#a8c49f',
          '--dsw-alias-brand-primary': '#2f6f4e',
          '--dsw-alias-brand-text': '#285f43',
          '--dsw-alias-link': '#2f6f4e',
          '--dsw-alias-button-primary-fill': '#2f6f4e',
          '--dsw-alias-label-primary': '#243529',
          '--dsw-alias-label-secondary': '#526659',
          '--dsw-alias-label-tertiary': '#708176',
          '--dsw-specific-sidebar-fill': '#eef6e9',
        }),
      }),
      Object.freeze({
        id: 'warm-paper', labelKey: 'preset.warmPaper', scheme: 'light', preview: '#f7f1e5',
        tokens: Object.freeze({
          '--dsw-alias-bg-base': '#f7f1e5',
          '--dsw-alias-bg-layer-1': '#fcf8ef',
          '--dsw-alias-bg-layer-2': '#efe5d2',
          '--dsw-alias-bg-layer-3': '#e7dac3',
          '--dsw-alias-bg-overlay': '#fcf8ef',
          '--dsw-alias-bg-module-platform': '#eee3cf',
          '--dsw-alias-border-l1': '#e0d4bf',
          '--dsw-alias-border-l2': '#cfbea3',
          '--dsw-alias-border-l3': '#bca989',
          '--dsw-alias-brand-primary': '#805b35',
          '--dsw-alias-brand-text': '#6f4e2e',
          '--dsw-alias-link': '#805b35',
          '--dsw-alias-button-primary-fill': '#805b35',
          '--dsw-alias-label-primary': '#3b3025',
          '--dsw-alias-label-secondary': '#6d6050',
          '--dsw-alias-label-tertiary': '#8a7c68',
          '--dsw-specific-sidebar-fill': '#f7f1e5',
        }),
      }),
      Object.freeze({
        id: 'ocean', labelKey: 'preset.ocean', scheme: 'light', preview: '#edf6f8',
        tokens: Object.freeze({
          '--dsw-alias-bg-base': '#edf6f8',
          '--dsw-alias-bg-layer-1': '#f7fbfc',
          '--dsw-alias-bg-layer-2': '#dfedf1',
          '--dsw-alias-bg-layer-3': '#d2e5ea',
          '--dsw-alias-bg-overlay': '#f7fbfc',
          '--dsw-alias-bg-module-platform': '#d9e9ed',
          '--dsw-alias-border-l1': '#cbdfe4',
          '--dsw-alias-border-l2': '#b5d2d9',
          '--dsw-alias-border-l3': '#96bbc5',
          '--dsw-alias-brand-primary': '#24677a',
          '--dsw-alias-brand-text': '#205a6b',
          '--dsw-alias-link': '#24677a',
          '--dsw-alias-button-primary-fill': '#24677a',
          '--dsw-alias-label-primary': '#23373d',
          '--dsw-alias-label-secondary': '#526970',
          '--dsw-alias-label-tertiary': '#70858b',
          '--dsw-specific-sidebar-fill': '#edf6f8',
        }),
      }),
      Object.freeze({
        id: 'lavender', labelKey: 'preset.lavender', scheme: 'light', preview: '#f4f0f8',
        tokens: Object.freeze({
          '--dsw-alias-bg-base': '#f4f0f8',
          '--dsw-alias-bg-layer-1': '#faf8fc',
          '--dsw-alias-bg-layer-2': '#e9e2f1',
          '--dsw-alias-bg-layer-3': '#dfd5e9',
          '--dsw-alias-bg-overlay': '#faf8fc',
          '--dsw-alias-bg-module-platform': '#e6deee',
          '--dsw-alias-border-l1': '#d9cfe4',
          '--dsw-alias-border-l2': '#c7b8d6',
          '--dsw-alias-border-l3': '#ad9ac1',
          '--dsw-alias-brand-primary': '#665080',
          '--dsw-alias-brand-text': '#59466f',
          '--dsw-alias-link': '#665080',
          '--dsw-alias-button-primary-fill': '#665080',
          '--dsw-alias-label-primary': '#352d3d',
          '--dsw-alias-label-secondary': '#665b70',
          '--dsw-alias-label-tertiary': '#82778c',
          '--dsw-specific-sidebar-fill': '#f4f0f8',
        }),
      }),
      Object.freeze({
        id: 'midnight', labelKey: 'preset.midnight', scheme: 'dark', preview: '#111920',
        tokens: Object.freeze({
          '--dsw-alias-bg-base': '#111920',
          '--dsw-alias-bg-layer-1': '#19242d',
          '--dsw-alias-bg-layer-2': '#22313d',
          '--dsw-alias-bg-layer-3': '#2a3b48',
          '--dsw-alias-bg-overlay': '#22313d',
          '--dsw-alias-bg-module-platform': '#21303b',
          '--dsw-alias-border-l1': '#2b3c48',
          '--dsw-alias-border-l2': '#3b4e5b',
          '--dsw-alias-border-l3': '#526775',
          '--dsw-alias-brand-primary': '#88c6d8',
          '--dsw-alias-brand-text': '#88c6d8',
          '--dsw-alias-link': '#88c6d8',
          '--dsw-alias-button-primary-fill': '#3f8298',
          '--dsw-alias-label-primary': '#e5edf1',
          '--dsw-alias-label-secondary': '#afc0c9',
          '--dsw-alias-label-tertiary': '#879ca7',
          '--dsw-specific-sidebar-fill': '#111920',
        }),
      }),
    ])

    const zh = Object.freeze({
      title: '外观增强',
      summary: '护眼配色与自定义背景图片。',
      unavailable: 'Host 尚未提供外观设置，请确认插件已启用。',
      readOnly: '当前设置存储不可写，预览仍可读取。',
      preset: '颜色主题',
      'preset.default': '默认',
      'preset.eyeGreen': '护眼绿',
      'preset.warmPaper': '暖纸',
      'preset.ocean': '海蓝',
      'preset.lavender': '柔紫',
      'preset.midnight': '深夜',
      background: '背景图片',
      backgroundUrl: '图片地址',
      backgroundPlaceholder: 'https://…，或选择本地图片',
      chooseLocal: '选择本地图片',
      localSelected: '本地图片（保存在当前设备）',
      localMissing: '本设备未保存这张本地图片，请重新选择。',
      removeBackground: '移除背景',
      backgroundOpacity: '图片亮度',
      surfaceOpacity: '界面遮罩',
      blur: '模糊',
      fit: '铺放方式',
      'fit.cover': '覆盖',
      'fit.contain': '完整显示',
      'fit.stretch': '拉伸',
      'fit.tile': '平铺',
      lock: '锁屏壁纸',
      lockUrl: '图片地址',
      lockEnabled: '空闲时启用',
      lockSeconds: '空闲判定',
      lockHint: '无操作满这段时间后整屏换成这张图片，对话与侧栏被完全遮住；点击、滚动、按键或移动鼠标后快速恢复，任务运行期间不进入锁屏。',
      reset: '恢复默认',
      saving: '正在自动保存…',
      saved: '已自动保存',
      processingImage: '正在处理图片…',
      invalidImage: '请选择有效的图片文件。',
      imageTooLarge: '图片不能超过 20 MB。',
      imageStoreFailed: '本地图片保存失败，请换一张较小的图片。',
      saveFailed: '保存失败：',
    })

    const en = Object.freeze({
      title: 'Appearance Plus',
      summary: 'Eye-friendly palettes and custom image backgrounds.',
      unavailable: 'The Host has not exposed appearance settings. Check that the plugin is enabled.',
      readOnly: 'The current settings store is read-only; saved values remain visible.',
      preset: 'Color theme',
      'preset.default': 'Default',
      'preset.eyeGreen': 'Eye green',
      'preset.warmPaper': 'Warm paper',
      'preset.ocean': 'Ocean',
      'preset.lavender': 'Lavender',
      'preset.midnight': 'Midnight',
      background: 'Background image',
      backgroundUrl: 'Image URL',
      backgroundPlaceholder: 'https://… or choose a local image',
      chooseLocal: 'Choose local image',
      localSelected: 'Local image (saved on this device)',
      localMissing: 'This device has no copy of the local image. Choose it again.',
      removeBackground: 'Remove background',
      backgroundOpacity: 'Image visibility',
      surfaceOpacity: 'Surface opacity',
      blur: 'Blur',
      fit: 'Fit',
      'fit.cover': 'Cover',
      'fit.contain': 'Contain',
      'fit.stretch': 'Stretch',
      'fit.tile': 'Tile',
      lock: 'Lock screen wallpaper',
      lockUrl: 'Image URL',
      lockEnabled: 'Enable when idle',
      lockSeconds: 'Idle delay',
      lockHint: 'After this long without input the whole window becomes this image and the conversation and sidebar disappear. A click, scroll, key press, or pointer move brings them back at once, and a running task keeps the lock screen away.',
      reset: 'Restore defaults',
      saving: 'Saving automatically…',
      saved: 'Saved automatically',
      processingImage: 'Processing image…',
      invalidImage: 'Choose a valid image file.',
      imageTooLarge: 'The image must be 20 MB or smaller.',
      imageStoreFailed: 'The local image could not be saved. Try a smaller image.',
      saveFailed: 'Save failed: ',
    })

    function paletteFor(preset) {
      return PALETTES.find((palette) => palette.id === preset)
    }

    function paletteOverrides(palette) {
      const overrides = {}
      for (const [name, value] of Object.entries(palette.tokens)) {
        overrides[name] = { light: value, dark: value }
      }
      return overrides
    }

    function clamp(value, min, max) {
      const n = Number(value)
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min
    }

    function sourceFor(slot, settings, localSource) {
      let source = String(settings[SLOTS[slot].field] ?? '').trim()
      if (source === SLOTS[slot].sentinel) {
        source = localSource ?? ''
        if (source === '') source = readLocalImage(slot)
      }
      if (source === '') return ''
      const lower = source.toLowerCase()
      if (lower.startsWith('javascript:') || (lower.startsWith('data:') && !lower.startsWith('data:image/'))) return ''
      return source
    }

    function cssImage(source) {
      return 'url(' + JSON.stringify(source) + ')'
    }

    // Every token that paints an opaque surface over the wallpaper, and the
    // floating layers that must stay legible above a busy image. The colour of
    // each one is read back from the active theme, so the selected color theme
    // survives the wallpaper; only the alpha comes from the overlay slider.
    const SURFACE_TOKENS = Object.freeze([
      '--dsw-alias-bg-base',
      '--dsw-alias-bg-layer-1',
      '--dsw-alias-bg-layer-2',
      '--dsw-alias-bg-layer-3',
      '--dsw-specific-sidebar-fill',
      '--dsw-specific-input-major',
      '--dsw-alias-bg-module-platform',
      '--dsw-specific-selector',
      '--dsw-alias-bg-multi-select',
      '--dsw-alias-markdown-code-block',
      '--dsw-alias-markdown-code-block-banner',
      '--dsw-alias-markdown-inline-code',
      '--dsw-alias-markdown-tag',
      '--dsw-alias-markdown-placeholder',
    ])

    const FLOAT_TOKENS = Object.freeze([
      '--dsw-alias-bg-overlay',
      '--dsw-specific-menu',
      '--dsw-specific-tip',
    ])

    function alphaRules(tokens, colors, opacityVar) {
      return tokens.map((token) => {
        const color = colors[token]
        // A token the active theme does not define keeps its own value: an
        // unreadable colour would invalidate the declaration and leave the
        // surface unpainted.
        if (color === undefined || color === '') return ''
        return `  ${token}: color-mix(in srgb, ${color} calc(var(${opacityVar}) * 100%), transparent) !important;`
      }).filter((rule) => rule !== '').join('\n')
    }

    function createBackgroundManager() {
      const base = document.createElement('style')
      base.dataset.dshAppearancePlus = 'true'
      // Two layers: the background wallpaper behind the interface, and the lock
      // screen above it. Only the lock screen's fade factor is transitioned.
      base.textContent = `
@property ${COVER_FADE_VAR} { syntax: '<number>'; inherits: true; initial-value: 0; }
@property ${IMAGE_OPACITY_VAR} { syntax: '<number>'; inherits: true; initial-value: 0; }
@property ${SURFACE_OPACITY_VAR} { syntax: '<number>'; inherits: true; initial-value: 1; }
@property ${FLOAT_OPACITY_VAR} { syntax: '<number>'; inherits: true; initial-value: 1; }
body[data-dsh-appearance-background] {
  position: relative;
  isolation: isolate;
  background: transparent !important;
}
body[data-dsh-appearance-background]::before {
  content: '';
  position: fixed;
  inset: -36px;
  z-index: 0;
  pointer-events: none;
  background-image: var(--dsh-appearance-image);
  background-position: center;
  background-size: var(--dsh-appearance-image-size);
  background-repeat: var(--dsh-appearance-image-repeat);
  opacity: var(${IMAGE_OPACITY_VAR});
  filter: blur(var(--dsh-appearance-image-blur));
}
/* The root paints the base surface itself: the image layer sits behind it, and
   a region the application leaves unpainted would otherwise show that image at
   full strength whatever the overlay slider says. */
body[data-dsh-appearance-background] #root {
  position: relative;
  z-index: 1;
  background-color: var(--dsw-alias-bg-base) !important;
}
body[${LOCK_ATTR}] {
  ${COVER_FADE_VAR}: 0;
  transition-property: ${COVER_FADE_VAR};
  transition-duration: ${LOCK_FADE_OUT_SECONDS}s;
  transition-timing-function: ease-out;
}
body[${LOCK_ATTR}][${COVER_ATTR}] {
  ${COVER_FADE_VAR}: 1;
  transition-duration: ${LOCK_FADE_IN_SECONDS}s;
  transition-timing-function: ease-in-out;
}
body[${LOCK_ATTR}]::after {
  content: '';
  position: fixed;
  inset: -36px;
  z-index: ${COVER_Z_INDEX};
  pointer-events: none;
  background-image: var(--dsh-appearance-lock-image);
  background-position: center;
  background-size: var(--dsh-appearance-lock-image-size);
  background-repeat: var(--dsh-appearance-lock-image-repeat);
  opacity: var(${COVER_FADE_VAR});
}`
      const tokens = document.createElement('style')
      tokens.dataset.dshAppearancePlus = 'true'
      document.head.append(base, tokens)

      let backgroundSource = ''
      let lockSource = ''
      // The lock image counts as on screen only after the browser has decoded
      // it. The Desktop caption colours are cleared while this layer is what
      // the user looks at, so an image that never arrives would otherwise
      // leave the interface without its primary text and without a lock
      // screen drawn over it.
      let lockReady = false
      let lockProbe = null
      let covered = false
      let paintedListener = () => {}
      let colors = {}
      let rules = ''
      let colorRetryTimer = null
      let colorAttempts = 0
      // A late theme stylesheet arrives as a load event on its head element.
      const onHeadLoad = () => { if (Object.values(colors).includes('')) refreshColors() }
      document.head.addEventListener('load', onHeadLoad, true)

      /**
       * Read the resolved colour of every surface token from the active theme.
       * @returns token name to CSS colour, '' for a token this theme omits.
       */
      function readColors() {
        // The override sheet has to leave the cascade first, or the read returns
        // the alpha version of the very value it is about to replace.
        tokens.disabled = true
        const computed = getComputedStyle(document.body)
        const read = {}
        try {
          for (const token of SURFACE_TOKENS) read[token] = computed.getPropertyValue(token).trim()
          for (const token of FLOAT_TOKENS) read[token] = computed.getPropertyValue(token).trim()
        } finally { tokens.disabled = false }
        return read
      }

      /** Re-derive the surface sheet from the current theme and Color theme. */
      function refreshColors() {
        colors = readColors()
        // Re-armed from the read, not from the write below: an unresolved read
        // rebuilds the same text and would otherwise end the backoff after one
        // attempt.
        scheduleColorRetry()
        const surfaces = alphaRules(SURFACE_TOKENS, colors, SURFACE_OPACITY_VAR)
        const floats = alphaRules(FLOAT_TOKENS, colors, FLOAT_OPACITY_VAR)
        // One colour set serves both base palettes: a color theme carries its
        // own scheme, and the built-in palette is re-read when the scheme flips.
        // The caption rule repeats the surface selectors so it matches their
        // specificity and, being last, outranks them for the two cleared
        // variables; the bare selector covers a profile with no wallpaper.
        const next = `body[data-dsh-appearance-background]:not([data-ds-dark-theme]) {\n${surfaces}\n${floats}\n}\n`
          + `body[data-dsh-appearance-background][data-ds-dark-theme] {\n${surfaces}\n${floats}\n}\n`
          + `body[${CAPTION_ATTR}],\n`
          + `body[data-dsh-appearance-background][${CAPTION_ATTR}],\n`
          + `body[${LOCK_ATTR}][${CAPTION_ATTR}] {\n  ${CAPTION_FILL_VAR}: ${CAPTION_TRANSPARENT} !important;\n  ${CAPTION_SYMBOL_VAR}: ${CAPTION_TRANSPARENT} !important;\n}`
        if (next === rules) return
        rules = next
        tokens.textContent = next
      }

      /**
       * The plugin can be applied before the stylesheet that defines the surface
       * tokens has loaded, and every read then comes back empty — which would
       * leave the sheet without a single surface rule. Re-read on a short backoff
       * until the tokens resolve, and let a late stylesheet load settle it sooner.
       */
      function scheduleColorRetry() {
        if (colorRetryTimer !== null || colorAttempts >= COLOR_RETRY_LIMIT) return
        if (!Object.values(colors).includes('')) {
          colorAttempts = 0
          return
        }
        colorAttempts += 1
        colorRetryTimer = setTimeout(() => {
          colorRetryTimer = null
          refreshColors()
        }, COLOR_RETRY_MS)
      }

      /**
       * Place one image, or clear its layer when its source is gone.
       * @param slot - which of the two layers this image belongs to.
       * @param value - the image address, possibly a device-local sentinel.
       * @param localSource - live preview source for a device-local image.
       */
      function applyImage(slot, value, localSource) {
        const source = sourceFor(slot, value, localSource)
        const body = document.body
        if (source === '') { clearImage(slot); return }
        const lock = slot === 'lock'
        const fit = lock ? value.lockFit : value.backgroundFit
        const size = fit === 'stretch' ? '100% 100%' : fit === 'tile' ? 'auto' : fit
        const repeat = fit === 'tile' ? 'repeat' : 'no-repeat'
        const prefix = lock ? '--dsh-appearance-lock-image' : '--dsh-appearance-image'
        body.setAttribute(lock ? LOCK_ATTR : 'data-dsh-appearance-background', '')
        body.style.setProperty(prefix, cssImage(source))
        body.style.setProperty(prefix + '-size', size)
        body.style.setProperty(prefix + '-repeat', repeat)
        if (lock) {
          setLockSource(source)
          return
        }
        backgroundSource = source
        body.style.setProperty(IMAGE_OPACITY_VAR, String(clamp(value.backgroundOpacity, 0.05, 1)))
        body.style.setProperty('--dsh-appearance-image-blur', clamp(value.backgroundBlur, 0, 30) + 'px')
        const surface = clamp(value.surfaceOpacity, SURFACE_OPACITY_MIN, 1)
        body.style.setProperty(SURFACE_OPACITY_VAR, String(surface))
        body.style.setProperty(FLOAT_OPACITY_VAR, String(Math.max(surface, FLOAT_OPACITY_MIN)))
      }

      function clearImage(slot) {
        const body = document.body
        const lock = slot === 'lock'
        const prefix = lock ? '--dsh-appearance-lock-image' : '--dsh-appearance-image'
        body.removeAttribute(lock ? LOCK_ATTR : 'data-dsh-appearance-background')
        const names = [prefix, prefix + '-size', prefix + '-repeat']
        if (lock) {
          setLockSource('')
          body.removeAttribute(COVER_ATTR)
        } else {
          backgroundSource = ''
          names.push(IMAGE_OPACITY_VAR, '--dsh-appearance-image-blur', SURFACE_OPACITY_VAR, FLOAT_OPACITY_VAR)
        }
        for (const name of names) body.style.removeProperty(name)
      }

      /**
       * Adopt a lock image, or drop the layer when its address is gone. The
       * image is probed first: the layer only counts as on screen once the
       * browser can actually paint it, because the caption colours are
       * cleared from the page while the lock screen covers the window.
       * @param source - the resolved image address, '' to drop the layer.
       */
      function setLockSource(source) {
        if (lockSource === source) return
        lockSource = source
        dropLockProbe()
        setLockReady(false)
        if (source === '') return
        const probe = new Image()
        lockProbe = probe
        probe.onload = () => {
          if (lockProbe !== probe) return
          dropLockProbe()
          setLockReady(true)
        }
        // An image that fails to load keeps the layer off screen, so a broken
        // address can never blank the interface from behind.
        probe.onerror = () => { if (lockProbe === probe) dropLockProbe() }
        probe.src = source
      }

      /** Retire the probe of a superseded image, so only the newest one counts. */
      function dropLockProbe() {
        if (lockProbe === null) return
        lockProbe.onload = null
        lockProbe.onerror = null
        lockProbe = null
      }

      /**
       * Publish a change in what the lock layer paints. The image arriving is
       * the one change the idle clock cannot see.
       * @param next - whether the decoded image is available.
       */
      function setLockReady(next) {
        if (lockReady === next) return
        lockReady = next
        syncCover()
        paintedListener(isCovered())
      }

      /** Whether the lock layer owns the window right now. */
      function isCovered() { return lockSource !== '' && lockReady && covered }

      function syncCover() {
        const body = document.body
        if (isCovered()) body.setAttribute(COVER_ATTR, '')
        else body.removeAttribute(COVER_ATTR)
      }

      refreshColors()

      return {
        /** Place both images from one settings value; the layer owns the rest. */
        apply(settings, sources) {
          // The client can apply before the shell stylesheets are parsed; a
          // later theme change refills the gaps, and this retries until it does.
          if (Object.values(colors).includes('')) refreshColors()
          applyImage('background', settings, sources.background)
          applyImage('lock', settings, sources.lock)
          syncCover()
        },
        /** Raise or drop the lock screen over the interface. */
        setCover(next) {
          if (covered === next) return
          covered = next
          syncCover()
        },
        /** Whether the opaque lock screen is the layer the user is looking at. */
        isCovered,
        /**
         * Register the callback for the painted state the layer changes on its
         * own, which is the lock image finishing or failing to load.
         * @param listener - receives whether the layer now owns the window.
         */
        onPaintedChange(listener) { paintedListener = listener },
        refreshColors,
        dispose() {
          if (colorRetryTimer !== null) clearTimeout(colorRetryTimer)
          document.head.removeEventListener('load', onHeadLoad, true)
          paintedListener = () => {}
          clearImage('background')
          clearImage('lock')
          dropLockProbe()
          base.remove()
          tokens.remove()
        },
      }
    }

    function readLocalImage(slot) {
      try {
        const stored = localStorage.getItem(SLOTS[slot].imageKey) ?? ''
        // Record that this origin held an image, so an emptied store can be
        // told apart from an origin that never received one.
        if (stored !== '') localStorage.setItem(SLOTS[slot].seenKey, '1')
        return stored
      } catch { return '' }
    }

    /** Whether this origin ever stored a local image, so its absence means removal. */
    function localImageEverSeen(slot) {
      try { return localStorage.getItem(SLOTS[slot].seenKey) !== null }
      catch { return false }
    }

    function writeLocalImage(slot, dataUrl) {
      try {
        localStorage.setItem(SLOTS[slot].imageKey, dataUrl)
        localStorage.setItem(SLOTS[slot].seenKey, '1')
      }
      catch { throw new Error('image-store-failed') }
    }

    function deleteLocalImage(slot) {
      try { localStorage.removeItem(SLOTS[slot].imageKey) } catch {}
    }

    function createController(ctx, form, background) {
      let state = {
        status: 'loading', value: DEFAULTS, writable: false, revision: undefined,
        saving: false, previewing: false, error: null,
        localMissing: { background: false, lock: false },
      }
      let current = DEFAULTS
      let saved = DEFAULTS
      let previewing = false
      let saveGeneration = 0
      let saveTail = Promise.resolve()
      let clearingMissingLocalImage = false
      let disposePalette
      const persistedLocalSource = { background: readLocalImage('background'), lock: readLocalImage('lock') }
      // Lock-screen state: entered after the idle delay with no Agent running.
      let busy = false
      let pageOpen = false
      let lastActivity = Date.now()
      let idleElapsed = false
      // Last pointer position, to tell a real move from an engine re-emission.
      let lastPointer = null
      // Pending caption hide, so a short lock never clears the caption colours.
      let captionTimer = null
      const store = createSnapshotStore(state)

      function publish(patch) {
        state = { ...state, ...patch }
        store.set(state)
      }

      function idleDelayMs() {
        return clamp(current.lockSeconds, IDLE_SECONDS_MIN, IDLE_SECONDS_MAX) * 1000
      }

      /**
       * Whether the lock screen belongs on screen right now. The layer owns the
       * last value, and the settings page is the one place it must stay away so
       * the interface being configured stays reachable. The window itself is
       * never resized or made fullscreen: the lock screen owns page pixels, and
       * the caption it hides is repainted by the shell from two page variables.
       */
      function refreshCover() {
        const cover = current.lockEnabled === true && !pageOpen && !busy && idleElapsed
        background.setCover(cover)
        // The caption follows the painted layer, not the idle clock: with no
        // lock image, or one that never loads, there is no lock screen to hide
        // it behind, and clearing it would blank the interface's own text.
        syncCaption(background.isCovered())
      }

      /**
       * Hide the Desktop window caption once the lock screen has covered the
       * window, and restore it before the interface comes back, so the label
       * colour is never seen as transparent.
       * @param painted - whether the lock screen is the layer on screen now.
       */
      function syncCaption(painted) {
        if (!DESKTOP_DOCUMENT) return
        if (captionTimer !== null) {
          clearTimeout(captionTimer)
          captionTimer = null
        }
        if (!painted) { showCaption(); return }
        captionTimer = setTimeout(() => {
          captionTimer = null
          // The image can fail, and the idle state can turn over, while the
          // fade-in this wait covers is still running.
          if (background.isCovered()) hideCaption()
        }, CAPTION_HIDE_DELAY_MS)
      }

      // The lock image arriving after the idle clock already asked for the
      // cover is the one painted-state change the controller cannot see.
      background.onPaintedChange(syncCaption)

      /**
       * The shell re-reads both caption colours when body's style attribute
       * changes. This plugin-owned property is that signal: the cleared values
       * come from the stylesheet, and the theme's own tokens — which the
       * presenter writes inline on body — are never touched.
       */
      function hideCaption() {
        const body = document.body
        body.setAttribute(CAPTION_ATTR, '')
        body.style.setProperty(CAPTION_STATE_VAR, '1')
      }

      function showCaption() {
        const body = document.body
        body.removeAttribute(CAPTION_ATTR)
        body.style.removeProperty(CAPTION_STATE_VAR)
      }

      function openPage() {
        if (pageOpen) return
        pageOpen = true
        refreshCover()
      }

      function closePage() {
        if (!pageOpen) return
        pageOpen = false
        refreshCover()
      }

      function setBusy(next) {
        if (busy === next) return
        busy = next
        refreshCover()
      }

      function noteActivity() {
        lastActivity = Date.now()
        if (!idleElapsed) return
        idleElapsed = false
        refreshCover()
      }

      /** An opaque lock screen consumes the click that dismisses it. */
      function notePointerDown(event) {
        if (background.isCovered()) {
          event.stopPropagation()
          event.preventDefault()
        }
        noteActivity()
      }

      /**
       * A pointer move counts only when the pointer actually moved: resizing or
       * moving the window makes the engine re-emit a move at the position the
       * pointer already had, which would otherwise retire the lock screen.
       */
      function notePointerMove(event) {
        const position = `${event.screenX},${event.screenY}`
        if (position === lastPointer) return
        lastPointer = position
        noteActivity()
      }

      const idleTimer = setInterval(() => {
        const elapsed = Date.now() - lastActivity >= idleDelayMs()
        if (elapsed === idleElapsed) return
        idleElapsed = elapsed
        refreshCover()
      }, IDLE_TICK_MS)

      window.addEventListener('pointerdown', notePointerDown, { capture: true })
      window.addEventListener('pointermove', notePointerMove, { capture: true, passive: true })
      for (const type of ACTIVITY_EVENTS) {
        window.addEventListener(type, noteActivity, { capture: true, passive: true })
      }

      function applySettings(value, localSources = {}) {
        const previousPreset = current.preset
        current = value
        const palette = paletteFor(value.preset)
        if (palette !== undefined) {
          // Registered theme ids are intentionally not durable in ui-theme.
          // Keep the built-in light/dark preference as the durable base and
          // place this plugin's colors in its independently persistent layer.
          const previousDispose = disposePalette
          disposePalette = ctx.theme.overrideTokens(NS, paletteOverrides(palette))
          previousDispose?.()
          if (ctx.theme.getTheme().preference !== palette.scheme) {
            ctx.theme.setTheme(palette.scheme)
          }
        } else {
          disposePalette?.()
          disposePalette = undefined
          if (previousPreset !== 'default') ctx.theme.setTheme('system')
        }
        background.apply(value, localSources)
        refreshCover()
      }

      function derive() {
        const snapshot = form.getSnapshot()
        let value = snapshot.value === undefined ? DEFAULTS : { ...DEFAULTS, ...snapshot.value }
        const localMissing = { background: false, lock: false }
        const retired = {}
        for (const slot of SLOT_NAMES) {
          const field = SLOTS[slot].field
          const missing = !previewing && value[field] === SLOTS[slot].sentinel && persistedLocalSource[slot] === ''
          // Only the origin that stored an image may retire the profile's
          // sentinel; writing from any other origin would erase an image the
          // storing origin still holds, because the profile config is shared
          // while localStorage is per origin.
          if (missing && localImageEverSeen(slot)) {
            value = { ...value, [field]: '' }
            retired[field] = ''
          } else {
            localMissing[slot] = missing
          }
        }
        if (Object.keys(retired).length > 0 && !clearingMissingLocalImage) {
          clearingMissingLocalImage = true
          void form.mutate(Object.entries(retired).map(([field, next]) => ({ op: 'set', path: [field], value: next })))
            .finally(() => { clearingMissingLocalImage = false })
        }
        saved = value
        publish({
          status: snapshot.status,
          value,
          writable: snapshot.writable,
          revision: snapshot.revision,
          localMissing,
        })
        if (snapshot.value !== undefined && !previewing) applySettings(value)
      }

      const unsubscribe = form.subscribe(derive)
      derive()

      return {
        openPage,
        closePage,
        setBusy,
        inject: () => ({
          hooks: { appearance: store },
          open: openPage,
          close: closePage,
          preview: (draft, localSources) => {
            previewing = true
            publish({ previewing: true, error: null })
            applySettings({ ...DEFAULTS, ...draft }, localSources)
          },
          restore: () => {
            previewing = false
            publish({ previewing: false })
            applySettings(saved)
          },
          save: (draft, localDataUrls = {}) => {
            const generation = ++saveGeneration
            publish({ saving: true, error: null })
            const operation = async () => {
              const previous = { ...persistedLocalSource }
              const replaced = []
              try {
                for (const slot of SLOT_NAMES) {
                  const field = SLOTS[slot].field
                  const dataUrl = localDataUrls[slot]
                  if (draft[field] === SLOTS[slot].sentinel && typeof dataUrl === 'string' && dataUrl !== '') {
                    writeLocalImage(slot, dataUrl)
                    persistedLocalSource[slot] = dataUrl
                    replaced.push(slot)
                  } else if (draft[field] === SLOTS[slot].sentinel && persistedLocalSource[slot] === '') {
                    throw new Error('image-store-failed')
                  }
                }
                const fields = Object.keys(DEFAULTS)
                await form.mutate(fields.map((field) => ({
                  op: 'set', path: [field], value: draft[field],
                })))
                for (const slot of SLOT_NAMES) {
                  if (draft[SLOTS[slot].field] === SLOTS[slot].sentinel) continue
                  deleteLocalImage(slot)
                  persistedLocalSource[slot] = ''
                }
                if (generation === saveGeneration) {
                  saved = { ...DEFAULTS, ...draft }
                  previewing = false
                  applySettings(saved)
                  publish({ saving: false, previewing: false })
                }
                return { ok: true }
              } catch (error) {
                for (const slot of replaced) {
                  if (previous[slot] === '') deleteLocalImage(slot)
                  else {
                    try { writeLocalImage(slot, previous[slot]) } catch {}
                  }
                  persistedLocalSource[slot] = previous[slot]
                }
                if (replaced.length > 0 && generation === saveGeneration) applySettings(saved)
                const message = error instanceof Error ? error.message : String(error)
                if (generation === saveGeneration) publish({ saving: false, error: message })
                return { ok: false, error: message }
              }
            }
            const result = saveTail.then(operation, operation)
            saveTail = result.then(() => {}, () => {})
            return result
          },
        }),
        dispose: () => {
          unsubscribe()
          clearInterval(idleTimer)
          if (captionTimer !== null) clearTimeout(captionTimer)
          background.onPaintedChange(() => {})
          showCaption()
          window.removeEventListener('pointerdown', notePointerDown, { capture: true })
          window.removeEventListener('pointermove', notePointerMove, { capture: true })
          for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, noteActivity, { capture: true })
          disposePalette?.()
        },
      }
    }

    function cardStyle() {
      return {
        display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '720px',
        color: 'var(--dsw-alias-label-primary)', fontSize: '13px',
      }
    }

    function sectionStyle() {
      return {
        display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px',
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '12px',
        background: 'var(--dsw-alias-bg-layer-1)',
      }
    }

    function buttonStyle(primary, disabled) {
      return {
        minHeight: '34px', padding: '7px 14px', borderRadius: '9px', cursor: disabled ? 'not-allowed' : 'pointer',
        border: primary ? 'none' : '1px solid var(--dsw-alias-border-l2)',
        background: primary ? 'var(--dsw-alias-button-primary-fill)' : 'var(--dsw-alias-bg-layer-2)',
        color: primary ? 'var(--dsw-alias-label-primary-foreground)' : 'var(--dsw-alias-label-primary)',
        opacity: disabled ? 0.55 : 1,
      }
    }

    function RangeRow({ label, value, min, max, step, suffix, onChange, disabled }) {
      return h('label', { style: { display: 'grid', gridTemplateColumns: '130px 1fr 58px', gap: '12px', alignItems: 'center' } },
        h('span', null, label),
        h('input', { type: 'range', value, min, max, step, disabled, onChange }),
        h('span', { style: { textAlign: 'right', color: 'var(--dsw-alias-label-secondary)' } }, value + suffix),
      )
    }

    function optimizeLocalImage(file, objectUrl) {
      return new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => {
          try {
            const canvas = document.createElement('canvas')
            const context = canvas.getContext('2d')
            if (context === null) throw new Error('image-store-failed')
            let scale = Math.min(1, 1920 / image.naturalWidth, 1080 / image.naturalHeight)
            const qualities = [0.84, 0.72, 0.6, 0.48]
            for (let resize = 0; resize < 7; resize += 1) {
              canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
              canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
              context.clearRect(0, 0, canvas.width, canvas.height)
              context.drawImage(image, 0, 0, canvas.width, canvas.height)
              for (const quality of qualities) {
                const dataUrl = canvas.toDataURL('image/webp', quality)
                if (dataUrl.length <= LOCAL_IMAGE_MAX_DATA_URL) { resolve(dataUrl); return }
              }
              scale *= 0.78
            }
            reject(new Error('image-store-failed'))
          } catch (error) { reject(error) }
        }
        image.onerror = () => reject(new Error('invalid-image'))
        image.src = objectUrl
      })
    }

    function AppearancePage(props) {
      const state = props.useAppearance((value) => value)
      const [draft, setDraft] = React.useState(state.value)
      const [notice, setNotice] = React.useState('')
      const [processingImage, setProcessingImage] = React.useState(false)
      // One live preview URL and one optimised data URL per image slot.
      const localPreviewUrlsRef = React.useRef({})
      const localDataUrlsRef = React.useRef({})
      const draftRef = React.useRef(state.value)
      const pendingSaveRef = React.useRef(null)
      const saveTimerRef = React.useRef(null)
      const saveRequestRef = React.useRef(0)

      function localSources() {
        return { ...localPreviewUrlsRef.current }
      }

      function clearLocalPreview(slot) {
        const slots = slot === undefined ? SLOT_NAMES : [slot]
        for (const name of slots) {
          const url = localPreviewUrlsRef.current[name]
          if (typeof url === 'string' && url !== '') URL.revokeObjectURL(url)
          delete localPreviewUrlsRef.current[name]
          delete localDataUrlsRef.current[name]
        }
      }

      React.useEffect(() => {
        if (state.previewing || state.saving) return
        draftRef.current = state.value
        setDraft(state.value)
        clearLocalPreview()
      }, [state.revision, state.previewing, state.saving])

      React.useEffect(() => {
        // The page is the images' preview: keep them on screen while it is
        // mounted, and keep the lock screen away whatever the idle clock says.
        props.open()
        return () => {
          props.close()
          if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current)
          if (pendingSaveRef.current !== null) {
            const pending = pendingSaveRef.current
            pendingSaveRef.current = null
            void props.save(pending.draft, pending.localDataUrls)
          }
          clearLocalPreview()
          props.restore()
        }
      }, [])

      if (state.status === 'unavailable') {
        return h('div', { style: cardStyle() }, props.t('unavailable'))
      }

      const disabled = !state.writable || processingImage

      function flushSave() {
        if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
        const pending = pendingSaveRef.current
        pendingSaveRef.current = null
        if (pending === null) return
        const request = ++saveRequestRef.current
        void props.save(pending.draft, pending.localDataUrls).then((result) => {
          if (request !== saveRequestRef.current) return
          setNotice(result.ok ? props.t('saved')
            : result.error === 'image-store-failed' ? props.t('imageStoreFailed') : props.t('saveFailed') + result.error)
        })
      }

      function apply(next, delay) {
        draftRef.current = next
        setDraft(next)
        props.preview(next, localSources())
        setNotice('')
        pendingSaveRef.current = { draft: next, localDataUrls: { ...localDataUrlsRef.current } }
        if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current)
        if (delay === 0) flushSave()
        else saveTimerRef.current = setTimeout(flushSave, delay)
      }

      function update(field, value, delay = 0) {
        apply({ ...draftRef.current, [field]: value }, delay)
      }

      async function chooseLocal(slot, event) {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file === undefined) return
        setNotice('')
        if (!file.type.startsWith('image/')) {
          setNotice(props.t('invalidImage'))
          return
        }
        if (file.size > 20 * 1024 * 1024) {
          setNotice(props.t('imageTooLarge'))
          return
        }
        clearLocalPreview(slot)
        const objectUrl = URL.createObjectURL(file)
        localPreviewUrlsRef.current[slot] = objectUrl
        const field = SLOTS[slot].field
        const previous = draftRef.current
        const next = { ...previous, [field]: SLOTS[slot].sentinel }
        draftRef.current = next
        setDraft(next)
        props.preview(next, localSources())
        setProcessingImage(true)
        try {
          const dataUrl = await optimizeLocalImage(file, objectUrl)
          if (localPreviewUrlsRef.current[slot] !== objectUrl) return
          localDataUrlsRef.current[slot] = dataUrl
          apply(next, 0)
        } catch (error) {
          if (localPreviewUrlsRef.current[slot] !== objectUrl) return
          clearLocalPreview(slot)
          draftRef.current = previous
          setDraft(previous)
          props.preview(previous, localSources())
          const code = error instanceof Error ? error.message : ''
          setNotice(code === 'image-store-failed' ? props.t('imageStoreFailed') : props.t('invalidImage'))
        } finally { setProcessingImage(false) }
      }

      /** The address row and the local-image buttons shared by both image slots. */
      function imagePicker(slot) {
        const field = SLOTS[slot].field
        const local = draft[field] === SLOTS[slot].sentinel
        return [
          h('label', { key: 'url', style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
            h('span', null, props.t(slot === 'lock' ? 'lockUrl' : 'backgroundUrl')),
            h('input', {
              type: local ? 'text' : 'url', disabled,
              readOnly: local,
              value: local
                ? props.t(state.localMissing[slot] ? 'localMissing' : 'localSelected')
                : draft[field],
              placeholder: props.t('backgroundPlaceholder'),
              onChange: (event) => { clearLocalPreview(slot); update(field, event.target.value, 350) },
              style: { height: '36px', boxSizing: 'border-box', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)' },
            }),
          ),
          h('div', { key: 'buttons', style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            h('label', { style: buttonStyle(false, disabled) },
              props.t('chooseLocal'),
              h('input', { type: 'file', accept: 'image/*', disabled, onChange: (event) => chooseLocal(slot, event), style: { display: 'none' } }),
            ),
            h('button', { type: 'button', disabled, onClick: () => { clearLocalPreview(slot); update(field, '') }, style: buttonStyle(false, disabled) }, props.t('removeBackground')),
          ),
        ]
      }

      function fitRow(field, value) {
        return h('label', { style: { display: 'grid', gridTemplateColumns: '130px 1fr', gap: '12px', alignItems: 'center' } },
          h('span', null, props.t('fit')),
          h('select', {
            value, disabled, onChange: (event) => update(field, event.target.value),
            style: { height: '34px', padding: '5px 9px', borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)' },
          }, ...['cover', 'contain', 'stretch', 'tile'].map((fit) => h('option', { key: fit, value: fit }, props.t('fit.' + fit)))),
        )
      }

      const presetButtons = [
        { id: 'default', labelKey: 'preset.default', preview: 'linear-gradient(135deg,#fff 50%,#202124 50%)' },
        ...PALETTES,
      ].map((preset) => {
        const selected = draft.preset === preset.id
        return h('button', {
          key: preset.id, type: 'button', disabled,
          'aria-pressed': selected,
          onClick: () => update('preset', preset.id),
          style: {
            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 11px', borderRadius: '9px', cursor: disabled ? 'not-allowed' : 'pointer',
            border: selected ? '2px solid var(--dsw-alias-brand-primary)' : '1px solid var(--dsw-alias-border-l2)',
            background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
          },
        },
        h('span', { style: { width: '18px', height: '18px', borderRadius: '6px', background: preset.preview, border: '1px solid var(--dsw-alias-border-l2)' } }),
        props.t(preset.labelKey))
      })

      return h('div', { style: cardStyle() },
        !state.writable && h('div', { style: { color: 'var(--dsw-alias-state-warn-primary)' } }, props.t('readOnly')),
        h('section', { style: sectionStyle() },
          h('strong', { style: { fontSize: '14px' } }, props.t('preset')),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } }, ...presetButtons),
        ),
        h('section', { style: sectionStyle() },
          h('strong', { style: { fontSize: '14px' } }, props.t('background')),
          ...imagePicker('background'),
          h(RangeRow, { label: props.t('backgroundOpacity'), value: Math.round(draft.backgroundOpacity * 100), min: 5, max: 100, step: 1, suffix: '%', disabled, onChange: (event) => update('backgroundOpacity', Number(event.target.value) / 100, 150) }),
          h(RangeRow, { label: props.t('surfaceOpacity'), value: Math.round(draft.surfaceOpacity * 100), min: Math.round(SURFACE_OPACITY_MIN * 100), max: 100, step: 1, suffix: '%', disabled, onChange: (event) => update('surfaceOpacity', Number(event.target.value) / 100, 150) }),
          h(RangeRow, { label: props.t('blur'), value: draft.backgroundBlur, min: 0, max: 30, step: 1, suffix: 'px', disabled, onChange: (event) => update('backgroundBlur', Number(event.target.value), 150) }),
          fitRow('backgroundFit', draft.backgroundFit),
        ),
        h('section', { style: sectionStyle() },
          h('strong', { style: { fontSize: '14px' } }, props.t('lock')),
          ...imagePicker('lock'),
          fitRow('lockFit', draft.lockFit),
          h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            h('input', {
              type: 'checkbox', checked: draft.lockEnabled === true, disabled,
              onChange: (event) => update('lockEnabled', event.target.checked),
            }),
            h('span', null, props.t('lockEnabled')),
          ),
          h(RangeRow, {
            label: props.t('lockSeconds'), value: draft.lockSeconds,
            min: IDLE_SECONDS_MIN, max: IDLE_SECONDS_MAX, step: 1, suffix: 's',
            disabled: disabled || draft.lockEnabled !== true,
            onChange: (event) => update('lockSeconds', Number(event.target.value), 200),
          }),
          h('span', { style: { color: 'var(--dsw-alias-label-secondary)', lineHeight: '18px' } }, props.t('lockHint')),
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
          h('button', { type: 'button', disabled, onClick: () => { clearLocalPreview(); apply({ ...DEFAULTS }, 0) }, style: buttonStyle(false, disabled) }, props.t('reset')),
          processingImage && h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, props.t('processingImage')),
          state.saving && h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, props.t('saving')),
          (state.localMissing.background || state.localMissing.lock) && h('span', { style: { color: 'var(--dsw-alias-state-warn-primary)' } }, props.t('localMissing')),
          notice && h('span', { style: { color: notice === props.t('saved') ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)' } }, notice),
          state.error && h('span', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, state.error),
        ),
      )
    }

    function AppearanceCard(props) {
      if (props.view === 'summary') return h('span', null, props.t('summary'))
      return h(AppearancePage, props)
    }

    const plugin = {
      name: 'appearance-plus-client',
      inject: ['slots', 'configForms', 'theme', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'appearance-plus: dictionaries')
        const background = createBackgroundManager()
        ctx.effect(() => () => { background.dispose() }, 'appearance-plus: background layer')
        // A Color theme arrives as a theme token override, so the surface
        // colours the wallpaper derives from it change on the same event.
        ctx.effect(() => ctx.on('theme/change', () => { background.refreshColors() }), 'appearance-plus: surface colours')
        const form = ctx.configForms.get(NS)
        const controller = createController(ctx, form, background)
        // Optional: without the sessions service the wallpaper never treats a
        // running Agent as a reason to stay hidden.
        ctx.inject(['sessions'], (sessionCtx) => {
          const list = sessionCtx.sessions.list
          const update = () => {
            const byId = list.getSnapshot().byId
            let running = false
            for (const id of Object.keys(byId)) {
              if (byId[id].running === true) { running = true; break }
            }
            controller.setBusy(running)
          }
          const unsubscribe = list.subscribe(update)
          update()
          ctx.effect(() => unsubscribe, 'appearance-plus: session activity')
        })
        const t = ctx.locale.bind(NS)
        ctx.slots.inject('plugins.item', () => ctx.slots.register({
          name: 'plugins.item',
          id: NS,
          order: 60,
          label: () => t('title'),
          locale: NS,
          inject: () => controller.inject(),
        }, AppearanceCard))
        ctx.effect(() => () => { controller.dispose() }, 'appearance-plus: controller')
      },
    }

    module.exports = plugin
    return module.exports
  },
})
