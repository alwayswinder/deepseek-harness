"""对比新旧 rig 的骨骼集合（新网格少 16 根，看少的是哪些）。"""

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

OLD = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders')
NEW = _fm_asset('/Game/_MyTest/Mouth/TMp/CR_Seven_MorphSliders1')


def bones(path):
    rig = _fm_load_asset(path)
    h = rig.get_hierarchy()
    return sorted([str(k.name) for k in h.get_all_keys() if k.type == unreal.RigElementType.BONE])


old = set(bones(OLD))
new = set(bones(NEW))
out = {
    'old_count': len(old),
    'new_count': len(new),
    'missing_in_new': sorted(old - new),
    'added_in_new': sorted(new - old),
}
print('JSONSTART')
print(json.dumps(out, ensure_ascii=False, indent=1))
print('JSONEND')
