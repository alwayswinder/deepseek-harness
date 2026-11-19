"""增量添加 Circle117..120 表情滑块；纯 Morph 输出，保留现有骨骼求解。"""

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
from slider_handle_layout import apply_slider_layout
ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()));E=_fm_tool('Docs/Evidence/ExpressionSliders')
b=types.ModuleType('chin');exec(compile((_fm_read(_fm_tool('Scripts/build_chin_control.py'))).read_text(encoding='utf-8'),'chin','exec'),b.__dict__)
ASSET=b.ASSET

def main():
    p=json.loads((_fm_read(E/'parameters.json')).read_text(encoding='utf-8'));rig=_fm_load_asset(ASSET);h=rig.get_hierarchy();hc=rig.get_hierarchy_controller();model=rig.get_default_model();c=rig.get_controller(model)
    assert not any(str(n.get_name()).startswith('EXPR_') for n in model.get_nodes()),'Already built'
    mesh=rig.get_preview_mesh();available={str(m.get_name()) for m in mesh.get_editor_property('morph_targets')}
    for row in p['rows']:
        for m in row['morphs']:assert m['name'] in available,m['name']
    backup=_fm_saved('Backup')/('ExpressionSliders_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'));_fm_output(backup).mkdir(parents=True)
    disk=_fm_disk('Content/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation.uasset');shutil.copy2(disk,backup/'disk_before.uasset');preview=b.base.preview_values(rig)
    assert _fm_save_asset(rig,False);shutil.copy2(disk,backup/'memory_before.uasset')
    cases=[x['values'] for x in json.loads((_fm_read(_fm_tool('Docs/Evidence/Chin/previous_controls.json'))).read_text(encoding='utf-8'))['cases']]
    cases.extend({'CTRL_CHIN':v} for v in ((-10/3,0,0),(10/3,0,0),(0,50/3,0),(0,0,-20),(-2,10,-35/3),(7/3,5,-4)))
    inst,rh=b.instance(rig);previous=[]
    for values in cases:b.solve(inst,rh,values);previous.append(dict(values=values,bones=b.packed(rh)))
    (_fm_output(E/'previous_controls.json')).write_text(json.dumps(dict(cases=previous),ensure_ascii=False,indent=2),encoding='utf-8')
    oldlinks=b.base.base.helper.exec_links(model);tail=({dst.split('.')[0] for src,dst in oldlinks}-{src.split('.')[0] for src,dst in oldlinks}).pop()+'.ExecutePin'
    report=dict(asset=ASSET,backup=str(backup),preview_values=preview,nodes_before=len(model.get_nodes()),controls_before=len(h.get_controls()),old_execution_links=oldlinks,saved=False)
    auto=rig.get_auto_vm_recompile();rig.modify();expected=list(oldlinks)
    def unit(cls,name,x,y):
        n=c.add_unit_node_from_struct_path(getattr(unreal,cls).static_struct().get_path_name(),'Execute',unreal.Vector2D(x,y),'EXPR_'+name,False);assert n;return str(n.get_name())
    def default(pin,v):assert c.set_pin_default_value(pin,str(v),False,False),pin
    def link(src,dst):assert c.add_link(src,dst,False),(src,dst)
    try:
        rig.set_auto_vm_recompile(False)
        with unreal.ScopedEditorTransaction('Add four independent whole face expression sliders'):
            library=_fm_load_asset('/ControlRig/Controls/DefaultGizmoLibraryNormalized');shape=next(s for s in library.get_editor_property('shapes') if str(s.shape_name)=='Sphere_Solid');bounds=shape.get_editor_property('shape_proxy').get_bounds();ds=shape.get_editor_property('transform').scale3d
            diameter=2*max(bounds.box_extent.x*abs(ds.x),bounds.box_extent.y*abs(ds.y),bounds.box_extent.z*abs(ds.z))
            for i,row in enumerate(p['rows']):
                st=unreal.RigControlSettings();st.control_type=unreal.RigControlType.POSITION;st.display_name=row['display_name'];st.shape_name='Sphere_Solid';st.shape_color=unreal.LinearColor(*row['color']);st.draw_limits=False
                st.limit_enabled=[unreal.RigControlLimitEnabled(minimum=True,maximum=True)]*3
                st.minimum_value=h.make_control_value_from_vector(unreal.Vector());st.maximum_value=h.make_control_value_from_vector(unreal.Vector(p['travel_cm'],0,0))
                ck=hc.add_control(row['control'],b.key('Root'),st,h.make_control_value_from_vector(unreal.Vector()),False,False);assert h.contains(ck)
                for initial in (True,False):
                    tf=unreal.Transform();tf.translation=unreal.Vector(*row['origin']);tf.rotation=unreal.Quat(*p['control_offset_rotation']);h.set_control_offset_transform(ck,tf,initial,True)
                    shape_tf=unreal.Transform();shape_tf.scale3d=unreal.Vector(1/diameter,1/diameter,1/diameter);h.set_control_shape_transform(ck,shape_tf,initial)
                h.set_control_value(ck,h.make_control_value_from_vector(unreal.Vector()),unreal.RigControlValueType.INITIAL)
                y=-200000-i*750
                get=unit('RigUnit_GetControlVector',str(i)+'_GET',0,y);default(get+'.Control',row['control']);default(get+'.Space','LocalSpace')
                clamp=unit('RigVMFunction_MathFloatClamp',str(i)+'_CLAMP',250,y);default(clamp+'.Minimum',0);default(clamp+'.Maximum',p['travel_cm']);link(get+'.Vector.X',clamp+'.Value')
                for j,m in enumerate(row['morphs']):
                    assert not h.contains(b.key(m['name'],unreal.RigElementType.CURVE));hc.add_curve(m['name'],0,False)
                    mul=unit('RigVMFunction_MathFloatMul',str(i)+'_GAIN'+str(j),500+j*450,y);link(clamp+'.Result',mul+'.A');default(mul+'.B',m['gain']/p['travel_cm'])
                    writer=unit('RigUnit_SetCurveValue',str(i)+'_SET'+str(j),750+j*450,y);default(writer+'.Curve',m['name']);link(mul+'.Result',writer+'.Value');link(tail,writer+'.ExecutePin');expected.append((tail,writer+'.ExecutePin'));tail=writer+'.ExecutePin'
                rail=unit('RigVMFunction_DebugLineStripNoSpace',str(i)+'_RAIL',1500,y)
                x,yy,z=row['origin'];end=x+p['travel_cm'];pts=[(x,yy,z-.5),(x,yy,z+.5),(x,yy,z),(end,yy,z),(end,yy,z+.5),(end,yy,z-.5)]
                assert c.set_pin_default_value(rail+'.Points','('+','.join(b.base.vstr(v) for v in pts)+')',True,False)
                default(rail+'.Color','(R=%.4f,G=%.4f,B=%.4f,A=1)'%tuple(v*.55 for v in row['color'][:3]));default(rail+'.Thickness',.8)
                link(tail,rail+'.ExecutePin');expected.append((tail,rail+'.ExecutePin'));tail=rail+'.ExecutePin'
            assert sorted(b.base.base.helper.exec_links(model))==sorted(expected)
            apply_slider_layout(rig)
            rig.recompile_vm();assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
    finally:rig.set_auto_vm_recompile(auto)
    report.update(nodes_after=len(model.get_nodes()),controls_after=len(h.get_controls()),expected_execution_links=expected,regression_cases=len(cases))
    (_fm_output(E/'build_report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({k:v for k,v in report.items() if k not in ('preview_values','expected_execution_links','old_execution_links')},ensure_ascii=False))

if __name__=='__main__':main()
