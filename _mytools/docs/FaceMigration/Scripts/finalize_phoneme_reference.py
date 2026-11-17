"""检查参考图持久化及原口型输出，恢复用户预览输入。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import datetime,json,types
from pathlib import Path
import unreal
ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
m=types.ModuleType('reference');exec(compile((_fm_read(_fm_tool('Scripts/build_phoneme_reference.py'))).read_text(encoding='utf-8'),'reference','exec'),m.__dict__)
E=m.E;p=json.loads((_fm_read(E/'parameters.json')).read_text(encoding='utf-8'));report=json.loads((_fm_read(E/'build_report.json')).read_text(encoding='utf-8'))
rig=_fm_load_asset(m.b.ASSET);h=rig.get_hierarchy();key=m.b.b.key(m.CONTROL,unreal.RigElementType.CONTROL)
assert h.contains(key)
for initial in (True,False):
    tf=unreal.Transform();tf.translation=unreal.Vector(*p['origin'])
    h.set_control_offset_transform(key,tf,initial,True);h.set_control_shape_transform(key,unreal.Transform(),initial)
st=h.get_control_settings(key);st.draw_limits=False;h.set_control_settings(key,st)
h.set_control_value(key,h.make_control_value_from_vector(unreal.Vector()),unreal.RigControlValueType.INITIAL)
rig.recompile_vm();assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
before_samples=json.loads((_fm_read(E/'before_outputs.json')).read_text(encoding='utf-8'))
def check():
    hh=rig.get_hierarchy();assert len(hh.get_controls())==63
    assert json.dumps(m.signature(rig),sort_keys=True)==json.dumps(report['before'],sort_keys=True)
    assert m.samples(rig)==before_samples,'Existing deformation changed'
    ck=m.b.b.key(m.CONTROL,unreal.RigElementType.CONTROL);st=hh.get_control_settings(ck)
    assert st.animation_type==unreal.RigControlAnimationType.VISUAL_CUE
    assert str(st.shape_name)=='SL_PhonemeReference.PhonemeReference'
    assert (hh.get_global_transform(ck,True).translation-unreal.Vector(*p['origin'])).length()<1e-5
    lib=_fm_load_asset(m.FOLDER+'/SL_PhonemeReference');mat=lib.get_editor_property('default_material')
    assert mat.get_editor_property('blend_mode')==unreal.BlendMode.BLEND_MASKED and mat.get_editor_property('two_sided')
    assert mat.get_editor_property('shading_model')==unreal.MaterialShadingModel.MSM_UNLIT
    shape=lib.get_editor_property('shapes')[0];mesh=shape.get_editor_property('shape_proxy')
    assert mesh.get_path_name().startswith(m.FOLDER+'/SM_PhonemeReference.')
    assert mesh.get_num_sections(0)==1
    assert mesh.get_num_triangles(0)==24
    assert mesh.get_material(0).get_path_name()==mat.get_path_name()
    return dict(controls=63,animation_controls=62,visual_cues=1,bones=len(hh.get_bones()),nodes=len(rig.get_default_model().get_nodes()),curves=len(hh.get_curves()),output_cases=len(before_samples),triangles=24,graph_unchanged=True,outputs_unchanged=True)
validation=check()
assert _fm_save_asset(rig,False)
sub=unreal.get_editor_subsystem(unreal.AssetEditorSubsystem);sub.close_all_editors_for_asset(rig)
result=unreal.EditorLoadingAndSavingUtils.reload_packages([rig.get_outer()],unreal.ReloadPackagesInteractionMode.ASSUME_POSITIVE);assert result[0]
rig=_fm_load_asset(m.b.ASSET);assert check()==validation
sub.open_editor_for_assets([rig]);live=rig.get_debugged_control_rig();assert live;lh=live.get_hierarchy()
for n,v in report['preview_values'].items():
    ck=m.b.b.key(n,unreal.RigElementType.CONTROL);lh.set_control_value(ck,lh.make_control_value_from_vector(unreal.Vector(*v)))
live.clear_control_selection();live.select_control('CTRL_PHONEME_A_FV_01',True)
validation.update(saved=True,reloaded=True,preview_restored=True,passed=True,captured_at=datetime.datetime.now().astimezone().isoformat())
report.update(saved=True,passed=True,controls_total=63,animation_controls=62,visual_cues=1,output_cases=len(before_samples))
(_fm_output(E/'build_report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(_fm_output(E/'validation.json')).write_text(json.dumps(validation,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(validation,ensure_ascii=False))
