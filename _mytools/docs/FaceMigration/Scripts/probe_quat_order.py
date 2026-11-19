"""验证四元数合成顺序：绕世界 X 轴旋转应改变 roll。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json
import math

import unreal

ASSET = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders')


def main():
    rig = _fm_load_asset(ASSET)
    h = rig.get_hierarchy()
    out = {}
    for bone, deg in (('Bone010', -9.1674), ('Bone012', 10.313)):
        k = unreal.RigElementKey(type=unreal.RigElementType.BONE, name=bone)
        q0 = h.get_global_transform(k).rotation
        a = math.radians(deg) * 0.5
        delta = unreal.Quat(math.sin(a), 0.0, 0.0, math.cos(a))
        try:
            q1 = delta * q0
            out[bone + '_delta_q0'] = str(unreal.MathLibrary.quat_rotator(q1).__str__())
        except Exception as exc:
            out[bone + '_delta_q0'] = 'ERR %r' % exc
        try:
            q2 = q0 * delta
            out[bone + '_q0_delta'] = str(unreal.MathLibrary.quat_rotator(q2).__str__())
        except Exception as exc:
            out[bone + '_q0_delta'] = 'ERR %r' % exc
        out[bone + '_base'] = str(unreal.MathLibrary.quat_rotator(q0).__str__())
        out[bone + '_expected_roll'] = 90.0 + deg
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
