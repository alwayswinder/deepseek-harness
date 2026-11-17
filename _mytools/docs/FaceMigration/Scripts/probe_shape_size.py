"""打印控制当前 shape transform 与 shape 的世界尺寸。"""

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
    out = {}
    for name in ('CTRL_BROW_L', 'CTRL_BROW_R'):
        k = unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=name)
        st = h.get_control_settings(k)
        tf = h.get_global_control_shape_transform(k)
        off = h.get_global_control_offset_transform(k)
        local_shape = h.get_local_control_shape_transform(k)
        out[name] = {
            'shape_name': str(st.shape_name),
            'settings_shape_scale': [round(v, 4) for v in (st.shape_transform.scale3d.x,
                                                          st.shape_transform.scale3d.y,
                                                          st.shape_transform.scale3d.z)],
            'local_shape_scale': [round(v, 4) for v in (local_shape.scale3d.x,
                                                        local_shape.scale3d.y,
                                                        local_shape.scale3d.z)],
            'global_shape_scale': [round(v, 4) for v in (tf.scale3d.x, tf.scale3d.y, tf.scale3d.z)],
            'global_shape_t': [round(v, 2) for v in (tf.translation.x, tf.translation.y, tf.translation.z)],
            'control_scale': [round(v, 3) for v in (off.scale3d.x, off.scale3d.y, off.scale3d.z)],
        }
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
