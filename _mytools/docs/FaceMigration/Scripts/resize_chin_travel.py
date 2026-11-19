"""下巴控制行程缩为 1/3，增益变为三倍，保留动作幅度和当前预览姿势。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import datetime,itertools,json,shutil,types
from pathlib import Path
import unreal

ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()));E=_fm_tool('Docs/Evidence/Chin')

def main():
    b=types.ModuleType('chin');exec(compile((_fm_read(_fm_tool('Scripts/build_chin_control.py'))).read_text(encoding='utf-8'),'chin','exec'),b.__dict__)
    p=json.loads((_fm_read(E/'parameters.json')).read_text(encoding='utf-8'))
    rig=_fm_load_asset(b.ASSET);h=rig.get_hierarchy();model=rig.get_default_model();ctrl=rig.get_controller(model);ck=b.key('CTRL_CHIN',unreal.RigElementType.CONTROL)
    settings=h.get_control_settings(ck)
    oldmin=h.get_vector_from_control_value(settings.minimum_value);oldmax=h.get_vector_from_control_value(settings.maximum_value)
    assert (oldmin-unreal.Vector(-10,0,-60)).length()<1e-5 and (oldmax-unreal.Vector(10,50,0)).length()<1e-5,'Travel already changed'
    preview=b.base.preview_values(rig);assert preview,'Preview unavailable'
    backup=_fm_saved('Backup')/('ChinTravel_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'));_fm_output(backup).mkdir(parents=True)
    disk=_fm_disk('Content/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation.uasset');shutil.copy2(disk,backup/'disk_before.uasset')
    assert _fm_save_asset(rig,False);shutil.copy2(disk,backup/'memory_before.uasset')
    oldlinks=b.base.base.helper.exec_links(model);oldnodes=len(model.get_nodes())
    cases=[dict(preview)]
    cases.extend({'CTRL_CHIN':list(v)} for v in itertools.product((-10,10),(0,50),(-60,0)))
    cases.extend({'CTRL_CHIN':v} for v in ((0,0,0),(-5,0,0),(5,0,0),(0,25,0),(0,0,-30),(-6,30,-35),(7,15,-12)))
    expected=[]
    for values in cases:
        inst,rh=b.instance(rig);b.solve(inst,rh,values);expected.append(b.packed(rh))
    report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),asset=b.ASSET,backup=str(backup),factor=1/3,old_minimum=oldmin.to_tuple(),old_maximum=oldmax.to_tuple(),old_preview=preview,old_pins={})
    adjusted=dict(preview);adjusted['CTRL_CHIN']=[x/3 for x in preview.get('CTRL_CHIN',[0,0,0])]
    auto=rig.get_auto_vm_recompile();rig.modify()
    try:
        rig.set_auto_vm_recompile(False)
        with unreal.ScopedEditorTransaction('Reduce chin control travel to one third'):
            settings.minimum_value=h.make_control_value_from_vector(unreal.Vector(*p['minimum']));settings.maximum_value=h.make_control_value_from_vector(unreal.Vector(*p['maximum']));h.set_control_settings(ck,settings)
            gain=1/p['ui_units_per_source']
            for i,row in enumerate(([0,gain,0],[0,0,gain],[-gain,0,0])):
                pin='CHIN_SRC'+str(i)+'.B';report['old_pins'][pin]=model.find_pin(pin).get_default_value();assert ctrl.set_pin_default_value(pin,b.base.vstr(row),False,False)
            h.set_control_value(ck,h.make_control_value_from_vector(unreal.Vector(*adjusted['CTRL_CHIN'])))
            rig.recompile_vm();assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
    finally:rig.set_auto_vm_recompile(auto)
    assert len(model.get_nodes())==oldnodes and b.base.base.helper.exec_links(model)==oldlinks
    worstp=worstq=worsts=0
    for values,pose in zip(cases,expected):
        vals=dict(values);vals['CTRL_CHIN']=[x/3 for x in vals.get('CTRL_CHIN',[0,0,0])]
        inst,rh=b.instance(rig);b.solve(inst,rh,vals)
        for bone,t in pose.items():
            tf=rh.get_global_transform(b.key(bone));worstp=max(worstp,(tf.translation-unreal.Vector(*t['p'])).length());worstq=max(worstq,b.base.base.helper.rotation_error(tf.rotation,unreal.Quat(*t['q'])));worsts=max(worsts,(tf.scale3d-unreal.Vector(*t['scale'])).length())
    assert worstp<1e-4 and worstq<1e-4 and worsts<1e-6,(worstp,worstq,worsts)
    reload=types.ModuleType('chin_reload');exec(compile((_fm_read(_fm_tool('Scripts/reload_chin_control.py'))).read_text(encoding='utf-8'),'reload_chin','exec'),reload.__dict__);reload.main(adjusted)
    report.update(new_minimum=p['minimum'],new_maximum=p['maximum'],new_gain=gain,restored_preview=adjusted,equivalent_pose_cases=len(cases),position_error_cm=worstp,rotation_error_deg=worstq,scale_error=worsts,saved_and_reloaded=True,passed=True)
    (_fm_output(E/'travel_adjustment.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({k:v for k,v in report.items() if k not in ('old_preview','restored_preview')},ensure_ascii=False))

if __name__=='__main__':main()
