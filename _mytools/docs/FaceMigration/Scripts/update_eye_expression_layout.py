"""将眼神两列移至玩家视角角色左侧，保留输入、驱动和行程。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import datetime,json,shutil,types
from pathlib import Path
import unreal
ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
E=_fm_tool('Docs/Evidence/EyeExpressions')
m=types.ModuleType('eye_expressions');exec(compile((_fm_read(_fm_tool('Scripts/build_eye_expression_sliders.py'))).read_text(encoding='utf-8'),'eye_expressions','exec'),m.__dict__)
p=json.loads((_fm_read(E/'parameters.json')).read_text(encoding='utf-8'));rig=_fm_load_asset(m.ASSET)
h=rig.get_hierarchy();model=rig.get_default_model();c=rig.get_controller(model)
preview=m.b.base.preview_values(rig)
if not preview:
    preview={str(k.name):list(h.get_vector_from_control_value(h.get_control_value(k)).to_tuple()) for k in h.get_controls()}
backup=_fm_saved('Backup')/('EyeExpressionLayout_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'));_fm_output(backup).mkdir(parents=True)
disk=_fm_disk('Content/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation.uasset');shutil.copy2(disk,backup/'disk_before.uasset')
assert _fm_save_asset(rig,False);shutil.copy2(disk,backup/'memory_before.uasset')
links=[(str(l.get_source_pin().get_pin_path()),str(l.get_target_pin().get_pin_path())) for l in model.get_links()]
nodes=[str(n.get_name()) for n in model.get_nodes()]
cases=[{},preview,{row['control']:[i+1,0,0] for i,row in enumerate(p['rows'])}]
def outputs():
    inst,rh=m.b.instance(rig);result=[]
    for values in cases:
        m.b.solve(inst,rh,values)
        result.append(dict(bones=m.b.packed(rh),curves={str(k.name):rh.get_curve_value(k) for k in rh.get_curves()}))
    return result
old_outputs=outputs();before={};auto=rig.get_auto_vm_recompile()
try:
    rig.set_auto_vm_recompile(False)
    with unreal.ScopedEditorTransaction('Move eye expressions to player view left of character'):
        rig.modify()
        for i,row in enumerate(p['rows']):
            k=m.b.key(row['control'],unreal.RigElementType.CONTROL)
            before[row['control']]=list(h.get_global_control_offset_transform(k,True).translation.to_tuple())
            row['origin'][0]=-34 if row['side']=='R' else -22
            for initial in (True,False):
                tf=h.get_global_control_offset_transform(k,initial);tf.translation=unreal.Vector(*row['origin'])
                h.set_control_offset_transform(k,tf,initial,True)
            x,y,z=row['origin'];end=x+p['travel_cm'];pts=[(x,y,z-.5),(x,y,z+.5),(x,y,z),(end,y,z),(end,y,z+.5),(end,y,z-.5)]
            pin='EEXPR_'+str(i)+'_RAIL.Points'
            assert c.set_pin_default_value(pin,'('+','.join(m.b.base.vstr(v) for v in pts)+')',True,False)
        rig.recompile_vm();assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
finally:rig.set_auto_vm_recompile(auto)
def check():
    model=rig.get_default_model();h=rig.get_hierarchy()
    assert nodes==[str(n.get_name()) for n in model.get_nodes()]
    assert links==[(str(l.get_source_pin().get_pin_path()),str(l.get_target_pin().get_pin_path())) for l in model.get_links()]
    for row in p['rows']:
        tf=h.get_global_control_offset_transform(m.b.key(row['control'],unreal.RigElementType.CONTROL),True)
        assert (tf.translation-unreal.Vector(*row['origin'])).length()<1e-5
        assert (tf.rotation.rotate_vector(unreal.Vector(1,0,0))-unreal.Vector(1,0,0)).length()<1e-7
    assert outputs()==old_outputs,'Layout unexpectedly changed deformation outputs'
check();assert _fm_save_asset(rig,False)
sub=unreal.get_editor_subsystem(unreal.AssetEditorSubsystem);sub.close_all_editors_for_asset(rig)
assert unreal.EditorLoadingAndSavingUtils.reload_packages([rig.get_outer()],unreal.ReloadPackagesInteractionMode.ASSUME_POSITIVE)[0]
rig=_fm_load_asset(m.ASSET);check()
sub.open_editor_for_assets([rig]);live=rig.get_debugged_control_rig();assert live;lh=live.get_hierarchy()
for n,v in preview.items():lh.set_control_value(m.b.key(n,unreal.RigElementType.CONTROL),lh.make_control_value_from_vector(unreal.Vector(*v)))
for n,v in preview.items():assert (lh.get_vector_from_control_value(lh.get_control_value(m.b.key(n,unreal.RigElementType.CONTROL)))-unreal.Vector(*v)).length()<1e-5
live.clear_control_selection();live.select_control('CTRL_EYE_EXPR_QI_R',True)
p['panel_location']='player view left of character'
(_fm_output(E/'parameters.json')).write_text(json.dumps(p,ensure_ascii=False,indent=2),encoding='utf-8')
report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),asset=m.ASSET,backup=str(backup),before=before,after={r['control']:r['origin'] for r in p['rows']},graph_connections_unchanged=True,deformation_cases_unchanged=3,saved_and_reloaded=True,preview_preserved=True,passed=True,visual_approval='pending_user')
(_fm_output(E/'layout_adjustment.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
