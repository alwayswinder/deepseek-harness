"""只读探测用户指定的新式 Control Rig 资产与参考 Rig。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json
from pathlib import Path
import unreal

ROOT = Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
TARGET = _fm_asset('/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset')
SOURCE = _fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation')
report = {'project': str(ROOT), 'engine': unreal.SystemLibrary.get_engine_version(), 'assets': {}}
for path in (TARGET, SOURCE):
    obj = unreal.load_asset(path)
    assert obj, path
    row = {'class': obj.get_class().get_path_name(), 'methods': [n for n in dir(obj) if any(s in n for s in ('hierarch', 'editor', 'model', 'rig', 'preview', 'shape', 'compile', 'copy', 'vm'))]}
    for name in ('get_editor_only_data', 'get_hierarchy', 'get_preview_mesh'):
        if hasattr(obj, name):
            try:
                value = getattr(obj, name)()
                row[name] = str(value)
                if name == 'get_editor_only_data' and value:
                    row['editor_methods'] = [n for n in dir(value) if not n.startswith('_')]
                if name == 'get_hierarchy':
                    row['counts'] = {kind: len(getattr(value, 'get_' + kind)()) for kind in ('bones', 'controls', 'curves')}
            except Exception as exc:
                row[name] = repr(exc)
    report['assets'][path] = row
report['libraries'] = {n: [m for m in dir(getattr(unreal, n)) if any(s in m for s in ('asset', 'blueprint', 'editor', 'rig', 'copy'))] for n in dir(unreal) if ('ControlRig' in n or 'RigVM' in n) and any(s in n for s in ('Library', 'Asset', 'Factory', 'Blueprint'))}
out = _fm_saved('RuntimeFace/preflight.json')
_fm_output(out.parent).mkdir(parents=True, exist_ok=True)
_fm_output(out).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
