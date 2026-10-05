// The settings tool moved to `sync-settings.mjs` when it took on the Desktop's
// shortcut document as well. This shim keeps an instance started before that
// move working: a running host half and a running pet still resolve the old name,
// and the mode argument reaches the moved tool unchanged.
import './sync-settings.mjs'
