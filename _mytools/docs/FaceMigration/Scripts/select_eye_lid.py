"""选中上眼皮控制，配合截图。"""

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
    hc = rig.get_hierarchy_controller()
    keys = [unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=n)
            for n in ('CTRL_EYE_LID_L', 'CTRL_EYE_LID_R')]
    hc.set_selection(keys)
    print('selected 2')


if __name__ == '__main__':
    main()
