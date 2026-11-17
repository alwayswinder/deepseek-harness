"""检查 rig 当前骨骼与预览网格引用状态。"""

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


def main():
    rig = _fm_load_asset(ASSET)
    h = rig.get_hierarchy()
    out = {'status': str(rig.get_editor_property('status'))}
    for b in ('Bone027', 'Bone028', 'Bone029', 'Bone036', 'Bone037', 'Bone038'):
        k = unreal.RigElementKey(type=unreal.RigElementType.BONE, name=b)
        try:
            t = h.get_global_transform(k)
            out[b] = [round(t.translation.x, 3), round(t.translation.y, 3), round(t.translation.z, 3)]
        except Exception as exc:
            out[b] = 'ERR %r' % exc
    try:
        out['bone_count'] = len([k for k in h.get_all_keys() if k.type == unreal.RigElementType.BONE])
    except Exception as exc:
        out['bone_count'] = 'ERR %r' % exc
    try:
        pm = rig.get_preview_mesh()
        out['preview_mesh'] = str(pm)
    except Exception as exc:
        out['preview_mesh'] = 'ERR %r' % exc
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
