"""打印眼周骨骼世界坐标与父级。"""

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
NAMES = ['Bone027', 'Bone028', 'Bone029', 'Bone030', 'Bone031', 'Bone032',
         'Bone036', 'Bone037', 'Bone038', 'Bone039', 'Bone040', 'Bone041',
         'Bone042', 'Bone043', 'Bone044', 'Bone045']


def main():
    rig = _fm_load_asset(ASSET)
    h = rig.get_hierarchy()
    out = {}
    for n in NAMES:
        k = unreal.RigElementKey(type=unreal.RigElementType.BONE, name=n)
        t = h.get_global_transform(k).translation
        out[n] = {
            'w': [round(t.x, 3), round(t.y, 3), round(t.z, 3)],
            'parent': str(h.get_first_parent(k).name),
        }
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
