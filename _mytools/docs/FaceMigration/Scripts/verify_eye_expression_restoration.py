"""在正常预览帧后检查用户输入和实际动画曲线均已恢复。"""

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
_er_root=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
_er_e=_fm_tool('Docs/Evidence/EyeExpressions')
_er_build=json.loads((_fm_read(_er_e/'build_report.json')).read_text(encoding='utf-8'))
_er_rows=json.loads((_fm_read(_er_e/'parameters.json')).read_text(encoding='utf-8'))['rows']
_er_bp=_fm_load_asset(_fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation'));_er_live=_er_bp.get_debugged_control_rig();_er_h=_er_live.get_hierarchy()
_er_comp=next(c for c in unreal.ObjectIterator(unreal.SkeletalMeshComponent) if c.get_skinned_asset()==_er_bp.get_preview_mesh() and 'AnimationEditorPreviewActor' in c.get_path_name())
_er_update=_er_comp.get_editor_property('update_animation_in_editor');_er_comp.set_update_animation_in_editor(True)
_er_frame=0
def _er_tick(delta):
    global _er_frame
    _er_frame+=1
    if _er_frame<20:return
    result=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),passed=False)
    try:
        maximum=0
        for n,v in _er_build['preview_values'].items():
            ck=unreal.RigElementKey(type=unreal.RigElementType.CONTROL,name=n)
            maximum=max(maximum,(_er_h.get_vector_from_control_value(_er_h.get_control_value(ck))-unreal.Vector(*v)).length())
        anim=_er_comp.get_anim_instance();new_curves={m['name']:anim.get_curve_value(m['name']) for row in _er_rows for m in row['morphs']}
        assert maximum<1e-5
        assert max(abs(v) for v in new_curves.values())<1e-6,new_curves
        assert _er_bp.get_editor_property('status')==unreal.BlueprintStatus.BS_UP_TO_DATE
        result.update(passed=True,input_error=maximum,new_curves=new_curves)
    except Exception as exc:result['error']=str(exc)
    finally:
        _er_comp.set_update_animation_in_editor(_er_update);unreal.unregister_slate_post_tick_callback(_er_handle)
        (_fm_output(_er_e/'preview_restored.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
_er_handle=unreal.register_slate_post_tick_callback(_er_tick)
print('Restoration verification scheduled')
