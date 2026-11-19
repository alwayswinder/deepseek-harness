"""读取 UE 眼部相关骨骼世界坐标，与 Max 值对照（UE = Max.x, -Max.y, Max.z）。"""

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
NAMES = ['Eye_R', 'Eye_L', 'Eye_R01', 'Eye_L01', 'yanqiu_R', 'yanqiu_L', 'yankuang_R', 'yankuang_L',
         'yandai_R', 'yandai_L', 'yandai2_R', 'yandai2_L', 'head001']

rig = _fm_load_asset(ASSET)
h = rig.get_hierarchy()

out = {}
for n in NAMES:
    k = unreal.RigElementKey(type=unreal.RigElementType.BONE, name=n)
    if not h.contains(k):
        out[n] = None
        continue
    t = h.get_global_transform(k)
    p = h.get_first_parent(k)
    out[n] = {
        't': [round(t.translation.x, 4), round(t.translation.y, 4), round(t.translation.z, 4)],
        'r': [round(t.rotation.x, 4), round(t.rotation.y, 4), round(t.rotation.z, 4), round(t.rotation.w, 4)],
        'parent': str(p.name) if p else None,
    }

print('JSONSTART')
print(json.dumps(out, ensure_ascii=False, indent=1))
print('JSONEND')
