"""读取 DefaultGizmoLibrary 的 shape 名称清单。"""

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
    out = {}
    for path in ('/Engine/Plugins/Animation/ControlRig/Content/Controls/DefaultGizmoLibrary',
                 '/Engine/Plugins/Animation/ControlRig/Content/Controls/DefaultGizmoLibraryNormalized'):
        try:
            lib = _fm_load_asset(path)
            out[path] = str(lib)
            if lib is not None:
                names = []
                for s in lib.get_editor_property('shapes'):
                    try:
                        names.append(str(s.get_editor_property('shape_name')))
                    except Exception:
                        names.append(str(s))
                out[path + '::names'] = names
                try:
                    d = lib.get_editor_property('default_shape')
                    out[path + '::default'] = str(d.get_editor_property('shape_name'))
                except Exception as exc:
                    out[path + '::default'] = 'ERR %r' % exc
        except Exception as exc:
            out[path] = 'ERR %r' % exc
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
