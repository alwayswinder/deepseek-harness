"""实验：只平移 Bone028 向下 2cm（不改旋转），看眼皮顶点是否跟随，以判断权重归属。"""

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


def bkey(name):
    return unreal.RigElementKey(type=unreal.RigElementType.BONE, name=name)


rig = _fm_load_asset(ASSET)
inst = rig.get_debugged_control_rig()
out = {}
if inst is None:
    out['err'] = 'no debugged instance'
else:
    rh = inst.get_hierarchy()
    t = rh.get_global_transform(bkey('Bone028'))
    out['before'] = [round(t.translation.x, 3), round(t.translation.y, 3), round(t.translation.z, 3)]
    t.translation.z -= 2.0
    rh.set_global_transform(bkey('Bone028'), t, True)
    t2 = rh.get_global_transform(bkey('Bone028'))
    out['after'] = [round(t2.translation.x, 3), round(t2.translation.y, 3), round(t2.translation.z, 3)]
print('JSONSTART')
print(json.dumps(out, ensure_ascii=False))
print('JSONEND')
