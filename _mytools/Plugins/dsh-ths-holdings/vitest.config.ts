/**
 * Test config for this out-of-tree plugin.
 *
 * The plugin lives outside the repository's pnpm workspace, so the repository
 * config (whose `include` patterns cover `packages/*` and `apps/*` only) never
 * matches these specs. This config keeps the plugin runnable on its own:
 * `..\..\..\node_modules\.bin\vitest.CMD run` from this directory, with
 * `vitest` resolved from the repository root's node_modules.
 *
 * The plugin ships no dependencies, so the Vite cache is kept out of its own
 * directory: the default `node_modules/.vite` would recreate the `node_modules`
 * folder this plugin deliberately does not have.
 */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  cacheDir: fileURLToPath(new URL('../../../.cache/plugin-vitest/dsh-ths-holdings', import.meta.url)),
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    // The Loader composition test boots a real webserver and a scripted ledger.
    testTimeout: 60_000,
  },
})
