# 个人工作副本约定

> 本文件是本地覆盖层（`AGENTS.local.md`），不属于 DeepSeek 官方仓库。

## 工作方式

- **先取证再说话，不猜状态。** 结论只要涉及「现在到底是什么情况」——进程或服务在不在跑、跑的是哪一版、某个文件或配置当前是什么值、某个操作有没有生效——就先实际测量再下结论：进程启动时间与命令行、文件 mtime 与哈希、`Test-Path`/`Get-Item`、依赖是 `link:` 还是 `file:` 副本、日志内容。测不到证据就直说「不确定」，不要拿推断当事实。
- **旧结论不等于现状**：上一轮量到的状态可能已经变了（重启过、改过、切换过），每轮重新取证，不把上一轮的话原样搬到这一轮。
- **报状态时连证据一起给**：哪条命令、看到什么，让人能当场复核。

## 仓库性质

- 本工作副本是 DeepSeek 官方仓库 fork 到个人 git 的：`origin` = `alwayswinder/deepseek-harness`，上游 remote 本机叫 **`upstream`**（另一台机器可能叫 `deepseek-ai`，`update-and-build.bat` 两个名字都认）。更新方式是合并上游 `master`。
- 个人改动只有下面这些，其余文件必须与上游一致；上游文件的那几处补丁记在 [UPSTREAM.md](_mytools/Plugins/dsh-littleIcon/UPSTREAM.md)，改动要往里追加：
  - `_mytools/**`，以及本文件 `AGENTS.local.md`；
  - `apps/desktop/src/main.ts`、`apps/desktop/src/browser-guests.ts`、`apps/desktop/tests/browser-guests.spec.ts`；
  - `packages/client/ui-sidebar-browser/`（`src/types.ts` 与三份 README）；
  - `.gitignore`（`.pnpm-tools/`、`_mytools/build/dsh-web*.log` 两行）。

## 多机使用

- 多台 Windows 机器共用本副本，改动要按「换一台机器也正确」来写，不能只在当前机器上可用。
- 不写死盘符、用户名或绝对路径：脚本从自身位置（`%~dp0`）推导仓库路径；用户数据目录统一读 `$DSH_HOME`——未设置或只有空白时回退 `~/.dsh`、展开开头的 `~`、转成绝对路径，与 harness 的 `resolveDshHome` 一致。
- Windows 批处理保持 CRLF 换行（`_mytools/.gitattributes` 固定 `*.bat text eol=crlf`）；`echo` 里带括号的文字不要直接写进 `( ... )` 块，cmd 会把括号当成块边界并报错。
- DSH 的启动与构建脚本都在 `_mytools/build/` 下；插件自带的测试与工具脚本跟各自插件走。
- 树外插件放 `_mytools/Plugins/`，由 `build\start-dsh.bat`（web）与 `build\start-desktop.bat`（desktop）注册。profile 里装的是链接还是副本**按实测，不能按插件名想当然**：`link:`（junction）时 profile 加载的就是源码本身，没有副本要同步；只有 `file:` 装成的副本才由 `build\sync-plugins.bat` 刷新（它每次启动都会实测链接类型再决定要不要复制）。生效时机同样分开看：宿主半边（`index.js`、`client.js`）要重启 DSH；插件自己另起的独立进程（桌宠 `pet/pet.ps1`、`assets/`、`labels.json`）只需重启那个进程。
- `$DSH_HOME` 下的凭据、会话、账本与 profile 安装记录（含本机绝对路径）按机器独立，不随仓库同步。

## 改动边界

- 只在 `_mytools/` 下修改、新增、删除内容（个人工具、脚本、插件、笔记）；新增文件也放这里，不要在上游目录（`packages/`、`apps/`、`scripts/`、`docs/`、`snapshots/` 等）里新增个人文件。
- 上游文件保持与官方一致：不重构、不顺手修 bug、不调格式；上游的测试、快照、脚本、文档也不为了让检查通过而改。
- 确实要改上游文件时：先说明改哪个、为什么必须改、有没有只改 `_mytools/` 或 `$DSH_HOME` 的替代方案；首选替代是用户配置写 `$DSH_HOME`（`settings.yaml`、`profiles/`）、插件与脚本放 `_mytools/`；得到明确同意后再改，并在回复中说明下次合并上游会带来冲突，改完记进 UPSTREAM.md。

## 提交与推送

- **未经同意不提交、不推送**：只有明确说「提交」「推送」才做；改完先汇报改动与验证结果，等确认。
- 提交信息用中文书写，保留 Conventional Commits 的类型与范围前缀，例如 `fix(_mytools/deepseek-usage): 去掉对话条里重复的 token 数`。
- 已推送的英文提交不追溯修改。

## 「更新上游」自动更新 + 构建流程

说一句「更新上游」（或类似意思）就跑 `_mytools/build/update-and-build.bat`（上游 remote 名由脚本自己解析）：

1. **`--check` 预检**：git、上游 remote、node、pnpm 可用；工作树没有未提交的改动（未跟踪文件不算）、没有进行中的 merge。有问题先停下汇报。
2. **更新**：`git fetch <上游>` → `git merge --no-edit <上游>/master`；有冲突就 `git merge --abort` 停下，**逐条处理并汇报**，不硬解、不带着冲突去构建（脚本 exit 2）。
3. **不自动 push**：只有另外说「推送」或显式带 `--push` 才推 `origin master`。
4. **preflight**：`node _mytools/build/preflight.mjs --mode desktop`；返回 2 就停下，修好再跑（脚本 exit 3），返回 1 只告警、继续。
5. **写契约**：`write-resume-plan.ps1` 把仓库、revision、日志路径与预期产物清单写进 `$DSH_HOME\build\resume-plan.json`，供构建结束后的 turn 核验。
6. **构建**：`build.bat --detached --restart --log <日志>`。完整构建会停掉本副本的 Electron，而本会话跑在它的进程树里——**被停瞬间这一轮 turn 必然中断，这是机制不是失败**；detached 构建脱离进程树活到结束，成功后自动把 app 拉回来，会话存在 `$DSH_HOME\sessions`。
7. **收尾**：app 回来后读 `resume-plan.json` 与 `$DSH_HOME\build\last-build.json`（外加日志）核对产物；detached 进程被 Ctrl+C / `0xC000013A` 打断也要从日志定位并修好，不允许静默烂尾。

「更新」（fetch + merge，含 merge commit）在说「更新上游」时即视为已授权；「推送」仍须单独明说。
