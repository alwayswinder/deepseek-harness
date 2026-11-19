
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
h = rig.get_hierarchy()
print('HIER:', [m for m in dir(h) if ('bone' in m.lower() or 'add' in m.lower() or 'element' in m.lower())][:60])
ctrl = rig.get_controller(rig.get_default_model())
print('CTRL:', [m for m in dir(ctrl) if ('link' in m.lower() or 'pin' in m.lower())][:60])
print('HIER_KEYS:', [m for m in dir(h) if 'key' in m.lower()][:40])
