"""四表情滑块移到角色左侧（玩家右侧），玩家从左到右增加权重。"""

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
ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()));E=_fm_tool('Docs/Evidence/ExpressionSliders')

def main():
    m=types.ModuleType('expressions');exec(compile((_fm_read(_fm_tool('Scripts/build_expression_sliders.py'))).read_text(encoding='utf-8'),'expressions','exec'),m.__dict__)
    p=json.loads((_fm_read(E/'parameters.json')).read_text(encoding='utf-8'));rig=_fm_load_asset(m.ASSET);h=rig.get_hierarchy();model=rig.get_default_model();ctrl=rig.get_controller(model)
    preview=m.b.base.preview_values(rig);assert preview,'Preview unavailable'
    backup=_fm_saved('Backup')/('ExpressionLayout_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'));_fm_output(backup).mkdir(parents=True)
    disk=_fm_disk('Content/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation.uasset');shutil.copy2(disk,backup/'disk_before.uasset')
    assert _fm_save_asset(rig,False);shutil.copy2(disk,backup/'memory_before.uasset')
    before={};links=[(str(l.get_source_pin().get_pin_path()),str(l.get_target_pin().get_pin_path())) for l in model.get_links()];nodes=len(model.get_nodes());auto=rig.get_auto_vm_recompile();rig.modify()
    try:
        rig.set_auto_vm_recompile(False)
        with unreal.ScopedEditorTransaction('Move expression sliders to character left and increase left to right'):
            for i,row in enumerate(p['rows']):
                k=m.b.key(row['control'],unreal.RigElementType.CONTROL);tf=h.get_global_control_offset_transform(k,True)
                pin='EXPR_'+str(i)+'_RAIL.Points';before[row['control']]=dict(position=tf.translation.to_tuple(),rotation=[tf.rotation.x,tf.rotation.y,tf.rotation.z,tf.rotation.w],rail=model.find_pin(pin).get_default_value())
                for initial in (True,False):
                    tf=unreal.Transform();tf.translation=unreal.Vector(*row['origin']);tf.rotation=unreal.Quat(*p['control_offset_rotation']);h.set_control_offset_transform(k,tf,initial,True)
                x,y,z=row['origin'];end=x+p['travel_cm'];pts=[(x,y,z-.5),(x,y,z+.5),(x,y,z),(end,y,z),(end,y,z+.5),(end,y,z-.5)]
                assert ctrl.set_pin_default_value(pin,'('+','.join(m.b.base.vstr(v) for v in pts)+')',True,False)
            rig.recompile_vm();assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
    finally:rig.set_auto_vm_recompile(auto)
    assert nodes==len(model.get_nodes()) and links==[(str(l.get_source_pin().get_pin_path()),str(l.get_target_pin().get_pin_path())) for l in model.get_links()]
    r=types.ModuleType('reload');exec(compile((_fm_read(_fm_tool('Scripts/reload_expression_sliders.py'))).read_text(encoding='utf-8'),'reload','exec'),r.__dict__);r.main(preview)
    rig=_fm_load_asset(m.ASSET);h=rig.get_hierarchy();after={}
    for row in p['rows']:
        k=m.b.key(row['control'],unreal.RigElementType.CONTROL);tf=h.get_global_control_offset_transform(k,True)
        assert (tf.translation-unreal.Vector(*row['origin'])).length()<1e-5
        axis=tf.rotation.rotate_vector(unreal.Vector(1,0,0));assert (axis-unreal.Vector(1,0,0)).length()<1e-7
        after[row['control']]=dict(start=tf.translation.to_tuple(),end=(tf.translation+axis*p['travel_cm']).to_tuple(),local_positive_x=axis.to_tuple())
    report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),asset=m.ASSET,backup=str(backup),before=before,after=after,preview_preserved=preview,saved_and_reloaded=True,passed=True)
    (_fm_output(E/'layout_adjustment.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({k:v for k,v in report.items() if k not in ('before','preview_preserved')},ensure_ascii=False))

if __name__=='__main__':main()
