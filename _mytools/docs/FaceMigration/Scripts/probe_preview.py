
# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import unreal

ASSET = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders')
rig = _fm_load_asset(ASSET)

# 打开资产编辑器
try:
    sub = unreal.get_editor_subsystem(unreal.AssetEditorSubsystem)
    sub.open_editor_for_assets([rig])
    print("opened editor")
except Exception as exc:
    print("open err", repr(exc))

for fn in ('get_debugged_control_rig', 'get_preview_instance', 'get_preview_control_rig'):
    f = getattr(rig, fn, None)
    print(fn, "->", (f() if callable(f) else None))

inst = None
for fn in ('get_debugged_control_rig', 'get_preview_instance'):
    f = getattr(rig, fn, None)
    if f:
        try:
            inst = f()
        except Exception:
            inst = None
        if inst:
            break
print("instance:", inst, inst.get_class().get_name() if inst else None)
