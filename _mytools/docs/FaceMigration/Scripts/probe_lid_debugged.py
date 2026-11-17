"""用 debugged 实例检查闭眼姿态。"""

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
    inst = rig.get_debugged_control_rig()
    out = {'has_inst': inst is not None}
    if inst is None:
        print('JSONSTART')
        print(json.dumps(out))
        print('JSONEND')
        return
    rh = inst.get_hierarchy()
    out['bone_count'] = len([k for k in rh.get_all_keys() if k.type == unreal.RigElementType.BONE])
    for c in ('CTRL_EYE_LID_R', 'CTRL_EYE_LID_L'):
        rh.set_control_value(unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=c),
                             rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, -10.0)))
    inst.execute('Forwards Solve')
    poses = {}
    for b in BONES:
        t = rh.get_global_transform(unreal.RigElementKey(type=unreal.RigElementType.BONE, name=b))
        poses[b] = {
            'p': [round(t.translation.x, 3), round(t.translation.y, 3), round(t.translation.z, 3)],
            'q': [round(t.rotation.x, 3), round(t.rotation.y, 3), round(t.rotation.z, 3), round(t.rotation.w, 3)],
        }
    out['poses'] = poses
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
