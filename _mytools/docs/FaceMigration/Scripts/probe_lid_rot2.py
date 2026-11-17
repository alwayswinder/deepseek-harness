"""验证修正后的上眼皮旋转轴（旧 rig，用临时实例）。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json
import math

import unreal

ASSET = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders')
BONES = ['Bone027', 'Bone028', 'Bone029', 'Bone036', 'Bone037', 'Bone038']


def bkey(n):
    return unreal.RigElementKey(type=unreal.RigElementType.BONE, name=n)


def ckey(n):
    return unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=n)


rig = _fm_load_asset(ASSET)
inst = rig.create_control_rig()
inst.request_init()
rh = inst.get_hierarchy()


def solve(v):
    for c in ('CTRL_EYE_LID_L', 'CTRL_EYE_LID_R'):
        rh.set_control_value(ckey(c), rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, v)))
    inst.execute('Forwards Solve')
    res = {}
    for b in BONES:
        t = rh.get_global_transform(bkey(b))
        res[b] = {
            't': [t.translation.x, t.translation.y, t.translation.z],
            'q': unreal.Quat(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w),
        }
    return res


open_pose = solve(0.0)
closed = solve(-10.0)

res = {}
for b in BONES:
    q0 = open_pose[b]['q']
    q1 = closed[b]['q']
    qinv = unreal.Quat(-q0.x, -q0.y, -q0.z, q0.w)
    dq = q1 * qinv
    w = max(-1.0, min(1.0, abs(dq.w)))
    ang = math.degrees(2.0 * math.acos(w))
    s = math.sin(math.radians(ang) / 2.0)
    axis = [round(dq.x / s, 4), round(dq.y / s, 4), round(dq.z / s, 4)] if abs(s) > 1e-8 else [0, 0, 0]
    res[b] = {
        'dP': [round(closed[b]['t'][i] - open_pose[b]['t'][i], 4) for i in range(3)],
        'angle': round(ang, 3),
        'axis': axis,
    }

solve(0.0)
print('JSONSTART')
print(json.dumps(res, ensure_ascii=False, indent=1))
print('JSONEND')
