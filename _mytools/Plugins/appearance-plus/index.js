/**
 * Appearance Plus Host plugin.
 *
 * The Host owns the durable settings schema. The browser half registers color
 * themes, applies the selected palette, and renders the configuration page.
 */

import z from '@deepseek-ai/schemastery'

const NS = 'appearance-plus'

export const name = NS

export const Config = z.object({
  preset: z.union(['default', 'eye-green', 'warm-paper', 'ocean', 'lavender', 'midnight']).default('default'),
  backgroundUrl: z.string().default(''),
  backgroundOpacity: z.number().min(0.05).max(1).default(0.72),
  backgroundBlur: z.number().step(1).min(0).max(30).default(0),
  backgroundFit: z.union(['cover', 'contain', 'stretch', 'tile']).default('cover'),
  // The lower bound is shared with the browser half's SURFACE_OPACITY_MIN: the
  // slider cannot offer a value this schema rejects, or the write fails and the
  // page falls back to the last saved value.
  surfaceOpacity: z.number().min(0.15).max(1).default(0.62),
  // The lock screen is a second, independent image: `lockEnabled` gates it
  // behind the quiet period `lockSeconds`, after which it covers the whole
  // interface. The bounds are shared with the browser half's slider, so the page
  // cannot offer a value this schema rejects.
  lockUrl: z.string().default(''),
  lockEnabled: z.boolean().default(true),
  lockSeconds: z.number().step(1).min(3).max(600).default(20),
  lockFit: z.union(['cover', 'contain', 'stretch', 'tile']).default('cover'),
}).volatile()

/** Keep the schema-derived settings form behind the plugin's custom page. */
export function apply(ctx) {
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
}
