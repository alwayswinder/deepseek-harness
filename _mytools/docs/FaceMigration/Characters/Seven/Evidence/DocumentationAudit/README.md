# 文档目录整理核对

2026-11-09。本轮只整理文档与导航、补充离线检查，不构建、重导、保存或重载 Control Rig。整理前全部 Docs 及移除的旧眉毛说明已备份，路径见 [清单](reorganization.json)。

| 记录 | 含义 |
|---|---|
| [reorganization.json](reorganization.json) | 整理前每个文件的 SHA-256、移动对应关系、移除理由及受保护脚本 / 资产摘要；用于逐文件追踪 |
| [validation.json](validation.json) | 文档链接和导航配置、JSON 解析、72 项表格及配方覆盖、脚本输入路径、证据和资产保留检查 |

处理原则：

- 当前迁移方法与 Seven 部位数值分开；重复的眉毛实战、旧 SOP 和不足以覆盖完整 Rig 的重建命令从通用指南移除，源控制特殊值合入基础配方。
- 顶层只留 AI 入口和迁移配置，角色表、模板、配方与排障在各自子目录。
- 音频口型、身体 Rig、七 Float 实验及版本兼容记录移出 Docs 到 `ProjectNotes/`，保留独立功能知识；两张未引用的口型中间图和失效的旧眉毛面板说明（原名 BROW_PANEL.md）移除。
- 构建和回归所需的采样、参数、`previous_controls.json`、预览失败 / 恢复证据保持原字节，不把旧批次报告伪装成当前报告。
- 现有源脚本和 UE 资产不改动；新增 `Tools/FaceMigration/Scripts/validate_face_docs.py` 仅做离线检查。

复查命令：`python Tools/FaceMigration/Scripts/validate_face_docs.py --verify-reorganization`，额外对照整理前摘要。后续正常维护只运行不带该参数的检查，避免把合法功能变更与本次整理混淆。这项检查不连接 Max / UE，不能作为本次重新通过功能或视觉验收的证据。
