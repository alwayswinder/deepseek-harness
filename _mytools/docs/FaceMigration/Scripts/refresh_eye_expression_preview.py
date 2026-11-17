"""重新打开资产刷新预览求值，恢复原输入并进行帧后检查；不修改全局设置。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json,unreal
from pathlib import Path
root=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
bp=_fm_load_asset(_fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation'))
sub=unreal.get_editor_subsystem(unreal.AssetEditorSubsystem)
live=bp.get_debugged_control_rig();h=live.get_hierarchy();values={str(k.name):h.get_vector_from_control_value(h.get_control_value(k)).to_tuple() for k in h.get_all_keys() if k.type==unreal.RigElementType.CONTROL}
sub.close_all_editors_for_asset(bp);sub.open_editor_for_assets([bp])
live=bp.get_debugged_control_rig();h=live.get_hierarchy()
for n,v in values.items():h.set_control_value(unreal.RigElementKey(type=unreal.RigElementType.CONTROL,name=n),h.make_control_value_from_vector(unreal.Vector(*v)))
live.clear_control_selection();live.select_control('CTRL_EYE_EXPR_QI_R',True)
exec(compile((_fm_read(_fm_tool('Scripts/probe_eye_expression_preview.py'))).read_text(encoding='utf-8'),'preview_probe','exec'))
