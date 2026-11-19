"""UE 端点：骨骼世界位置 + 四元数。"""

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
BONES = ['Bone027', 'Bone028', 'Bone029', 'Bone036', 'Bone037', 'Bone038']


def main():
    rig = _fm_load_asset(ASSET)
    inst = rig.create_control_rig()
    inst.request_init()
    rh = inst.get_hierarchy()

    def snap(values):
        for c, v in values.items():
            rh.set_control_value(unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=c),
                                 rh.make_control_value_from_vector(unreal.Vector(*v)))
        inst.execute('Forwards Solve')
        res = {}
        for b in BONES:
            t = rh.get_global_transform(unreal.RigElementKey(type=unreal.RigElementType.BONE, name=b))
            res[b] = {
                'p': [round(t.translation.x, 4), round(t.translation.y, 4), round(t.translation.z, 4)],
                'q': [round(t.rotation.x, 4), round(t.rotation.y, 4), round(t.rotation.z, 4), round(t.rotation.w, 4)],
            }
        return res

    out = {
        'base': snap({}),
        'endpoint': snap({'CTRL_EYE_LID_R': (0, 0, -10), 'CTRL_EYE_LID_L': (0, 0, -10)}),
    }
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
