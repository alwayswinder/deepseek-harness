
# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import unreal,json
bp=_fm_load_asset(_fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation'));live=bp.get_debugged_control_rig();h=live.get_hierarchy()
print('LIVE',live.get_path_name())
for n in ('CTRL_EYE_EXPR_QI_R','CTRL_EYE_EXPR_NU_L'):
 k=unreal.RigElementKey(type=unreal.RigElementType.CONTROL,name=n);print('CTRL',n,h.get_vector_from_control_value(h.get_control_value(k)))
print('SCOPE',[(k,str(globals().get(k))) for k in ('_eyeexpr_frame','_eyeexpr_handle')])
for c in unreal.ObjectIterator(unreal.SkeletalMeshComponent):
 if c.get_skinned_asset()==bp.get_preview_mesh() and 'AnimationEditorPreviewActor' in c.get_path_name():print('COMP',c.get_path_name(),c.get_anim_instance().get_curve_value('1_qi_l_es'))
