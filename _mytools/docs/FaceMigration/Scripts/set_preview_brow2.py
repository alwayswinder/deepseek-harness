"""把 debugged rig 的两个控制设成不同值，用于编辑器内视觉验证。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json
import sys

import unreal

ASSET = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders')
# 用法：改下面这行，格式 "L_x,L_z,R_x,R_z"
ARGS = ['0,0,10,10']


def key(name):
    return unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=name)


def main():
    vals = [float(v) for v in ARGS[0].split(',')]
    rig = _fm_load_asset(ASSET)
    inst = rig.get_debugged_control_rig()
    out = {'has_instance': inst is not None}
    if inst is None:
        print(json.dumps(out))
        return
    rh = inst.get_hierarchy()
    rh.set_control_value(key('CTRL_BROW_L'), rh.make_control_value_from_vector(unreal.Vector(vals[0], 0.0, vals[1])))
    rh.set_control_value(key('CTRL_BROW_R'), rh.make_control_value_from_vector(unreal.Vector(vals[2], 0.0, vals[3])))
    inst.execute('Forwards Solve')
    out['L'] = vals[0:2]
    out['R'] = vals[2:4]
    print(json.dumps(out))
    print('SET_OK')


if __name__ == '__main__':
    main()
