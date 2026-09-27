/**
 * DSH Little Icon — browser half.
 *
 * Renders the pet's settings on the bundle's own page in the Plugins list
 * (`plugins.bundle.config`, keyed by the package name), so size and
 * translucency sit one click from the plugin list instead of behind the row's
 * own page. The Host owns every value and this half only renders controls and
 * writes through the settings form, so a change reaches the pet without
 * restarting anything: the Host republishes the state file and the pet applies
 * it within a second.
 *
 * It also carries the two directions that have nothing to do with settings. The
 * page reports its own input, so the pet can tell "nobody is there" from "no task
 * is running". And it performs the pet's menu commands: the pet window belongs to
 * another process, so a choice made there reaches the page through the Host, and
 * "chat" opens the DeepSeek chat site in DSH's own Browser tab rather than the
 * system browser, while "git" opens this plugin's own Git page beside the
 * conversation.
 *
 * The Git page is a tab type this plugin registers itself: the right Sidebar's
 * registry is the extension point for exactly that, so the page needs neither the
 * product's Browser tab nor any other shipped viewer. It draws what the Host's
 * Git route answers for the Session's working directory, and it only ever reads.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-little-icon',
  factory: (require) => {
    'use strict'
    const module = { exports: {} }
    const React = require('react')
    const { createSnapshotStore } = require('@deepseek-ai/dsh-client-store')
    const h = React.createElement

    /** Settings namespace; the Host row id. */
    const NS = 'little-icon'

    /** The bundle whose page carries this configuration. */
    const PACKAGE_NAME = '@local/dsh-little-icon'

    /** The Host route that records "the person is still doing something". */
    const ACTIVITY_PATH = '/api/little-icon/activity'

    /** The Host route the pet's menu commands arrive on, as Server-Sent Events. */
    const COMMANDS_PATH = '/api/little-icon/commands'

    /** The DeepSeek chat site the pet's "chat" entry opens inside DSH. */
    const CHAT_URL = 'https://chat.deepseek.com'

    /** The right-Sidebar page type that shows an HTTP(S) site inside DSH. */
    const BROWSER_TAB = 'browser'

    /** The right-Sidebar page type the pet's "git" entry opens. */
    const GIT_KIND = 'little-icon-git'

    /**
     * That type's implementation identity: the key its definition registers
     * under, and the key its body registers under in `sidebar.right.pane.tab`.
     */
    const GIT_TYPE_ID = '@local/dsh-little-icon/git'

    /** The Host route the Git page reads the Session's repository from. */
    const GIT_PATH = '/api/little-icon/git'

    /**
     * What the Git page's button says into the conversation. The message is a
     * real user turn, admitted exactly as the composer admits one, so the agent
     * reads it as an instruction and commits and pushes with its own tools.
     */
    const COMMIT_AND_PUSH_PROMPT = '提交并推送'

    /** At most one activity ping per window; the Host only needs coarse recency. */
    const ACTIVITY_PING_MS = 15_000

    /** Input that counts as using DSH, so the pet never sleeps while you work. */
    const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'wheel', 'keydown']

    /** Mirrors the Host schema defaults so a control never renders blank. */
    const DEFAULTS = {
      enabled: true,
      size: 160,
      translucent: true,
      idleOpacity: 0.45,
      topmost: true,
      clickAction: 'toggle',
      frameMs: 600,
      pollMs: 800,
      happyMs: 3000,
      boredEverySeconds: 60,
      boredMs: 5000,
      sleepAfterSeconds: 600,
      sleepWhenHiddenSeconds: 20,
      autoHide: true,
      autoHideSeconds: 0,
    }

    /** Slider bounds, matching the Host schema. */
    const SIZE = { min: 96, max: 320, step: 8 }
    const OPACITY = { min: 0.15, max: 1, step: 0.05 }
    const FRAME_MS = { min: 120, max: 2000, step: 20 }
    const POLL_MS = { min: 200, max: 5000, step: 100 }
    const HOLD_MS = { min: 0, max: 15000, step: 500 }
    const BORED_EVERY_SECONDS = { min: 5, max: 600, step: 5 }
    const BORED_MS = { min: 500, max: 20000, step: 500 }
    const SLEEP_SECONDS = { min: 30, max: 86400, step: 30 }
    const HIDDEN_SECONDS = { min: 2, max: 600, step: 2 }
    const AUTO_HIDE_SECONDS = { min: 0, max: 600, step: 5 }

    /** How long a slider drag settles before its writes are merged into one. */
    const WRITE_DELAY_MS = 250

    const zh = {
      title: '桌宠',
      summary: '桌面上的像素桌宠：大小与虚化都能在这里调。',
      enable: '启用桌宠',
      enableHint: '关闭会立刻结束桌宠进程，再打开会重新拉起。',
      size: '大小',
      sizeHint: '桌宠窗口边长；鼠标移上去时会完全显示。',
      translucent: '闲置时虚化',
      translucentHint: '鼠标不在桌宠上时半透明，移上去变清晰。',
      opacity: '虚化程度',
      opacityHint: '越小越透明。',
      topmost: '始终置顶',
      topmostHint: '让桌宠浮在其他窗口之上。',
      click: '点击桌宠',
      clickToggle: '收起 / 恢复 DSH',
      clickMinimize: '只最小化 DSH',
      clickNone: '不动作',
      clickHint: '单击（没有拖动的那一次按下）执行的动作。',
      autoHide: '切到别的应用就收起 DSH',
      autoHideHint: 'DSH 还在屏幕上、但前面是别的应用时把它收起来；DSH 自己在最前面时永不自动收起。0 秒就是一切到后台立刻收。',
      autoHideSeconds: '到后台多久才收起',
      pace: '表情节奏',
      paceHint: '每帧停留的毫秒数。',
      advanced: '更多',
      happyMs: '「开心」保持',
      happyHint: '一轮活干完后开心多久，然后回到待机。',
      boredEvery: '无聊间隔',
      boredHint: '闲着的时候每隔这么久插一次「无聊」（跟鼠标无关，只看有没有任务在跑）。',
      boredMs: '「无聊」时长',
      sleepAfter: '无操作多久「打盹」',
      sleepHint: 'DSH 显示着的时候：鼠标、键盘、拖动桌宠都算操作；一有操作就醒过来回到待机。',
      hiddenSleep: '收起 DSH 后多久「打盹」',
      hiddenSleepHint: '收起后只有拖动桌宠算操作；重新显示 DSH、或点一下桌宠也立刻醒来。',
      pollMs: '状态采样间隔',
      pollMsHint: '宿主读取 agent 状态的间隔；改大更省，改小更跟手。',
      pixels: '{value} px',
      percent: '{value}%',
      seconds: '{value} 秒',
      milliseconds: '{value} 毫秒',
      unavailable: '当前连接不保存设置，改不了。',
      saved: '已保存',
      failed: '保存失败，已回到上次的值。',
      gitTab: 'Git 改动',
      gitChanges: '未提交的改动',
      gitCommits: '最近提交',
      gitRefresh: '刷新',
      gitLoading: '读取中…',
      gitStaged: '已暂存',
      gitBranch: '分支 {name}',
      gitEmptyChanges: '没有未提交的改动。',
      gitEmptyCommits: '还没有提交记录。',
      gitNoCwd: '这个会话还没有工作目录，读不到 Git 状态。',
      gitNoDir: '工作目录已经不在，读不到 Git 状态。',
      gitNoGit: '找不到 git 命令，确认它在 PATH 里再刷新。',
      gitNotARepo: '工作目录不在 Git 仓库里。',
      gitFailed: '读取失败：{message}',
      gitUntracked: '新增',
      gitModified: '修改',
      gitAdded: '新增',
      gitDeleted: '删除',
      gitRenamed: '重命名',
      gitCopied: '复制',
      gitConflicted: '冲突',
      gitTypeChanged: '类型变更',
      gitUnknown: '变更',
      gitCommitAndPush: '提交并推送',
      gitSending: '发送中…',
      gitSent: '已发送',
      gitQueued: '已排队',
      gitSendNoChannel: '这个会话当前没有输入通道，这句话发不出去。',
      gitSendFailed: '发送失败：{message}',
    }

    const en = {
      title: 'Desktop pet',
      summary: 'The pixel pet on your desktop; its size and translucency are set here.',
      enable: 'Enable the pet',
      enableHint: 'Turning this off ends the pet process; turning it back on starts one.',
      size: 'Size',
      sizeHint: 'Window edge; the pet shows fully while the pointer is over it.',
      translucent: 'Translucent while idle',
      translucentHint: 'Half transparent until the pointer reaches it.',
      opacity: 'Translucency',
      opacityHint: 'Lower is more transparent.',
      topmost: 'Always on top',
      topmostHint: 'Keeps the pet above other windows.',
      click: 'Clicking the pet',
      clickToggle: 'Tuck / restore DSH',
      clickMinimize: 'Minimize DSH only',
      clickNone: 'Do nothing',
      clickHint: 'What a click performs — a press that did not move the window.',
      autoHide: 'Tuck DSH away behind another app',
      autoHideHint: 'Tucks DSH away while it is still on screen but another application is in front of it; DSH itself in front is never tucked away. Zero seconds tucks it the moment it goes behind.',
      autoHideSeconds: 'Tuck away after going behind',
      pace: 'Animation pace',
      paceHint: 'Milliseconds each frame stays on screen.',
      advanced: 'More',
      happyMs: 'Happy for',
      happyHint: 'How long a finished task keeps it happy before it idles again.',
      boredEvery: 'Boredom interval',
      boredHint: 'While the agent is idle, how often a bored interruption comes around (mouse movement does not postpone it).',
      boredMs: 'Boredom duration',
      sleepAfter: 'Asleep after',
      sleepHint: 'While DSH is on screen: pointer, keyboard, and dragging the pet all count as activity, and any of them wakes it.',
      hiddenSleep: 'Asleep after tucking DSH',
      hiddenSleepHint: 'Tucked away, only dragging the pet counts; showing DSH again — or clicking the pet — wakes it at once.',
      pollMs: 'State sampling',
      pollMsHint: 'How often the host reads agent state.',
      pixels: '{value} px',
      percent: '{value}%',
      seconds: '{value} s',
      milliseconds: '{value} ms',
      unavailable: 'This connection keeps no settings, so they cannot be changed.',
      saved: 'Saved',
      failed: 'Save failed; the previous value is back.',
      gitTab: 'Git changes',
      gitChanges: 'Uncommitted changes',
      gitCommits: 'Recent commits',
      gitRefresh: 'Refresh',
      gitLoading: 'Reading…',
      gitStaged: 'staged',
      gitBranch: 'branch {name}',
      gitEmptyChanges: 'No uncommitted changes.',
      gitEmptyCommits: 'No commits yet.',
      gitNoCwd: 'This session has no working directory yet, so there is no Git state to read.',
      gitNoDir: 'The working directory is gone, so there is no Git state to read.',
      gitNoGit: 'The git command was not found; make sure it is on PATH and refresh.',
      gitNotARepo: 'The working directory is not inside a Git repository.',
      gitFailed: 'Could not read the repository: {message}',
      gitUntracked: 'new',
      gitModified: 'modified',
      gitAdded: 'added',
      gitDeleted: 'deleted',
      gitRenamed: 'renamed',
      gitCopied: 'copied',
      gitConflicted: 'conflicted',
      gitTypeChanged: 'type changed',
      gitUnknown: 'changed',
      gitCommitAndPush: 'Commit and push',
      gitSending: 'Sending…',
      gitSent: 'Sent',
      gitQueued: 'Queued',
      gitSendNoChannel: 'This session has no input channel right now, so the message cannot be sent.',
      gitSendFailed: 'Could not send: {message}',
    }

    /** Insert the card stylesheet once per document. */
    function injectStyles() {
      if (typeof document === 'undefined' || document.getElementById('dsh-little-icon-style') !== null) return
      const style = document.createElement('style')
      style.id = 'dsh-little-icon-style'
      style.textContent = [
        '.dli-page{display:flex;flex-direction:column;gap:16px;max-width:560px;',
        'color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;}',
        '.dli-row{display:flex;flex-direction:column;gap:6px;}',
        '.dli-head{display:flex;align-items:center;gap:8px;}',
        '.dli-label{font-weight:600;}',
        '.dli-value{margin-left:auto;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
        '.dli-hint{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;}',
        '.dli-slider{width:100%;}',
        '.dli-row[data-disabled="true"]{opacity:.5;}',
        '.dli-select{background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.12));',
        'color:inherit;border:1px solid rgba(127,127,127,.35);border-radius:6px;padding:4px 8px;font:inherit;}',
        '.dli-details summary{cursor:pointer;color:var(--dsw-alias-label-secondary);}',
        '.dli-grid{display:flex;flex-direction:column;gap:14px;padding-top:12px;}',
        '.dli-status{font-size:11px;color:var(--dsw-alias-label-secondary);min-height:16px;}',
        '.dli-git{display:flex;flex:1 1 auto;flex-direction:column;gap:8px;height:100%;min-height:0;',
        'color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;}',
        '.dli-git-bar{display:flex;flex:0 0 auto;align-items:center;gap:8px;min-height:28px;}',
        '.dli-git-route{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;',
        'color:var(--dsw-alias-label-secondary);font-size:11px;}',
        '.dli-git-branch{flex:0 0 auto;font-size:11px;padding:1px 8px;border-radius:999px;',
        'background:rgba(127,127,127,.14);}',
        '.dli-git-refresh{flex:0 0 auto;margin-left:auto;font:inherit;color:inherit;cursor:pointer;',
        'background:transparent;border:1px solid rgba(127,127,127,.35);border-radius:6px;padding:2px 10px;}',
        '.dli-git-refresh:disabled{opacity:.5;cursor:default;}',
        '.dli-git-send{flex:0 0 auto;font:inherit;color:inherit;cursor:pointer;padding:2px 12px;',
        'background:rgba(127,127,127,.18);border:1px solid rgba(127,127,127,.4);border-radius:6px;}',
        '.dli-git-send:disabled{opacity:.5;cursor:default;}',
        '.dli-git-send[data-sent="true"]{color:#3fb950;border-color:rgba(63,185,80,.5);background:rgba(63,185,80,.12);}',
        '.dli-git-cols{display:flex;flex:1 1 auto;flex-wrap:wrap;gap:12px;min-height:0;}',
        // Two columns side by side, stacked once the pane is too narrow to hold
        // both: a fixed split would leave one of them unreadable in a small pane.
        '.dli-git-col{display:flex;flex:1 1 220px;flex-direction:column;min-width:0;min-height:0;',
        'border:1px solid rgba(127,127,127,.25);border-radius:8px;overflow:hidden;}',
        '.dli-git-head{display:flex;align-items:center;gap:8px;padding:6px 10px;',
        'border-bottom:0.5px solid rgba(127,127,127,.25);}',
        '.dli-git-title{font-weight:600;}',
        '.dli-git-count{margin-left:auto;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
        '.dli-git-list{flex:1 1 auto;min-height:0;overflow:auto;padding:4px 0;}',
        '.dli-git-row{display:flex;align-items:center;gap:6px;padding:2px 10px;}',
        '.dli-git-badge{flex:0 0 auto;font-size:11px;padding:0 5px;border-radius:4px;',
        'color:var(--dsw-alias-label-secondary);background:rgba(127,127,127,.16);}',
        '.dli-git-badge-new{color:#3fb950;}',
        '.dli-git-badge-modified{color:#d29922;}',
        '.dli-git-badge-deleted{color:#f85149;}',
        '.dli-git-badge-moved{color:#58a6ff;}',
        '.dli-git-badge-conflict{color:#f85149;}',
        '.dli-git-path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}',
        '.dli-git-staged{flex:0 0 auto;margin-left:auto;font-size:11px;color:var(--dsw-alias-label-secondary);}',
        '.dli-git-commit{display:flex;flex-direction:column;gap:2px;padding:5px 10px;}',
        '.dli-git-commit+.dli-git-commit{border-top:0.5px solid rgba(127,127,127,.18);}',
        // The message wraps rather than trailing off: it leads the row, and the
        // column is too narrow to show a full subject on one line.
        '.dli-git-subject{overflow-wrap:anywhere;}',
        '.dli-git-hash{font-size:11px;color:var(--dsw-alias-label-secondary);',
        'font-family:ui-monospace,SFMono-Regular,Consolas,monospace;}',
        '.dli-git-byline{color:var(--dsw-alias-label-secondary);font-size:11px;}',
        '.dli-git-note{margin:0;padding:8px 10px;color:var(--dsw-alias-label-secondary);}',
      ].join('')
      document.head.appendChild(style)
    }

    /**
     * One labelled control row.
     * @param props - label, hint, formatted value, the control itself, and whether
     *   a switch sits on the label's own line.
     * @returns the row element.
     */
    function Row(props) {
      const label = h('span', { className: 'dli-label' }, props.label)
      const value = props.value === undefined ? null : h('span', { className: 'dli-value' }, props.value)
      return h('div', { className: 'dli-row', 'data-disabled': props.disabled === true ? 'true' : undefined },
        props.inline === true
          ? h('div', { className: 'dli-head' }, props.control, label, value)
          : h('div', { className: 'dli-head' }, label, value),
        props.inline === true ? null : props.control,
        props.text === undefined ? null : h('div', { className: 'dli-hint' }, props.text))
    }

    /**
     * The pet's settings card.
     * @param props - slot props from `plugins.bundle.config` plus the inject face:
     *   the `usePetSettings` hook over the mirrored form and the `write` callback.
     * @returns the summary line, or the settings card.
     */
    function PetSettings(props) {
      const { t, view } = props
      if (view === 'summary') return h('span', null, t('summary'))

      const live = props.usePetSettings((snapshot) => snapshot)
      const accepted = { ...DEFAULTS, ...(live.value ?? {}) }
      // Sliders follow the pointer locally; the plugin merges their writes once
      // the drag settles, so the card stays responsive without one profile write
      // per pixel.
      const [draft, setDraft] = React.useState(accepted)
      React.useEffect(() => { setDraft(accepted) }, [live.value])

      const write = (patch, immediate) => {
        setDraft((current) => ({ ...current, ...patch }))
        props.write(patch, immediate)
      }

      const editable = live.status === 'ready' && live.writable === true
      /** Slider props: local echo while dragging, one write after it settles. */
      const slider = (field) => ({
        className: 'dli-slider', type: 'range', disabled: !editable, value: draft[field],
        onChange: (event) => write({ [field]: Number(event.target.value) }, false),
      })
      /** Switch props: one write per click. */
      const toggle = (field) => ({
        type: 'checkbox', disabled: !editable, checked: draft[field] === true,
        onChange: (event) => write({ [field]: event.target.checked }, true),
      })

      return h('div', { className: 'dli-page' },
        h(Row, {
          label: t('enable'), text: t('enableHint'), inline: true, disabled: !editable,
          control: h('input', toggle('enabled')),
        }),
        h(Row, {
          label: t('size'), value: t('pixels', { value: draft.size }), text: t('sizeHint'), disabled: !editable,
          control: h('input', { min: SIZE.min, max: SIZE.max, step: SIZE.step, ...slider('size') }),
        }),
        h(Row, {
          label: t('translucent'), text: t('translucentHint'), inline: true, disabled: !editable,
          control: h('input', toggle('translucent')),
        }),
        h(Row, {
          label: t('opacity'), value: t('percent', { value: Math.round(draft.idleOpacity * 100) }),
          text: t('opacityHint'), disabled: !editable || draft.translucent !== true,
          control: h('input', {
            min: OPACITY.min, max: OPACITY.max, step: OPACITY.step,
            ...slider('idleOpacity'),
            disabled: !editable || draft.translucent !== true,
          }),
        }),
        h(Row, {
          label: t('topmost'), text: t('topmostHint'), inline: true, disabled: !editable,
          control: h('input', toggle('topmost')),
        }),
        h(Row, {
          label: t('click'), text: t('clickHint'), disabled: !editable,
          control: h('select', {
            className: 'dli-select', value: draft.clickAction, disabled: !editable,
            onChange: (event) => write({ clickAction: event.target.value }, true),
          },
          h('option', { value: 'toggle' }, t('clickToggle')),
          h('option', { value: 'minimize' }, t('clickMinimize')),
          h('option', { value: 'none' }, t('clickNone'))),
        }),
        h(Row, {
          label: t('autoHide'), text: t('autoHideHint'), inline: true, disabled: !editable,
          control: h('input', toggle('autoHide')),
        }),
        h(Row, {
          label: t('autoHideSeconds'), value: t('seconds', { value: draft.autoHideSeconds }),
          disabled: !editable || draft.autoHide !== true,
          control: h('input', {
            min: AUTO_HIDE_SECONDS.min, max: AUTO_HIDE_SECONDS.max, step: AUTO_HIDE_SECONDS.step,
            ...slider('autoHideSeconds'),
            disabled: !editable || draft.autoHide !== true,
          }),
        }),
        h(Row, {
          label: t('pace'), value: t('milliseconds', { value: draft.frameMs }), text: t('paceHint'), disabled: !editable,
          control: h('input', { min: FRAME_MS.min, max: FRAME_MS.max, step: FRAME_MS.step, ...slider('frameMs') }),
        }),
        h('details', { className: 'dli-details' },
          h('summary', null, t('advanced')),
          h('div', { className: 'dli-grid' },
            h(Row, {
              label: t('happyMs'), value: t('milliseconds', { value: draft.happyMs }),
              text: t('happyHint'), disabled: !editable,
              control: h('input', { min: HOLD_MS.min, max: HOLD_MS.max, step: HOLD_MS.step, ...slider('happyMs') }),
            }),
            h(Row, {
              label: t('boredEvery'), value: t('seconds', { value: draft.boredEverySeconds }),
              text: t('boredHint'), disabled: !editable,
              control: h('input', {
                min: BORED_EVERY_SECONDS.min, max: BORED_EVERY_SECONDS.max, step: BORED_EVERY_SECONDS.step,
                ...slider('boredEverySeconds'),
              }),
            }),
            h(Row, {
              label: t('boredMs'), value: t('milliseconds', { value: draft.boredMs }), disabled: !editable,
              control: h('input', { min: BORED_MS.min, max: BORED_MS.max, step: BORED_MS.step, ...slider('boredMs') }),
            }),
            h(Row, {
              label: t('sleepAfter'), value: t('seconds', { value: draft.sleepAfterSeconds }),
              text: t('sleepHint'), disabled: !editable,
              control: h('input', {
                min: SLEEP_SECONDS.min, max: SLEEP_SECONDS.max, step: SLEEP_SECONDS.step,
                ...slider('sleepAfterSeconds'),
              }),
            }),
            h(Row, {
              label: t('hiddenSleep'), value: t('seconds', { value: draft.sleepWhenHiddenSeconds }),
              text: t('hiddenSleepHint'), disabled: !editable,
              control: h('input', {
                min: HIDDEN_SECONDS.min, max: HIDDEN_SECONDS.max, step: HIDDEN_SECONDS.step,
                ...slider('sleepWhenHiddenSeconds'),
              }),
            }),
            h(Row, {
              label: t('pollMs'), value: t('milliseconds', { value: draft.pollMs }), text: t('pollMsHint'), disabled: !editable,
              control: h('input', { min: POLL_MS.min, max: POLL_MS.max, step: POLL_MS.step, ...slider('pollMs') }),
            }))),
        h('div', { className: 'dli-status' },
          editable
            ? (live.save === 'saved' ? t('saved') : live.save === 'failed' ? t('failed') : '')
            : t('unavailable')))
    }

    // ---- git page -----------------------------------------------------------

    /** Porcelain letters as copy keys; the untracked pair is not one of them. */
    const CHANGE_COPY = {
      M: 'gitModified',
      A: 'gitAdded',
      D: 'gitDeleted',
      R: 'gitRenamed',
      C: 'gitCopied',
      U: 'gitConflicted',
      T: 'gitTypeChanged',
    }

    /** The same letters as badge colors. */
    const CHANGE_TONE = { M: 'modified', A: 'new', D: 'deleted', R: 'moved', C: 'moved', U: 'conflict' }

    /**
     * Read one `git status --porcelain` pair as what a row shows.
     * @param t - namespace-bound translate.
     * @param status - the two letters Git reported.
     * @returns the label, the badge color, and whether the change is staged.
     */
    function describeChange(t, status) {
      // `??` is not two statuses but one statement about the path: Git has never
      // been told about it, which is what "new file" means in this list.
      if (status === '??') return { label: t('gitUntracked'), tone: 'new', staged: false }
      const staged = status[0] !== ' ' && status[0] !== '?'
      const letter = staged ? status[0] : status[1]
      const copy = CHANGE_COPY[letter]
      return {
        label: copy === undefined ? t('gitUnknown') : t(copy),
        tone: CHANGE_TONE[letter] ?? 'other',
        staged,
      }
    }

    /**
     * Why a read produced no repository, in words.
     * @param t - namespace-bound translate.
     * @param result - the Host's refusal.
     * @returns the line to show in place of the two columns.
     */
    function gitReason(t, result) {
      switch (result.reason) {
        case 'no-cwd': return t('gitNoCwd')
        case 'no-dir': return t('gitNoDir')
        case 'no-git': return t('gitNoGit')
        case 'not-a-repo': return t('gitNotARepo')
        default: return t('gitFailed', { message: result.message ?? '' })
      }
    }

    /**
     * A commit's date as this machine writes dates; the Host sends ISO 8601.
     * @param iso - the author date as Git reported it.
     * @returns the date to show, or the raw value when it cannot be parsed.
     */
    function formatCommitDate(iso) {
      const at = new Date(iso)
      return Number.isNaN(at.getTime()) ? iso : at.toLocaleString()
    }

    /**
     * The Git page: the Session's working directory, its uncommitted changes on
     * the left, and its last commits on the right.
     *
     * Read-only by design: nothing here stages, commits, or pushes. The working
     * directory comes from the Session rather than from a setting, so the page
     * follows whichever project the conversation is in, and the pet's menu
     * re-opening the tab is a new navigation revision — which is what refreshes it.
     * @param props - slot props plus the injected `load` callback.
     * @returns the two columns, or the line explaining why there are none.
     */
    function GitPanel(props) {
      const { t, sessionId } = props
      const cwd = props.useSessions((sessions) => sessions.byId[sessionId]?.cwd)
      // Read at render time and closed over by the click: a message sent while a
      // turn is already running joins the queue behind it rather than starting one.
      const running = props.useSessions((sessions) => sessions.byId[sessionId]?.running === true)
      const { tab } = props.useTabInfo()
      const [state, setState] = React.useState({ phase: 'loading' })
      const [attempt, setAttempt] = React.useState(0)
      const [send, setSend] = React.useState({ phase: 'idle' })

      // Three things move this read: the Session's working directory, the refresh
      // button's `attempt`, and the tab's navigation revision — choosing the pet's
      // menu entry again reopens this same tab, which is what makes that refresh too.
      React.useEffect(() => {
        if (cwd === undefined || cwd === '') {
          setState({ phase: 'settled', result: { ok: false, reason: 'no-cwd' } })
          return undefined
        }
        const controller = new AbortController()
        setState({ phase: 'loading' })
        props.load(cwd, controller.signal).then(
          (result) => { if (!controller.signal.aborted) setState({ phase: 'settled', result }) },
          (error) => { if (!controller.signal.aborted) setState({ phase: 'failed', error }) })
        return () => { controller.abort() }
      }, [cwd, tab.navigation.revision, attempt])

      const reload = () => { setAttempt((value) => value + 1) }
      const result = state.phase === 'settled' ? state.result : undefined
      const loaded = result?.ok === true ? result : undefined
      const note = (text) => h('p', { className: 'dli-git-note' }, text)

      /**
       * Put the instruction in the conversation. The Host admits it as an ordinary
       * user turn, so the agent reads it beside the rest of the conversation and
       * performs it with its own tools; the page only reports what came back.
       */
      const submit = () => {
        if (send.phase === 'sending') return
        setSend({ phase: 'sending' })
        void props.sendPrompt(COMMIT_AND_PUSH_PROMPT).then((outcome) => {
          setSend(outcome.ok
            ? { phase: 'sent', queued: running }
            : { phase: 'failed', reason: outcome.reason, message: outcome.message })
        })
      }
      const sendLabel = () => {
        switch (send.phase) {
          case 'sending': return t('gitSending')
          case 'sent': return send.queued ? t('gitQueued') : t('gitSent')
          default: return t('gitCommitAndPush')
        }
      }
      const bar = h('div', { className: 'dli-git-bar' },
        h('span', { className: 'dli-git-route', title: loaded?.root ?? cwd ?? '' }, loaded?.root ?? cwd ?? ''),
        loaded === undefined || loaded.branch === ''
          ? null
          : h('span', { className: 'dli-git-branch' }, t('gitBranch', { name: loaded.branch })),
        h('button', {
          type: 'button', className: 'dli-git-refresh', onClick: reload, disabled: state.phase === 'loading',
        }, t('gitRefresh')),
        h('button', {
          type: 'button', className: 'dli-git-send', onClick: submit,
          // Nothing to say about a directory whose state could not be read.
          disabled: loaded === undefined || send.phase === 'sending',
          'data-sent': send.phase === 'sent' ? 'true' : undefined,
        }, sendLabel()))
      const sendNote = send.phase !== 'failed' ? null
        : note(send.reason === 'no-channel'
          ? t('gitSendNoChannel')
          : t('gitSendFailed', { message: send.message }))

      const column = (title, count, rows) => h('section', { className: 'dli-git-col' },
        h('div', { className: 'dli-git-head' },
          h('span', { className: 'dli-git-title' }, title),
          h('span', { className: 'dli-git-count' }, String(count))),
        h('div', { className: 'dli-git-list' }, rows))

      const body = () => {
        if (state.phase === 'failed') {
          return note(t('gitFailed', { message: String(state.error?.message ?? state.error) }))
        }
        if (result === undefined) return note(t('gitLoading'))
        if (loaded === undefined) return note(gitReason(t, result))
        const changes = loaded.changes.map((change, index) => {
          const view = describeChange(t, change.status)
          return h('div', { className: 'dli-git-row', key: `${index}:${change.path}` },
            h('span', { className: `dli-git-badge dli-git-badge-${view.tone}` }, view.label),
            h('span', { className: 'dli-git-path', title: change.path }, change.path),
            view.staged ? h('span', { className: 'dli-git-staged' }, t('gitStaged')) : null)
        })
        const commits = loaded.commits.map((commit) => h('div', {
          className: 'dli-git-commit', key: commit.hash,
        },
        // The message leads and wraps: it is what the reader scans for, while the
        // hash under it is a reference to copy rather than the headline.
        h('div', { className: 'dli-git-subject', title: commit.subject }, commit.subject),
        h('div', { className: 'dli-git-hash' }, commit.short),
        h('div', { className: 'dli-git-byline' }, `${commit.author} · ${formatCommitDate(commit.date)}`)))
        return h('div', { className: 'dli-git-cols' },
          column(t('gitChanges'), changes.length,
            changes.length === 0 ? note(t('gitEmptyChanges')) : changes),
          column(t('gitCommits'), commits.length,
            commits.length === 0 ? note(t('gitEmptyCommits')) : commits))
      }

      return h('div', { className: 'dli-git' }, bar, sendNote, body())
    }

    // ---- plugin -------------------------------------------------------------

    const plugin = {
      name: 'little-icon-client',
      inject: ['slots', 'locale', 'configForms'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'little-icon: dictionaries')
        ctx.effect(() => {
          injectStyles()
          return () => {}
        }, 'little-icon: stylesheet')
        // The tab type names itself when it is opened, outside any render, so the
        // definition needs its own binding of this namespace.
        const t = ctx.locale.bind(NS)

        // The pet sleeps only when nobody is doing anything, and the Host sees
        // agents and jobs rather than input, so the page reports its own use.
        // Throttled: the Host only needs to know activity happened recently.
        let lastPing = 0
        const ping = () => {
          const now = Date.now()
          if (now - lastPing < ACTIVITY_PING_MS) return
          lastPing = now
          void fetch(ACTIVITY_PATH, { method: 'POST' }).catch(() => {})
        }
        const onVisibility = () => { if (document.visibilityState === 'visible') ping() }
        for (const name of ACTIVITY_EVENTS) window.addEventListener(name, ping, { passive: true, capture: true })
        document.addEventListener('visibilitychange', onVisibility)
        ping()
        ctx.effect(() => () => {
          for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, ping, { capture: true })
          document.removeEventListener('visibilitychange', onVisibility)
        }, 'little-icon: activity reporting')

        /**
         * Carry out one menu command the pet reported. The pet window belongs to
         * another process, so the page is what acts on a choice made there.
         */
        const runMenuCommand = {
          chat: () => {
            // The Browser tab is a shipped type a Web profile may leave disabled,
            // and a build without the right Sidebar provides no service at all, so
            // both are looked up instead of injected: this plugin must load and
            // render its settings card either way.
            const sidebar = ctx.get('sidebarRight')
            if (sidebar === undefined || ctx.get('sidebarRightTabs')?.get(BROWSER_TAB) === undefined) {
              console.warn('little-icon: this DSH build has no in-app Browser tab to open %s in', CHAT_URL)
              return
            }
            // "In DSH" is the requirement: the chat site opens beside the
            // conversation, in the same surface DSH's own chat links use, never in
            // the system browser.
            sidebar.openTab(BROWSER_TAB, { params: { url: CHAT_URL } })
          },
          git: () => {
            // Nothing shipped is needed here: the page type is this plugin's own,
            // so the only thing that can be missing is the right Sidebar itself.
            const sidebar = ctx.get('sidebarRight')
            if (sidebar === undefined || ctx.get('sidebarRightTabs')?.get(GIT_KIND) === undefined) {
              console.warn('little-icon: this DSH build has no right Sidebar to open the Git page in')
              return
            }
            sidebar.openTab(GIT_KIND)
          },
        }

        // The Host holds this stream open and relays the pet's menu commands on it.
        const commands = new EventSource(COMMANDS_PATH)
        commands.onmessage = (event) => {
          let command
          try {
            command = JSON.parse(event.data).command
          } catch {
            return
          }
          const run = runMenuCommand[command]
          if (run === undefined) {
            console.warn('little-icon: unknown menu command "%s"', command)
            return
          }
          try {
            run()
          } catch (error) {
            console.warn('little-icon: menu command "%s" failed', command, error)
          }
        }
        ctx.effect(() => () => { commands.close() }, 'little-icon: menu commands')

        // The Git page, in the two stages the right Sidebar's registry defines: the
        // type, then its body under the type's own id. The registry waits for the
        // service, so a build with the Sidebar present gets both whenever the
        // Sidebar's own plugin happens to load, and a build without one simply
        // never runs this — the settings card above still loads there.
        ctx.inject(['sidebarRightTabs', 'slots'], (scope) => {
          scope.effect(() => scope.sidebarRightTabs.register({
            id: GIT_TYPE_ID,
            kind: GIT_KIND,
            title: () => t('gitTab'),
          }), 'little-icon: git tab type')
          scope.effect(() => scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
            name: 'sidebar.right.pane.tab',
            key: GIT_TYPE_ID,
            locale: NS,
            // The component reaches no service itself: one callback reads the
            // repository, the other puts a message in the conversation, and both
            // are bound to the Session this tab belongs to.
            inject: (sessionId) => ({
              load: async (cwd, signal) => {
                const response = await fetch(`${GIT_PATH}?cwd=${encodeURIComponent(cwd)}`, { signal })
                if (!response.ok) throw new Error(`little-icon: the Git route answered ${response.status}`)
                return response.json()
              },
              /**
               * Send one user message into this Session.
               *
               * `ctx.conversation.send` is the composer's own admission — the text
               * becomes an ordinary user turn in the session log, which is what
               * makes the agent read it as an instruction and act on it with its
               * own tools. The Session's scope is borrowed rather than opened: a
               * Session nobody holds has no conversation to put anything in.
               * @param text - the message to send, verbatim.
               * @returns `{ ok: true }`, or `{ ok: false }` with `no-channel` when
               *   this Session has no live conversation and `failed` with the
               *   admission's own message.
               */
              sendPrompt: async (text) => {
                const conversation = ctx.get('sessions')?.scope(sessionId)?.get('conversation')
                if (conversation === undefined) return { ok: false, reason: 'no-channel' }
                try {
                  await conversation.send(text)
                  return { ok: true }
                } catch (error) {
                  return {
                    ok: false,
                    reason: 'failed',
                    message: error instanceof Error ? error.message : String(error),
                  }
                }
              },
            }),
          }, GitPanel)), 'little-icon: git tab body')
        })

        // The Host document stays the single owner of every value; this half
        // mirrors the accepted section into a snapshot the card renders.
        const form = ctx.configForms.get(NS)
        const store = createSnapshotStore({ ...form.getSnapshot(), save: 'idle' })
        const publish = (patch) => { store.set({ ...store.getSnapshot(), ...patch }) }
        ctx.effect(() => form.subscribe(() => { publish(form.getSnapshot()) }), 'little-icon: settings snapshot')

        let pending = {}
        let timer
        const flush = () => {
          const patch = pending
          pending = {}
          const ops = Object.entries(patch).map(([field, value]) => ({ op: 'set', path: [field], value }))
          if (ops.length === 0) return
          void form.mutate(ops, form.getSnapshot().revision).then(
            (accepted) => { publish({ save: accepted ? 'saved' : 'failed' }) },
            () => { publish({ save: 'failed' }) },
          )
        }

        /**
         * Queue field writes; a slider drag is merged into one write.
         * @param patch - field values to write.
         * @param immediate - write at once (switches, selects) or after the drag settles.
         */
        const write = (patch, immediate) => {
          pending = { ...pending, ...patch }
          publish({ save: 'idle' })
          if (timer !== undefined) clearTimeout(timer)
          if (immediate) flush()
          else timer = setTimeout(flush, WRITE_DELAY_MS)
        }

        ctx.effect(() => () => { if (timer !== undefined) clearTimeout(timer) }, 'little-icon: pending writes')

        ctx.effect(() => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config',
          key: PACKAGE_NAME,
          locale: NS,
          inject: () => ({ hooks: { petSettings: store }, write }),
        }, PetSettings)), 'little-icon: pet settings card')
      },
    }

    module.exports = plugin
    return module.exports
  },
})
