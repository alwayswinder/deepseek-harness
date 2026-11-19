"""读取 Box_Thick / Box_Thin / Box_Solid 的实际尺寸（shape proxy 包围盒）。"""

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

LIB = '/ControlRig/Controls/DefaultGizmoLibraryNormalized'


def main():
    out = {}
    lib = _fm_load_asset(LIB)
    defs = lib.get_editor_property('shapes')
    for d in defs:
        try:
            name = str(d.get_editor_property('shape_name'))
        except Exception:
            continue
        if name not in ('Box_Thick', 'Box_Thin', 'Box_Solid'):
            continue
        item = {'name': name}
        try:
            proxy = d.get_editor_property('shape_proxy')
            item['proxy'] = str(proxy)
            try:
                path = proxy.to_soft_object_path().export_text() if hasattr(proxy, 'to_soft_object_path') else str(proxy)
            except Exception:
                path = None
            item['path'] = path
            if path:
                mesh = _fm_load_asset(path.split('.')[0])
                if mesh:
                    b = mesh.get_bounding_box()
                    item['size'] = [round(b.max.x - b.min.x, 4), round(b.max.y - b.min.y, 4), round(b.max.z - b.min.z, 4)]
                    item['min'] = [round(b.min.x, 4), round(b.min.y, 4), round(b.min.z, 4)]
                    item['max'] = [round(b.max.x, 4), round(b.max.y, 4), round(b.max.z, 4)]
        except Exception as exc:
            item['err'] = repr(exc)
        out[name] = item
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
