"""只读探测：RuntimeAsset 测试实例与层级控制器 API。"""

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

TARGET = _fm_asset('/Game/_MyTest/Mouth/Rig/NewControlRigRuntimeAsset')


def main():
    asset = unreal.load_asset(TARGET)
    editor = asset.get_editor_asset()
    h = asset.hierarchy
    hc = h.get_controller()
    out = {
        'hierarchy_controller_class': hc.get_class().get_name(),
        'hc_methods': [m for m in dir(hc) if not m.startswith('_')][:120],
        'hierarchy_get_controller_ok': hc is not None,
    }
    host = editor.create_rig_vm_host()
    out['host_class'] = host.get_class().get_name() if host else None
    if host:
        out['host_methods'] = [m for m in dir(host) if not m.startswith('_')][:200]
        try:
            ih = host.get_hierarchy()
            out['host_hierarchy_ok'] = True
            out['host_hierarchy_bones'] = len(ih.get_bones()) if ih else None
            out['host_execute_ok'] = bool(host.execute('Forwards Solve'))
        except Exception as exc:
            out['host_hierarchy_ok'] = 'ERR:' + str(exc)
    print('PROBE3:' + json.dumps(out, ensure_ascii=False))


main()
