"""给新 rig 的 debugged instance 设置上眼皮闭合，便于截图（左眼 -10）。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json

import unreal

RIG = _fm_asset('/Game/_MyTest/Mouth/TMp/CR_Seven_MorphSliders1')


def ckey(n):
    return unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=n)


rig = _fm_load_asset(RIG)
inst = rig.get_debugged_control_rig()
out = {'debugged': inst is not None}
if inst is not None:
    rh = inst.get_hierarchy()
    for c, v in (('CTRL_EYE_LID_L', -10.0), ('CTRL_EYE_LID_R', 0.0)):
        rh.set_control_value(ckey(c), rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, v)))
        out[c] = v
    inst.execute('Forwards Solve')
print('JSONSTART')
print(json.dumps(out, ensure_ascii=False))
print('JSONEND')
