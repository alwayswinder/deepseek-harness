
# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import unreal
rig = _fm_load_asset(_fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders'))
sub = unreal.get_editor_subsystem(unreal.AssetEditorSubsystem)
try:
    sub.close_all_editors_for_asset(rig)
    print("closed")
except Exception as exc:
    print("close err", repr(exc))
print("level:", unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world().get_name())
