"""探测 Seven 网格可用 API（顶点/权重/LOD）与眼部骨骼位置，用于和 Max 对比。"""

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

MESH = _fm_asset('/Game/_MyTest/Mouth/Mesh/Seven')
ASSET = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders')

out = {}
mesh = _fm_load_asset(MESH)
cands = [m for m in dir(mesh) if any(t in m.lower() for t in ('vertex', 'skin', 'weight', 'lod', 'model', 'bone', 'section'))]
out['mesh_api'] = cands
for attr in ('skinning_data', 'skin_weight_profiles', 'lod_group', 'morph_targets', 'skeleton', 'physics_asset'):
    try:
        out['prop_' + attr] = str(mesh.get_editor_property(attr))[:200]
    except Exception as exc:
        out['prop_' + attr] = 'ERR'

# 骨骼位置
rig = _fm_load_asset(ASSET)
h = rig.get_hierarchy()
keys = h.get_all_keys()
out['bone_count'] = sum(1 for k in keys if k.type == unreal.RigElementType.BONE)
out['bones'] = {}
for b in ('root', 'Root', 'Eye_L', 'Eye_R', 'Eye_L01', 'Eye_R01', 'Bone052', 'Bone053', 'Head', 'head'):
    k = unreal.RigElementKey(type=unreal.RigElementType.BONE, name=b)
    try:
        if not h.contains(k):
            out['bones'][b] = None
            continue
        t = h.get_global_transform(k)
        p = h.get_first_parent(k)
        out['bones'][b] = {
            't': [round(t.translation.x, 3), round(t.translation.y, 3), round(t.translation.z, 3)],
            'parent': str(p.name) if p else None,
        }
    except Exception as exc:
        out['bones'][b] = 'ERR %r' % exc

# 全部骨名（看是否有睫毛/眼睑辅助骨）
out['all_bones'] = sorted([str(k.name) for k in keys if k.type == unreal.RigElementType.BONE])

print('JSONSTART')
print(json.dumps(out, ensure_ascii=False, indent=1))
print('JSONEND')
