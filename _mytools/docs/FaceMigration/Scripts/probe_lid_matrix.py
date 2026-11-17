"""用旋转矩阵比较 Max 与 UE 的骨骼世界旋转（避免四元数符号/手性问题）。"""

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

MAX_BASE = {
    'Bone027': (-0.501915, 0.485784, 0.511299, 0.500669),
    'Bone028': (0.455442, -0.527571, -0.553098, -0.456425),
    'Bone029': (0.296771, -0.627726, -0.652128, -0.304328),
    'Bone036': (-0.511303, 0.50066, 0.501921, 0.485783),
    'Bone037': (-0.553103, 0.456417, 0.455446, 0.527569),
    'Bone038': (-0.652134, 0.304321, 0.296774, 0.627722),
}
MAX_END = {
    'Bone027': (-0.583364, 0.510181, 0.482838, 0.407761),
    'Bone028': (0.574314, -0.414413, -0.640176, -0.297657),
    'Bone029': (0.389055, -0.477332, -0.767006, -0.180256),
    'Bone036': (-0.482842, 0.407751, 0.583368, 0.51018),
    'Bone037': (-0.64018, 0.297648, 0.574317, 0.41441),
    'Bone038': (-0.76701, 0.180249, 0.389057, 0.477327),
}


def qmat(q):
    x, y, z, w = q
    return [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ]


def mirror(r):
    # M * R * M, M = diag(1,-1,1)
    s = [1, -1, 1]
    return [[s[i] * r[i][j] * s[j] for j in range(3)] for i in range(3)]


def diff(a, b):
    return sum((a[i][j] - b[i][j]) ** 2 for i in range(3) for j in range(3)) ** 0.5


def main():
    rig = _fm_load_asset(ASSET)
    inst = rig.create_control_rig()
    inst.request_init()
    rh = inst.get_hierarchy()
    out = {}

    def snaps(values):
        for c in values:
            rh.set_control_value(unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=c),
                                 rh.make_control_value_from_vector(unreal.Vector(*values[c])))
        inst.execute('Forwards Solve')
        res = {}
        for b in BONES:
            q = rh.get_global_transform(unreal.RigElementKey(type=unreal.RigElementType.BONE, name=b)).rotation
            res[b] = (q.x, q.y, q.z, q.w)
        return res

    base = snaps({'CTRL_EYE_LID_R': (0, 0, 0), 'CTRL_EYE_LID_L': (0, 0, 0)})
    end = snaps({'CTRL_EYE_LID_R': (0, 0, -10), 'CTRL_EYE_LID_L': (0, 0, -10)})

    for b in BONES:
        out[b] = {
            'base_diff': round(diff(mirror(qmat(MAX_BASE[b])), qmat(base[b])), 4),
            'end_diff': round(diff(mirror(qmat(MAX_END[b])), qmat(end[b])), 4),
        }
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
