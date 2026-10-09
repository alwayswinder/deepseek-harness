// The settings tool moved to `sync-settings.mjs` when it took on the Desktop's
// shortcut document as well. This shim keeps an instance started before that
// move working: a running host half and a running pet still resolve the old name,
// and the mode argument reaches the moved tool unchanged.
import './sync-settings.mjs'

// A restart from the pet's menu replays the app's command line directly, so it
// never passes through build\start-desktop.bat and that launcher's conversation
// backup would be missed. Take it here instead, before the app is ended; the
// worker copies incrementally, skips a file the running app holds open, and a
// failure is reported without blocking the restart.
try {
  const { runBackup } = await import('../backup/backup-chats.mjs')
  await runBackup()
} catch (error) {
  console.error(`[backup] skipped: ${error?.message ?? error}`)
}
