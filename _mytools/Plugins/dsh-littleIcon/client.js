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
 * "chat" and the Sites entries open their address where Chat's own "Open chat
 * links in" preference points — DSH's Browser tab, or the system browser — while
 * "git" opens this plugin's own Git page beside the conversation.
 *
 * The Git page is a tab type this plugin registers itself: the right Sidebar's
 * registry is the extension point for exactly that, so the page needs neither the
 * product's Browser tab nor any other shipped viewer. It draws what the Host's
 * Git route answers for the Session's working directory. Listings and details
 * are reads; the remote status check refreshes one tracking ref, and only Pull
 * moves the local branch or working tree.
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

    /** The row whose "Open chat links in" preference decides where a site opens. */
    const CHAT_NS = 'ui-chat'

    /** The destination that preference takes while nobody has chosen one. */
    const DEFAULT_LINK_OPENING = 'sidebar'

    /** The right-Sidebar page type the pet's "git" entry opens. */
    const GIT_KIND = 'little-icon-git'

    /**
     * That type's implementation identity: the key its definition registers
     * under, and the key its body registers under in `sidebar.right.pane.tab`.
     */
    const GIT_TYPE_ID = '@local/dsh-little-icon/git'

    /** The Host route the Git page reads the Session's repository from. */
    const GIT_PATH = '/api/little-icon/git'

    /** The Host route it reads one changed file's diff from, on a double-click. */
    const GIT_DIFF_PATH = '/api/little-icon/git/diff'

    /** The Host route it reads one commit's changed files from, the same way. */
    const GIT_COMMIT_PATH = '/api/little-icon/git/commit'

    /** The Host route it reads later pages of the history column from, under the same filter. */
    const GIT_COMMITS_PATH = '/api/little-icon/git/commits'

    /** The Host route that refreshes and compares the configured upstream. */
    const GIT_REMOTE_PATH = '/api/little-icon/git/remote'

    /** The Host route that fast-forwards the current branch from its upstream. */
    const GIT_PULL_PATH = '/api/little-icon/git/pull'

    /**
     * The Host route that opens a directory in the system file manager. Which
     * directory is a Session detail this half alone knows, and opening one is
     * something only the Host can do, so the menu's open command is this half
     * naming the directory on that route.
     */
    const OPEN_PATH = '/api/little-icon/open'

    /**
     * The Host routes behind the music section of this card. The page cannot list a
     * folder, cannot reach Bilibili, and cannot play a file while the DSH window is
     * hidden — the pet does that — so everything here reads what this machine has and
     * asks the Host for the work.
     */
    const MUSIC_PATH = '/api/little-icon/music'
    const MUSIC_SYNC_PATH = '/api/little-icon/music/sync'
    const MUSIC_DOWNLOAD_PATH = '/api/little-icon/music/download'
    /** POST `?url=`: every link one pasted link stands for, without downloading any. */
    const MUSIC_EXPAND_PATH = '/api/little-icon/music/expand'
    /** POST `?count=`: a set this half just added, so the pet can say how many. */
    const MUSIC_ADDED_PATH = '/api/little-icon/music/added'
    const MUSIC_REMOVE_PATH = '/api/little-icon/music/remove'
    const MUSIC_COMMAND_PATH = '/api/little-icon/music/command'

    /**
     * How often the card re-reads the library while it is on screen: a download's
     * progress and the pet's playback live on the Host, so the card follows them
     * rather than being told. The request is a local one and the page is not busy.
     */
    const MUSIC_POLL_MS = 4_000

    /** Volume a fresh install plays at; mirrors the Host schema default. */
    const MUSIC_VOLUME_DEFAULT = 70

    /**
     * Clamp a volume the pet's menu reported to the range the player accepts.
     * @param value - the number the frame carried.
     * @returns the volume to write, or undefined when the frame named no number.
     */
    const clampMusicVolume = (value) => {
      const number = Number(value)
      if (!Number.isFinite(number)) return undefined
      return Math.max(0, Math.min(100, Math.round(number)))
    }

    /**
     * The links one pasted link stands for, asked of the Host so that the parsing and
     * the video's own facts stay on the half that talks to Bilibili. A bare video link
     * covers its whole set — every part of a multi-part video, or the episodes of the
     * collection it belongs to — while a link that names a part stays that part.
     * Nothing is downloaded here: a set of a hundred songs is added long before it is
     * fetched.
     * @param request - fetches one Host path and answers its JSON.
     * @param raw - the link as pasted.
     * @returns `{ ok: true, title, links, fresh, total, known }`, or the Host's failure.
     */
    const expandMusicLink = async (request, raw) => {
      const text = String(raw ?? '').trim()
      if (text === '') return { ok: false, reason: 'empty' }
      try {
        return await request(`${MUSIC_EXPAND_PATH}?url=${encodeURIComponent(text)}`)
      } catch (error) {
        console.warn('little-icon: the Host could not expand the link', error)
        return { ok: false, reason: 'network' }
      }
    }

    /**
     * What the Git page's button says into the conversation; the button itself
     * keeps the short `gitCommitAndPush` label. The message is a real user turn,
     * admitted exactly as the composer admits one, so the agent reads it as an
     * instruction and commits and pushes with its own tools.
     */
    const COMMIT_AND_PUSH_PROMPT = '审查本地改动，没有问题就提交并推送吧'

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
      shotDir: '',
      sites: [],
      coopAddress: '192.168.1.3:15180',
      coopHotkey: 'ctrl+alt+f12',
      coopAutoStart: true,
      musicLinks: [],
      musicDir: '',
      musicVolume: MUSIC_VOLUME_DEFAULT,
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
    const MUSIC_VOLUME = { min: 0, max: 100, step: 1 }

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
      shotDir: '截图存放位置',
      shotDirHint: '右键菜单「截图」存下的 PNG 放在这个文件夹里；留空就放在 DSH 自己的 little-icon/shots 下。',
      shotDirPlaceholder: '留空 = 默认位置',
      shotDirBrowse: '浏览…',
      sites: '常用网站',
      sitesHint: '右键桌宠菜单里的「常用网站」按这里的顺序列出，点一条就在右侧的 Browser 标签里打开；备注是菜单上显示的名字，留空就用网址的域名。',
      sitesLogin: '登录状态由右侧的浏览器按工作区保存，桌面端重启、重新 build 都不用重登。',
      coop: '多机协同',
      coopHint: '右键桌宠菜单的「特殊功能 → 多机协同」用它：主机端监听，被控端连过来（谁先点都行）。地址里写主机端的 IP——哪台机器的网卡地址与它相同，哪台就当主机端；两台共用这一项设置，各自不必再设角色。',
      coopAddress: '主机端地址',
      coopAddressHint: 'IP:端口。主机端按这个端口监听，被控端连到这个地址；主机 IP 变了只改这一处。',
      coopHotkey: '切换热键',
      coopHotkeyHint: '主机端用它在本机与远程之间切换，例如 ctrl+alt+f12。',
      coopAutoStart: 'DSH 启动时自动启用',
      coopAutoStartHint: '默认打开：DSH 一起来就按上面的地址启动多机协同，不必再点菜单。从菜单里停掉的链路，这次运行期间不会自己再起来，下次启动照常。',
      coopAddressPlaceholder: '192.168.1.3:15180',
      siteNotePlaceholder: '备注（菜单上显示的名字）',
      siteAddressPlaceholder: '网址，例如 chat.deepseek.com',
      siteAdd: '添加一个网站',
      siteRemove: '删除',
      siteBadAddress: '这个地址打不开（只支持 http/https，且不能带用户名密码），菜单里不会出现它。',
      music: '听歌',
      musicHint: '右键桌宠菜单的「听歌」用它：播放、暂停、换歌都在桌宠进程里，DSH 收起来也照样放。这里只保存 B站链接；音频文件下载到下面的目录，不放进仓库。换目录后已经下好的文件不会跟着搬，去新目录要重新补全。',
      musicDir: '音乐目录',
      musicDirHint: '音频文件的存放位置；留空就是 DSH 自己的 little-icon/music。指到仓库里的目录会被忽略、改用默认目录——那些文件会被一起提交。',
      musicDirPlaceholder: '留空 = DSH 自己的 little-icon/music',
      musicVolume: '音量',
      musicVolumeHint: '桌宠播放的音量；这一项跟着设置文件走，每台机器共用。',
      musicAddPlaceholder: '粘贴 B站链接（BV号 / av号 / b23.tv 短链都行）',
      musicAdd: '添加',
      musicAdding: '正在解析并下载，请稍候…',
      musicAdded: '已添加：{title}',
      musicSetAdded: '已加入 {count} 首；点上面的「补全缺失」开始下载',
      musicSetCount: '{count} 首 · 已下载 {ready} 首',
      musicSetOpen: '展开',
      musicSetClose: '收起',
      musicSetRemove: '删除整组',
      musicSetRemoveFiles: '删除整组（{count} 个文件）',
      musicSetRemovePartial: '有 {count} 个文件没能删除（可能正在播放）。',
      musicAlready: '这条链接已经在列表里了。',
      musicList: '歌曲列表',
      musicListEmpty: '还没有链接。粘贴一条 B站视频地址，它会下载成人声/伴奏完整的音频文件。',
      musicMissing: '未下载',
      musicReady: '已下载',
      musicDownloading: '下载中',
      musicFailed: '下载失败',
      musicRemove: '删除',
      musicRemoveHint: '同时删掉这台机器上已下载的文件',
      musicSync: '补全缺失（{count} 首）',
      musicSyncing: '正在下载：{done}/{total}',
      musicSyncNone: '没有缺失的歌曲',
      musicSyncRunning: '已经在补全了，等它下完再试。',
      musicNotPlaying: '桌宠没有在播放',
      musicPlaying: '正在播放：{title}',
      musicPaused: '已暂停：{title}',
      musicPlay: '播放',
      musicPause: '暂停',
      musicNext: '下一首',
      musicPrev: '上一首',
      musicCount: '共 {count} 首可用',
      musicExtras: '下面这些文件在这台机器上，但没有对应的链接——多半是链接删掉后文件留下了。',
      musicExtrasRemove: '删除文件',
      musicWarnInsideCheckout: '这个目录在仓库里，下载的音频会被提交进版本库；这一项被忽略，改用了默认目录。',
      musicWarnUnwritable: '这个目录建不出来或不能写，下载会失败；换一个能写的目录。',
      musicReasonEmpty: '链接是空的。',
      musicReasonUnrecognized: '认不出这条链接，只支持 B站视频的 BV/av 号或 b23.tv 短链。',
      musicReasonVideo: '取不到视频信息（{message}）。',
      musicReasonAudio: '取不到音频流（{message}）。',
      musicReasonNoAudio: '这个视频没有音频流，换一个。',
      musicReasonNetwork: '网络请求失败：{message}',
      musicReasonWrite: '音频写不进音乐目录：{message}',
      musicReasonBusy: '文件正在被桌宠播放，先换一首再删。',
      musicReasonRunning: '桌宠正在补全歌曲，等它下完再添加。',
      musicReasonUnknown: '这条记录找不到了，刷新一下。',
      musicReadFailed: '读不到音乐库：{message}',
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
      gitAuthorFilter: '按作者筛选',
      gitAuthorAll: '全部作者',
      gitAuthorOption: '{name}（{count}）',
      gitMore: '加载更多',
      gitMoreLoading: '加载中…',
      gitMoreRetry: '重试',
      gitMoreFailed: '加载更多失败：{message}',
      gitRefresh: '刷新',
      gitPull: '拉取',
      gitPulling: '拉取中…',
      gitPulled: '已拉取',
      gitUpToDate: '已是最新',
      gitRemoteChecking: '检查中…',
      gitRemoteCurrent: '已是最新',
      gitRemoteBehind: '{count} 个提交待拉取',
      gitRemoteDiverged: '已分叉 · {count} 个待拉取',
      gitRemoteNoUpstream: '未跟踪上游',
      gitRemoteDetached: 'detached HEAD',
      gitRemoteUnknown: '远端状态未知',
      gitRemoteFailed: '远端状态检查失败：{message}',
      gitPullDetached: '当前处于 detached HEAD，无法拉取',
      gitPullNoUpstream: '当前分支没有上游分支，无法拉取',
      gitPullTimedOut: '拉取超时，请检查网络后重试',
      gitPullFailed: '拉取失败：{message}',
      gitLoading: '读取中…',
      gitStaged: '已暂存',
      gitBranch: '分支 {name}',
      gitEmptyChanges: '没有未提交的改动。',
      gitEmptyCommits: '还没有提交记录。',
      gitEmptyAuthor: '这个作者没有提交记录。',
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
      gitDiffHint: '双击查看改动详情',
      gitDiffBack: '返回',
      gitDiffLoading: '读取差异中…',
      gitDiffEmpty: '这个文件没有可显示的差异。',
      gitDiffTruncated: '差异太长，只显示开头一部分。',
      gitCommitHint: '双击查看这次提交涉及的文件',
      gitCommitLoading: '读取文件列表中…',
      gitCommitFiles: '{count} 个文件',
      gitCommitEmpty: '这次提交没有改动文件。',
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
      shotDir: 'Screenshot folder',
      shotDirHint: 'Where the right-click menu\'s screenshots are written; leave it empty for the plugin\'s own little-icon/shots directory.',
      shotDirPlaceholder: 'Empty = the default location',
      shotDirBrowse: 'Browse…',
      sites: 'Sites',
      sitesHint: 'The right-click menu lists these under "Sites", in this order; choosing one opens it in the Browser tab beside the conversation. The note is the name the menu shows — leave it empty to use the address\'s host.',
      sitesLogin: 'Sign-ins are kept by that Browser tab per workspace, so a restart or a rebuild does not ask for them again.',
      coop: 'Multi-machine',
      coopHint: 'The pet menu runs it under Special → Multi-machine: the host listens and the client dials in, so either side may start first. The address names the host — whichever machine has a network adapter on that IP becomes the host — and both machines share this one setting, so neither needs its role set separately.',
      coopAddress: 'Host address',
      coopAddressHint: 'IP:port. The host listens on this port and the client connects to this address; when the host IP changes, this is the only field to edit.',
      coopHotkey: 'Switch hotkey',
      coopHotkeyHint: 'The host uses it to switch between this computer and the remote one, for example ctrl+alt+f12.',
      coopAutoStart: 'Start with DSH',
      coopAutoStartHint: 'On by default: DSH brings the multi-machine link up at the address above as soon as it starts, with no menu entry to choose. A link stopped from the menu stays stopped for that run and starts again on the next one.',
      coopAddressPlaceholder: '192.168.1.3:15180',
      siteNotePlaceholder: 'Note (the name in the menu)',
      siteAddressPlaceholder: 'Address, for example chat.deepseek.com',
      siteAdd: 'Add a site',
      siteRemove: 'Remove',
      siteBadAddress: 'This address cannot open (HTTP/HTTPS only, and no user name or password), so the menu will not list it.',
      music: 'Music',
      musicHint: 'The right-click menu plays it under "Music": play, pause, and next all happen in the pet process, so it keeps playing while DSH is tucked away. Only the Bilibili links are kept here; the audio is downloaded into the folder below and never into the repository. Moving that folder does not move what is already downloaded — fill the new one in again.',
      musicDir: 'Music folder',
      musicDirHint: 'Where the audio files go; leave it empty for DSH\'s own little-icon/music. A folder inside the repository is ignored in favour of the default one, because those files would be committed with the links.',
      musicDirPlaceholder: 'Empty = DSH\'s own little-icon/music',
      musicVolume: 'Volume',
      musicVolumeHint: 'What the pet plays at; this one travels with the settings file, so both machines share it.',
      musicAddPlaceholder: 'Paste a Bilibili link (a BV id, an av id, or a b23.tv address)',
      musicAdd: 'Add',
      musicAdding: 'Resolving and downloading…',
      musicAdded: 'Added: {title}',
      musicSetAdded: 'Added {count} songs; use Download missing to fetch them',
      musicSetCount: '{count} songs · {ready} here',
      musicSetOpen: 'Show songs',
      musicSetClose: 'Hide songs',
      musicSetRemove: 'Remove the set',
      musicSetRemoveFiles: 'Remove the set ({count} files)',
      musicSetRemovePartial: '{count} files were left in place (one may be playing).',
      musicAlready: 'That link is already in the list.',
      musicList: 'Songs',
      musicListEmpty: 'No links yet. Paste a Bilibili video address and its audio is downloaded as a file.',
      musicMissing: 'not downloaded',
      musicReady: 'downloaded',
      musicDownloading: 'downloading',
      musicFailed: 'download failed',
      musicRemove: 'Remove',
      musicRemoveHint: 'Also deletes the downloaded file on this machine',
      musicSync: 'Download missing ({count})',
      musicSyncing: 'Downloading: {done}/{total}',
      musicSyncNone: 'Nothing is missing',
      musicSyncRunning: 'A fill-in is already running; try again after it finishes.',
      musicNotPlaying: 'The pet is not playing anything',
      musicPlaying: 'Now playing: {title}',
      musicPaused: 'Paused: {title}',
      musicPlay: 'Play',
      musicPause: 'Pause',
      musicNext: 'Next',
      musicPrev: 'Previous',
      musicCount: '{count} playable',
      musicExtras: 'These files are on this machine without a link — most likely a link was removed and its file stayed.',
      musicExtrasRemove: 'Delete file',
      musicWarnInsideCheckout: 'This folder is inside the repository, so the downloaded audio would be committed; it is ignored and the default folder is used instead.',
      musicWarnUnwritable: 'This folder cannot be created or written to, so downloads would fail; pick one that can.',
      musicReasonEmpty: 'The link is empty.',
      musicReasonUnrecognized: 'That link was not recognized; only a Bilibili BV/av id or a b23.tv address works.',
      musicReasonVideo: 'The video could not be read ({message}).',
      musicReasonAudio: 'The audio stream could not be read ({message}).',
      musicReasonNoAudio: 'That video carries no audio stream; try another one.',
      musicReasonNetwork: 'The network request failed: {message}',
      musicReasonWrite: 'The audio could not be written into the music folder: {message}',
      musicReasonBusy: 'The pet is playing that file; switch song and remove it again.',
      musicReasonRunning: 'The pet is filling the library in; try again once it finishes.',
      musicReasonUnknown: 'That entry is gone; refresh the card.',
      musicReadFailed: 'The library could not be read: {message}',
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
      gitAuthorFilter: 'Filter by author',
      gitAuthorAll: 'All authors',
      gitAuthorOption: '{name} ({count})',
      gitMore: 'Load more',
      gitMoreLoading: 'Loading…',
      gitMoreRetry: 'Retry',
      gitMoreFailed: 'Could not load more: {message}',
      gitRefresh: 'Refresh',
      gitPull: 'Pull',
      gitPulling: 'Pulling…',
      gitPulled: 'Pulled',
      gitUpToDate: 'Up to date',
      gitRemoteChecking: 'Checking…',
      gitRemoteCurrent: 'Up to date',
      gitRemoteBehind: '{count} to pull',
      gitRemoteDiverged: 'Diverged · {count} to pull',
      gitRemoteNoUpstream: 'No upstream',
      gitRemoteDetached: 'detached HEAD',
      gitRemoteUnknown: 'Remote status unknown',
      gitRemoteFailed: 'Could not check the remote: {message}',
      gitPullDetached: 'The repository is on a detached HEAD, so it cannot pull.',
      gitPullNoUpstream: 'The current branch has no upstream to pull from.',
      gitPullTimedOut: 'The pull timed out; check the network and try again.',
      gitPullFailed: 'Could not pull: {message}',
      gitLoading: 'Reading…',
      gitStaged: 'staged',
      gitBranch: 'branch {name}',
      gitEmptyChanges: 'No uncommitted changes.',
      gitEmptyCommits: 'No commits yet.',
      gitEmptyAuthor: 'No commits by this author.',
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
      gitDiffHint: 'Double-click to see the diff',
      gitDiffBack: 'Back',
      gitDiffLoading: 'Reading the diff…',
      gitDiffEmpty: 'This file has no diff to show.',
      gitDiffTruncated: 'The diff is long, so only its beginning is shown.',
      gitCommitHint: 'Double-click to see the files this commit touched',
      gitCommitLoading: 'Reading the file list…',
      gitCommitFiles: '{count} files',
      gitCommitEmpty: 'This commit changed no files.',
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
        '.dli-path{display:flex;gap:8px;align-items:center;}',
        '.dli-pair{display:flex;gap:8px;align-items:center;}',
        '.dli-text{flex:1 1 auto;min-width:0;background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.12));',
        'color:inherit;border:1px solid rgba(127,127,127,.35);border-radius:6px;padding:4px 8px;font:inherit;}',
        '.dli-button{flex:0 0 auto;background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.12));',
        'color:inherit;border:1px solid rgba(127,127,127,.35);border-radius:6px;padding:4px 10px;font:inherit;',
        'cursor:pointer;}',
        '.dli-button:disabled{cursor:default;opacity:.5;}',
        // One site per line: a note and an address side by side, the remove button
        // at the end, and — when the address cannot open — the reason under both
        // boxes rather than a row that silently never reaches the menu.
        '.dli-sites{display:flex;flex-direction:column;gap:8px;}',
        '.dli-site{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr) auto;gap:8px;align-items:center;}',
        '.dli-site-problem{grid-column:1/-1;color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px;}',
        '.dli-sites-foot{display:flex;align-items:center;gap:8px;}',
        '.dli-sites-foot .dli-hint{flex:1 1 auto;min-width:0;}',
        // Music: one line for what the pet is playing and its transport buttons, one
        // for the link being added, then one row per link — its title, the state of
        // this machine's copy, and the button that removes both.
        '.dli-music{display:flex;flex-direction:column;gap:8px;}',
        '.dli-music-now{display:flex;align-items:center;gap:8px;}',
        '.dli-music-now .dli-music-title{flex:1 1 auto;min-width:0;overflow:hidden;',
        'text-overflow:ellipsis;white-space:nowrap;}',
        '.dli-music-add{display:flex;gap:8px;align-items:center;}',
        '.dli-music-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;}',
        '.dli-music-set{display:flex;flex-direction:column;gap:6px;padding-top:8px;',
        'border-top:0.5px solid rgba(127,127,127,.25);}',
        '.dli-music-set .dli-music-name{font-weight:600;}',
        '.dli-music-set-buttons{display:flex;gap:6px;}',
        '.dli-music-row-child{padding-left:14px;}',
        '.dli-music-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        '.dli-music-state{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;}',
        '.dli-music-state[data-state="ready"]{color:var(--dsw-alias-state-success-primary);}',
        '.dli-music-state[data-state="failed"]{color:var(--dsw-alias-state-error-primary);}',
        '.dli-music-foot{display:flex;align-items:center;gap:8px;}',
        '.dli-music-foot .dli-hint{flex:1 1 auto;min-width:0;}',
        '.dli-music-extras{display:flex;flex-direction:column;gap:6px;padding-top:8px;',
        'border-top:0.5px solid rgba(127,127,127,.25);}',
        '.dli-music-warning{color:var(--dsw-alias-state-warn-label);font-size:11px;line-height:16px;}',
        '.dli-music-message{min-height:16px;}',
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
        '.dli-git-refresh,.dli-git-pull{flex:0 0 auto;font:inherit;color:inherit;cursor:pointer;',
        'background:transparent;border:1px solid rgba(127,127,127,.35);border-radius:6px;padding:2px 10px;}',
        '.dli-git-refresh{margin-left:auto;}',
        '.dli-git-refresh:disabled,.dli-git-pull:disabled{opacity:.5;cursor:default;}',
        '.dli-git-send{flex:0 0 auto;font:inherit;color:inherit;cursor:pointer;padding:2px 12px;',
        'background:rgba(127,127,127,.18);border:1px solid rgba(127,127,127,.4);border-radius:6px;}',
        '.dli-git-send:disabled{opacity:.5;cursor:default;}',
        '.dli-git-send[data-sent="true"]{color:#3fb950;border-color:rgba(63,185,80,.5);background:rgba(63,185,80,.12);}',
        // Two columns side by side, stacked once the pane is too narrow to hold
        // both: a fixed split would leave one of them unreadable in a small pane.
        // Tracks divide the height between the columns, so each list keeps its
        // own scrollport; a wrapping flex line is sized by its items instead,
        // which leaves both columns taller than the pane with nothing to scroll.
        '.dli-git-cols{display:grid;flex:1 1 auto;gap:12px;min-height:0;',
        'grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));grid-auto-rows:minmax(0,1fr);}',
        '.dli-git-col{display:flex;flex-direction:column;min-width:0;min-height:0;',
        'border:1px solid rgba(127,127,127,.25);border-radius:8px;overflow:hidden;}',
        '.dli-git-head{display:flex;align-items:center;gap:8px;padding:6px 10px;',
        'border-bottom:0.5px solid rgba(127,127,127,.25);}',
        '.dli-git-title{font-weight:600;}',
        '.dli-git-remote{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
        'font-size:11px;line-height:18px;padding:0 6px;border-radius:999px;',
        'color:var(--dsw-alias-label-secondary);background:rgba(127,127,127,.14);}',
        '.dli-git-remote[data-tone="success"]{color:var(--dsw-alias-state-success-primary);',
        'background:var(--dsw-alias-state-success-tertiary);}',
        '.dli-git-remote[data-tone="warn"]{color:var(--dsw-alias-state-warn-label);',
        'background:var(--dsw-alias-state-warn-tertiary);}',
        '.dli-git-remote[data-tone="error"]{color:var(--dsw-alias-state-error-primary);',
        'background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);}',
        '.dli-git-count{margin-left:auto;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
        // The author filter sits on its own row under the heading rather than
        // beside it: the heading already carries the title, the upstream badge,
        // and the count, and a control wedged among them is unreadable in a
        // narrow column.
        '.dli-git-filter{display:flex;flex:0 0 auto;align-items:center;gap:6px;padding:6px 10px;',
        'border-bottom:0.5px solid rgba(127,127,127,.25);}',
        '.dli-git-author{flex:1 1 auto;min-width:0;font:inherit;font-size:12px;color:inherit;',
        'background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.12));border:1px solid rgba(127,127,127,.35);',
        'border-radius:6px;padding:2px 6px;cursor:pointer;}',
        '.dli-git-list{flex:1 1 auto;min-height:0;overflow:auto;padding:4px 0;}',
        // The end of the list is also the way to the next page: the row stays
        // inside the scrollport, so scrolling to it is what asks for more.
        '.dli-git-more{display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 10px;}',
        '.dli-git-more-button{font:inherit;font-size:12px;color:inherit;cursor:pointer;padding:2px 12px;',
        'background:transparent;border:1px solid rgba(127,127,127,.35);border-radius:6px;}',
        '.dli-git-more-button:disabled{opacity:.5;cursor:default;}',
        '.dli-git-more-note{color:var(--dsw-alias-label-secondary);font-size:11px;text-align:center;}',
        '.dli-git-row{display:flex;align-items:center;gap:6px;padding:2px 10px;}',
        '.dli-git-row:hover{background:rgba(127,127,127,.10);}',
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
        '.dli-git-commit:hover{background:rgba(127,127,127,.10);}',
        '.dli-git-commit+.dli-git-commit{border-top:0.5px solid rgba(127,127,127,.18);}',
        // The message wraps rather than trailing off: it leads the row, and the
        // column is too narrow to show a full subject on one line.
        '.dli-git-subject{overflow-wrap:anywhere;}',
        '.dli-git-hash{font-size:11px;color:var(--dsw-alias-label-secondary);',
        'font-family:ui-monospace,SFMono-Regular,Consolas,monospace;}',
        '.dli-git-byline{color:var(--dsw-alias-label-secondary);font-size:11px;}',
        '.dli-git-note{margin:0;padding:8px 10px;color:var(--dsw-alias-label-secondary);}',
        // The detail behind a row takes the two columns' room: the question is
        // the same one — what changed — asked about one path or one commit.
        '.dli-git-detail{display:flex;flex:1 1 auto;flex-direction:column;gap:8px;min-height:0;}',
        '.dli-git-detail-head{display:flex;flex:0 0 auto;align-items:center;gap:8px;min-height:28px;}',
        '.dli-git-detail-back{flex:0 0 auto;font:inherit;color:inherit;cursor:pointer;padding:2px 10px;',
        'background:transparent;border:1px solid rgba(127,127,127,.35);border-radius:6px;}',
        '.dli-git-detail-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}',
        '.dli-git-short{flex:0 0 auto;font-size:11px;padding:1px 8px;border-radius:999px;',
        'background:rgba(127,127,127,.14);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;}',
        // One commit's files, as rows rather than diff text, so it scrolls in the
        // page's own font; the diff below keeps its monospace instead.
        '.dli-git-detail-body{flex:1 1 auto;min-height:0;overflow:auto;padding:4px 0;',
        'border:1px solid rgba(127,127,127,.25);border-radius:8px;}',
        // A rename reads as the new path with where it came from beside it; the
        // source may be long, so it gives way to the path before it is cut off.
        '.dli-git-from{flex:0 1 auto;color:var(--dsw-alias-label-secondary);font-size:11px;',
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        // The diff keeps its own line breaks and scrolls sideways rather than
        // wrapping: a wrapped line no longer says what the file's lines are.
        '.dli-git-diff-body{flex:1 1 auto;min-height:0;overflow:auto;padding:6px 0;',
        'border:1px solid rgba(127,127,127,.25);border-radius:8px;background:rgba(127,127,127,.06);',
        'font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:18px;}',
        '.dli-git-diff-line{white-space:pre;padding:0 10px;}',
        '.dli-git-diff-add{color:#3fb950;background:rgba(63,185,80,.12);}',
        '.dli-git-diff-del{color:#f85149;background:rgba(248,81,73,.12);}',
        '.dli-git-diff-hunk{color:#58a6ff;}',
        '.dli-git-diff-meta{color:var(--dsw-alias-label-secondary);}',
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
     * The address a site row will offer, or undefined when it will not be offered.
     * The Host owns this rule — it leaves a row it cannot open out of the menu and
     * checks the address again when the pet sends one back — and this is the same
     * rule read a second time so the card can say so on the row instead of an
     * entry quietly missing from the menu.
     * @param value - the address as typed.
     * @returns the absolute address the Browser tab would open, or undefined.
     */
    function siteAddress(value) {
      const text = typeof value === 'string' ? value.trim() : ''
      if (text === '') return undefined
      const candidate = /^[a-z][a-z0-9+.-]*:/iu.test(text) ? text : `https://${text}`
      try {
        const url = new URL(candidate)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
        if (url.username !== '' || url.password !== '') return undefined
        return url.href
      } catch {
        return undefined
      }
    }

    /**
     * One row per configured link, with whatever this machine has for it. The rows
     * come from the form, so adding or removing a link shows at once, and each one is
     * matched to the Host's answer by its own link text — which is the identity the
     * Host uses too, because one video has many spellings and only the pasted text
     * survives all of them.
     * @param library - the Host's view, or null before the first answer.
     * @param links - the configured links, in the configured order.
     * @returns the rows, and the files the Host found without a link.
     */
    function musicRows(library, links) {
      const known = Array.isArray(library?.entries) ? library.entries : []
      return {
        rows: links.map(link => known.find(entry => entry.link === link) ?? {
          link, id: '', state: 'unknown', title: '', owner: '', durationMs: 0, size: 0,
        }),
        extras: Array.isArray(library?.extras) ? library.extras : [],
      }
    }

    /**
     * The link rows folded into the sets they came from: a hundred parts of one video
     * are one group rather than a hundred lines. A group of one stays a line, because a
     * header above a single song is more to read, not less.
     * @param rows - one row per link, in the configured order.
     * @returns one group per source, in the order its first row appeared.
     */
    function musicGroups(rows) {
      const groups = new Map()
      for (const row of rows) {
        // The entry id names the part — `BV…-p7` is the seventh part of `BV…` — and a
        // row the Host has not answered about yet falls back to its own link.
        const base = String(row.id !== '' ? row.id : row.link).replace(/-p\d+$/u, '')
        const group = groups.get(base)
        if (group === undefined) groups.set(base, { base, rows: [row] })
        else group.rows.push(row)
      }
      return [...groups.values()]
    }

    /**
     * What a set is called in the card: the video's own title, which every part of it
     * repeats with ` - <part>` appended. A set with nothing readable left falls back to
     * the link it came from.
     * @param group - one `musicGroups` entry.
     * @returns the title, never empty.
     */
    function musicSetTitle(group) {
      for (const row of group.rows) {
        const title = typeof row.title === 'string' ? row.title.trim() : ''
        if (title === '') continue
        const cut = title.lastIndexOf(' - ')
        return cut > 0 ? title.slice(0, cut) : title
      }
      return group.base
    }

    /**
     * Why a download did not happen, in the reader's words. The Host answers with a
     * reason and the message the service gave it, so the reason picks the sentence and
     * the message is shown inside it rather than instead of it.
     * @param t - bound translator.
     * @param result - the Host's answer.
     * @returns one line of copy.
     */
    function musicReasonText(t, result) {
      const message = typeof result?.message === 'string' ? result.message : ''
      switch (result?.reason) {
        case 'empty': return t('musicReasonEmpty')
        case 'running': return t('musicReasonRunning')
        case 'unrecognized': return t('musicReasonUnrecognized')
        case 'video': return t('musicReasonVideo', { message })
        case 'audio': return t('musicReasonAudio', { message })
        case 'no-audio': return t('musicReasonNoAudio')
        case 'network': return t('musicReasonNetwork', { message })
        case 'write': return t('musicReasonWrite', { message })
        case 'busy': return t('musicReasonBusy')
        case 'unknown': return t('musicReasonUnknown')
        default: return message
      }
    }

    /**
     * The music part of the pet's settings card.
     *
     * Three things live here because they are one decision each: the volume the pet
     * plays at (a config field, shared through the settings file), the folder this
     * machine downloads into (a config field too, but machine-shaped — a path that
     * does not exist here is reported rather than obeyed), and the links themselves,
     * which are the only part of the feature the repository carries. What this machine
     * has for each link comes from the Host, which is also where every download runs,
     * so the card never handles audio and never needs DSH to be in front.
     * @param props - `t`, editability, the form draft, the config writer, the slider
     *   factory the other rows use, and the directory picker.
     * @returns the section.
     */
    function MusicSection(props) {
      const { t, editable, draft, write, slider, pickDirectory } = props
      const [library, setLibrary] = React.useState(null)
      const [busy, setBusy] = React.useState('')
      const [message, setMessage] = React.useState('')
      const [libraryError, setLibraryError] = React.useState('')
      const [link, setLink] = React.useState('')
      // Which sets are unfolded. The songs are the detail behind a set's own line, so a
      // hundred-part video does not push everything else off the card.
      const [openSets, setOpenSets] = React.useState(() => ({}))

      /**
       * Read what the Host knows: the links' files, the sync, the pet's playing.
       * A read that fails after the card already has an answer says nothing — the
       * library it shows is still the last thing this machine knew, and replacing an
       * action's own message with "Failed to fetch" reads as that action failing.
       * Only a card that never got an answer reports one.
       * @param first - whether this is the card's first read.
       */
      const reload = async (first = false) => {
        try {
          const response = await fetch(MUSIC_PATH)
          if (!response.ok) throw new Error(String(response.status))
          setLibrary(await response.json())
          setLibraryError('')
        } catch (error) {
          if (first) setLibraryError(String(error?.message ?? error))
        }
      }

      React.useEffect(() => {
        let cancelled = false
        let seen = false
        const load = async () => {
          try {
            const response = await fetch(MUSIC_PATH)
            if (!response.ok) throw new Error(String(response.status))
            const payload = await response.json()
            if (cancelled) return
            seen = true
            setLibraryError('')
            setLibrary(payload)
          } catch (error) {
            if (!cancelled && !seen) setLibraryError(String(error?.message ?? error))
          }
        }
        void load()
        const timer = setInterval(() => { void load() }, MUSIC_POLL_MS)
        return () => { cancelled = true; clearInterval(timer) }
      }, [])

      const links = Array.isArray(draft.musicLinks) ? draft.musicLinks : []
      const { rows, extras } = musicRows(library, links)
      // One line per source rather than one per song: a set is what a person added, and
      // the songs inside it are what they open when they want them.
      const groups = musicGroups(rows)
      const ready = rows.filter(row => row.state === 'ready').length
      // What the Host counted is authoritative once it answered — it also knows about
      // a file a person deleted by hand — and the rows are the fallback before that.
      const missing = library?.missing ?? rows.length - ready
      const sync = library?.sync ?? null
      const syncing = sync?.running === true
      const player = library?.player ?? null
      const playing = player?.playing === true
      const playingTitle = typeof player?.title === 'string' ? player.title : ''
      const nowText = playingTitle === ''
        ? t('musicNotPlaying')
        : playing ? t('musicPlaying', { title: playingTitle }) : t('musicPaused', { title: playingTitle })
      const warning = library?.warning === 'inside-checkout' ? t('musicWarnInsideCheckout')
        : library?.warning === 'unwritable' ? t('musicWarnUnwritable') : ''

      const ask = async (path) => {
        const response = await fetch(path, { method: 'POST' })
        return await response.json()
      }

      const addLink = async () => {
        const url = link.trim()
        if (url === '' || busy !== '') return
        if (links.includes(url)) { setMessage(t('musicAlready')); return }
        setBusy('add')
        setMessage(t('musicAdding'))
        // The list is config and the file is this machine's, so both are written here:
        // the list through the form (which is what the repository carries), the file
        // through the Host route that resolves and downloads it. One link can stand
        // for a whole set, so the Host is asked what it means first and only the links
        // the list does not already hold are added.
        const outcome = await expandMusicLink(ask, url)
        if (outcome?.ok !== true) {
          setMessage(musicReasonText(t, outcome ?? { reason: 'network' }))
          setBusy('')
          return
        }
        const fresh = Array.isArray(outcome.fresh) ? outcome.fresh : []
        if (fresh.length === 0) {
          setMessage(t('musicAlready'))
          setBusy('')
          return
        }
        write({ musicLinks: [...links, ...fresh] }, true)
        if (fresh.length === 1) {
          try {
            const result = await ask(`${MUSIC_DOWNLOAD_PATH}?url=${encodeURIComponent(fresh[0])}`)
            if (result.ok === true) {
              setMessage(t('musicAdded', { title: typeof result.title === 'string' && result.title !== '' ? result.title : fresh[0] }))
            } else {
              setMessage(musicReasonText(t, result))
            }
          } catch (error) {
            setMessage(musicReasonText(t, { reason: 'network', message: String(error?.message ?? error) }))
          }
        } else {
          // Added whole rather than fetched whole: the pet says how many, and the
          // fill-in button above is what starts the downloads.
          setMessage(t('musicSetAdded', { count: fresh.length }))
          try {
            await ask(`${MUSIC_ADDED_PATH}?count=${fresh.length}`)
          } catch (error) {
            console.warn('little-icon: the pet could not be told about the added songs', error)
          }
        }
        setLink('')
        setBusy('')
        await reload()
      }

      /** Drop one link, and the file it names on this machine. */
      const removeRow = async (row) => {
        write({ musicLinks: links.filter(entry => entry !== row.link) }, true)
        if (typeof row.id === 'string' && row.id !== '') {
          try {
            const result = await ask(`${MUSIC_REMOVE_PATH}?id=${encodeURIComponent(row.id)}`)
            if (result.ok !== true) setMessage(musicReasonText(t, result))
          } catch (error) {
            setMessage(musicReasonText(t, { reason: 'network', message: String(error?.message ?? error) }))
          }
        }
        await reload()
      }

      /** The one click that fills a machine in after it pulled the links. */
      const syncAll = async () => {
        setBusy('sync')
        try {
          const result = await ask(MUSIC_SYNC_PATH)
          if (result.ok !== true) setMessage(result.reason === 'running' ? t('musicSyncRunning') : musicReasonText(t, result))
          else if (result.started === 0) setMessage(t('musicSyncNone'))
        } catch (error) {
          setMessage(musicReasonText(t, { reason: 'network', message: String(error?.message ?? error) }))
        }
        setBusy('')
        await reload()
      }

      /** Delete one file that no link claims; the Host may refuse it while the pet plays it. */
      const removeFile = async (row) => {
        try {
          const result = await ask(`${MUSIC_REMOVE_PATH}?id=${encodeURIComponent(row.id)}`)
          if (result.ok !== true) setMessage(musicReasonText(t, result))
        } catch (error) {
          setMessage(musicReasonText(t, { reason: 'network', message: String(error?.message ?? error) }))
        }
        await reload()
      }

      /** One playback command for the pet, which is the half that owns the audio. */
      const command = async (action) => {
        try { await ask(`${MUSIC_COMMAND_PATH}?action=${action}`) } catch { /* the next read shows the truth */ }
        await reload()
      }

      const stateText = (state) => state === 'ready' ? t('musicReady')
        : state === 'downloading' ? t('musicDownloading')
          : state === 'failed' ? t('musicFailed')
            : state === 'missing' ? t('musicMissing') : ''

      const musicDirControl = h('div', { className: 'dli-path' },
        h('input', {
          className: 'dli-text', type: 'text', disabled: !editable,
          value: draft.musicDir ?? '', placeholder: t('musicDirPlaceholder'),
          onChange: (event) => props.echo({ musicDir: event.target.value }),
          onBlur: (event) => write({ musicDir: event.target.value.trim() }, true),
          onKeyDown: (event) => { if (event.key === 'Enter') event.target.blur() },
        }),
        h('button', {
          className: 'dli-button', type: 'button', disabled: !editable,
          onClick: () => {
            void pickDirectory().then((picked) => {
              if (typeof picked === 'string' && picked !== '') write({ musicDir: picked }, true)
            })
          },
        }, t('shotDirBrowse')))

      const rowOf = (row, extra, child = false) => h('div', {
        className: child ? 'dli-music-row dli-music-row-child' : 'dli-music-row',
        key: `${extra ? 'extra' : 'link'}-${row.id || row.link}`,
      },
        h('span', { className: 'dli-music-name', title: row.link }, row.title !== '' ? row.title : row.link),
        h('span', { className: 'dli-music-state', 'data-state': row.state }, stateText(row.state)),
        h('button', {
          className: 'dli-button', type: 'button', disabled: !editable,
          title: t('musicRemoveHint'),
          onClick: () => { void (extra ? removeFile(row) : removeRow(row)) },
        }, extra ? t('musicExtrasRemove') : t('musicRemove')))

      /** Drop every link of one set, and this machine's files for the rows that have one. */
      const removeSet = async (group) => {
        const setLinks = group.rows.map(row => row.link)
        write({ musicLinks: links.filter(entry => !setLinks.includes(entry)) }, true)
        const ids = group.rows.map(row => row.id).filter(id => typeof id === 'string' && id !== '')
        if (ids.length === 0) return
        try {
          const result = await ask(`${MUSIC_REMOVE_PATH}?ids=${encodeURIComponent(ids.join(','))}`)
          if (result.ok !== true) setMessage(musicReasonText(t, result))
          // One file the Host refused to delete — the one the pet is playing — leaves the
          // rest of the set gone, so the line says what stayed rather than looking clean.
          else if (result.failed > 0) setMessage(t('musicSetRemovePartial', { count: result.failed }))
        } catch (error) {
          setMessage(musicReasonText(t, { reason: 'network', message: String(error?.message ?? error) }))
        }
        await reload()
      }

      /**
       * One set as a line of its own: what it is, how much of it is here, and the two
       * things a set needs — opening, and going away in one step rather than a hundred.
       */
      const setRowOf = (group) => {
        const open = openSets[group.base] === true
        const ready = group.rows.filter(row => row.state === 'ready').length
        return h('div', { className: 'dli-music-set', key: `set-${group.base}` },
          h('div', { className: 'dli-music-row' },
            h('span', { className: 'dli-music-name', title: group.base }, musicSetTitle(group)),
            h('span', { className: 'dli-music-state' }, t('musicSetCount', { count: group.rows.length, ready })),
            h('span', { className: 'dli-music-set-buttons' },
              h('button', {
                className: 'dli-button', type: 'button',
                onClick: () => setOpenSets({ ...openSets, [group.base]: !open }),
              }, open ? t('musicSetClose') : t('musicSetOpen')),
              h('button', {
                className: 'dli-button', type: 'button', disabled: !editable,
                onClick: () => { void removeSet(group) },
              }, ready > 0 ? t('musicSetRemoveFiles', { count: ready }) : t('musicSetRemove')))),
          open ? group.rows.map(row => rowOf(row, false, true)) : null)
      }

      const list = h('div', { className: 'dli-music' },
        h('div', { className: 'dli-music-now' },
          h('span', { className: 'dli-music-title' }, nowText),
          h('button', { className: 'dli-button', type: 'button', disabled: !editable, onClick: () => { void command('play') } }, t('musicPlay')),
          h('button', { className: 'dli-button', type: 'button', disabled: !editable, onClick: () => { void command('pause') } }, t('musicPause')),
          h('button', { className: 'dli-button', type: 'button', disabled: !editable, onClick: () => { void command('prev') } }, t('musicPrev')),
          h('button', { className: 'dli-button', type: 'button', disabled: !editable, onClick: () => { void command('next') } }, t('musicNext'))),
        h('div', { className: 'dli-music-add' },
          h('input', {
            className: 'dli-text', type: 'text', disabled: !editable || busy !== '',
            value: link, placeholder: t('musicAddPlaceholder'),
            onChange: (event) => setLink(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter') void addLink() },
          }),
          h('button', {
            className: 'dli-button', type: 'button',
            disabled: !editable || busy !== '' || syncing || link.trim() === '',
            onClick: () => { void addLink() },
          }, busy === 'add' ? t('musicAdding') : t('musicAdd'))),
        rows.length === 0 ? h('div', { className: 'dli-hint' }, t('musicListEmpty'))
          : groups.map((group) => (group.rows.length === 1 ? rowOf(group.rows[0], false) : setRowOf(group))),
        h('div', { className: 'dli-music-foot' },
          h('button', {
            className: 'dli-button', type: 'button',
            disabled: !editable || syncing || busy === 'sync' || missing === 0,
            onClick: () => { void syncAll() },
          }, syncing
            ? t('musicSyncing', { done: sync?.done ?? 0, total: sync?.total ?? 0 })
            : missing > 0 ? t('musicSync', { count: missing }) : t('musicSyncNone')),
          h('span', { className: 'dli-hint' }, t('musicCount', { count: ready }))),
        extras.length === 0 ? null : h('div', { className: 'dli-music-extras' },
          h('div', { className: 'dli-hint' }, t('musicExtras')),
          extras.map(row => rowOf(row, true))),
        message === '' ? null : h('div', { className: 'dli-hint dli-music-message' }, message),
        libraryError === '' ? null : h('div', { className: 'dli-music-warning' }, t('musicReadFailed', { message: libraryError })),
        warning === '' ? null : h('div', { className: 'dli-music-warning' }, warning))

      return h('div', null,
        h(Row, {
          label: t('musicVolume'), value: t('percent', { value: Math.round(draft.musicVolume ?? MUSIC_VOLUME_DEFAULT) }),
          text: t('musicVolumeHint'), disabled: !editable,
          control: h('input', {
            min: MUSIC_VOLUME.min, max: MUSIC_VOLUME.max, step: MUSIC_VOLUME.step,
            ...slider('musicVolume'),
          }),
        }),
        h(Row, {
          label: t('musicDir'), text: t('musicDirHint'), disabled: !editable,
          control: musicDirControl,
        }),
        h(Row, {
          label: t('musicList'), disabled: !editable,
          control: list,
        }))
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

      /** Ask for a folder and store it; a cancelled picker changes nothing. */
      const pickDirectoryIntoFolder = async () => {
        const picked = await props.pickDirectory()
        if (typeof picked === 'string' && picked !== '') write({ shotDir: picked }, true)
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
      /**
       * The folder control: a path box that writes when it is left — typing is a
       * local echo, not one profile write per keystroke — beside the button that
       * fills it from the directory picker.
       */
      const shotDirControl = h('div', { className: 'dli-path' },
        h('input', {
          className: 'dli-text', type: 'text', disabled: !editable,
          value: draft.shotDir ?? '', placeholder: t('shotDirPlaceholder'),
          onChange: (event) => setDraft((current) => ({ ...current, shotDir: event.target.value })),
          onBlur: (event) => write({ shotDir: event.target.value.trim() }, true),
          onKeyDown: (event) => { if (event.key === 'Enter') event.target.blur() },
        }),
        h('button', {
          className: 'dli-button', type: 'button', disabled: !editable,
          onClick: () => { void pickDirectoryIntoFolder() },
        }, t('shotDirBrowse')))

      /**
       * The site rows the card edits, as the draft currently holds them; the Host
       * keeps the last accepted list and is the authority on what the menu offers.
       */
      const rows = Array.isArray(draft.sites) ? draft.sites : []

      /** Local echo for one row, so typing is not one profile write per keystroke. */
      const echoSite = (index, patch) => setDraft((current) => ({
        ...current,
        sites: (Array.isArray(current.sites) ? current.sites : [])
          .map((row, position) => (position === index ? { ...row, ...patch } : row)),
      }))

      /** One row plus a patch, as the value the whole list is written back as. */
      const withSite = (index, patch) => rows
        .map((row, position) => (position === index ? { ...row, ...patch } : row))

      /**
       * The address box of one row: local echo while typing, one list write when
       * it is left. A row of text boxes is otherwise one profile write per
       * keystroke, which is a whole YAML line rewritten for one character.
       */
      const siteBox = (index, row, field, placeholder) => h('input', {
        className: 'dli-text', type: 'text', disabled: !editable,
        value: typeof row[field] === 'string' ? row[field] : '', placeholder,
        onChange: (event) => echoSite(index, { [field]: event.target.value }),
        onBlur: (event) => write({ sites: withSite(index, { [field]: event.target.value.trim() }) }, true),
        onKeyDown: (event) => { if (event.key === 'Enter') event.target.blur() },
      })

      const siteRow = (row, index) => {
        const typed = typeof row.url === 'string' ? row.url.trim() : ''
        const problem = typed !== '' && siteAddress(typed) === undefined
        return h('div', { className: 'dli-site', key: `site-${String(index)}` },
          siteBox(index, row, 'name', t('siteNotePlaceholder')),
          siteBox(index, row, 'url', t('siteAddressPlaceholder')),
          h('button', {
            className: 'dli-button', type: 'button', disabled: !editable,
            onClick: () => write({ sites: rows.filter((_row, position) => position !== index) }, true),
          }, t('siteRemove')),
          problem ? h('div', { className: 'dli-site-problem' }, t('siteBadAddress')) : null)
      }

      const sitesControl = h('div', { className: 'dli-sites' },
        ...rows.map(siteRow),
        h('div', { className: 'dli-sites-foot' },
          h('button', {
            className: 'dli-button', type: 'button', disabled: !editable,
            onClick: () => write({ sites: [...rows, { name: '', url: '' }] }, true),
          }, t('siteAdd')),
          h('span', { className: 'dli-hint' }, t('sitesLogin'))))

      /** Local echo for one form field, for a box that writes on leaving rather than per keystroke. */
      const echo = (patch) => setDraft((current) => ({ ...current, ...patch }))

      const musicSection = h(MusicSection, {
        t, editable, draft, write, slider, pickDirectory: props.pickDirectory, echo,
      })

      return h('div', { className: 'dli-page' },
        h(Row, {
          label: t('enable'), text: t('enableHint'), inline: true, disabled: !editable,
          control: h('input', toggle('enabled')),
        }),
        h(Row, {
          label: t('sites'), text: t('sitesHint'), disabled: !editable,
          control: sitesControl,
        }),
        h(Row, {
          label: t('music'), text: t('musicHint'), disabled: !editable,
          control: musicSection,
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
        h(Row, {
          label: t('shotDir'), text: t('shotDirHint'), disabled: !editable,
          control: shotDirControl,
        }),
        h(Row, {
          label: t('coop'), text: t('coopHint'), disabled: !editable,
          control: h('div', { className: 'dli-pair' },
            h('input', {
              className: 'dli-text', type: 'text', disabled: !editable,
              value: draft.coopAddress ?? '', placeholder: t('coopAddressPlaceholder'),
              onChange: (event) => setDraft((current) => ({ ...current, coopAddress: event.target.value })),
              onBlur: (event) => write({ coopAddress: event.target.value.trim() }, true),
              onKeyDown: (event) => { if (event.key === 'Enter') event.target.blur() },
            }),
            h('input', {
              className: 'dli-text', type: 'text', disabled: !editable,
              value: draft.coopHotkey ?? '', placeholder: 'ctrl+alt+f12',
              title: t('coopHotkeyHint'),
              onChange: (event) => setDraft((current) => ({ ...current, coopHotkey: event.target.value })),
              onBlur: (event) => write({ coopHotkey: event.target.value.trim() }, true),
              onKeyDown: (event) => { if (event.key === 'Enter') event.target.blur() },
            }))}),
        h(Row, {
          label: t('coopAutoStart'), text: t('coopAutoStartHint'), inline: true, disabled: !editable,
          control: h('input', toggle('coopAutoStart')),
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
     * Read one commit file's status as what a row shows.
     *
     * Unlike the listing's two porcelain letters this is one letter, and a rename
     * or copy carries its similarity score in the same field (`R100`), which the
     * badge drops: the row already shows the two paths.
     * @param t - namespace-bound translate.
     * @param status - the status `git diff-tree --name-status` reported.
     * @returns the label and the badge color.
     */
    function describeCommitFile(t, status) {
      const letter = status[0]
      const copy = CHANGE_COPY[letter]
      return {
        label: copy === undefined ? t('gitUnknown') : t(copy),
        tone: CHANGE_TONE[letter] ?? 'other',
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
     * Why an explicit pull left the existing repository listing unchanged.
     * @param t - namespace-bound translate.
     * @param result - the Host's refusal.
     * @returns the compact line shown below the toolbar.
     */
    function gitPullReason(t, result) {
      switch (result.reason) {
        case 'detached-head': return t('gitPullDetached')
        case 'no-upstream': return t('gitPullNoUpstream')
        case 'timed-out': return t('gitPullTimedOut')
        case 'no-cwd':
        case 'no-dir':
        case 'no-git':
        case 'not-a-repo': return gitReason(t, result)
        default: return t('gitPullFailed', { message: result.message ?? '' })
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

    /** The header lines `git diff` writes before the first hunk. */
    const DIFF_HEADER_PREFIXES = [
      'diff ', 'index ', 'new file ', 'deleted file ', 'old mode ', 'new mode ',
      'similarity index ', 'rename ', 'copy ', 'Binary files ',
    ]

    /**
     * What one diff line is, which is what colors it.
     *
     * The two file headers start with the same characters as an added and a
     * removed line, so they are recognized first and shown as headers.
     * @param line - one line of a unified diff.
     * @returns the tone suffix of its class name.
     */
    function diffTone(line) {
      if (line.startsWith('@@')) return 'hunk'
      if (line.startsWith('+++') || line.startsWith('---')) return 'meta'
      if (DIFF_HEADER_PREFIXES.some((prefix) => line.startsWith(prefix))) return 'meta'
      if (line.startsWith('+')) return 'add'
      if (line.startsWith('-')) return 'del'
      return 'context'
    }

    /**
     * Split a unified diff into the lines the page draws.
     * @param text - the diff the Host sent.
     * @returns one `{ text, tone }` per line, in order.
     */
    function diffLines(text) {
      const body = text.endsWith('\n') ? text.slice(0, -1) : text
      if (body === '') return []
      return body.split('\n').map((line) => ({ text: line, tone: diffTone(line) }))
    }

    /**
     * The Git page: the Session's working directory, its uncommitted changes on
     * the left, and its commits on the right. Double-clicking either kind of
     * row replaces both columns with what that row is about — one file's diff, or
     * one commit's changed files — and a back button returns.
     *
     * The history column holds one page of commits and reads the next one when
     * its end comes into view, so the list keeps going rather than stopping at
     * the first page; the select under its heading narrows the whole list to one
     * author. Both are reads of the same list, so a page that a filter or a
     * refresh has replaced is dropped rather than appended.
     *
     * The upstream badge refreshes one remote-tracking ref without moving local
     * work. Pull is the only action that changes the branch or working tree: the
     * Host accepts it only as a fast-forward and returns the refreshed listing.
     * Nothing here stages, commits, pushes, or discards work. The working
     * directory comes from the Session rather than from a setting, so the page
     * follows whichever project the conversation is in.
     * @param props - slot props plus the injected `load`, `loadCommits`,
     *   `loadRemote`, `pull`, `loadDiff`, and `loadCommit` callbacks.
     * @returns the two columns, the open detail, or the line explaining why there
     *   is neither.
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
      const [pull, setPull] = React.useState({ phase: 'idle' })
      const pullController = React.useRef(undefined)
      // What has taken the two columns' place: `undefined` is the listing, and
      // anything else names one row's subject and how its read is going.
      const [detail, setDetail] = React.useState(undefined)
      // The history column's author filter, and its own page of commits: an
      // undefined `list` is the listing's first page, which is the one the column
      // shows until a filter or a further page replaces it.
      const [author, setAuthor] = React.useState('')
      const [history, setHistory] = React.useState({ author: '', list: undefined, more: false, phase: 'idle' })
      const historyController = React.useRef(undefined)
      // What the filter the column is showing is, for reads that were started
      // before it and land after it: the listing's own answer must not put an
      // unfiltered page under a heading that says otherwise.
      const authorRef = React.useRef('')
      React.useEffect(() => { authorRef.current = author }, [author])
      /** A listing that settled: every read of the column belongs to it from here. */
      const [listingRev, setListingRev] = React.useState(0)

      /**
       * Put the history column back on the listing's own first page.
       *
       * A listing and a pull both answer with one repository's first page, so
       * whatever page was read before them is stale; a filter that is still in
       * force is read again from that listing rather than left showing rows that
       * belong to the one before it.
       * @param forAuthor - the author filter the listing is being seeded under.
       */
      const seedHistory = (forAuthor) => {
        historyController.current?.abort()
        historyController.current = undefined
        setHistory(forAuthor === ''
          ? { author: '', list: undefined, more: false, phase: 'idle' }
          : { author: forAuthor, list: [], more: false, phase: 'loading' })
      }

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
          (result) => {
            if (controller.signal.aborted) return
            if (!result.ok) {
              setState({ phase: 'settled', result })
              return
            }
            setState({ phase: 'settled', result, remote: { phase: 'loading' } })
            // The listing carries the column's first page, so it is what the
            // column shows from here; a chosen author is read again below, once
            // this listing has replaced whatever page was on screen.
            seedHistory(authorRef.current)
            setListingRev((value) => value + 1)
            void props.loadRemote(result.root, controller.signal).then(
              (remoteResult) => {
                if (controller.signal.aborted) return
                setState((current) => current.result?.root === result.root
                  ? { ...current, remote: { phase: 'settled', result: remoteResult } }
                  : current)
              },
              (error) => {
                if (controller.signal.aborted) return
                setState((current) => current.result?.root === result.root
                  ? { ...current, remote: { phase: 'failed', error } }
                  : current)
              })
          },
          (error) => { if (!controller.signal.aborted) setState({ phase: 'failed', error }) })
        return () => { controller.abort(); historyController.current?.abort() }
      }, [cwd, tab.navigation.revision, attempt])

      /**
       * Read one page of the history column: the first page of an author's own
       * list, or the page after the rows on screen.
       *
       * One read at a time: a newer one aborts the one before it, so a page that
       * a filter or a refresh has already replaced cannot land on top of it.
       * @param who - the author identity to keep, or empty for every author.
       * @param skip - how many commits the column already shows.
       * @param append - whether the page extends the list rather than replacing it.
       */
      const readHistory = (who, skip, append) => {
        if (cwd === undefined || cwd === '') return
        const controller = new AbortController()
        historyController.current?.abort()
        historyController.current = controller
        const base = history.list ?? loaded?.commits ?? []
        setHistory((current) => ({
          author: who,
          list: append ? current.list ?? base : [],
          more: append && current.more,
          phase: 'loading',
        }))
        props.loadCommits(cwd, skip, who, controller.signal).then(
          (page) => {
            if (controller.signal.aborted) return
            historyController.current = undefined
            if (page.ok !== true) {
              // The repository became unreadable under the column: the rows
              // already read stay where they are, with the reason beneath them.
              setHistory((current) => ({ ...current, phase: 'refused', refused: page, more: true }))
              return
            }
            setHistory((current) => ({
              author: who,
              list: append ? [...current.list ?? base, ...page.commits] : page.commits,
              more: page.hasMore === true,
              phase: 'idle',
            }))
          },
          (error) => {
            if (controller.signal.aborted) return
            historyController.current = undefined
            // Keeping the rows and leaving the way forward is what makes a failed
            // page a retry rather than an empty column.
            setHistory((current) => ({ ...current, phase: 'failed', error, more: true }))
          })
      }

      // A listing that lands while an author is chosen is what that author's page
      // belongs to — a refresh, a pull, another repository — so it is read again
      // from that listing. An author this history does not have is dropped: a
      // filter nothing can match would only ever show an empty column.
      React.useEffect(() => {
        if (author === '' || loaded === undefined) return undefined
        if (!(loaded.authors ?? []).some((entry) => entry.id === author)) {
          setAuthor('')
          seedHistory('')
          return undefined
        }
        readHistory(author, 0, false)
        return undefined
      }, [listingRev])

      // The detail is read once, when a row is double-clicked or when the refresh
      // button re-arms it: the row it belongs to is its identity, so an answer
      // that arrives after another row was opened is dropped rather than shown.
      React.useEffect(() => {
        if (detail === undefined || detail.phase !== 'loading') return undefined
        const controller = new AbortController()
        /** Whether a later state is still the detail this read was started for. */
        const mine = (current) => current !== undefined && current.kind === detail.kind
          && (detail.kind === 'diff' ? current.path === detail.path : current.hash === detail.hash)
        const settle = (patch) => {
          if (controller.signal.aborted) return
          setDetail((current) => (mine(current) ? { ...current, ...patch } : current))
        }
        const read = detail.kind === 'diff'
          ? props.loadDiff(detail.root, detail.path, controller.signal)
          : props.loadCommit(detail.root, detail.hash, controller.signal)
        read.then(
          (result) => { settle({ phase: 'settled', result }) },
          (error) => { settle({ phase: 'failed', error }) })
        return () => { controller.abort() }
      }, [detail?.kind, detail?.path, detail?.hash, detail?.phase])

      // A different working directory is a different repository: a detail that
      // belonged to the last one says nothing about this one.
      React.useEffect(() => {
        pullController.current?.abort()
        pullController.current = undefined
        setPull({ phase: 'idle' })
        setDetail(undefined)
      }, [cwd])
      React.useEffect(() => () => { pullController.current?.abort() }, [])

      const reload = () => {
        // Refreshing re-reads what is on screen, which is the detail while one is open.
        setPull({ phase: 'idle' })
        setDetail((current) => (current === undefined ? current : { ...current, phase: 'loading' }))
        setAttempt((value) => value + 1)
      }
      const result = state.phase === 'settled' ? state.result : undefined
      const loaded = result?.ok === true ? result : undefined
      const note = (text) => h('p', { className: 'dli-git-note' }, text)

      /** Fast-forward the current branch, then replace the listing with the Host's fresh answer. */
      const pullLatest = () => {
        if (loaded === undefined || pull.phase === 'pulling' || cwd === undefined || cwd === '') return
        const controller = new AbortController()
        pullController.current?.abort()
        pullController.current = controller
        setPull({ phase: 'pulling' })
        void props.pull(cwd, controller.signal).then(
          (outcome) => {
            if (controller.signal.aborted) return
            pullController.current = undefined
            if (outcome.ok) {
              setState({
                phase: 'settled',
                result: outcome,
                remote: { phase: 'settled', result: { ok: true, relation: 'up-to-date', behind: 0 } },
              })
              // A pull answers with a fresh listing, which is the column's new
              // first page: the rows read before it belong to the old history.
              seedHistory(authorRef.current)
              setListingRev((value) => value + 1)
              setDetail(undefined)
              setPull({ phase: 'done', updated: outcome.updated === true })
            } else {
              setPull({ phase: 'failed', result: outcome })
            }
          },
          (error) => {
            if (controller.signal.aborted) return
            pullController.current = undefined
            setPull({ phase: 'failed', result: { reason: 'failed', message: String(error?.message ?? error) } })
          })
      }
      const pullLabel = () => {
        if (pull.phase === 'pulling') return t('gitPulling')
        if (pull.phase === 'done') return t(pull.updated ? 'gitPulled' : 'gitUpToDate')
        return t('gitPull')
      }

      /** Current upstream comparison, shown beside the recent-commits heading. */
      const remoteBadge = () => {
        if (loaded === undefined) return null
        const remote = state.remote
        let label = t('gitRemoteChecking')
        let tone = 'muted'
        let title
        if (remote?.phase === 'failed') {
          label = t('gitRemoteUnknown')
          tone = 'error'
          title = t('gitRemoteFailed', { message: String(remote.error?.message ?? remote.error) })
        } else if (remote?.phase === 'settled') {
          const status = remote.result
          if (status.ok) {
            if (status.relation === 'behind') {
              label = t('gitRemoteBehind', { count: status.behind })
              tone = 'warn'
            } else if (status.relation === 'diverged') {
              label = t('gitRemoteDiverged', { count: status.behind })
              tone = 'error'
            } else {
              label = t('gitRemoteCurrent')
              tone = 'success'
            }
          } else if (status.reason === 'no-upstream') {
            label = t('gitRemoteNoUpstream')
          } else if (status.reason === 'detached-head') {
            label = t('gitRemoteDetached')
          } else {
            label = t('gitRemoteUnknown')
            tone = 'error'
            title = t('gitRemoteFailed', { message: status.message ?? status.reason })
          }
        }
        return h('span', {
          className: 'dli-git-remote', 'data-tone': tone, title: title ?? label,
          role: 'status', 'aria-live': 'polite',
        }, label)
      }

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
          type: 'button', className: 'dli-git-refresh', onClick: reload,
          disabled: state.phase === 'loading' || pull.phase === 'pulling',
        }, t('gitRefresh')),
        h('button', {
          type: 'button', className: 'dli-git-pull', onClick: pullLatest,
          disabled: loaded === undefined || state.phase === 'loading' || state.remote?.phase === 'loading'
            || pull.phase === 'pulling',
        }, pullLabel()),
        h('button', {
          type: 'button', className: 'dli-git-send', onClick: submit,
          // Nothing to say about a directory whose state could not be read.
          disabled: loaded === undefined || send.phase === 'sending' || pull.phase === 'pulling',
          'data-sent': send.phase === 'sent' ? 'true' : undefined,
        }, sendLabel()))
      const sendNote = send.phase !== 'failed' ? null
        : note(send.reason === 'no-channel'
          ? t('gitSendNoChannel')
          : t('gitSendFailed', { message: send.message }))
      const pullNote = pull.phase === 'failed' ? note(gitPullReason(t, pull.result)) : null

      /**
       * One of the two columns: its heading, what sits under the heading, and the
       * rows in their own scrollport.
       * @param title - the column's name.
       * @param count - how many rows it currently holds.
       * @param rows - the rows, or the line explaining why there are none.
       * @param status - the upstream badge, when the column carries one.
       * @param options - the heading's filter row and the scrollport's own ref,
       *   which the history column needs for the next page.
       * @returns the column.
       */
      const column = (title, count, rows, status, options = {}) => h('section', { className: 'dli-git-col' },
        h('div', { className: 'dli-git-head' },
          h('span', { className: 'dli-git-title' }, title),
          status,
          h('span', { className: 'dli-git-count' }, String(count))),
        options.filter ?? null,
        h('div', { className: 'dli-git-list', ref: options.listRef }, rows))

      // The history column as the filter on screen sees it: a page read for
      // another author belongs to that author, not to this one.
      const historyMine = history.author === author
      const commitRows = !historyMine ? [] : history.list ?? loaded?.commits ?? []
      const moreCommits = historyMine
        && (history.list === undefined ? loaded?.hasMoreCommits === true : history.more)
      const commitPhase = historyMine ? history.phase : 'loading'
      const listNode = React.useRef(undefined)
      const moreNode = React.useRef(undefined)

      /** Ask for the page after the rows on screen. */
      const loadMore = () => {
        if (commitPhase === 'loading' || !moreCommits) return
        readHistory(author, commitRows.length, true)
      }

      // Reaching the end of the list is how the next page is asked for: the
      // sentinel lives inside the scrollport, so scrolling to it reads on before
      // the reader has to ask. The button in that row is the same read for a
      // pointer that arrived some other way.
      React.useEffect(() => {
        const node = moreNode.current
        if (node === undefined || node === null || typeof IntersectionObserver !== 'function') return undefined
        const observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) loadMore()
        }, { root: listNode.current ?? null })
        observer.observe(node)
        return () => { observer.disconnect() }
      }, [moreCommits, commitPhase, commitRows.length, author, loaded])

      /**
       * Narrow the history column to one author, or put every author back.
       * @param who - the identity the Host listed, or empty for all of them.
       */
      const chooseAuthor = (who) => {
        if (who === author) return
        setAuthor(who)
        // Every author again is the listing's own first page, which is already in
        // hand; one author is that author's first page, read from here.
        if (who === '') seedHistory('')
        else readHistory(who, 0, false)
      }

      /** The author filter, once the Host has named the authors of this history. */
      const authorFilter = () => {
        const authors = loaded?.authors ?? []
        if (authors.length === 0) return null
        return h('div', { className: 'dli-git-filter' },
          h('select', {
            className: 'dli-git-author', value: author,
            'aria-label': t('gitAuthorFilter'), title: t('gitAuthorFilter'),
            onChange: (event) => { chooseAuthor(event.target.value) },
          },
          h('option', { value: '' }, t('gitAuthorAll')),
          authors.map((entry) => h('option', {
            key: entry.id,
            value: entry.id,
            // The identity is what the filter matches on; the address beside it
            // is what tells two people with one name apart on hover.
            title: entry.email === '' ? entry.name : `${entry.name} <${entry.email}>`,
          }, t('gitAuthorOption', { name: entry.name, count: entry.commits })))))
      }

      /** The end of the history column: the next page, and how asking for it went. */
      const moreRow = () => h('div', { className: 'dli-git-more', ref: moreNode },
        h('button', {
          type: 'button', className: 'dli-git-more-button', disabled: commitPhase === 'loading',
          onClick: loadMore,
        }, commitPhase === 'loading' ? t('gitMoreLoading')
          : commitPhase === 'idle' ? t('gitMore') : t('gitMoreRetry')),
        commitPhase === 'failed'
          ? h('span', { className: 'dli-git-more-note' },
            t('gitMoreFailed', { message: String(history.error?.message ?? history.error) }))
          : null,
        commitPhase === 'refused'
          ? h('span', { className: 'dli-git-more-note' }, gitReason(t, history.refused))
          : null)

      /**
       * Open one changed file's diff, replacing the two columns.
       * @param change - the row's own entry from the listing.
       */
      const openDiff = (change) => {
        setDetail({ kind: 'diff', phase: 'loading', root: loaded?.root ?? '', path: change.path, status: change.status })
      }

      /**
       * Open one commit's changed files, replacing the two columns.
       * @param commit - the row's own entry from the listing.
       */
      const openCommit = (commit) => {
        setDetail({ kind: 'commit', phase: 'loading', root: loaded?.root ?? '', hash: commit.hash, commit })
      }

      /** The open detail's header: the way back, then what it is about. */
      const detailHead = () => {
        const back = h('button', {
          type: 'button', className: 'dli-git-detail-back', onClick: () => { setDetail(undefined) },
        }, t('gitDiffBack'))
        if (detail.kind === 'diff') {
          const view = detail.status === undefined ? undefined : describeChange(t, detail.status)
          return h('div', { className: 'dli-git-detail-head' },
            back,
            view === undefined ? null : h('span', { className: `dli-git-badge dli-git-badge-${view.tone}` }, view.label),
            h('span', { className: 'dli-git-detail-title', title: detail.path }, detail.path))
        }
        // The commit's own words lead, as they do in the column this was opened
        // from, with the count and the hash it names beside them.
        const count = detail.phase === 'settled' && detail.result?.ok === true
          ? h('span', { className: 'dli-git-count' }, t('gitCommitFiles', { count: detail.result.files.length }))
          : null
        return h('div', { className: 'dli-git-detail-head' },
          back,
          h('span', { className: 'dli-git-detail-title', title: detail.commit.subject }, detail.commit.subject),
          count,
          h('span', { className: 'dli-git-short' }, detail.commit.short))
      }

      /** One file the open commit touched. */
      const commitFile = (file, index) => {
        const view = describeCommitFile(t, file.status)
        return h('div', { className: 'dli-git-row', key: `${index}:${file.path}` },
          h('span', { className: `dli-git-badge dli-git-badge-${view.tone}` }, view.label),
          h('span', { className: 'dli-git-path', title: file.path }, file.path),
          // A rename is one row rather than two: the path it has now, and the one
          // it came from beside it.
          file.from === undefined
            ? null
            : h('span', { className: 'dli-git-from', title: file.from }, `← ${file.from}`))
      }

      /** What the open detail says: one file's diff text, or one commit's files. */
      const detailContent = () => {
        if (detail.phase === 'loading') {
          return note(t(detail.kind === 'diff' ? 'gitDiffLoading' : 'gitCommitLoading'))
        }
        if (detail.phase === 'failed') {
          return note(t('gitFailed', { message: String(detail.error?.message ?? detail.error) }))
        }
        const result = detail.result
        if (result?.ok !== true) return note(gitReason(t, result ?? {}))
        if (detail.kind === 'commit') {
          return result.files.length === 0
            ? note(t('gitCommitEmpty'))
            : h('div', { className: 'dli-git-detail-body' }, result.files.map(commitFile))
        }
        const lines = diffLines(result.text)
        if (lines.length === 0) return note(t('gitDiffEmpty'))
        // The cut is a line of the diff like any other, so the reader sees why
        // the text stops where it does.
        const rows = result.truncated === true
          ? [{ text: t('gitDiffTruncated'), tone: 'meta' }, ...lines]
          : lines
        return h('div', { className: 'dli-git-diff-body' },
          rows.map((line, index) => h('div', {
            className: `dli-git-diff-line dli-git-diff-${line.tone}`, key: index,
          }, line.text)))
      }

      const body = () => {
        // The detail is the same question about one row, so it takes both
        // columns' room rather than sitting beside them.
        if (detail !== undefined) {
          return h('section', { className: 'dli-git-detail' }, detailHead(), detailContent())
        }
        if (state.phase === 'failed') {
          return note(t('gitFailed', { message: String(state.error?.message ?? state.error) }))
        }
        if (result === undefined) return note(t('gitLoading'))
        if (loaded === undefined) return note(gitReason(t, result))
        const changes = loaded.changes.map((change, index) => {
          const view = describeChange(t, change.status)
          return h('div', {
            className: 'dli-git-row',
            key: `${index}:${change.path}`,
            // The path stays in the tooltip because the column is narrow enough to
            // shorten it; the second line says what a double-click does, which is
            // the only thing on this page that is not visible at a glance.
            title: `${change.path}\n${t('gitDiffHint')}`,
            onDoubleClick: () => { openDiff(change) },
          },
          h('span', { className: `dli-git-badge dli-git-badge-${view.tone}` }, view.label),
          h('span', { className: 'dli-git-path' }, change.path),
          view.staged ? h('span', { className: 'dli-git-staged' }, t('gitStaged')) : null)
        })
        const commits = commitRows.map((commit) => h('div', {
          className: 'dli-git-commit',
          key: commit.hash,
          title: `${commit.subject}\n${t('gitCommitHint')}`,
          onDoubleClick: () => { openCommit(commit) },
        },
        // The message leads and wraps: it is what the reader scans for, while the
        // hash under it is a reference to copy rather than the headline.
        h('div', { className: 'dli-git-subject' }, commit.subject),
        h('div', { className: 'dli-git-hash' }, commit.short),
        h('div', { className: 'dli-git-byline' }, `${commit.author} · ${formatCommitDate(commit.date)}`)))
        // An empty column says which kind of empty it is: a history with nothing
        // in it at all, one this author never wrote in, or a page still on its way.
        const commitBody = commits.length > 0
          ? (moreCommits || commitPhase !== 'idle' ? [...commits, moreRow()] : commits)
          : note(commitPhase === 'loading' ? t('gitLoading')
            : commitPhase === 'refused' ? gitReason(t, history.refused)
            : commitPhase === 'failed'
              ? t('gitMoreFailed', { message: String(history.error?.message ?? history.error) })
              : author === '' ? t('gitEmptyCommits') : t('gitEmptyAuthor'))
        return h('div', { className: 'dli-git-cols' },
          column(t('gitChanges'), changes.length,
            changes.length === 0 ? note(t('gitEmptyChanges')) : changes),
          column(t('gitCommits'), commitRows.length, commitBody, remoteBadge(), {
            filter: authorFilter(), listRef: listNode,
          }))
      }

      return h('div', { className: 'dli-git' }, bar, pullNote, sendNote, body())
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

        // Where a menu entry opens is the person's choice rather than this plugin's:
        // Chat and Sites must land where a chat link lands, so they follow ui-chat's
        // "Open chat links in" preference instead of keeping a second copy of it.
        // That row belongs to ui-chat and `configForms.get` answers for any id, so a
        // deployment without ui-chat reads no value and keeps the in-app Browser tab.
        // Read at the click rather than mirrored: nothing renders from it.
        const linkForm = ctx.configForms.get(CHAT_NS)
        const wantsInApp = () => (linkForm.getSnapshot().value?.linkOpening ?? DEFAULT_LINK_OPENING) === 'sidebar'

        /**
         * Open one address where the person's link preference points: the in-app
         * Browser tab, or the system browser, which is where the Desktop shell sends
         * an HTTP(S) `window.open`. Both services are looked up instead of injected
         * because a Web profile may leave the Browser type disabled and a build
         * without the right Sidebar provides neither: this plugin must load and
         * render its settings card either way.
         * @param url - HTTP(S) address to open.
         */
        const openAddress = (url) => {
          const sidebar = ctx.get('sidebarRight')
          const inApp = wantsInApp() && sidebar !== undefined
            && ctx.get('sidebarRightTabs')?.get(BROWSER_TAB) !== undefined
          if (inApp) {
            sidebar.openTab(BROWSER_TAB, { params: { url } })
            return
          }
          // The preference asked for the in-app tab and this build has none. Handing
          // the address to the system browser is what ui-chat's own fallback does;
          // saying so keeps the fallback from looking like a click that went nowhere.
          if (wantsInApp()) {
            console.warn('little-icon: this DSH build has no in-app Browser tab to open %s in', url)
          }
          window.open(url, '_blank', 'noopener,noreferrer')
        }

        /** The settings form this plugin's card edits: the Host document, mirrored here. */
        const musicForm = () => ctx.configForms.get(NS)

        /**
         * Write music configuration the way the card writes it: one form edit, sent
         * from this half. The Host cannot make this write, because the settings
         * service refuses a write attempted inside an HMR transaction and the Host's
         * timer runs in the context of the load that created it, so the menu's volume
         * and link entries are carried out here. What the Host publishes afterwards -
         * the notice above the pet included - follows from this write.
         * @param patch - field values to set.
         * @returns after the edit was accepted or refused.
         */
        const writeMusicConfig = (patch) => {
          const form = musicForm()
          if (form === undefined) {
            console.warn('little-icon: this build has no settings form to write music configuration through')
            return Promise.resolve()
          }
          const ops = Object.entries(patch).map(([field, value]) => ({ op: 'set', path: [field], value }))
          return form.mutate(ops, form.getSnapshot().revision).then(
            (accepted) => {
              if (!accepted) console.warn('little-icon: the music configuration the menu changed was not saved')
            },
            (error) => {
              console.warn('little-icon: the music configuration the menu changed failed to save', error)
            },
          )
        }

        /** The link list as the configuration holds it, which is what an added link joins. */
        const musicLinksNow = () => {
          const links = musicForm()?.getSnapshot()?.value?.musicLinks
          return Array.isArray(links) ? links : []
        }

        /** Ask one music route on the Host and answer its JSON. */
        const fetchMusicPath = async (path) => {
          const response = await fetch(path, { method: 'POST' })
          return await response.json()
        }

        /**
         * Carry out one menu command the pet reported. The pet window belongs to
         * another process, so the page is what acts on a choice made there.
         * @param payload - the frame's `{ command, url }`; only the site entry
         *   carries an address, and the Host has already checked it.
         */
        const runMenuCommand = {
          chat: () => {
            openAddress(CHAT_URL)
          },
          site: ({ url }) => {
            // One configured entry, by the address the Host put in the frame. The
            // address travelled pet -> file -> Host -> page, so it is checked once
            // more here, at the last point before a tab is handed it; a frame
            // carrying nothing openable opens nothing rather than a blank tab.
            const target = siteAddress(url)
            if (target === undefined) {
              console.warn('little-icon: a site entry named no openable address: %s', String(url))
              return
            }
            openAddress(target)
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
          'open-cwd': () => {
            // The directory is the one the main view holds, the same Session the
            // shipped "open workspace" control reads, because a pet click says
            // nothing about which Session is meant. The Host opens it and tells
            // the pet when it could not; this half has nowhere to report that,
            // and only names the directory the click is about.
            const listed = ctx.get('sessions')?.list?.getSnapshot()?.byId
            const current = Object.values(listed ?? {})
              .find(row => (row.retainedBy?.mainView ?? 0) > 0)
            void fetch(`${OPEN_PATH}?cwd=${encodeURIComponent(current?.cwd ?? '')}`, { method: 'POST' })
              .catch((error) => {
                console.warn('little-icon: the Host could not be asked to open the working directory', error)
              })
          },
          settings: () => {
            // This card lives on the Plugins page, which belongs to the plugin
            // manager: reaching it is cross-plugin navigation through the service
            // that page provides, not a route of this plugin's own. A build without
            // that panel provides no such service, so it is looked up rather than
            // injected - the reason the Sidebar entries above do the same.
            const navigation = ctx.get('pluginNavigation')
            if (navigation === undefined) {
              console.warn('little-icon: this DSH build has no Plugins page to show the settings card on')
              return
            }
            navigation.openBundle(PACKAGE_NAME)
          },
          aquarium: () => {
            // The glass aquarium belongs to another plugin and is opened through
            // the service that plugin provides, the same way the settings card
            // reaches the Plugins page: the pet's menu only names the game, and a
            // profile without that plugin says so instead of failing at the click.
            const aquarium = ctx.get('aquarium3d')
            if (aquarium === undefined) {
              console.warn('little-icon: the aquarium plugin is not installed, so there is no tank to open')
              return
            }
            aquarium.open()
          },
          'music-volume': ({ value }) => {
            // Configuration, so it is written from this half; the Host says the new
            // number above the pet once the configuration carries it, because the menu
            // that set it has already closed.
            const percent = clampMusicVolume(value)
            if (percent === undefined) {
              console.warn('little-icon: a volume command named no volume: %s', String(value))
              return
            }
            void writeMusicConfig({ musicVolume: percent })
          },
          'music-add-link': async ({ link }) => {
            // The Host checked the link before forwarding it. What is left is what the
            // card's own add does: ask what the link stands for, write the links the
            // list does not hold yet, and download it when it is a single one. A set is
            // only added - the menu's fill-in entry starts those downloads.
            const outcome = await expandMusicLink(fetchMusicPath, link)
            if (outcome?.ok !== true) {
              console.warn('little-icon: the menu link was not added: %s', String(outcome?.reason ?? 'network'))
              return
            }
            const fresh = Array.isArray(outcome.fresh) ? outcome.fresh : []
            if (fresh.length === 0) {
              console.warn('little-icon: that link is already in the list: %s', String(link))
              return
            }
            await writeMusicConfig({ musicLinks: [...musicLinksNow(), ...fresh] })
            try {
              await fetchMusicPath(fresh.length === 1
                ? `${MUSIC_DOWNLOAD_PATH}?url=${encodeURIComponent(fresh[0])}`
                : `${MUSIC_ADDED_PATH}?count=${fresh.length}`)
            } catch (error) {
              console.warn('little-icon: the Host could not be told about the added link', error)
            }
          },
        }

        // The Host holds this stream open and relays the pet's menu commands on it.
        const commands = new EventSource(COMMANDS_PATH)
        commands.onmessage = (event) => {
          let payload
          try {
            payload = JSON.parse(event.data)
          } catch {
            return
          }
          // The frame is read, not trusted: a property of Object.prototype is not
          // one of this plugin's entries.
          const run = Object.hasOwn(runMenuCommand, payload.command) ? runMenuCommand[payload.command] : undefined
          if (run === undefined) {
            console.warn('little-icon: unknown menu command "%s"', String(payload.command))
            return
          }
          try {
            run(payload)
          } catch (error) {
            console.warn('little-icon: menu command "%s" failed', String(payload.command), error)
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
            // The component reaches no service itself: these callbacks read the
            // repository, compare or fast-forward its upstream, read one detail,
            // or put a message in the conversation; all are bound to the Session
            // this tab belongs to.
            inject: (sessionId) => ({
              load: async (cwd, signal) => {
                const response = await fetch(`${GIT_PATH}?cwd=${encodeURIComponent(cwd)}`, { signal })
                if (!response.ok) throw new Error(`little-icon: the Git route answered ${response.status}`)
                return response.json()
              },
              /**
               * Read one page of the listing's own history.
               *
               * The page is asked for by the directory rather than by the root
               * the listing named, so the Host resolves the repository exactly as
               * it did for the listing: a workspace that moved since then is
               * answered about the repository that is there now.
               * @param cwd - the Session's working directory.
               * @param skip - how many commits the column already shows.
               * @param author - one identity from the listing's author list, or
               *   empty for every author.
               * @param signal - aborts the read when the page moves on.
               * @returns the Host's page: the commits, and whether more follow.
               */
              loadCommits: async (cwd, skip, author, signal) => {
                const query = `cwd=${encodeURIComponent(cwd)}&skip=${skip}&author=${encodeURIComponent(author)}`
                const response = await fetch(`${GIT_COMMITS_PATH}?${query}`, { signal })
                if (!response.ok) throw new Error(`little-icon: the Git commits route answered ${response.status}`)
                return response.json()
              },
              /**
               * Refresh and compare the branch's configured upstream.
               * @param root - repository root from the local listing.
               * @param signal - aborts the page's wait when it closes or refreshes.
               * @returns ahead/behind status, or why no status is available.
               */
              loadRemote: async (root, signal) => {
                const response = await fetch(`${GIT_REMOTE_PATH}?root=${encodeURIComponent(root)}`, {
                  method: 'POST', signal,
                })
                if (!response.ok) throw new Error(`little-icon: the Git remote route answered ${response.status}`)
                return response.json()
              },
              /**
               * Fast-forward the Session's repository from its configured upstream.
               * @param cwd - the Session's working directory.
               * @param signal - aborts the page's wait when it closes or changes repository.
               * @returns the refreshed listing plus whether HEAD moved.
               */
              pull: async (cwd, signal) => {
                const response = await fetch(`${GIT_PULL_PATH}?cwd=${encodeURIComponent(cwd)}`, {
                  method: 'POST', signal,
                })
                if (!response.ok) throw new Error(`little-icon: the Git pull route answered ${response.status}`)
                return response.json()
              },
              /**
               * Read one changed file's diff.
               *
               * The repository root travels rather than the Session's directory:
               * the path the listing gave is relative to the root, so Git has to
               * resolve it from there. Which comparison shows the change is the
               * Host's decision — it looks the path's status up itself.
               * @param root - the repository root from the listing.
               * @param path - the changed path, relative to the root.
               * @param signal - aborts the read when the page moves on.
               * @returns the Host's diff answer.
               */
              loadDiff: async (root, path, signal) => {
                const query = `root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`
                const response = await fetch(`${GIT_DIFF_PATH}?${query}`, { signal })
                if (!response.ok) throw new Error(`little-icon: the Git diff route answered ${response.status}`)
                return response.json()
              },
              /**
               * Read the files one commit touched.
               *
               * The Host asks Git for the commit's parents itself, so this only
               * names the repository and the hash the history column showed.
               * @param root - the repository root from the listing.
               * @param hash - the commit's full hash, as the listing reported it.
               * @param signal - aborts the read when the page moves on.
               * @returns the Host's answer: one entry per changed path.
               */
              loadCommit: async (root, hash, signal) => {
                const query = `root=${encodeURIComponent(root)}&hash=${encodeURIComponent(hash)}`
                const response = await fetch(`${GIT_COMMIT_PATH}?${query}`, { signal })
                if (!response.ok) throw new Error(`little-icon: the Git commit route answered ${response.status}`)
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

        /**
         * Ask for a folder, through the same picker the workspace panel opens.
         * @returns the chosen directory, or null when it was cancelled or this build
         *   has no picker.
         */
        const pickDirectory = async () => {
          const workspace = ctx.get('uiWorkspace')
          if (workspace === undefined) {
            console.warn('little-icon: this DSH build has no directory picker to choose a screenshot folder with')
            return null
          }
          try {
            return await workspace.pickDirectory()
          } catch (error) {
            console.warn('little-icon: choosing a screenshot folder failed', error)
            return null
          }
        }

        ctx.effect(() => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config',
          key: PACKAGE_NAME,
          locale: NS,
          inject: () => ({ hooks: { petSettings: store }, write, pickDirectory }),
        }, PetSettings)), 'little-icon: pet settings card')
      },
    }

    module.exports = plugin
    return module.exports
  },
})
