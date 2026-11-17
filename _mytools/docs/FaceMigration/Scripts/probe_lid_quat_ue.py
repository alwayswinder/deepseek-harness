"""UE 端点骨骼世界四元数 vs Max 转换期望。"""

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

# Max 端点四元数 -> UE 镜像期望 (-x, y, -z, w)
EXPECT = {
    'Bone027': (0.583364, 0.510181, -0.482838, 0.407761),
    'Bone028': (-0.574314, -0.414413, 0.640176, -0.297657),
    'Bone029': (-0.389055, -0.477332, 0.767006, -0.180256),
    'Bone036': (0.482842, 0.407751, -0.583368, 0.51018),
    'Bone037': (0.64018, 0.297648, -0.574317, 0.41441),
    'Bone038': (0.76701, 0.180249, -0.389057, 0.477327),
}


def main():
    rig = _fm_load_asset(ASSET)
    inst = rig.create_control_rig()
    inst.request_init()
    rh = inst.get_hierarchy()
    for c in ('CTRL_EYE_LID_R', 'CTRL_EYE_LID_L'):
        rh.set_control_value(unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=c),
                             rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, -10.0)))
    inst.execute('Forwards Solve')
    out = {}
    for b in BONES:
        q = rh.get_global_transform(unreal.RigElementKey(type=unreal.RigElementType.BONE, name=b)).rotation
        e = EXPECT[b]
        dot = abs(q.x * e[0] + q.y * e[1] + q.z * e[2] + q.w * e[3])
        out[b] = {
            'ue': [round(q.x, 4), round(q.y, 4), round(q.z, 4), round(q.w, 4)],
            'expect': [round(v, 4) for v in e],
            'abs_dot': round(dot, 4),
        }
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
