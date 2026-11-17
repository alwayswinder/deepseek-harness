
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
hc = rig.get_hierarchy_controller()
k = unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name='CTRL_BROW_R')
board = unreal.RigElementKey(type=unreal.RigElementType.NULL, name='BrowBoard')
with unreal.ScopedEditorTransaction('Parent CTRL_BROW_R to BrowBoard'):
    ok = hc.set_parent(k, board, True, False, False)
print('set_parent:', ok)
p = h.get_first_parent(k)
print('parent now:', str(p.name) if p else None)
off = h.get_global_control_offset_transform(k)
print('offset:', off.translation)
_fm_save_asset(rig, False)
print('saved')
