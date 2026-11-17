"""探测 ControlRig 使用的形状库与全部 shape 名称。"""

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
    out = {}
    rig = _fm_load_asset(ASSET)
    out['rig_methods'] = [m for m in dir(rig) if 'shape' in m.lower()]
    inst = rig.get_debugged_control_rig()
    out['has_inst'] = inst is not None
    if inst is not None:
        out['inst_methods'] = [m for m in dir(inst) if 'shape' in m.lower()]
        try:
            libs = inst.get_shape_libraries()
            out['libraries'] = []
            for lib in libs:
                item = {'path': str(lib)}
                try:
                    item['shapes'] = [str(s.get_editor_property('shape_name')) for s in lib.get_editor_property('shapes')]
                except Exception as exc:
                    item['shapes'] = 'ERR %r' % exc
                out['libraries'].append(item)
        except Exception as exc:
            out['get_shape_libraries'] = 'ERR %r' % exc
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
