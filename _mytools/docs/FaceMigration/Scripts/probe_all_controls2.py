"""一次跑完所有控制的驱动自检，输出精简的骨骼位移摘要。"""

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


def ckey(n):
    return unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=n)


def bkey(n):
    return unreal.RigElementKey(type=unreal.RigElementType.BONE, name=n)


rig = _fm_load_asset(ASSET)
inst = rig.create_control_rig()
inst.request_init()
rh = inst.get_hierarchy()

WATCH = ['Bone007', 'Bone008', 'Bone009', 'Bone010', 'Bone011', 'Bone012',
         'Bone027', 'Bone028', 'Bone029', 'Bone036', 'Bone037', 'Bone038']

ALL_CTRLS = ['CTRL_BROW_L', 'CTRL_BROW_R', 'CTRL_BROW_L_IN', 'CTRL_BROW_L_MID', 'CTRL_BROW_L_OUT',
             'CTRL_BROW_R_IN', 'CTRL_BROW_R_MID', 'CTRL_BROW_R_OUT', 'CTRL_BROW_L_BEND', 'CTRL_BROW_R_BEND',
             'CTRL_EYE_L_UP_IN', 'CTRL_EYE_L_UP_MID', 'CTRL_EYE_L_UP_OUT',
             'CTRL_EYE_R_UP_IN', 'CTRL_EYE_R_UP_MID', 'CTRL_EYE_R_UP_OUT',
             'CTRL_EYE_L_DOWN_IN', 'CTRL_EYE_L_DOWN_MID', 'CTRL_EYE_L_DOWN_OUT',
             'CTRL_EYE_R_DOWN_IN', 'CTRL_EYE_R_DOWN_MID', 'CTRL_EYE_R_DOWN_OUT',
             'CTRL_EYE_L_CORNER_IN', 'CTRL_EYE_L_CORNER_OUT', 'CTRL_EYE_R_CORNER_IN', 'CTRL_EYE_R_CORNER_OUT',
             'CTRL_EYE_LID_L', 'CTRL_EYE_LID_R']


def p(b):
    t = rh.get_global_transform(bkey(b)).translation
    return [round(t.x, 3), round(t.y, 3), round(t.z, 3)]


def reset():
    for c in ALL_CTRLS:
        try:
            rh.set_control_value(ckey(c), rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, 0.0)))
        except Exception:
            pass
    inst.execute('Forwards Solve')


reset()
base = {b: p(b) for b in WATCH}

CASES = [
    ('brow_L_10', {'CTRL_BROW_L': (10, 0, 0)}),
    ('brow_L_IN_z10', {'CTRL_BROW_L_IN': (0, 0, 10)}),
    ('brow_L_BEND_z2', {'CTRL_BROW_L_BEND': (0, 0, 2)}),
    ('brow_R_10', {'CTRL_BROW_R': (10, 0, 0)}),
    ('brow_R_BEND_z2', {'CTRL_BROW_R_BEND': (0, 0, 2)}),
    ('eye_L_UP_MID_z10', {'CTRL_EYE_L_UP_MID': (0, 0, 10)}),
    ('lid_L_minus10', {'CTRL_EYE_LID_L': (0, 0, -10)}),
    ('lid_R_minus10', {'CTRL_EYE_LID_R': (0, 0, -10)}),
]

out = {}
for name, values in CASES:
    reset()
    for c, v in values.items():
        rh.set_control_value(ckey(c), rh.make_control_value_from_vector(unreal.Vector(*v)))
    inst.execute('Forwards Solve')
    diffs = {}
    for b in WATCH:
        d = [round(p(b)[i] - base[b][i], 3) for i in range(3)]
        if any(abs(x) > 0.001 for x in d):
            diffs[b] = d
    out[name] = diffs

reset()
print('JSONSTART')
print(json.dumps(out, ensure_ascii=False, indent=1))
print('JSONEND')
