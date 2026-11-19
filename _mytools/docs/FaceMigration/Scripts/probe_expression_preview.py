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
_expr_root=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
_expr_bp=_fm_load_asset(_fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation'))
_expr_live=_expr_bp.get_debugged_control_rig();assert _expr_live
_expr_h=_expr_live.get_hierarchy()
_expr_rows=json.loads((_fm_read(_expr_root/'Docs/Evidence/ExpressionSliders/parameters.json')).read_text(encoding='utf-8'))['rows']
_expr_key=lambda n:unreal.RigElementKey(type=unreal.RigElementType.CONTROL,name=n)
_expr_saved={r['control']:_expr_h.get_vector_from_control_value(_expr_h.get_control_value(_expr_key(r['control']))).to_tuple() for r in _expr_rows}
_expr_comps=[c for c in unreal.ObjectIterator(unreal.SkeletalMeshComponent) if c.get_skinned_asset()==_expr_bp.get_preview_mesh() and 'AnimationEditorPreviewActor' in c.get_path_name()]
assert len(_expr_comps)==1, str(_expr_comps)
_expr_comp=_expr_comps[0];_expr_anim=_expr_comp.get_anim_instance();assert _expr_anim
_expr_old_update=_expr_comp.get_editor_property('update_animation_in_editor')
_expr_comp.set_update_animation_in_editor(True)
_expr_frame=0;_expr_results={};_expr_error=None
(_fm_output(_expr_root/'Docs/Evidence/ExpressionSliders/preview_morph_check.json')).write_text(json.dumps(dict(pending=True,started_at=datetime.datetime.now().astimezone().isoformat())),encoding='utf-8')
for _expr_row in _expr_rows:_expr_h.set_control_value(_expr_key(_expr_row['control']),_expr_h.make_control_value_from_vector(unreal.Vector(4,0,0)))
# 由正常预览动画求值，避免手动 Execute 提前消耗 changed-curve 跟踪。

def _expr_tick(delta):
    global _expr_frame,_expr_results
    _expr_frame+=1
    if _expr_frame<20:return
    try:
        curves={m['name']:_expr_anim.get_curve_value(m['name']) for r in _expr_rows for m in r['morphs']}
        active=[str(n) for n in _expr_anim.get_active_curve_names(unreal.AnimCurveType.MORPH_TARGET_CURVE)]
        current={r['control']:_expr_h.get_vector_from_control_value(_expr_h.get_control_value(_expr_key(r['control']))).to_tuple() for r in _expr_rows}
        component_curves={n:_expr_comp.get_morph_target(n) for n in curves}
        rig_curves={n:_expr_h.get_curve_value(unreal.RigElementKey(type=unreal.RigElementType.CURVE,name=n)) for n in curves}
        _expr_results=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),preview_component=_expr_comp.get_path_name(),animation_class=_expr_anim.get_class().get_name(),input_x=4,current_inputs=current,rig_curves=rig_curves,curves=curves,component_override_curves=component_curves,component_override_note='GetMorphTarget reads explicit component overrides, not evaluated animation morph weights',active_morph_curves=active,optimization_cvar=unreal.SystemLibrary.get_console_variable_int_value('ControlRig.EnableAnimNodePerformanceOptimizations'),passed=all(abs(v-.50014)<1e-5 for v in curves.values()) and all(n in active for n in curves))
    except Exception as exc:_expr_results=dict(passed=False,error=str(exc))
    finally:
        for n,v in _expr_saved.items():_expr_h.set_control_value(_expr_key(n),_expr_h.make_control_value_from_vector(unreal.Vector(*v)))
        _expr_live.execute('Forwards Solve');unreal.unregister_slate_post_tick_callback(_expr_handle)
        _expr_comp.set_update_animation_in_editor(_expr_old_update)
        (_fm_output(_expr_root/'Docs/Evidence/ExpressionSliders/preview_morph_check.json')).write_text(json.dumps(_expr_results,ensure_ascii=False,indent=2),encoding='utf-8')

_expr_handle=unreal.register_slate_post_tick_callback(_expr_tick)
print('Preview check scheduled; original inputs will be restored')
