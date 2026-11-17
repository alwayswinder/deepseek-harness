"""只读探测：目标 RuntimeAsset 的编辑 API 能力（不修改资产）。"""

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


def has(obj, name):
    return {'name': name, 'attr': hasattr(obj, name)}


def main():
    asset = unreal.load_asset(TARGET)
    editor = asset.get_editor_asset()
    model = editor.get_default_model()
    controller = editor.get_controller(model)
    h = asset.hierarchy
    out = {
        'asset_class': asset.get_class().get_name(),
        'editor_class': editor.get_class().get_name(),
        'controller_class': controller.get_class().get_name(),
        'node_count': len(model.get_nodes()),
        'links': len(model.get_links()),
        'node_names': [str(n.get_name()) for n in model.get_nodes()],
        'controller_methods': sorted([m for m in dir(controller) if not m.startswith('_')])[:800],
        'hierarchy_methods': [m for m in dir(h) if 'add_control' in m or 'control' in m.lower()][:80],
        'editor_methods': [m for m in dir(editor) if 'host' in m.lower() or 'vm' in m.lower() or 'preview' in m.lower()],
        'has_add_control': hasattr(h, 'add_control'),
        'has_controller_add_unit': hasattr(controller, 'add_unit_node_from_struct_path'),
        'has_create_host': hasattr(editor, 'create_rig_vm_host'),
        'hierarchy_settings': str(asset.get_editor_property('hierarchy_settings')),
        'shape_libraries': str(asset.get_editor_property('shape_libraries')),
    }
    try:
        out['preview_mesh'] = asset.get_editor_property('preview_skeletal_mesh').get_path_name()
    except Exception as exc:
        out['preview_mesh'] = 'ERR:' + str(exc)
    print('PROBE2:' + json.dumps(out, ensure_ascii=False))


main()
