"""验证上眼皮控制限值：X/Y 必须为 0，Z 只能在 [-10, 0]。"""

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
CONTROLS = ('CTRL_EYE_LID_L', 'CTRL_EYE_LID_R')


def ckey(n):
    return unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=n)


def bkey(n):
    return unreal.RigElementKey(type=unreal.RigElementType.BONE, name=n)


rig = _fm_load_asset(ASSET)
inst = rig.create_control_rig()
inst.request_init()
rh = inst.get_hierarchy()

out = {'cases': {}, 'bones': {}}
for name in CONTROLS:
    cases = {}
    for raw in ((10.0, 10.0, 10.0), (5.0, -5.0, -5.0), (0.0, 0.0, -100.0), (0.0, 0.0, -10.0), (0.0, 0.0, 0.0)):
        rh.set_control_value(ckey(name), rh.make_control_value_from_vector(unreal.Vector(*raw)))
        v = rh.get_vector_from_control_value(rh.get_control_value(ckey(name)))
        cases['%s' % (list(raw),)] = [round(v.x, 3), round(v.y, 3), round(v.z, 3)]
    out['cases'][name] = cases

# 骨骼检查：Z=-10 应复现 Max 端点
rh.set_control_value(ckey('CTRL_EYE_LID_L'), rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, -10.0)))
rh.set_control_value(ckey('CTRL_EYE_LID_R'), rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, -10.0)))
inst.execute('Forwards Solve')
for b in ('Bone028', 'Bone037'):
    t = rh.get_global_transform(bkey(b)).translation
    out['bones'][b] = [round(t.x, 3), round(t.y, 3), round(t.z, 3)]

print('JSONSTART')
print(json.dumps(out, ensure_ascii=False, indent=1))
print('JSONEND')
