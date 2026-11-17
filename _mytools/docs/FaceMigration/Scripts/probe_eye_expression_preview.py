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
_eyeexpr_root=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
_eyeexpr_bp=_fm_load_asset(_fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation'))
_eyeexpr_live=_eyeexpr_bp.get_debugged_control_rig();assert _eyeexpr_live
_eyeexpr_h=_eyeexpr_live.get_hierarchy()
_eyeexpr_rows=json.loads((_fm_read(_eyeexpr_root/'Docs/Evidence/EyeExpressions/parameters.json')).read_text(encoding='utf-8'))['rows']
_eyeexpr_key=lambda n:unreal.RigElementKey(type=unreal.RigElementType.CONTROL,name=n)
_eyeexpr_saved={r['control']:_eyeexpr_h.get_vector_from_control_value(_eyeexpr_h.get_control_value(_eyeexpr_key(r['control']))).to_tuple() for r in _eyeexpr_rows}
_eyeexpr_comps=[c for c in unreal.ObjectIterator(unreal.SkeletalMeshComponent) if c.get_skinned_asset()==_eyeexpr_bp.get_preview_mesh() and 'AnimationEditorPreviewActor' in c.get_path_name()]
assert len(_eyeexpr_comps)==1, str(_eyeexpr_comps)
_eyeexpr_comp=_eyeexpr_comps[0];_eyeexpr_anim=_eyeexpr_comp.get_anim_instance();assert _eyeexpr_anim
_eyeexpr_old_update=_eyeexpr_comp.get_editor_property('update_animation_in_editor')
_eyeexpr_comp.set_update_animation_in_editor(True)
_eyeexpr_frame=0;_eyeexpr_results={};_eyeexpr_error=None
(_fm_output(_eyeexpr_root/'Docs/Evidence/EyeExpressions/preview_morph_check.json')).write_text(json.dumps(dict(pending=True,started_at=datetime.datetime.now().astimezone().isoformat())),encoding='utf-8')
for _eyeexpr_row in _eyeexpr_rows:_eyeexpr_h.set_control_value(_eyeexpr_key(_eyeexpr_row['control']),_eyeexpr_h.make_control_value_from_vector(unreal.Vector(4,0,0)))
# 由正常预览动画求值，避免手动 Execute 提前消耗 changed-curve 跟踪。

def _eyeexpr_tick(delta):
    global _eyeexpr_frame,_eyeexpr_results
    _eyeexpr_frame+=1
    if _eyeexpr_frame<20:return
    try:
        curves={m['name']:_eyeexpr_anim.get_curve_value(m['name']) for r in _eyeexpr_rows for m in r['morphs']}
        active=[str(n) for n in _eyeexpr_anim.get_active_curve_names(unreal.AnimCurveType.MORPH_TARGET_CURVE)]
        current={r['control']:_eyeexpr_h.get_vector_from_control_value(_eyeexpr_h.get_control_value(_eyeexpr_key(r['control']))).to_tuple() for r in _eyeexpr_rows}
        component_curves={n:_eyeexpr_comp.get_morph_target(n) for n in curves}
        rig_curves={n:_eyeexpr_h.get_curve_value(unreal.RigElementKey(type=unreal.RigElementType.CURVE,name=n)) for n in curves}
        _eyeexpr_results=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),preview_component=_eyeexpr_comp.get_path_name(),animation_class=_eyeexpr_anim.get_class().get_name(),input_x=4,current_inputs=current,rig_curves=rig_curves,curves=curves,component_override_curves=component_curves,component_override_note='GetMorphTarget reads explicit component overrides, not evaluated animation morph weights',active_morph_curves=active,optimization_cvar=unreal.SystemLibrary.get_console_variable_int_value('ControlRig.EnableAnimNodePerformanceOptimizations'),passed=all(abs(v-.5)<1e-5 for v in curves.values()) and all(n in active for n in curves))
    except Exception as exc:_eyeexpr_results=dict(passed=False,error=str(exc))
    finally:
        for n,v in _eyeexpr_saved.items():_eyeexpr_h.set_control_value(_eyeexpr_key(n),_eyeexpr_h.make_control_value_from_vector(unreal.Vector(*v)))
        unreal.unregister_slate_post_tick_callback(_eyeexpr_handle)
        _eyeexpr_comp.set_update_animation_in_editor(_eyeexpr_old_update)
        (_fm_output(_eyeexpr_root/'Docs/Evidence/EyeExpressions/preview_morph_check.json')).write_text(json.dumps(_eyeexpr_results,ensure_ascii=False,indent=2),encoding='utf-8')

_eyeexpr_handle=unreal.register_slate_post_tick_callback(_eyeexpr_tick)
print('Preview check scheduled; original inputs will be restored')
