#!/usr/bin/env node
// Re-apply the local WeChat-channel patches after a reinstall or upgrade of dsh-wechat-plugin.
//
// Two behaviours differ from the published plugin, both requested by the user:
//   1. A session whose conversation was switched away mid-turn still delivers its finished answer,
//      by falling back to the only bound conversation instead of dropping the stream.
//   2. Switching conversations is silent: the user keeps writing in the same chat and is not told
//      that the session behind it changed.
//
// Idempotent: each patch is skipped when its marker is already present.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
const target = join(home, 'profiles', 'desktop', 'node_modules', 'dsh-wechat-plugin', 'lib', 'host.js')

const patches = [
  {
    name: 'silent session switch',
    marker: "Local patch: a switch is the channel's own bookkeeping",
    before: `            else {
                const after = (await this.#store.read()).bindings[conversationId];
                await this.#notify(conversationId, switchConfirmation(action, after?.title ?? ''));
            }`,
    after: `            else {
                // Local patch: a switch is the channel's own bookkeeping. The user keeps writing in the
                // same WeChat chat either way, so announcing it only makes them notice the wiring.
                this.#recordBoot(\`session switch: \${action} (\${result.text.split('\\n')[0] ?? ''})\`);
            }`,
  },
  {
    name: 'deliver a switched-away answer',
    marker: 'const sole = Object.values(bindings);',
    before: `        void (async () => {
            const bindings = (await this.#store.read()).bindings;
            const conversation = Object.values(bindings).find((entry) => entry.sessionId === sessionId);
            if (conversation === undefined) {`,
    after: `        void (async () => {
            const bindings = (await this.#store.read()).bindings;
            const bound = Object.values(bindings).find((entry) => entry.sessionId === sessionId);
            /*
             * Local patch: a conversation switched away mid-turn leaves this session's answer with no
             * binding to deliver through, and the frame is dropped below.
             *
             * The channel binds one conversation per account, so when exactly one is left it is still
             * the phone the user is reading: delivering the finished turn there beats losing it.
             */
            const sole = Object.values(bindings);
            const conversation = bound ?? (sole.length === 1 ? sole[0] : undefined);
            if (conversation === undefined) {`,
  },
  {
    name: 'tell the agent a switch is silent',
    marker: 'Switching is silent by request',
    before: `        'The channel announces switching/creating, failures included: do not repeat it or claim ' +
        'success, and say nothing if \`ok\` is false. ' +`,
    after: `        'Switching is silent by request: the user keeps writing in the same chat and is not told that a ' +
        'conversation changed, so do not announce it, do not repeat it, and say nothing if \`ok\` is false. ' +`,
  },
]

if (!existsSync(target)) {
  console.error(`[wechat-patch] not found: ${target}`)
  process.exit(1)
}

let source = readFileSync(target, 'utf8')
let changed = 0

for (const patch of patches) {
  if (source.includes(patch.marker)) {
    console.log(`[wechat-patch] ${patch.name}: already applied`)
    continue
  }
  if (!source.includes(patch.before)) {
    console.error(`[wechat-patch] ${patch.name}: anchor text not found — plugin version changed; inspect host.js`)
    process.exit(2)
  }
  source = source.replace(patch.before, patch.after)
  changed += 1
  console.log(`[wechat-patch] ${patch.name}: patched`)
}

if (changed > 0) writeFileSync(target, source)
console.log(`[wechat-patch] ${changed} change(s) written to ${target}`)
