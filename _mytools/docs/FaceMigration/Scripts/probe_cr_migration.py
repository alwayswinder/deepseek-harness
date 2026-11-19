"""探测新项目里源 Rig 与目标 RuntimeAsset 的结构（只读）。"""

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

SOURCE = _fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation')
TARGET = _fm_asset('/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset')


def summarize(asset, path):
    info = {'path': path, 'class': asset.get_class().get_name()}
    try:
        mesh = asset.get_editor_property('preview_skeletal_mesh') if isinstance(asset, unreal.ControlRigRuntimeAsset) else asset.get_preview_mesh()
        info['preview_mesh'] = mesh.get_path_name() if mesh else None
    except Exception as exc:
        info['preview_mesh'] = 'ERR:' + str(exc)
    if isinstance(asset, unreal.ControlRigRuntimeAsset):
        hierarchy = asset.hierarchy
    else:
        hierarchy = asset.get_hierarchy()
    info['bones'] = len(hierarchy.get_bones())
    info['controls'] = len(hierarchy.get_controls())
    info['curves'] = len(hierarchy.get_curves())
    info['curve_names'] = [str(k.name) for k in hierarchy.get_curves()]
    info['control_names'] = [str(k.name) for k in hierarchy.get_controls()]
    return info


def main():
    out = {'engine': unreal.SystemLibrary.get_engine_version(),
           'project': unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())}
    source = unreal.load_asset(SOURCE)
    target = unreal.load_asset(TARGET)
    out['source_found'] = source is not None
    out['target_found'] = target is not None
    if target:
        out['target'] = summarize(target, TARGET)
        editor = target.get_editor_asset()
        model = editor.get_default_model()
        out['target']['nodes'] = len(model.get_nodes())
        out['target']['links'] = len(model.get_links())
        out['target']['editor_class'] = editor.get_class().get_name()
        out['target']['preview_mesh_prop'] = str(target.get_editor_property('preview_skeletal_mesh'))
    if source:
        out['source'] = summarize(source, SOURCE)
        out['source']['is_blueprint'] = isinstance(source, unreal.ControlRigBlueprint)
        try:
            model = source.get_default_model()
            out['source']['nodes'] = len(model.get_nodes())
            out['source']['links'] = len(model.get_links())
        except Exception as exc:
            out['source']['model_error'] = str(exc)
        try:
            out['source']['local_function_nodes'] = len(source.get_local_function_library().get_nodes())
        except Exception as exc:
            out['source']['local_function_error'] = str(exc)
        try:
            out['source']['controllers'] = len(source.get_controllers())
        except Exception as exc:
            out['source']['controllers_error'] = str(exc)
    print('PROBE_JSON:' + json.dumps(out, ensure_ascii=False))


main()
