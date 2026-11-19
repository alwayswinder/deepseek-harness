"""新 rig 限值回夹测试 + 新 mesh 骨骼父级检查。"""

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


def bkey(n):
    return unreal.RigElementKey(type=unreal.RigElementType.BONE, name=n)


rig = _fm_load_asset(RIG)
inst = rig.create_control_rig()
inst.request_init()
rh = inst.get_hierarchy()

out = {'clamp': {}}
for name in ('CTRL_EYE_LID_L', 'CTRL_EYE_LID_R'):
    cases = {}
    for raw in ((5.0, 5.0, 10.0), (0.0, 0.0, -100.0), (0.0, 0.0, -10.0)):
        rh.set_control_value(ckey(name), rh.make_control_value_from_vector(unreal.Vector(*raw)))
        v = rh.get_vector_from_control_value(rh.get_control_value(ckey(name)))
        cases[str(list(raw))] = [round(v.x, 3), round(v.y, 3), round(v.z, 3)]
    out['clamp'][name] = cases

h = rig.get_hierarchy()
out['parents'] = {}
for b in ('Bone027', 'Bone028', 'Bone029', 'Bone036', 'Bone037', 'Bone038', 'yanqiu_L', 'yanqiu_R', 'Eye_L', 'Eye_R'):
    k = bkey(b)
    if h.contains(k):
        p = h.get_first_parent(k)
        out['parents'][b] = str(p.name) if p else None
    else:
        out['parents'][b] = None

print('JSONSTART')
print(json.dumps(out, ensure_ascii=False, indent=1))
print('JSONEND')
