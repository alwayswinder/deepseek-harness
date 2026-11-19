"""检查眉毛控制是否还在、图是否连通、给值后骨骼是否响应。"""

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
BROW_CTRLS = ['CTRL_BROW_L', 'CTRL_BROW_R', 'CTRL_BROW_L_IN', 'CTRL_BROW_L_MID', 'CTRL_BROW_L_OUT',
              'CTRL_BROW_R_IN', 'CTRL_BROW_R_MID', 'CTRL_BROW_R_OUT', 'CTRL_BROW_L_BEND', 'CTRL_BROW_R_BEND']
BEND_BONES = ['Bone007', 'Bone008', 'Bone009', 'Bone010', 'Bone011', 'Bone012']


def ckey(n):
    return unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=n)


def bkey(n):
    return unreal.RigElementKey(type=unreal.RigElementType.BONE, name=n)


rig = _fm_load_asset(ASSET)
h = rig.get_hierarchy()
model = rig.get_default_model()
out = {'controls': {}, 'node_prefix_counts': {}, 'status': str(rig.get_editor_property('status'))}

keys = h.get_all_keys()
ctrl_names = sorted([str(k.name) for k in keys if k.type == unreal.RigElementType.CONTROL])
out['all_controls'] = ctrl_names

for c in BROW_CTRLS:
    k = ckey(c)
    rec = {'exists': h.contains(k)}
    if rec['exists']:
        try:
            st = h.get_control_settings(k)
            rec['type'] = str(st.control_type)
            rec['shape'] = str(st.shape_name)
            rec['limit_enabled'] = [(l.minimum, l.maximum) for l in st.limit_enabled]
            rec['min'] = str(st.minimum_value)
            rec['max'] = str(st.maximum_value)
            v = h.get_vector_from_control_value(h.get_control_value(k))
            rec['value'] = [round(v.x, 3), round(v.y, 3), round(v.z, 3)]
            parent = h.get_first_parent(k)
            rec['parent'] = str(parent.name) if parent else None
        except Exception as exc:
            rec['err'] = repr(exc)
    out['controls'][c] = rec

names = [n.get_name() for n in model.get_nodes()]
for p in ('BROW_', 'BPT_', 'BB_', 'BBL_', 'EYE_', 'LID_'):
    out['node_prefix_counts'][p] = sum(1 for n in names if n.startswith(p))
out['total_nodes'] = len(names)

# 读三条关键链的节点是否存在
for n in ('BROW_MAKE_Bone008', 'BPT_ADD_Bone008', 'BROW_SET_Bone008', 'BROW_VADD_Bone008',
          'EYE_MAKE_Bone036', 'EYE_VADD_Bone036', 'EYE_SET_Bone036'):
    out['node_exists_' + n] = n in names

# 给眉毛整体控制值，看骨骼是否响应
inst = rig.create_control_rig()
inst.request_init()
rh = inst.get_hierarchy()


def bone_positions():
    res = {}
    for b in BEND_BONES:
        t = rh.get_global_transform(bkey(b)).translation
        res[b] = [round(t.x, 3), round(t.y, 3), round(t.z, 3)]
    return res


rh.set_control_value(ckey('CTRL_BROW_L'), rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, 0.0)))
rh.set_control_value(ckey('CTRL_BROW_R'), rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, 0.0)))
inst.execute('Forwards Solve')
out['bones_rest'] = bone_positions()

rh.set_control_value(ckey('CTRL_BROW_L'), rh.make_control_value_from_vector(unreal.Vector(10.0, 0.0, 0.0)))
rh.set_control_value(ckey('CTRL_BROW_R'), rh.make_control_value_from_vector(unreal.Vector(10.0, 0.0, 0.0)))
inst.execute('Forwards Solve')
out['bones_brow10'] = bone_positions()

print('JSONSTART')
print(json.dumps(out, ensure_ascii=False, indent=1))
print('JSONEND')
