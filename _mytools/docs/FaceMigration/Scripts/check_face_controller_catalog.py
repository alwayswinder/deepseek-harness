"""在 UE 中只读核对名称表覆盖；不构建或修改 Rig。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import datetime,json
from pathlib import Path
import unreal
ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
catalog=json.loads((_fm_read(_fm_tool('Docs/Characters/Seven.face-controls.json'))).read_text(encoding='utf-8'))
bp=_fm_load_asset(catalog['target']['control_rig']);assert bp
h=bp.get_hierarchy();wanted={r['ue_control'] for r in catalog['bindings'] if r['enabled']}
animation={str(k.name) for k in h.get_controls() if h.get_control_settings(k).animation_type!=unreal.RigControlAnimationType.VISUAL_CUE}
cue=[str(k.name) for k in h.get_controls() if h.get_control_settings(k).animation_type==unreal.RigControlAnimationType.VISUAL_CUE]
report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),kind='name_coverage_only',asset=bp.get_path_name(),catalog_count=len(wanted),animation_controls=len(animation),visual_cues=cue,missing=sorted(wanted-animation),uncatalogued=sorted(animation-wanted),bones=len(h.get_bones()),nodes=len(bp.get_default_model().get_nodes()),curves=len(h.get_curves()))
report['passed']=not report['missing'] and not report['uncatalogued']
(_fm_output(_fm_tool('Docs/Evidence/ControllerCatalog/ue_name_coverage.json'))).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
assert report['passed'],report
print(json.dumps(report,ensure_ascii=False))
