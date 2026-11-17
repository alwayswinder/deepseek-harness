"""探测 ControlRig 形状库里是否有 Box_thick 及其尺寸。"""

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


def main():
    out = {'libraries': {}, 'thick': []}
    for path in ('/Engine/Plugins/Animation/ControlRig/Content/Controls/ControlRigShapes',
                 '/Engine/Plugins/Animation/ControlRig/Content/Controls/ControlRigShapes.ControlRigShapes',
                 '/Engine/ControlRig/Controls/ControlRigShapes'):
        try:
            a = _fm_load_asset(path)
            if a is None:
                out['libraries'][path] = 'None'
                continue
            out['libraries'][path] = str(a.get_class().get_name())
            shapes = a.get_editor_property('shapes')
            names = []
            for s in shapes:
                try:
                    n = str(s.get_editor_property('shape_name'))
                except Exception:
                    n = str(s)
                names.append(n)
                if 'thick' in n.lower():
                    out['thick'].append(n)
            out['libraries'][path + '::names'] = names
        except Exception as exc:
            out['libraries'][path] = 'ERR %r' % exc
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
