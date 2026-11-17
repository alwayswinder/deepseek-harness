"""新 rig：读眼皮骨初始位置、LID 节点清单（查重复）、以及 0 / -10 两个状态。"""

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
BONES = ['Bone027', 'Bone028', 'Bone029', 'Bone036', 'Bone037', 'Bone038']


def ckey(n):
    return unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=n)


def bkey(n):
    return unreal.RigElementKey(type=unreal.RigElementType.BONE, name=n)


rig = _fm_load_asset(RIG)
model = rig.get_default_model()
names = [n.get_name() for n in model.get_nodes()]
out = {'lid_nodes': sorted([n for n in names if n.startswith('LID_')])}

inst = rig.create_control_rig()
inst.request_init()
rh = inst.get_hierarchy()


def pos(b):
    t = rh.get_global_transform(bkey(b)).translation
    return [round(t.x, 4), round(t.y, 4), round(t.z, 4)]


def rot(b):
    q = rh.get_global_transform(bkey(b)).rotation
    return [round(q.x, 4), round(q.y, 4), round(q.z, 4), round(q.w, 4)]


for c in ('CTRL_EYE_LID_L', 'CTRL_EYE_LID_R'):
    rh.set_control_value(ckey(c), rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, 0.0)))
inst.execute('Forwards Solve')
out['rest'] = {b: {'t': pos(b), 'q': rot(b)} for b in BONES}

for c in ('CTRL_EYE_LID_L', 'CTRL_EYE_LID_R'):
    rh.set_control_value(ckey(c), rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, -10.0)))
inst.execute('Forwards Solve')
out['closed'] = {b: {'t': pos(b)} for b in BONES}

print('JSONSTART')
print(json.dumps(out, ensure_ascii=False, indent=1))
print('JSONEND')
