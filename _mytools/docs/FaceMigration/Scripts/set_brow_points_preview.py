"""把 debugged rig 的新点控设成夸张值，用于编辑器内视觉验证。"""

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


def key(name):
    return unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=name)


def main():
    rig = _fm_load_asset(ASSET)
    inst = rig.get_debugged_control_rig()
    out = {'has_instance': inst is not None}
    if inst is None:
        print('JSONSTART')
        print(json.dumps(out))
        print('JSONEND')
        return
    rh = inst.get_hierarchy()
    vals = {
        'CTRL_BROW_L_IN': (0.0, 0.0, 8.0),
        'CTRL_BROW_L_MID': (0.0, 0.0, -6.0),
        'CTRL_BROW_L_OUT': (0.0, 0.0, 4.0),
        'CTRL_BROW_R_IN': (0.0, 0.0, 8.0),
        'CTRL_BROW_R_MID': (0.0, 0.0, -6.0),
        'CTRL_BROW_R_OUT': (0.0, 0.0, 4.0),
    }
    for c, v in vals.items():
        try:
            rh.set_control_value(key(c), rh.make_control_value_from_vector(unreal.Vector(*v)))
            out[c] = list(v)
        except Exception as exc:
            out[c] = 'ERR %r' % exc
    inst.execute('Forwards Solve')
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False))
    print('JSONEND')


if __name__ == '__main__':
    main()
