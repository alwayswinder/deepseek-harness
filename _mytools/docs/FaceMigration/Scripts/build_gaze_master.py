"""增量接入双眼总控，保留单眼输入与源表达式的独立正负分支。"""

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
EVIDENCE=_fm_tool('Docs/Evidence/GazeMaster')
base=types.ModuleType('eyeballs');exec(compile((_fm_read(_fm_tool('Scripts/build_eyeball_controls.py'))).read_text(encoding='utf-8'),'eyeballs','exec'),base.__dict__)
def main():
    p=json.loads((_fm_read(EVIDENCE/'parameters.json')).read_text(encoding='utf-8'));old=json.loads((_fm_read(_fm_tool('Docs/Evidence/Eyeballs/parameters.json'))).read_text(encoding='utf-8'))
    rig=_fm_load_asset(base.ASSET);h=rig.get_hierarchy();hc=rig.get_hierarchy_controller();model=rig.get_default_model();ctrl=rig.get_controller(model)
    assert not model.find_node_by_name('GAZEM_GET')
    before_links=base.base.base.helper.exec_links(model)
    backup=_fm_saved('Backup')/('GazeMaster_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'));_fm_output(backup).mkdir(parents=True)
    disk=_fm_disk('Content/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation.uasset');shutil.copy2(disk,backup/'disk_before.uasset')
    preview=base.base.preview_values(rig);assert _fm_save_asset(rig,False);shutil.copy2(disk,backup/'memory_before.uasset')
    cap=json.loads((_fm_read(_fm_tool('Docs/Evidence/Eyeballs/previous_controls.json'))).read_text(encoding='utf-8'))
    cases=[x['values'] for x in cap['cases']]+[x['values'] for x in cap['lid_cases']]
    for s in old['sides']:
        cases.extend({s['control']:v} for v in ((-10,0,0),(10,0,0),(0,-10,0),(0,10,0),(0,0,-10),(0,0,10),(-8,4,6),(8,-4,-6)))
    ref=json.loads((_fm_read(_fm_tool('Docs/Evidence/Eyeballs/max_samples.json'))).read_text(encoding='utf-8'))
    cases.extend(base.input_values(x,old) for x in ref['lid_samples'])
    inst,bh=base.instance(rig);previous=[]
    for v in cases:base.solve(inst,bh,v);previous.append(dict(values=v,bones=base.packed(bh)))
    (_fm_output(EVIDENCE/'previous_controls.json')).write_text(json.dumps(dict(cases=previous),ensure_ascii=False,indent=2),encoding='utf-8')
    report=dict(asset=base.ASSET,backup=str(backup),preview_values=preview,nodes_before=len(model.get_nodes()),old_execution_links=before_links,regression_cases=len(cases),rewired={},saved=False)
    def save_report():(_fm_output(EVIDENCE/'build_report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    save_report()
    counter=[0]
    def unit(cls,n):
        counter[0]+=1
        x=ctrl.add_unit_node_from_struct_path(getattr(unreal,cls).static_struct().get_path_name(),'Execute',unreal.Vector2D(200+(counter[0]%8)*260,-160000-(counter[0]//8)*400),'GAZEM_'+n,False);assert x
        return str(x.get_name())
    def default(pin,v):assert ctrl.set_pin_default_value(pin,v,False,False),pin
    def link(a,b):assert ctrl.add_link(a,b,False),(a,b)
    def source(pin):
        xs=[str(l.get_source_pin().get_pin_path()) for l in model.get_links() if str(l.get_target_pin().get_pin_path())==pin];assert len(xs)==1,pin
        return xs[0]
    def replace(pin,out):
        report['rewired'][pin]=source(pin);assert ctrl.break_all_links(pin,True,False,False);link(out,pin)
    def op(cls,n,inputs):
        node=unit('RigVMFunction_Math'+cls,n)
        for pin,value in inputs.items():
            if isinstance(value,str) and '.' in value and model.find_node_by_name(value.split('.')[0]):link(value,node+'.'+pin)
            elif isinstance(value,(list,tuple)):default(node+'.'+pin,base.vstr(value))
            else:default(node+'.'+pin,str(value))
        return node+'.Result'
    auto=rig.get_auto_vm_recompile();rig.modify()
    try:
        rig.set_auto_vm_recompile(False)
        with unreal.ScopedEditorTransaction('Add binocular Max gaze master'):
            st=unreal.RigControlSettings();st.control_type=unreal.RigControlType.POSITION;st.display_name=p['display_name'];st.shape_name='Box_Thick';st.shape_color=unreal.LinearColor(1,.65,.12,1);st.draw_limits=False
            st.limit_enabled=[unreal.RigControlLimitEnabled(minimum=False,maximum=False)]*3
            ck=hc.add_control(p['control'],base.key('Root'),st,h.make_control_value_from_vector(unreal.Vector()),False,False);assert h.contains(ck)
            tf=unreal.Transform();tf.translation=unreal.Vector(*p['control_rest'])
            for initial in (True,False):
                h.set_control_offset_transform(ck,tf,initial,True)
                shape=unreal.Transform();shape.scale3d=unreal.Vector(1.1,.12,.45);h.set_control_shape_transform(ck,shape,initial)
            get=unit('RigUnit_GetControlVector','GET');default(get+'.Control',p['control']);default(get+'.Space','LocalSpace');world=get+'.Vector'
            master=[op('VectorDot','SRC'+str(i),dict(A=world,B=row)) for i,row in enumerate(p['inverse_input_rows'])]
            halves={(ax,sg):op('FloatMin' if sg<0 else 'FloatMax','HALF'+str(ax)+str(sg),dict(A=master[ax],B='0.0')) for ax in range(3) for sg in (-1,1)}
            def displacement(terms,n):
                out=None
                for ti,t in enumerate(terms):
                    term=op('VectorScale',n+'Scale'+str(ti),dict(Value=t['p'],Factor=halves[t['axis'],t['sign']]))
                    out=op('VectorAdd',n+'Add'+str(ti),dict(A=out,B=term)) if out else term
                return out
            for ci,s in enumerate(old['sides']):
                side='L' if ci==0 else 'R';child=base.key(s['control'],unreal.RigElementType.CONTROL)
                assert hc.set_parent(child,ck,True,False,False)
                offset=unreal.Transform();offset.translation=unreal.Vector(*[a-b for a,b in zip(s['control_rest'],p['control_rest'])])
                for initial in (True,False):h.set_control_offset_transform(child,offset,initial,True)
                # Maintain-global reparenting changes control values as well as
                # offsets. Offsets now contain the entire reference placement.
                zero=h.make_control_value_from_vector(unreal.Vector())
                h.set_control_value(child,zero,unreal.RigControlValueType.INITIAL)
                h.set_control_value(child,zero,unreal.RigControlValueType.CURRENT)
                both=op('VectorAdd','TargetOffset_'+side,dict(A='GAZE_GET_'+side+'.Vector',B=world));replace('GAZE_Target_'+side+'.A',both)
                for ax in (1,2):
                    combined=op('FloatAdd','EulerInput_'+side+str(ax),dict(A='GAZE_SRC_'+side+str(ax)+'.Result',B=master[ax]))
                    for group in ('upper','lower'):replace('GAZE_Euler'+('XZ_' if ax==2 else 'Y_')+group+side+'.Factor',combined)
                for g in p['sides'][ci]['groups']:
                    for b,terms in g['bones'].items():
                        if not terms:continue
                        extra=displacement(terms,'Pre_'+b)
                        extra=op('QuaternionRotateVector','PreRot_'+b,dict(Transform='GAZE_Total_'+g['group']+side+'Global.Result',Vector=extra))
                        dest='GAZE_LidPosition_'+b+'.A';out=op('VectorAdd','PreOut_'+b,dict(A=source(dest),B=extra));replace(dest,out)
                for b,terms in p['sides'][ci]['linear_bones'].items():
                    if not terms:continue
                    extra=displacement(terms,'Linear_'+b);dest='GAZE_LinearOut_'+b+'.B'
                    out=op('VectorAdd','LinearOut_'+b,dict(A=source(dest),B=extra));replace(dest,out)
            assert sorted(base.base.base.helper.exec_links(model))==sorted(before_links)
            rig.recompile_vm();assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
    finally:rig.set_auto_vm_recompile(auto)
    report.update(nodes_after=len(model.get_nodes()),controls_after=len(h.get_controls()),execution_links_preserved=True)
    save_report();print(json.dumps(report,ensure_ascii=False))
if __name__=='__main__':main()

