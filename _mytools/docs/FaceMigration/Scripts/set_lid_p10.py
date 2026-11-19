"""固定把 debugged rig 的上眼皮控制设为 +10（向上拖），看是否反向翻转穿模。"""

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

ASSET = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders')
VAL = 10.0


def ckey(n):
    return unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=n)


def bkey(n):
    return unreal.RigElementKey(type=unreal.RigElementType.BONE, name=n)


rig = _fm_load_asset(ASSET)
inst = rig.get_debugged_control_rig()
out = {'target': VAL, 'debugged': inst is not None}
if inst is not None:
    rh = inst.get_hierarchy()
    for c in ('CTRL_EYE_LID_L', 'CTRL_EYE_LID_R'):
        rh.set_control_value(ckey(c), rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, VAL)))
    inst.execute('Forwards Solve')
    for c in ('CTRL_EYE_LID_L', 'CTRL_EYE_LID_R'):
        try:
            v = rh.get_vector_from_control_value(rh.get_control_value(ckey(c)))
            out[c] = [round(v.x, 3), round(v.y, 3), round(v.z, 3)]
        except Exception as exc:
            out[c] = 'ERR %r' % exc
    t = rh.get_global_transform(bkey('Bone028'))
    out['Bone028'] = [round(t.translation.x, 3), round(t.translation.y, 3), round(t.translation.z, 3)]
print('JSONSTART')
print(json.dumps(out, ensure_ascii=False))
print('JSONEND')
