
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
h = rig.get_hierarchy()
k = unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name="CTRL_BROW_POINT")
off = h.get_global_control_offset_transform(k)
rot = off.rotation
print("rotation:", rot)
print("forward(X):", unreal.MathLibrary.get_forward_vector(rot))
print("right(Y)  :", unreal.MathLibrary.get_right_vector(rot))
print("up(Z)     :", unreal.MathLibrary.get_up_vector(rot))
print("gizmo scale:", off.scale3d)
