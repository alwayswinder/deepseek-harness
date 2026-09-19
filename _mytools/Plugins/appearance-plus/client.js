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
    const LOCAL_IMAGE = 'local://appearance-plus-background'
    const LOCAL_IMAGE_KEY = 'dsh.appearance-plus.local-image.v1'
    const LOCAL_IMAGE_SEEN_KEY = 'dsh.appearance-plus.local-image.seen.v1'
    const LOCAL_IMAGE_MAX_DATA_URL = 1_800_000

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
    })

    const PALETTES = Object.freeze([
      Object.freeze({
        id: 'eye-green', labelKey: 'preset.eyeGreen', scheme: 'light', preview: '#dfeeda',
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
          '--dsw-specific-sidebar-fill': '#dcebd5',
        }),
      }),
      Object.freeze({
        id: 'warm-paper', labelKey: 'preset.warmPaper', scheme: 'light', preview: '#eadfca',
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
          '--dsw-specific-sidebar-fill': '#eadfca',
        }),
      }),
      Object.freeze({
        id: 'ocean', labelKey: 'preset.ocean', scheme: 'light', preview: '#d5e9ef',
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
          '--dsw-specific-sidebar-fill': '#d5e9ef',
        }),
      }),
      Object.freeze({
        id: 'lavender', labelKey: 'preset.lavender', scheme: 'light', preview: '#e5def0',
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
          '--dsw-specific-sidebar-fill': '#e5def0',
        }),
      }),
      Object.freeze({
        id: 'midnight', labelKey: 'preset.midnight', scheme: 'dark', preview: '#263746',
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
          '--dsw-specific-sidebar-fill': '#182631',
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

    function sourceFor(settings, localSource) {
      let source = settings.backgroundUrl.trim()
      if (source === LOCAL_IMAGE) {
        source = localSource ?? ''
        if (source === '') {
          try { source = localStorage.getItem(LOCAL_IMAGE_KEY) ?? '' } catch { source = '' }
        }
      }
      if (source === '') return ''
      const lower = source.toLowerCase()
      if (lower.startsWith('javascript:') || (lower.startsWith('data:') && !lower.startsWith('data:image/'))) return ''
      return source
    }

    function cssImage(source) {
      return 'url(' + JSON.stringify(source) + ')'
    }

    function createBackgroundManager() {
      const style = document.createElement('style')
      style.dataset.dshAppearancePlus = 'true'
      style.textContent = `
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
  opacity: var(--dsh-appearance-image-opacity);
  filter: blur(var(--dsh-appearance-image-blur));
}
body[data-dsh-appearance-background] #root {
  position: relative;
  z-index: 1;
  background: transparent !important;
}
body[data-dsh-appearance-background]:not([data-ds-dark-theme]) {
  --dsw-alias-bg-base: rgb(248 251 247 / var(--dsh-appearance-surface-opacity)) !important;
  --dsw-alias-bg-layer-1: rgb(255 255 255 / var(--dsh-appearance-surface-opacity)) !important;
  --dsw-alias-bg-layer-2: rgb(243 247 241 / var(--dsh-appearance-surface-opacity)) !important;
  --dsw-alias-bg-layer-3: rgb(238 244 236 / var(--dsh-appearance-surface-opacity)) !important;
  --dsw-alias-bg-overlay: rgb(255 255 255 / 0.94) !important;
  --dsw-specific-sidebar-fill: rgb(235 242 232 / var(--dsh-appearance-surface-opacity)) !important;
}
body[data-dsh-appearance-background][data-ds-dark-theme] {
  --dsw-alias-bg-base: rgb(16 21 25 / var(--dsh-appearance-surface-opacity)) !important;
  --dsw-alias-bg-layer-1: rgb(24 31 36 / var(--dsh-appearance-surface-opacity)) !important;
  --dsw-alias-bg-layer-2: rgb(31 40 46 / var(--dsh-appearance-surface-opacity)) !important;
  --dsw-alias-bg-layer-3: rgb(38 48 55 / var(--dsh-appearance-surface-opacity)) !important;
  --dsw-alias-bg-overlay: rgb(29 37 43 / 0.95) !important;
  --dsw-specific-sidebar-fill: rgb(22 30 35 / var(--dsh-appearance-surface-opacity)) !important;
}`
      document.head.append(style)

      function clear() {
        const body = document.body
        body.removeAttribute('data-dsh-appearance-background')
        for (const name of [
          '--dsh-appearance-image', '--dsh-appearance-image-size', '--dsh-appearance-image-repeat',
          '--dsh-appearance-image-opacity', '--dsh-appearance-image-blur', '--dsh-appearance-surface-opacity',
        ]) body.style.removeProperty(name)
      }

      return {
        apply(settings, localSource) {
          const source = sourceFor(settings, localSource)
          if (source === '') { clear(); return }
          const fit = settings.backgroundFit
          const size = fit === 'stretch' ? '100% 100%' : fit === 'tile' ? 'auto' : fit
          const repeat = fit === 'tile' ? 'repeat' : 'no-repeat'
          const body = document.body
          body.setAttribute('data-dsh-appearance-background', '')
          body.style.setProperty('--dsh-appearance-image', cssImage(source))
          body.style.setProperty('--dsh-appearance-image-size', size)
          body.style.setProperty('--dsh-appearance-image-repeat', repeat)
          body.style.setProperty('--dsh-appearance-image-opacity', String(clamp(settings.backgroundOpacity, 0.05, 1)))
          body.style.setProperty('--dsh-appearance-image-blur', clamp(settings.backgroundBlur, 0, 30) + 'px')
          body.style.setProperty('--dsh-appearance-surface-opacity', String(clamp(settings.surfaceOpacity, 0.45, 1)))
        },
        dispose() { clear(); style.remove() },
      }
    }

    function readLocalImage() {
      try {
        const stored = localStorage.getItem(LOCAL_IMAGE_KEY) ?? ''
        // Record that this origin held an image, so an emptied store can be
        // told apart from an origin that never received one.
        if (stored !== '') localStorage.setItem(LOCAL_IMAGE_SEEN_KEY, '1')
        return stored
      } catch { return '' }
    }

    /** Whether this origin ever stored a local image, so its absence means removal. */
    function localImageEverSeen() {
      try { return localStorage.getItem(LOCAL_IMAGE_SEEN_KEY) !== null }
      catch { return false }
    }

    function writeLocalImage(dataUrl) {
      try {
        localStorage.setItem(LOCAL_IMAGE_KEY, dataUrl)
        localStorage.setItem(LOCAL_IMAGE_SEEN_KEY, '1')
      }
      catch { throw new Error('image-store-failed') }
    }

    function deleteLocalImage() {
      try { localStorage.removeItem(LOCAL_IMAGE_KEY) } catch {}
    }

    function createController(ctx, scope, background) {
      let state = {
        status: 'loading', value: DEFAULTS, writable: false, revision: undefined,
        saving: false, previewing: false, error: null, localMissing: false,
      }
      let current = DEFAULTS
      let saved = DEFAULTS
      let previewing = false
      let saveGeneration = 0
      let saveTail = Promise.resolve()
      let clearingMissingLocalImage = false
      let disposePalette
      let persistedLocalSource = readLocalImage()
      const store = createSnapshotStore(state)

      function publish(patch) {
        state = { ...state, ...patch }
        store.set(state)
      }

      function applySettings(value, localSource) {
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
        background.apply(value, value.backgroundUrl === LOCAL_IMAGE ? localSource ?? persistedLocalSource : undefined)
      }

      function derive() {
        const snapshot = scope.getSnapshot()
        let value = snapshot.value === undefined ? DEFAULTS : { ...DEFAULTS, ...snapshot.value }
        const missing = !previewing && value.backgroundUrl === LOCAL_IMAGE && persistedLocalSource === ''
        // Only the origin that stored an image may retire the profile's
        // sentinel; writing from any other origin would erase a background the
        // storing origin still holds, because the settings document is shared
        // while localStorage is per origin.
        const retirable = missing && localImageEverSeen()
        if (retirable) {
          value = { ...value, backgroundUrl: '' }
          if (!clearingMissingLocalImage) {
            clearingMissingLocalImage = true
            void scope.set('backgroundUrl', '').finally(() => { clearingMissingLocalImage = false })
          }
        }
        saved = value
        publish({
          status: snapshot.status,
          value,
          writable: snapshot.writable,
          revision: snapshot.revision,
          localMissing: missing && !retirable,
        })
        if (snapshot.value !== undefined && !previewing) applySettings(value)
      }

      const unsubscribe = scope.subscribe(derive)
      derive()

      return {
        inject: () => ({
          hooks: { appearance: store },
          preview: (draft, localSource) => {
            previewing = true
            publish({ previewing: true, error: null })
            applySettings({ ...DEFAULTS, ...draft }, localSource)
          },
          restore: () => {
            previewing = false
            publish({ previewing: false })
            applySettings(saved)
          },
          save: (draft, localDataUrl) => {
            const generation = ++saveGeneration
            publish({ saving: true, error: null })
            const operation = async () => {
              const previousLocalSource = persistedLocalSource
              let replacedLocalSource = false
              try {
                if (draft.backgroundUrl === LOCAL_IMAGE && typeof localDataUrl === 'string' && localDataUrl !== '') {
                  writeLocalImage(localDataUrl)
                  persistedLocalSource = localDataUrl
                  replacedLocalSource = true
                } else if (draft.backgroundUrl === LOCAL_IMAGE && persistedLocalSource === '') {
                  throw new Error('image-store-failed')
                }
                const fields = Object.keys(DEFAULTS)
                await scope.mutate(fields.map((field) => ({
                  op: 'set', path: [field], value: draft[field],
                })))
                if (draft.backgroundUrl !== LOCAL_IMAGE) {
                  deleteLocalImage()
                  persistedLocalSource = ''
                }
                if (generation === saveGeneration) {
                  saved = { ...DEFAULTS, ...draft }
                  previewing = false
                  applySettings(saved)
                  publish({ saving: false, previewing: false })
                }
                return { ok: true }
              } catch (error) {
                if (replacedLocalSource) {
                  if (previousLocalSource === '') deleteLocalImage()
                  else {
                    try { writeLocalImage(previousLocalSource) } catch {}
                  }
                  persistedLocalSource = previousLocalSource
                  if (generation === saveGeneration) applySettings(saved)
                }
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
      const localPreviewUrlRef = React.useRef('')
      const localDataUrlRef = React.useRef(null)
      const draftRef = React.useRef(state.value)
      const pendingSaveRef = React.useRef(null)
      const saveTimerRef = React.useRef(null)
      const saveRequestRef = React.useRef(0)

      function clearLocalPreview() {
        if (localPreviewUrlRef.current !== '') URL.revokeObjectURL(localPreviewUrlRef.current)
        localPreviewUrlRef.current = ''
        localDataUrlRef.current = null
      }

      React.useEffect(() => {
        if (state.previewing || state.saving) return
        draftRef.current = state.value
        setDraft(state.value)
        clearLocalPreview()
      }, [state.revision, state.previewing, state.saving])

      React.useEffect(() => () => {
        if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current)
        if (pendingSaveRef.current !== null) {
          const pending = pendingSaveRef.current
          pendingSaveRef.current = null
          void props.save(pending.draft, pending.localDataUrl)
        }
        if (localPreviewUrlRef.current !== '') URL.revokeObjectURL(localPreviewUrlRef.current)
        props.restore()
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
        void props.save(pending.draft, pending.localDataUrl).then((result) => {
          if (request !== saveRequestRef.current) return
          setNotice(result.ok ? props.t('saved')
            : result.error === 'image-store-failed' ? props.t('imageStoreFailed') : props.t('saveFailed') + result.error)
        })
      }

      function apply(next, localSource, localDataUrl, delay) {
        draftRef.current = next
        setDraft(next)
        props.preview(next, localSource)
        setNotice('')
        pendingSaveRef.current = { draft: next, localDataUrl }
        if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current)
        if (delay === 0) flushSave()
        else saveTimerRef.current = setTimeout(flushSave, delay)
      }

      function update(field, value, localSource = localPreviewUrlRef.current, localDataUrl = localDataUrlRef.current, delay = 0) {
        apply({ ...draftRef.current, [field]: value }, localSource, localDataUrl, delay)
      }

      async function chooseLocal(event) {
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
        clearLocalPreview()
        const objectUrl = URL.createObjectURL(file)
        localPreviewUrlRef.current = objectUrl
        const previous = draftRef.current
        const next = { ...previous, backgroundUrl: LOCAL_IMAGE }
        draftRef.current = next
        setDraft(next)
        props.preview(next, objectUrl)
        setProcessingImage(true)
        try {
          const dataUrl = await optimizeLocalImage(file, objectUrl)
          if (localPreviewUrlRef.current !== objectUrl) return
          localDataUrlRef.current = dataUrl
          apply(next, objectUrl, dataUrl, 0)
        } catch (error) {
          if (localPreviewUrlRef.current !== objectUrl) return
          clearLocalPreview()
          draftRef.current = previous
          setDraft(previous)
          props.preview(previous)
          const code = error instanceof Error ? error.message : ''
          setNotice(code === 'image-store-failed' ? props.t('imageStoreFailed') : props.t('invalidImage'))
        } finally { setProcessingImage(false) }
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
          h('label', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
            h('span', null, props.t('backgroundUrl')),
            h('input', {
              type: draft.backgroundUrl === LOCAL_IMAGE ? 'text' : 'url', disabled,
              readOnly: draft.backgroundUrl === LOCAL_IMAGE,
              value: draft.backgroundUrl === LOCAL_IMAGE
                ? props.t(state.localMissing ? 'localMissing' : 'localSelected')
                : draft.backgroundUrl,
              placeholder: props.t('backgroundPlaceholder'),
              onChange: (event) => { clearLocalPreview(); update('backgroundUrl', event.target.value, '', null, 350) },
              style: { height: '36px', boxSizing: 'border-box', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)' },
            }),
          ),
          h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            h('label', { style: buttonStyle(false, disabled) },
              props.t('chooseLocal'),
              h('input', { type: 'file', accept: 'image/*', disabled, onChange: chooseLocal, style: { display: 'none' } }),
            ),
            h('button', { type: 'button', disabled, onClick: () => { clearLocalPreview(); update('backgroundUrl', '', '') }, style: buttonStyle(false, disabled) }, props.t('removeBackground')),
          ),
          h(RangeRow, { label: props.t('backgroundOpacity'), value: Math.round(draft.backgroundOpacity * 100), min: 5, max: 100, step: 1, suffix: '%', disabled, onChange: (event) => update('backgroundOpacity', Number(event.target.value) / 100, localPreviewUrlRef.current, localDataUrlRef.current, 150) }),
          h(RangeRow, { label: props.t('surfaceOpacity'), value: Math.round(draft.surfaceOpacity * 100), min: 45, max: 100, step: 1, suffix: '%', disabled, onChange: (event) => update('surfaceOpacity', Number(event.target.value) / 100, localPreviewUrlRef.current, localDataUrlRef.current, 150) }),
          h(RangeRow, { label: props.t('blur'), value: draft.backgroundBlur, min: 0, max: 30, step: 1, suffix: 'px', disabled, onChange: (event) => update('backgroundBlur', Number(event.target.value), localPreviewUrlRef.current, localDataUrlRef.current, 150) }),
          h('label', { style: { display: 'grid', gridTemplateColumns: '130px 1fr', gap: '12px', alignItems: 'center' } },
            h('span', null, props.t('fit')),
            h('select', {
              value: draft.backgroundFit, disabled, onChange: (event) => update('backgroundFit', event.target.value),
              style: { height: '34px', padding: '5px 9px', borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)' },
            }, ...['cover', 'contain', 'stretch', 'tile'].map((fit) => h('option', { key: fit, value: fit }, props.t('fit.' + fit)))),
          ),
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
          h('button', { type: 'button', disabled, onClick: () => { clearLocalPreview(); apply({ ...DEFAULTS }, '', null, 0) }, style: buttonStyle(false, disabled) }, props.t('reset')),
          processingImage && h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, props.t('processingImage')),
          state.saving && h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, props.t('saving')),
          state.localMissing && h('span', { style: { color: 'var(--dsw-alias-state-warn-primary)' } }, props.t('localMissing')),
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
      inject: ['slots', 'settingsScope', 'theme', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'appearance-plus: dictionaries')
        const background = createBackgroundManager()
        ctx.effect(() => () => { background.dispose() }, 'appearance-plus: background layer')
        const scope = ctx.settingsScope.bind({ namespace: NS })
        const controller = createController(ctx, scope, background)
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
