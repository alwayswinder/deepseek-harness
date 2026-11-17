# 名称总表覆盖核对（2026-11-09）

范围是 [72 项名称表](../../../../Docs/Reference/ControllerNames.md)及 [Seven 映射实例](../../face-controls.json)的名称覆盖、唯一性和文件引用；本轮不构建或修改 Rig，不重新验收各控制效果。

| 文件 | 检查范围 |
|---|---|
| [max_name_coverage.json](max_name_coverage.json) | 从运行中 Max 场景的 1096 个节点中，逐项匹配全部 72 个精确名称，无缺失或同名歧义；记录实际名称和类型 |
| [ue_name_coverage.json](ue_name_coverage.json) | 根据最近鼻侧控制保存 / 重载的构建报告、当时预览控制名及新增参数，核对 72 个动画控制完整覆盖；参考图 Visual Cue 单列排除。本轮 UE 远程执行节点不可用，未重新读取运行中的 Rig |
| [file_validation.json](file_validation.json) | JSON / Markdown 模板的行数、唯一性、角色表及引用文件完整性 |

主清单 46 项按本段会话指定功能及成对补全整理；补充 26 项来自已有眉毛和眼周基础实现。名称存在与配对无误不等于动作已完整验证，功能和已知残差见各组文档。

UE 名称只读复核：`python Tools/FaceMigration/Scripts/ue_run.py Tools/FaceMigration/Scripts/check_face_controller_catalog.py`。

上述命令需要编辑器正在运行且 Python 远程执行可用。当前 JSON 的 `live_checked=false`；它表示最近已保存报告的名称覆盖，不作为本轮实时资产检查。
