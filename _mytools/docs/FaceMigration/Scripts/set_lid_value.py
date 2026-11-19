"""把 debugged rig 的上眼皮控制设为指定值（命令行参数），用于截图对比。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json
import sys

import unreal

ASSET = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders')


def ckey(name):
    return unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=name)


def bkey(name):
    return unreal.RigElementKey(type=unreal.RigElementType.BONE, name=name)


val = float(sys.argv[1]) if len(sys.argv) > 1 else 0.0
rig = _fm_load_asset(ASSET)
inst = rig.get_debugged_control_rig()
out = {'value': val, 'debugged': inst is not None}
if inst is not None:
    rh = inst.get_hierarchy()
    for c in ('CTRL_EYE_LID_L', 'CTRL_EYE_LID_R'):
        try:
            rh.set_control_value(ckey(c), rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, val)))
        except Exception as exc:
            out[c] = 'ERR %r' % exc
    inst.execute('Forwards Solve')
    out['Bone028'] = [round(v, 3) for v in (
        rh.get_global_transform(bkey('Bone028')).translation.x,
        rh.get_global_transform(bkey('Bone028')).translation.y,
        rh.get_global_transform(bkey('Bone028')).translation.z)]
print('JSONSTART')
print(json.dumps(out, ensure_ascii=False))
print('JSONEND')
