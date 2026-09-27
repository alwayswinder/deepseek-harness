// Render the Desktop app's Windows icon for shortcuts on this machine.
//
// The application icon is an SVG; Windows wants an ICO whose entries are the
// sizes Explorer and the Start Menu ask for. The repository's committed
// `resources/tray-windows.ico` is not a substitute: it is rasterized from the
// same vector with an enlarged mark for the 16 px tray, so it reads as too full
// at 48 px and above.
//
// sharp comes from the Desktop app's own dependencies, so this runs on the same
// rasterizer as `pnpm run render:tray-icon`. The output is machine-local, next to
// the build logs under the harness home; nothing is written into the repository.
//
// Usage: node _mytools/build/make-app-icon.mjs [--force]

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..', '..')
const source = join(repositoryRoot, 'apps', 'desktop', 'resources', 'icon-windows.svg')

/** Sizes Windows asks for: Explorer, the Start Menu, alt-tab, and the large tiles. */
const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]

/** Resolve the harness home the way the rest of this layer does. */
function dshHome() {
  const raw = (process.env.DSH_HOME ?? '').trim()
  if (raw === '') return join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh')
  if (raw === '~') return process.env.USERPROFILE ?? process.env.HOME ?? '.'
  if (raw.startsWith('~/') || raw.startsWith('~\\')) {
    return join(process.env.USERPROFILE ?? process.env.HOME ?? '.', raw.slice(2))
  }
  return resolve(raw)
}

/**
 * Assemble an ICO container from PNG entries: the 6-byte header, one 16-byte
 * directory entry per image, then the images themselves. PNG payloads are what
 * Windows Vista and later expect for the larger sizes and are accepted for all
 * of them.
 * @param images - one entry per size, each its PNG bytes.
 * @returns the complete `.ico` file.
 */
function icoContainer(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const directory = Buffer.alloc(16 * images.length)
  let offset = header.length + directory.length
  images.forEach((image, index) => {
    const entry = index * 16
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry)
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 1)
    directory.writeUInt8(0, entry + 2)
    directory.writeUInt8(0, entry + 3)
    directory.writeUInt16LE(1, entry + 4)
    directory.writeUInt16LE(32, entry + 6)
    directory.writeUInt32LE(image.png.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += image.png.length
  })
  return Buffer.concat([header, directory, ...images.map(image => image.png)])
}

const destination = join(dshHome(), 'build', 'dsh.ico')
const force = process.argv.includes('--force')
if (!force && statSync(destination, { throwIfNoEntry: false })?.mtimeMs >= statSync(source).mtimeMs) {
  console.log(`[icon] up to date: ${destination}`)
  process.exit(0)
}

const require = createRequire(join(repositoryRoot, 'apps', 'desktop', 'package.json'))
const sharp = require('sharp')
const svg = readFileSync(source)
const images = []
for (const size of SIZES) {
  images.push({ size, png: await sharp(svg).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer() })
}

mkdirSync(join(dshHome(), 'build'), { recursive: true })
writeFileSync(destination, icoContainer(images))
console.log(`[icon] wrote ${destination} (${SIZES.length} sizes: ${SIZES.join(', ')})`)
