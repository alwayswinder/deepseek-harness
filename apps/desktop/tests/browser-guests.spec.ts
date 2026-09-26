import { EventEmitter } from 'node:events'
import { beforeEach, expect, it, vi } from 'vitest'
import { DesktopBrowserGuests } from '../src/browser-guests.ts'
import type { WebContents } from 'electron'

const native = vi.hoisted(() => ({ partition: vi.fn<(name: string) => unknown>() }))
vi.mock('electron', () => ({ app: { isPackaged: true }, session: { fromPartition: native.partition } }))

/** The session members `configureSession` installs, on an emitter for `will-download`. */
function makeSession() {
  return Object.assign(new EventEmitter(), {
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    setDevicePermissionHandler: vi.fn(),
    setDisplayMediaRequestHandler: vi.fn(),
    webRequest: { onBeforeRequest: vi.fn() },
  })
}

/** A lease owner is only recorded, so an empty stand-in is enough. */
const owner = {} as WebContents
const created: ReturnType<typeof makeSession>[] = []

beforeEach(() => {
  vi.clearAllMocks()
  created.length = 0
  native.partition.mockImplementation(() => {
    const browserSession = makeSession()
    created.push(browserSession)
    return browserSession
  })
})

it('puts a workspace in a persistent partition named after the workspace identity', () => {
  const partition = new DesktopBrowserGuests(() => undefined).acquire(owner, 'cwd:D:\\AI\\DSH\\deepseek-harness').partition
  // Persistent so a signed-in site outlives the application, and a digest so a
  // path that could not be a directory name never reaches the partition name.
  expect(partition).toMatch(/^persist:dsh-sidebar-browser-[0-9a-f]{32}$/)
  expect(native.partition).toHaveBeenCalledExactlyOnceWith(partition)
  // The fixed isolation policy applies to a persistent partition just the same.
  expect(created).toHaveLength(1)
  expect(created[0]!.setPermissionRequestHandler).toHaveBeenCalledOnce()
  expect(created[0]!.webRequest.onBeforeRequest).toHaveBeenCalledOnce()
})

it('reuses one partition per workspace, and isolates another workspace', () => {
  const guests = new DesktopBrowserGuests(() => undefined)
  const first = guests.acquire(owner, 'cwd:D:\\project')
  const again = guests.acquire(owner, 'cwd:D:\\project')
  const other = guests.acquire(owner, 'session:8d1f')
  expect(again.partition).toBe(first.partition)
  expect(other.partition).not.toBe(first.partition)
  expect(native.partition).toHaveBeenCalledTimes(2)
})

it('gives a restarted application the same partition for the same workspace', () => {
  const before = new DesktopBrowserGuests(() => undefined).acquire(owner, 'cwd:D:\\project').partition
  vi.clearAllMocks()
  const after = new DesktopBrowserGuests(() => undefined).acquire(owner, 'cwd:D:\\project').partition
  expect(after).toBe(before)
})

it('still refuses a workspace identity that is missing or unusable', () => {
  const guests = new DesktopBrowserGuests(() => undefined)
  for (const workspace of [undefined, '', null, 42, 'x'.repeat(4097)]) {
    expect(() => guests.acquire(owner, workspace)).toThrow('workspace storage identity is required')
  }
  expect(native.partition).not.toHaveBeenCalled()
})
