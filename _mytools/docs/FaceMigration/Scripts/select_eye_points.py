"""选中 16 个眼周点控，配合截图。"""

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
NAMES = [
    'CTRL_EYE_R_CORNER_IN', 'CTRL_EYE_R_UP_IN', 'CTRL_EYE_R_UP_MID', 'CTRL_EYE_R_UP_OUT',
    'CTRL_EYE_R_CORNER_OUT', 'CTRL_EYE_R_DOWN_OUT', 'CTRL_EYE_R_DOWN_MID', 'CTRL_EYE_R_DOWN_IN',
    'CTRL_EYE_L_CORNER_IN', 'CTRL_EYE_L_UP_IN', 'CTRL_EYE_L_UP_MID', 'CTRL_EYE_L_UP_OUT',
    'CTRL_EYE_L_CORNER_OUT', 'CTRL_EYE_L_DOWN_OUT', 'CTRL_EYE_L_DOWN_MID', 'CTRL_EYE_L_DOWN_IN',
]


def main():
    rig = _fm_load_asset(ASSET)
    hc = rig.get_hierarchy_controller()
    hc.set_selection([unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=n) for n in NAMES])
    print('selected', len(NAMES))


if __name__ == '__main__':
    main()
