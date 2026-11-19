"""接入左右鼻侧蓝轴控制，在已有鼻尖 MakeTransform 前合成旋转。"""

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
ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()));E=_fm_tool('Docs/Evidence/NoseSides')
b=types.ModuleType('chin');exec(compile((_fm_read(_fm_tool('Scripts/build_chin_control.py'))).read_text(encoding='utf-8'),'chin','exec'),b.__dict__)
ASSET=b.ASSET;key,instance,solve,packed=b.key,b.instance,b.solve,b.packed
def main():
    p=json.loads((_fm_read(E/'parameters.json')).read_text(encoding='utf-8'));rig=_fm_load_asset(ASSET);h=rig.get_hierarchy();hc=rig.get_hierarchy_controller();model=rig.get_default_model();c=rig.get_controller(model)
    assert not any(str(n.get_name()).startswith('NOSESIDE_') for n in model.get_nodes())
    preview=b.base.preview_values(rig)
    if not preview:preview={str(k.name):list(h.get_vector_from_control_value(h.get_control_value(k)).to_tuple()) for k in h.get_controls()}
    backup=_fm_saved('Backup')/('NoseSides_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'));_fm_output(backup).mkdir(parents=True)
    disk=_fm_disk('Content/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation.uasset');shutil.copy2(disk,backup/'disk_before.uasset');assert _fm_save_asset(rig,False);shutil.copy2(disk,backup/'memory_before.uasset')
    cases=[x['values'] for x in json.loads((_fm_read(_fm_tool('Docs/Evidence/EyeExpressions/previous_controls.json'))).read_text(encoding='utf-8'))['cases']]
    eyes=json.loads((_fm_read(_fm_tool('Docs/Evidence/EyeExpressions/parameters.json'))).read_text(encoding='utf-8'))['rows']
    cases.extend({row['control']:[8,0,0]} for row in eyes)
    cases.append(preview)
    for step in range(4):cases.append(dict(cases[-6],**{r['control']:[(i+step)%9,0,0] for i,r in enumerate(eyes)}))
    inst,rh=instance(rig);previous=[]
    for values in cases:
        solve(inst,rh,values);previous.append(dict(values=values,bones=packed(rh),curves={str(k.name):rh.get_curve_value(k) for k in rh.get_curves()}))
    (_fm_output(E/'previous_controls.json')).write_text(json.dumps(dict(cases=previous),ensure_ascii=False,indent=2),encoding='utf-8')
    old_exec=b.base.base.helper.exec_links(model)
    destination=p['rotation_target'];old_source=next(str(l.get_source_pin().get_pin_path()) for l in model.get_links() if str(l.get_target_pin().get_pin_path())==destination)
    report=dict(asset=ASSET,backup=str(backup),preview_values=preview,nodes_before=len(model.get_nodes()),controls_before=len(h.get_controls()),old_execution_links=old_exec,rewired=dict(destination=destination,previous_source=old_source),regression_cases=len(cases),saved=False)
    def write():(_fm_output(E/'build_report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    write();auto=rig.get_auto_vm_recompile();counter=[0]
    def unit(cls,name):
        counter[0]+=1
        n=c.add_unit_node_from_struct_path(getattr(unreal,cls).static_struct().get_path_name(),'Execute',unreal.Vector2D(counter[0]*280,-245000),'NOSESIDE_'+name,False);assert n;return str(n.get_name())
    def default(pin,v):assert c.set_pin_default_value(pin,str(v),False,False),pin
    def link(src,dst):assert c.add_link(src,dst,False),(src,dst)
    try:
        rig.set_auto_vm_recompile(False)
        with unreal.ScopedEditorTransaction('Add left and right nose side controls'):
            rig.modify();lib=_fm_load_asset('/ControlRig/Controls/DefaultGizmoLibraryNormalized');shape=next(s for s in lib.get_editor_property('shapes') if str(s.shape_name)=='Sphere_Solid');bounds=shape.get_editor_property('shape_proxy').get_bounds();ds=shape.get_editor_property('transform').scale3d
            diameter=2*max(bounds.box_extent.x*abs(ds.x),bounds.box_extent.y*abs(ds.y),bounds.box_extent.z*abs(ds.z));scalars=[]
            for row in p['controls']:
                st=unreal.RigControlSettings(control_type=unreal.RigControlType.POSITION,display_name=row['display_name'],shape_name='Sphere_Solid',shape_color=unreal.LinearColor(*row['color']),draw_limits=False,primary_axis=unreal.RigControlAxis.Z)
                st.limit_enabled=[unreal.RigControlLimitEnabled(minimum=True,maximum=True)]*3;st.minimum_value=h.make_control_value_from_vector(unreal.Vector(*p['minimum']));st.maximum_value=h.make_control_value_from_vector(unreal.Vector(*p['maximum']))
                ck=hc.add_control(row['control'],key('Root'),st,h.make_control_value_from_vector(unreal.Vector()),False,False);assert h.contains(ck)
                for initial in (True,False):
                    tf=unreal.Transform();tf.translation=unreal.Vector(*row['origin']);h.set_control_offset_transform(ck,tf,initial,True)
                    shape_tf=unreal.Transform();size=p['shape_diameter_cm']/diameter;shape_tf.scale3d=unreal.Vector(size,size,size);h.set_control_shape_transform(ck,shape_tf,initial)
                h.set_control_value(ck,h.make_control_value_from_vector(unreal.Vector()),unreal.RigControlValueType.INITIAL)
                get=unit('RigUnit_GetControlVector',row['control']+'_GET');default(get+'.Control',row['control']);default(get+'.Space','LocalSpace')
                clamp=unit('RigVMFunction_MathFloatClamp',row['control']+'_CLAMP');link(get+'.Vector.Z',clamp+'.Value');default(clamp+'.Minimum',-10);default(clamp+'.Maximum',10);scalars.append(clamp+'.Result')
            sub=unit('RigVMFunction_MathFloatSub','DIFFERENCE');link(scalars[0],sub+'.A');link(scalars[1],sub+'.B')
            mul=unit('RigVMFunction_MathFloatMul','RADIANS');link(sub+'.Result',mul+'.A');default(mul+'.B',p['radians_per_ui_unit'])
            q=unit('RigVMFunction_MathQuaternionFromAxisAndAngle','DELTA_Q');default(q+'.Axis',b.base.vstr(p['axis_rig_global']));link(mul+'.Result',q+'.Angle')
            rotation=unit('RigVMFunction_MathQuaternionMul','ROTATION');link(q+'.Result',rotation+'.A');link(old_source,rotation+'.B')
            assert c.break_all_links(destination,True,False,False);link(rotation+'.Result',destination)
            assert sorted(b.base.base.helper.exec_links(model))==sorted(old_exec)
            rig.recompile_vm();assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
    finally:rig.set_auto_vm_recompile(auto)
    report.update(nodes_after=len(model.get_nodes()),controls_after=len(h.get_controls()),execution_chain_unchanged=True);write();print(json.dumps({k:v for k,v in report.items() if k not in ('preview_values','old_execution_links')},ensure_ascii=False))
if __name__=='__main__':main()
