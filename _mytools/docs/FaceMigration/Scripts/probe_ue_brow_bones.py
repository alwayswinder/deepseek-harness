"""打印 UE 里眉毛骨骼世界坐标与父级，用于确定控制摆放位置。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json
import traceback

import unreal

ASSET = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders')


def main():
    rig = _fm_load_asset(ASSET)
    h = rig.get_hierarchy()
    names = ['meibu_L', 'Bone007', 'Bone008', 'Bone009',
             'meibu_R', 'Bone010', 'Bone011', 'Bone012', 'head']
    out = {}
    for n in names:
        k = unreal.RigElementKey(type=unreal.RigElementType.BONE, name=n)
        try:
            t = h.get_global_transform(k).translation
            local = h.get_local_transform(k).translation
            par = str(h.get_first_parent(k).name)
            out[n] = {
                'world': [round(t.x, 3), round(t.y, 3), round(t.z, 3)],
                'local': [round(local.x, 3), round(local.y, 3), round(local.z, 3)],
                'parent': par,
            }
        except Exception as exc:
            out[n] = {'error': repr(exc)}
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')
    return out


if __name__ == '__main__':
    try:
        main()
    except Exception:
        unreal.log_error('[ProbeBrowBones] FAILED\n' + traceback.format_exc())
        raise
