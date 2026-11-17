"""重建指定资产的预览场景，保存并恢复实例输入，不改写磁盘资产。"""

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

root = Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
target = unreal.load_asset(_fm_asset('/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset'))
hosts = []
for comp in unreal.ObjectIterator(unreal.SkeletalMeshComponent):
    if comp.get_skinned_asset() != target.get_editor_property('preview_skeletal_mesh') or 'AnimationEditorPreviewActor' not in comp.get_path_name():
        continue
    if comp.get_anim_instance():
        for host in unreal.RigVMHost.find_rig_vm_hosts(comp.get_anim_instance(), unreal.ControlRig):
            if host.get_vm().get_outer() == target:
                hosts.append(host)
if len(hosts) > 1:
    previous = json.loads((_fm_read(_fm_tool('Docs/Evidence/SevenRuntime/preview_morph_check.json'))).read_text(encoding='utf-8'))
    hosts = [h for h in hosts if h.get_path_name() == previous.get('preview_host')]
assert len(hosts) == 1, str(hosts)
h = hosts[0].get_hierarchy()
values = {str(k.name): h.get_vector_from_control_value(h.get_control_value(k)).to_tuple() for k in h.get_controls()}
out = _fm_saved('RuntimeFace/preview_inputs_before_refresh.json')
_fm_output(out).write_text(json.dumps(values, indent=2), encoding='utf-8')
sub = unreal.get_editor_subsystem(unreal.AssetEditorSubsystem)
sub.close_all_editors_for_asset(target)
assert sub.open_editor_for_assets([target])
found = []
for comp in unreal.ObjectIterator(unreal.SkeletalMeshComponent):
    if comp.get_skinned_asset() != target.get_editor_property('preview_skeletal_mesh') or 'AnimationEditorPreviewActor' not in comp.get_path_name():
        continue
    if comp.get_anim_instance():
        for host in unreal.RigVMHost.find_rig_vm_hosts(comp.get_anim_instance(), unreal.ControlRig):
            if host.get_vm().get_outer() == target and host not in hosts:
                found.append(host)
assert len(found) == 1, str(found)
h = found[0].get_hierarchy()
for name, v in values.items():
    h.set_control_value(unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=name), h.make_control_value_from_vector(unreal.Vector(*v)))
print('REFRESHED', found[0].get_path_name(), 'RESTORED', len(values))
