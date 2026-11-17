"""试验 Box_thick 形状是否可用（改一个控制后截图对比，再改回）。"""

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


def main():
    rig = _fm_load_asset(ASSET)
    h = rig.get_hierarchy()
    k = unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name='CTRL_BROW_R_BEND')
    st = h.get_control_settings(k)
    out = {'before': str(st.shape_name)}
    st.shape_name = 'Box_thick'
    h.set_control_settings(k, st)
    st2 = h.get_control_settings(k)
    out['after_set'] = str(st2.shape_name)
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
