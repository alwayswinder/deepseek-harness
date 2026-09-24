/** Prepare the development Desktop runtime without launching Electron. */

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../../apps/desktop/src/host-protocol.ts'
import type { DesktopRelease } from '../../apps/desktop/src/release.ts'
import { prepareDevelopmentProject } from '../../apps/desktop/scripts/development-project.ts'
import { resolveDesktopBuildTarget } from '../../apps/desktop/scripts/desktop-build-paths.mjs'
import { preparePrimaryRuntime } from '../../apps/desktop/scripts/prepare-primary-runtime.ts'

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..', '..')
const APP_ROOT = join(REPOSITORY_ROOT, 'apps', 'desktop')
const CLI_ROOT = join(REPOSITORY_ROOT, 'apps', 'cli')
const DEVELOPMENT_ROOT = join(APP_ROOT, '.desktop-build', 'development')
const DEPENDENCY_VIEW = join(DEVELOPMENT_ROOT, 'dependency-view')

interface PackageManifest {
  readonly version?: string
}

function packageVersion(path: string, subject: string): string {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as PackageManifest
  if (typeof manifest.version !== 'string') throw new Error(`${subject} has no version`)
  return manifest.version
}

function removeOwnedPath(path: string): void {
  let stat: ReturnType<typeof lstatSync>
  try {
    stat = lstatSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  if (stat.isSymbolicLink()) unlinkSync(path)
  else rmSync(path, { recursive: true })
}

/**
 * Whether a link no longer names a package: its target is gone, or the target
 * is a leftover directory from a renamed package without a manifest. pnpm keeps
 * such links from earlier checkouts; resolving one aborts the dependency view,
 * and one that still resolves would abort the project manifest walk instead.
 */
function isStaleLink(path: string): boolean {
  let stat: ReturnType<typeof lstatSync>
  try {
    stat = lstatSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
  if (!stat.isSymbolicLink()) return false
  return !existsSync(join(path, 'package.json'))
}

/**
 * Drop stale package links under one dependency root so `linkPackage` and the
 * project manifest walk only ever see live packages.
 */
function pruneStaleLinks(root: string): void {
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  for (const entry of entries) {
    if (entry.name === '.bin') continue
    const path = join(root, entry.name)
    if (entry.name.startsWith('@') && entry.isDirectory()) {
      for (const scoped of readdirSync(path, { withFileTypes: true })) {
        const child = join(path, scoped.name)
        if (!isStaleLink(child)) continue
        unlinkSync(child)
        console.log(`desktop preparation: removed stale dependency link ${child}`)
      }
      continue
    }
    if (!isStaleLink(path)) continue
    unlinkSync(path)
    console.log(`desktop preparation: removed stale dependency link ${path}`)
  }
}

function linkPackage(source: string, destination: string): void {
  removeOwnedPath(destination)
  mkdirSync(dirname(destination), { recursive: true })
  symlinkSync(realpathSync(source), destination, process.platform === 'win32' ? 'junction' : 'dir')
}

function overlayDependencies(sourceRoot: string): void {
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (entry.name === '.bin') continue
    const source = join(sourceRoot, entry.name)
    if (entry.name.startsWith('@') && (entry.isDirectory() || entry.isSymbolicLink())) {
      for (const scoped of readdirSync(source, { withFileTypes: true })) {
        if (scoped.isDirectory() || scoped.isSymbolicLink()) {
          linkPackage(join(source, scoped.name), join(DEPENDENCY_VIEW, entry.name, scoped.name))
        }
      }
    } else if (entry.isDirectory() || entry.isSymbolicLink()) {
      linkPackage(source, join(DEPENDENCY_VIEW, entry.name))
    }
  }
}

function prepareDependencyView(): void {
  removeOwnedPath(DEPENDENCY_VIEW)
  mkdirSync(DEPENDENCY_VIEW, { recursive: true })
  const pnpmRoot = join(REPOSITORY_ROOT, 'node_modules', '.pnpm', 'node_modules')
  const cliRoot = join(CLI_ROOT, 'node_modules')
  pruneStaleLinks(pnpmRoot)
  pruneStaleLinks(cliRoot)
  overlayDependencies(pnpmRoot)
  // CLI links are authoritative for direct runtime dependencies and cover packages
  // that pnpm did not expose through its workspace-wide virtual-hoist directory.
  overlayDependencies(cliRoot)
}

const requireFromDesktop = createRequire(join(APP_ROOT, 'package.json'))
const electron: unknown = requireFromDesktop('electron')
if (typeof electron !== 'string') throw new Error('desktop preparation: Electron executable is unavailable')

const release: DesktopRelease = {
  schemaVersion: 1,
  version: packageVersion(join(APP_ROOT, 'package.json'), 'desktop package'),
  hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
  nodeVersion: execFileSync(electron, ['-p', 'process.versions.node'], {
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  }).trim(),
  pnpmVersion: packageVersion(join(APP_ROOT, 'node_modules', 'pnpm', 'package.json'), 'pnpm package'),
}

prepareDependencyView()
prepareDevelopmentProject({
  projectDir: join(DEVELOPMENT_ROOT, 'project'),
  cliDir: CLI_ROOT,
  hostDir: join(REPOSITORY_ROOT, 'apps', 'desktop-host'),
  dependencyDir: DEPENDENCY_VIEW,
  release,
  target: resolveDesktopBuildTarget(),
})
await preparePrimaryRuntime()
console.log('desktop preparation: development project and primary runtime are ready')
