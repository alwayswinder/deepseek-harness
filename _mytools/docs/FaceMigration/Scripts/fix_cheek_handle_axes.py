"""反转左右脸颊蓝色轴并补偿 Z 输入；验证世界拖动和变形保持不变。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import datetime
import json
from pathlib import Path
import shutil
import types
import unreal

ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
EVIDENCE=_fm_tool('Docs/Evidence/Cheeks')
helpers=types.ModuleType('cheek_helpers')
exec(compile((_fm_read(_fm_tool('Scripts/build_cheek_controls.py'))).read_text(encoding='utf-8'),'build_cheek_controls.py','exec'),helpers.__dict__)


def main():
    params=json.loads((_fm_read(EVIDENCE/'parameters.json')).read_text(encoding='utf-8'))
    ref=json.loads((_fm_read(EVIDENCE/'max_samples.json')).read_text(encoding='utf-8'))
    rig=_fm_load_asset(helpers.ASSET)
    model=rig.get_default_model()
    ctrl=rig.get_controller(model)
    h=rig.get_hierarchy()
    links_before=helpers.base.helper.exec_links(model)
    count_before=len(model.get_nodes())
    for c in params['controls']:
        k=helpers.key(c['control'],unreal.RigElementType.CONTROL)
        assert helpers.base.helper.rotation_error(h.get_global_control_offset_transform(k).rotation,unreal.Quat(*c['source_control_rotation']))<1e-4,'Axis already adjusted or offset changed'
    backup=_fm_saved('Backup')/('CheekAxes_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'))
    _fm_output(backup).mkdir(parents=True)
    disk=_fm_disk('Content/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation.uasset')
    shutil.copy2(disk,backup/'disk_before.uasset')
    assert _fm_save_asset(rig,False)
    shutil.copy2(disk,backup/'memory_before.uasset')
    preview=rig.get_debugged_control_rig()
    preview_values={}
    selection=[]
    if preview:
        ph=preview.get_hierarchy()
        for k in ph.get_all_keys():
            if k.type==unreal.RigElementType.CONTROL:
                v=ph.get_vector_from_control_value(ph.get_control_value(k))
                preview_values[str(k.name)]=[v.x,v.y,v.z]
        selection=list(preview.current_control_selection())
    inst,bh=helpers.instance(rig)
    before=[]
    for sample in ref['samples']:
        values={c['control']:tuple(10*v for v in s) for c,s in zip(params['controls'],sample['input'])}
        helpers.solve(inst,bh,values)
        positions={c['control']:bh.get_global_transform(helpers.key(c['control'],unreal.RigElementType.CONTROL)).translation for c in params['controls']}
        before.append((sample,helpers.pose(bh),positions))
    auto=rig.get_auto_vm_recompile()
    rig.modify()
    try:
        rig.set_auto_vm_recompile(False)
        with unreal.ScopedEditorTransaction('Align cheek blue axes and compensate input'):
            for c in params['controls']:
                k=helpers.key(c['control'],unreal.RigElementType.CONTROL)
                offset=h.get_global_control_offset_transform(k)
                offset.rotation=unreal.Quat(*c['control_rotation'])
                for initial in (True,False):
                    h.set_control_offset_transform(k,offset,initial,True)
                assert ctrl.set_pin_default_value('CHEEK_'+c['control']+'_Z.B',helpers.vstr((0,0,-1)),False,False)
            rig.recompile_vm()
            assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
    finally:
        rig.set_auto_vm_recompile(auto)
    after_inst,ah=helpers.instance(rig)
    max_position=max_rotation=max_handle=0.0
    for sample,old_pose,old_positions in before:
        values={c['control']:(10*s[0],0,-10*s[2]) for c,s in zip(params['controls'],sample['input'])}
        helpers.solve(after_inst,ah,values)
        for b,tf in old_pose.items():
            current=ah.get_global_transform(helpers.key(b))
            max_position=max(max_position,(current.translation-tf.translation).length())
            max_rotation=max(max_rotation,helpers.base.helper.rotation_error(current.rotation,tf.rotation))
        for name,pos in old_positions.items():
            current=ah.get_global_transform(helpers.key(name,unreal.RigElementType.CONTROL)).translation
            max_handle=max(max_handle,(current-pos).length())
    assert max_position<1e-6 and max_rotation<1e-4 and max_handle<1e-5,(max_position,max_rotation,max_handle)
    assert helpers.base.helper.exec_links(model)==links_before
    assert len(model.get_nodes())==count_before
    reload_module=types.ModuleType('cheek_reload')
    exec(compile((_fm_read(_fm_tool('Scripts/reload_cheek_target.py'))).read_text(encoding='utf-8'),'reload_cheek_target.py','exec'),reload_module.__dict__)
    reload_module.main()
    # Restore the user's current preview pose and selection after reloading.
    rig=_fm_load_asset(helpers.ASSET)
    live=rig.get_debugged_control_rig()
    restored=False
    if live and preview_values:
        for c in params['controls']:
            preview_values[c['control']][2]*=-1
        helpers.solve(live,live.get_hierarchy(),preview_values)
        live.clear_control_selection()
        for name in selection:
            live.select_control(name,True)
        restored=True
    report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),asset=helpers.ASSET,
                backup=str(backup),source_cases=len(before),bones_per_case=len(before[0][1]),
                bones_max_position_change_cm=max_position,bones_max_rotation_change_deg=max_rotation,
                handle_max_world_position_change_cm=max_handle,nodes=count_before,
                original_execution_links_preserved=True,blue_z_reversed=True,input_z_sign=-1,
                preview_restored=restored,validation_after_reload_passed=True,saved=True)
    (_fm_output(EVIDENCE/'axis_adjustment.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))


if __name__=='__main__':
    main()
