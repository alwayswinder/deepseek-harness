"""看 codex 修的 CR_Seven_LidWorldRotation：节点结构、参数、闭合时的骨骼变换。"""

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

RIG = _fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation')
BONES = ['Bone027', 'Bone028', 'Bone029', 'Bone036', 'Bone037', 'Bone038']


def ckey(n):
    return unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=n)


def bkey(n):
    return unreal.RigElementKey(type=unreal.RigElementType.BONE, name=n)


rig = _fm_load_asset(RIG)
h = rig.get_hierarchy()
model = rig.get_default_model()
names = [n.get_name() for n in model.get_nodes()]
out = {
    'status': str(rig.get_editor_property('status')),
    'node_count': len(names),
    'prefix_counts': {p: sum(1 for n in names if n.startswith(p)) for p in ('BROW_', 'BPT_', 'BB_', 'BBL_', 'EYE_', 'LID_', 'LIDX_', 'DIAG_')},
    'controls': sorted([str(k.name) for k in h.get_all_keys() if k.type == unreal.RigElementType.CONTROL]),
    'lid_nodes': sorted([n for n in names if 'LID' in n.upper()]),
}

inst = rig.create_control_rig()
inst.request_init()
rh = inst.get_hierarchy()


def snap():
    res = {}
    for b in BONES:
        t = rh.get_global_transform(bkey(b))
        res[b] = {
            't': [round(t.translation.x, 4), round(t.translation.y, 4), round(t.translation.z, 4)],
            'q': unreal.Quat(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w),
        }
    return res


def set_lid(v):
    for c in ('CTRL_EYE_LID_L', 'CTRL_EYE_LID_R'):
        try:
            rh.set_control_value(ckey(c), rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, v)))
        except Exception:
            pass
    inst.execute('Forwards Solve')


set_lid(0.0)
base = snap()
set_lid(-10.0)
closed = snap()

out['closed'] = {}
for b in BONES:
    q0 = base[b]['q']
    q1 = closed[b]['q']
    qinv = unreal.Quat(-q0.x, -q0.y, -q0.z, q0.w)
    dq = q1 * qinv
    w = max(-1.0, min(1.0, abs(dq.w)))
    ang = math.degrees(2.0 * math.acos(w))
    s = math.sin(math.radians(ang) / 2.0)
    axis = [round(dq.x / s, 4), round(dq.y / s, 4), round(dq.z / s, 4)] if abs(s) > 1e-8 else [0, 0, 0]
    out['closed'][b] = {
        'dP': [round(closed[b]['t'][i] - base[b]['t'][i], 4) for i in range(3)],
        'angle': round(ang, 3),
        'axis': axis,
    }

set_lid(0.0)
print('JSONSTART')
print(json.dumps(out, ensure_ascii=False, indent=1))
print('JSONEND')
