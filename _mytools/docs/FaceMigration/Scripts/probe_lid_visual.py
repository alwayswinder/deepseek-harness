"""诊断用：打印 RigHierarchy 父子 API 与 LID 骨层级，并把 debugged rig 的上眼皮设到闭合，便于截图。"""

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
BONES = ['Bone027', 'Bone028', 'Bone029', 'Bone036', 'Bone037', 'Bone038', 'Bone030', 'Bone053']


def bkey(name):
    return unreal.RigElementKey(type=unreal.RigElementType.BONE, name=name)


def ckey(name):
    return unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=name)


out = {}
rig = _fm_load_asset(ASSET)
h = rig.get_hierarchy()
out['hier_parent_api'] = [m for m in dir(h) if 'parent' in m.lower() or 'child' in m.lower()]
out['hier_all'] = [m for m in dir(h) if not m.startswith('_')]

for b in BONES:
    rec = {}
    try:
        rec['parent'] = str(h.get_first_parent(bkey(b)).name)
    except Exception as exc:
        rec['parent'] = 'ERR %r' % exc
    try:
        rec['children'] = [str(c.name) for c in h.get_children(bkey(b))]
    except Exception as exc:
        rec['children'] = 'ERR %r' % exc
    out[b] = rec

# 骨骼总数与是否有辅助骨名字含 lid/eye
keys = h.get_all_keys()
out['num_keys'] = len(keys)
out['eye_named_bones'] = sorted([str(k.name) for k in keys
                                 if k.type == unreal.RigElementType.BONE
                                 and any(t in str(k.name).lower() for t in ('lid', 'eye', 'eyelid', 'lash'))])

inst = rig.get_debugged_control_rig()
out['debugged'] = inst is not None
if inst is not None:
    rh = inst.get_hierarchy()
    for c, v in (('CTRL_EYE_LID_L', (0.0, 0.0, -10.0)), ('CTRL_EYE_LID_R', (0.0, 0.0, -10.0))):
        try:
            rh.set_control_value(ckey(c), rh.make_control_value_from_vector(unreal.Vector(*v)))
            out[c] = list(v)
        except Exception as exc:
            out[c] = 'ERR %r' % exc
    inst.execute('Forwards Solve')
    out['pose'] = {}
    for b in BONES:
        t = rh.get_global_transform(bkey(b))
        out['pose'][b] = [round(t.translation.x, 3), round(t.translation.y, 3), round(t.translation.z, 3)]

print('JSONSTART')
print(json.dumps(out, ensure_ascii=False, indent=1))
print('JSONEND')
