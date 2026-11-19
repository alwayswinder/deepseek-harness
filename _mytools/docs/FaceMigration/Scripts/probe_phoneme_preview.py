"""经编辑器帧更新读取预览动画曲线及 Morph 类型，结束后恢复输入。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import datetime,json,unreal
from pathlib import Path
_phon_root=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
_phon_bp=_fm_load_asset(_fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation'))
_phon_live=_phon_bp.get_debugged_control_rig();assert _phon_live
_phon_h=_phon_live.get_hierarchy()
_phon_rows=json.loads((_fm_read(_phon_root/'Docs/Evidence/PhonemeSliders/parameters.json')).read_text(encoding='utf-8'))['rows']
_phon_key=lambda n:unreal.RigElementKey(type=unreal.RigElementType.CONTROL,name=n)
_phon_saved={r['control']:_phon_h.get_vector_from_control_value(_phon_h.get_control_value(_phon_key(r['control']))).to_tuple() for r in _phon_rows}
_phon_comps=[c for c in unreal.ObjectIterator(unreal.SkeletalMeshComponent) if c.get_skinned_asset()==_phon_bp.get_preview_mesh() and 'AnimationEditorPreviewActor' in c.get_path_name()]
assert len(_phon_comps)==1, str(_phon_comps)
_phon_comp=_phon_comps[0];_phon_anim=_phon_comp.get_anim_instance();assert _phon_anim
_phon_old_update=_phon_comp.get_editor_property('update_animation_in_editor')
_phon_comp.set_update_animation_in_editor(True)
_phon_frame=0;_phon_results={};_phon_error=None
(_fm_output(_phon_root/'Docs/Evidence/PhonemeSliders/preview_morph_check.json')).write_text(json.dumps(dict(pending=True,started_at=datetime.datetime.now().astimezone().isoformat())),encoding='utf-8')
for _phon_row in _phon_rows:_phon_h.set_control_value(_phon_key(_phon_row['control']),_phon_h.make_control_value_from_vector(unreal.Vector(4,0,0)))
# 由正常预览动画求值，避免手动 Execute 提前消耗 changed-curve 跟踪。

def _phon_tick(delta):
    global _phon_frame,_phon_results
    _phon_frame+=1
    if _phon_frame<20:return
    try:
        curves={m['name']:_phon_anim.get_curve_value(m['name']) for r in _phon_rows for m in r['morphs']}
        active=[str(n) for n in _phon_anim.get_active_curve_names(unreal.AnimCurveType.MORPH_TARGET_CURVE)]
        current={r['control']:_phon_h.get_vector_from_control_value(_phon_h.get_control_value(_phon_key(r['control']))).to_tuple() for r in _phon_rows}
        component_curves={n:_phon_comp.get_morph_target(n) for n in curves}
        rig_curves={n:_phon_h.get_curve_value(unreal.RigElementKey(type=unreal.RigElementType.CURVE,name=n)) for n in curves}
        _phon_results=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),preview_component=_phon_comp.get_path_name(),animation_class=_phon_anim.get_class().get_name(),input_x=4,current_inputs=current,rig_curves=rig_curves,curves=curves,component_override_curves=component_curves,component_override_note='GetMorphTarget reads explicit component overrides, not evaluated animation morph weights',active_morph_curves=active,optimization_cvar=unreal.SystemLibrary.get_console_variable_int_value('ControlRig.EnableAnimNodePerformanceOptimizations'),passed=all(abs(v-.5)<1e-5 for v in curves.values()) and all(n in active for n in curves))
    except Exception as exc:_phon_results=dict(passed=False,error=str(exc))
    finally:
        for n,v in _phon_saved.items():_phon_h.set_control_value(_phon_key(n),_phon_h.make_control_value_from_vector(unreal.Vector(*v)))
        _phon_live.execute('Forwards Solve');unreal.unregister_slate_post_tick_callback(_phon_handle)
        _phon_comp.set_update_animation_in_editor(_phon_old_update)
        (_fm_output(_phon_root/'Docs/Evidence/PhonemeSliders/preview_morph_check.json')).write_text(json.dumps(_phon_results,ensure_ascii=False,indent=2),encoding='utf-8')

_phon_handle=unreal.register_slate_post_tick_callback(_phon_tick)
print('Preview check scheduled; original inputs will be restored')
