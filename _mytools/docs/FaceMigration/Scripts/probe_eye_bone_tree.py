"""查看眼睑骨的父子关系（UE 层级）。"""

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
NAMES = ['Bone027', 'Bone028', 'Bone029', 'Bone036', 'Bone037', 'Bone038', 'Eye_R', 'Eye_L', 'yankuang_R', 'yankuang_L']


def main():
    rig = _fm_load_asset(ASSET)
    h = rig.get_hierarchy()
    out = {}
    for n in NAMES:
        k = unreal.RigElementKey(type=unreal.RigElementType.BONE, name=n)
        kids = []
        try:
            kids = [str(c.name) for c in h.get_children(k)]
        except Exception as exc:
            kids = ['ERR %r' % exc]
        out[n] = {'parent': str(h.get_first_parent(k).name), 'children': kids}
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
