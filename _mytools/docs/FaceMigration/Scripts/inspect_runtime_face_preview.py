"""只读定位新资产对应的预览动画实例。"""

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
ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
target=unreal.load_asset(_fm_asset('/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset'))
print('TARGET_MESH',target.get_editor_property('preview_skeletal_mesh'))
sub=unreal.get_editor_subsystem(unreal.AssetEditorSubsystem)
rows=[]
for c in unreal.ObjectIterator(unreal.SkeletalMeshComponent):
    if c.get_skinned_asset()!=target.get_editor_property('preview_skeletal_mesh') or 'AnimationEditorPreviewActor' not in c.get_path_name():continue
    anim=c.get_anim_instance()
    print('PREVIEW_TICK',c.is_component_tick_enabled(),c.get_editor_property('enable_animation'),c.get_editor_property('update_animation_in_editor'),c.get_editor_property('visibility_based_anim_tick_option'))
    hosts=unreal.RigVMHost.find_rig_vm_hosts(anim,unreal.ControlRig) if anim else []
    for host in hosts:
        print('HOST_API',[n for n in dir(host) if any(s in n for s in ('queue','event','execute','time','init','vm'))])
        print('COMP_API',[n for n in dir(c) if any(s in n for s in ('rig','animation','preview','tick','update'))])
        print('VM_API',[n for n in dir(host.get_vm()) if any(s in n for s in ('byte','instruction','event'))])
        print('VM_OBJECT',host.get_vm(),'EVENTS',host.get_supported_events(),'CAN_EXECUTE',host.can_execute(),'INIT_REQUIRED',host.is_init_required(),'TIME',host.get_absolute_time())
        for prop in ('event_queue','generated_by'):
            try:print('HOST_PROPERTY',prop,host.get_editor_property(prop))
            except Exception as exc:print('HOST_PROPERTY_ERROR',prop,str(exc))
    rows.append(dict(component=c.get_path_name(),animation=str(anim),hosts=[dict(path=h.get_path_name(),cls=h.get_class().get_name(),controls=len(h.get_hierarchy().get_controls())) for h in hosts],anim_methods=[n for n in dir(anim) if any(s in n for s in ('rig','asset','animation','preview'))]))
out=_fm_saved('RuntimeFace/preview_instances.json')
_fm_output(out).write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(rows,ensure_ascii=False))
if not rows:
    sub.open_editor_for_assets([target])
    print('Opened target editor; inspect after an editor frame')
