import type { UserConfig } from 'tsdown'

const PACKAGE_NAME = 'dsh-ths-holdings'

/**
 * Standard tsdown config: the node half only.
 *
 * This fork serves the composer strip from the deepseek-usage plugin, which
 * reads `/api/stock-pnl` — the route this host half registers — so the package
 * ships no browser bundle.
 */
const config: UserConfig[] = [
  {
    name: PACKAGE_NAME,
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: { outputDir: 'lib/types' },
    clean: false,
    // playwright-core is resolved at runtime through a multi-anchor loader
    // (global npm root / profile / plugin node_modules) so the auto-acquire
    // feature degrades to a hint when it is not installed. It must not be
    // bundled into the plugin.
    external: ['playwright-core'],
  },
]

export default config
