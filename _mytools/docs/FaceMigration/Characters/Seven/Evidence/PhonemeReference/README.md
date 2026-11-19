# 口型参考图证据（2026-11-09）

目标及实现见 [十二口型滑块](../../../../Docs/Recipes/PhonemeSliders.md#口型参考图)。本次只增加参考图展示，未重新采样 Max。原贴图保持不变，十二行按图片顺序与已有滑块对应，最终视觉效果待用户检查。

| 文件 | 内容 |
|---|---|
| [parameters.json](parameters.json) | 原贴图、尺寸、每个口型 Alpha 边界及 UV 裁切、统一像素比例、布局 |
| [build_report.json](build_report.json) | 双份 Rig 备份位置、原预览输入、原节点 / 执行连接、保存及验证状态 |
| [before_outputs.json](before_outputs.json) | 添加前中性、十二个独立完整权重、一组混合，共 14 组全骨骼及曲线输出 |
| [validation.json](validation.json) | 保存重载前后原输出不变、材质 / 形状 / 位置、24 三角面及结构统计 |
| [preview_binding.json](preview_binding.json) | 重开预览后实际 ShapeActor 的可见性、位置和材质绑定；不等同于视觉验收 |
| [depth_update.json](depth_update.json) | 参考图后移 6 cm：Y=18→12；其他控制偏移、节点及执行连接保持，保存重载和用户输入恢复通过 |

只读检查预览：`python Tools/FaceMigration/Scripts/ue_run.py Tools/FaceMigration/Scripts/verify_phoneme_reference_preview.py`。目标 Rig 编辑器需已打开。
