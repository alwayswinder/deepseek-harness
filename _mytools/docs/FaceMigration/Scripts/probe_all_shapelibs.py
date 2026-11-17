"""枚举所有 ControlRigShapeLibrary 资产与其中的 shape 名。"""

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
    out = {'libs': [], 'thick': []}
    ar = unreal.AssetRegistryHelpers.get_asset_registry()
    classes = []
    for cls_name in ('/Script/ControlRig.ControlRigShapeLibrary',
                     '/Script/ControlRigEditor.ControlRigShapeLibrary'):
        try:
            classes.append(unreal.TopLevelAssetPath(cls_name))
        except Exception:
            pass
    for cls in classes:
        try:
            assets = ar.get_assets_by_class(cls, True)
        except Exception as exc:
            out['libs'].append({'class': str(cls), 'err': repr(exc)})
            continue
        for a in assets:
            path = str(a.package_name)
            item = {'class': str(cls), 'path': path}
            try:
                lib = _fm_load_asset(path)
                if lib is not None:
                    names = []
                    for s in lib.get_editor_property('shapes'):
                        try:
                            n = str(s.get_editor_property('shape_name'))
                        except Exception:
                            n = str(s)
                        names.append(n)
                        if 'thick' in n.lower():
                            out['thick'].append(path + '::' + n)
                    item['shapes'] = names
                else:
                    item['shapes'] = 'load None'
            except Exception as exc:
                item['shapes'] = 'ERR %r' % exc
            out['libs'].append(item)
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
