"""只读确认预览中实际创建了参考图 ShapeActor，未使用截图验收。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json,unreal
from pathlib import Path
ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
E=_fm_tool('Docs/Evidence/PhonemeReference')
folder=_fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/PhonemeReference')
parameters=json.loads((_fm_read(E/'parameters.json')).read_text(encoding='utf-8'))
matches=[]
for obj in unreal.ObjectIterator(unreal.ControlRigShapeActor):
    comp=obj.get_component_by_class(unreal.StaticMeshComponent)
    if comp and comp.static_mesh and comp.static_mesh.get_path_name()==folder+'/SM_PhonemeReference.SM_PhonemeReference':
        tf=obj.get_actor_transform();mat=comp.get_material(0).get_base_material()
        assert not obj.is_hidden_ed() and comp.get_editor_property('visible')
        assert (tf.translation-unreal.Vector(*parameters['origin'])).length()<1e-5
        assert mat.get_path_name()==folder+'/M_PhonemeReference.M_PhonemeReference'
        matches.append(dict(actor=obj.get_path_name(),position=list(tf.translation.to_tuple()),material=mat.get_path_name(),visible=True))
assert matches,'Reference shape actor missing from preview'
report=dict(passed=True,actors=matches,visual_approval='pending_user')
(_fm_output(E/'preview_binding.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
