"""把上眼皮控制设为闭合，供截图验证穿模。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import unreal

ASSET = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders')


def main():
    rig = _fm_load_asset(ASSET)
    inst = rig.get_debugged_control_rig()
    if inst is None:
        print('NO INSTANCE')
        return
    rh = inst.get_hierarchy()
    for c in ('CTRL_EYE_LID_R', 'CTRL_EYE_LID_L'):
        rh.set_control_value(unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=c),
                             rh.make_control_value_from_vector(unreal.Vector(0.0, 0.0, -10.0)))
    inst.execute('Forwards Solve')
    print('LID CLOSED')


if __name__ == '__main__':
    main()
