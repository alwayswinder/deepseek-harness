"""保存后关闭指定 Rig 编辑器，重载包，再打开；不涉及其他资产编辑器。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json
from pathlib import Path
import unreal

asset = _fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation')
rig = _fm_load_asset(asset)
subsystem = unreal.get_editor_subsystem(unreal.AssetEditorSubsystem)
subsystem.close_all_editors_for_asset(rig)
package = rig.get_outer()
result = unreal.EditorLoadingAndSavingUtils.reload_packages([package], unreal.ReloadPackagesInteractionMode.ASSUME_POSITIVE)
assert result[0], str(result)
rig = _fm_load_asset(asset)
assert rig.get_editor_property('status') == unreal.BlueprintStatus.BS_UP_TO_DATE
assert len(rig.get_default_model().get_nodes()) == 394
subsystem.open_editor_for_assets([rig])
root = Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
(_fm_output(_fm_tool('Docs/Evidence/XYP/reload.json'))).write_text(json.dumps({'asset': asset, 'reload_result': str(result), 'nodes': 394, 'opened': True}), encoding='utf-8')
print('Reloaded and opened', asset)
