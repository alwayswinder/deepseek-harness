"""探测用户新建的 rig / mesh：控制、LID 链、执行流、预览网格、骨骼响应。"""

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
MESH = _fm_asset('/Game/_MyTest/Mouth/TMp/Seven_Skeletal_2026-11-06')

out = {}
rig = _fm_load_asset(RIG)
h = rig.get_hierarchy()
model = rig.get_default_model()
names = [n.get_name() for n in model.get_nodes()]
keys = h.get_all_keys()

out['status'] = str(rig.get_editor_property('status'))
out['node_count'] = len(names)
out['prefix_counts'] = {p: sum(1 for n in names if n.startswith(p)) for p in ('BROW_', 'BPT_', 'BB_', 'BBL_', 'EYE_', 'LID_')}
out['controls'] = sorted([str(k.name) for k in keys if k.type == unreal.RigElementType.CONTROL])
out['bones'] = sum(1 for k in keys if k.type == unreal.RigElementType.BONE)

# 预览网格
try:
    pm = rig.get_editor_property('preview_mesh')
    out['preview_mesh'] = str(pm) if pm else None
except Exception as exc:
    out['preview_mesh'] = 'ERR %r' % exc

# LID 控制设置
for c in ('CTRL_EYE_LID_L', 'CTRL_EYE_LID_R'):
    k = unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=c)
    if not h.contains(k):
        out[c] = None
        continue
    st = h.get_control_settings(k)
    out[c] = {
        'type': str(st.control_type),
        'min': str(st.minimum_value),
        'max': str(st.maximum_value),
    }

# 执行流
targets = {}
for link in model.get_links():
    try:
        if 'Execute' in str(link.get_target_pin().get_name()):
            targets[str(link.get_target_node().get_name())] = str(link.get_source_node().get_name())
    except Exception:
        pass
out['exec_targets_brow_head'] = targets.get('BROW_SET_meibu_L')
out['exec_targets_eye_head'] = targets.get('EYE_SET_Bone043')

# 新 mesh
mesh = _fm_load_asset(MESH)
out['mesh'] = {}
try:
    out['mesh']['morph_count'] = len(mesh.get_editor_property('morph_targets')) if mesh.get_editor_property('morph_targets') else 0
except Exception as exc:
    out['mesh']['morph_count'] = 'ERR %r' % exc
try:
    out['mesh']['source'] = str(mesh.get_editor_property('asset_import_data').get_first_filename())
except Exception as exc:
    out['mesh']['source'] = 'ERR %r' % exc
try:
    sk = mesh.get_editor_property('skeleton')
    out['mesh']['skeleton'] = str(sk)
except Exception as exc:
    out['mesh']['skeleton'] = 'ERR %r' % exc

# 骨骼响应
inst = rig.create_control_rig()
inst.request_init()
rh = inst.get_hierarchy()

def ckey(n):
    return unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=n)

def bkey(n):
    return unreal.RigElementKey(type=unreal.RigElementType.BONE, name=n)

def pos(b, kind=unreal.RigElementType.BONE):
    t = rh.get_global_transform(bkey(b))
    return [round(t.translation.x, 3), round(t.translation.y, 3), round(t.translation.z, 3)]

rh.set_control_value(ckey('CTRL_EYE_LID_L'), rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, -10.0)))
rh.set_control_value(ckey('CTRL_EYE_LID_R'), rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, -10.0)))
inst.execute('Forwards Solve')
out['lid_minus10'] = {b: pos(b) for b in ('Bone027', 'Bone028', 'Bone029', 'Bone036', 'Bone037', 'Bone038')}

print('JSONSTART')
print(json.dumps(out, ensure_ascii=False, indent=1))
print('JSONEND')
