# 个人工作副本约定

> 本文件是本地覆盖层（`AGENTS.local.md`），不属于 DeepSeek 官方仓库。

## 仓库性质

- 本工作副本是从 DeepSeek 官方仓库 fork 到个人 git 的（`origin` = `alwayswinder/deepseek-harness`），更新方式是合并上游 master。
- 因此除 `_mytools/` 以外的所有文件都是**上游文件**。

## 多机使用

- 本工作副本会在多台电脑上拉取更新使用，全部是 Windows。改动要按「换一台机器也正确」来写，不能只在当前机器上可用。
- 不写死盘符、用户名或绝对路径：脚本从自身位置（`%~dp0`）推导仓库路径，用户数据目录统一读 `$DSH_HOME`（未设置时回退 `~/.dsh`）。
- 解析 `$DSH_HOME` 时与 harness 的 `resolveDshHome` 保持一致：空白视为未设置、展开开头的 `~`、结果转为绝对路径。
- Windows 批处理保持 CRLF 换行（`_mytools/.gitattributes` 已固定 `*.bat text eol=crlf`）；`echo` 里带括号的文字不要直接写进 `( ... )` 块，cmd 会把括号当成块边界并报错。
- 依赖与路径按机器无关的方式声明（如 `file:<仓库>/...`），不要把某台机器的安装路径写进配置；`$DSH_HOME` 下的凭据、本地账本等按机器独立，文档里要写明，避免误以为会跟着同步。
- 树外插件放 `_mytools/Plugins/`，由 `_mytools/start-dsh.bat` 注册并把最新源码同步进 profile 副本；改完插件必须重启 `dsh web` 才生效。

## 改动边界

- 只允许在 `_mytools/` 下修改、新增、删除内容：个人工具、脚本、插件、笔记等。
- 上游文件保持与 DeepSeek 官方版本一致：不要修改、不要重构、不要顺手修 bug、不要调整格式。
- 需要新增文件时放在 `_mytools/` 下；不要在上游目录（`packages/`、`apps/`、`scripts/`、`docs/`、`snapshots/` 等）里新增个人文件。

## 需要改上游文件时

- 先说明：要改哪个文件、为什么必须改、有没有只改 `_mytools/` 或 `$DSH_HOME` 的替代方案。
- 首选替代：用户配置写 `$DSH_HOME`（`settings.yaml`、`profiles/`），插件和脚本放 `_mytools/`。
- 得到明确同意后再改，并在回复中说明这次改动会在下次合并上游时带来冲突。

## 提交与推送

- **不要未经我同意就提交或推送。** 只有我主动要求时才执行（例如「提交」「推送」「commit」「push」）；改完先汇报改动与验证结果，等我说了再做。
- git 提交信息用中文书写：主题与正文都用中文。
- 保留 Conventional Commits 的类型与范围前缀（如 `fix(_mytools/deepseek-usage): `），前缀之后用中文描述，例如 `fix(_mytools/deepseek-usage): 去掉对话条里重复的 token 数`。
- 之前已推送的英文提交不追溯修改。

## 不要做

- 不要为了让检查通过而修改上游的测试、快照、脚本或文档。
- 不要把个人配置写进 `packages/`、`apps/`、`scripts/`、`docs/`、`snapshots/`。
