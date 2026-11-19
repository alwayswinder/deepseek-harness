"""选中两个弯曲控制，配合截图。"""

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
            for n in ('CTRL_BROW_L_BEND', 'CTRL_BROW_R_BEND')]
    hc.set_selection(keys)
    h = rig.get_hierarchy()
    out = []
    for k in keys:
        st = h.get_control_settings(k)
        off = h.get_global_control_offset_transform(k).translation
        out.append({'name': str(k.name), 'shape': str(st.shape_name), 't': [round(off.x, 2), round(off.y, 2), round(off.z, 2)]})
    print(out)


if __name__ == '__main__':
    main()
