"""增量添加 Line010 下巴整体；在源枢轴顺序中合并现有控制。"""

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
ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()));EVIDENCE=_fm_tool('Docs/Evidence/Chin')
base=types.ModuleType('mouth');exec(compile((_fm_read(_fm_tool('Scripts/build_mouth_controls.py'))).read_text(encoding='utf-8'),'mouth','exec'),base.__dict__)
ASSET=base.ASSET
key,instance,solve,packed=base.key,base.instance,base.solve,base.packed
UI_UNITS_PER_SOURCE=json.loads((_fm_read(EVIDENCE/'parameters.json')).read_text(encoding='utf-8')).get('ui_units_per_source',10.0)
def inputs(sample,include_chin=True):
    vs=sample['inputs'];result={}
    for n,i,sign in (('CTRL_MOUTH_L',1,-1),('CTRL_MOUTH_R',2,1),('CTRL_MOUTH',3,-1)):
        x,y,z=vs[i];result[n]=[10*sign*z,-10*sign*x,10*y]
    x,y,z=vs[4];result['CTRL_NOSE']=[-10*z,10*x,10*y]
    for n,i in (('CTRL_CHEEK_R',5),('CTRL_CHEEK_L',6)):result[n]=[10*vs[i][0],0,-10*vs[i][2]]
    for i,n in enumerate(('CTRL_LIP_UP_L','CTRL_LIP_UP_C','CTRL_LIP_UP_R','CTRL_LIP_LOW_R','CTRL_LIP_LOW_C','CTRL_LIP_LOW_L'),7):result[n]=[0,0,10*vs[i][1]]
    eyes=json.loads((_fm_read(_fm_tool('Docs/Evidence/Eyeballs/parameters.json'))).read_text(encoding='utf-8'));master=json.loads((_fm_read(_fm_tool('Docs/Evidence/GazeMaster/parameters.json'))).read_text(encoding='utf-8'))
    for i,s in enumerate(eyes['sides'],13):result[s['control']]=[sum(a*b for a,b in zip(row,vs[i])) for row in s['source_world_basis']]
    result[master['control']]=[sum(a*b for a,b in zip(row,vs[15])) for row in master['source_world_basis']]
    for n,i,f in (('CTRL_EYE_LID_L',16,10/1.75),('CTRL_EYE_LID_R',17,10/1.75),('CTRL_EYE_LOWER_LID_L',18,-10/1.72),('CTRL_EYE_LOWER_LID_R',19,-10/1.72)):result[n]=[0,0,vs[i][1]*f]
    if include_chin:x,y,z=vs[0];result['CTRL_CHIN']=[-UI_UNITS_PER_SOURCE*z,UI_UNITS_PER_SOURCE*x,UI_UNITS_PER_SOURCE*y]
    return result
def main():
    p=json.loads((_fm_read(EVIDENCE/'parameters.json')).read_text(encoding='utf-8'));ref=json.loads((_fm_read(EVIDENCE/'max_samples.json')).read_text(encoding='utf-8'))
    rig=_fm_load_asset(ASSET);h=rig.get_hierarchy();hc=rig.get_hierarchy_controller();model=rig.get_default_model();ctrl=rig.get_controller(model)
    assert not any(str(n.get_name()).startswith('CHIN_') for n in model.get_nodes())
    old_links=base.base.helper.exec_links(model);tail=({b.split('.')[0] for a,b in old_links}-{a.split('.')[0] for a,b in old_links}).pop()+'.ExecutePin'
    backup=_fm_saved('Backup')/('Chin_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'));_fm_output(backup).mkdir(parents=True)
    disk=_fm_disk('Content/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation.uasset');shutil.copy2(disk,backup/'disk_before.uasset');preview=base.preview_values(rig)
    assert _fm_save_asset(rig,False);shutil.copy2(disk,backup/'memory_before.uasset')
    cases=[x['values'] for x in json.loads((_fm_read(_fm_tool('Docs/Evidence/GazeMaster/previous_controls.json'))).read_text(encoding='utf-8'))['cases']]
    cases.extend({'CTRL_EYEBALL_MASTER':v} for v in ((-8,0,0),(8,0,0),(0,-8,0),(0,8,0),(0,0,-8),(0,0,8),(-7,3,5),(6,-4,-3)))
    cases.extend(inputs(x,False) for x in ref['mixed_samples'])
    bi,bh=instance(rig);previous=[]
    for v in cases:solve(bi,bh,v);previous.append(dict(values=v,bones=packed(bh)))
    (_fm_output(EVIDENCE/'previous_controls.json')).write_text(json.dumps(dict(cases=previous),ensure_ascii=False,indent=2),encoding='utf-8')
    report=dict(asset=ASSET,backup=str(backup),preview_values=preview,nodes_before=len(model.get_nodes()),old_execution_links=old_links,regression_cases=len(cases),rewired={},saved=False)
    def write():(_fm_output(EVIDENCE/'build_report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    write();counter=[0]
    def unit(cls,name):
        counter[0]+=1;node=ctrl.add_unit_node_from_struct_path(getattr(unreal,cls).static_struct().get_path_name(),'Execute',unreal.Vector2D(200+(counter[0]%10)*280,-180000-(counter[0]//10)*400),'CHIN_'+name,False);assert node;return str(node.get_name())
    def default(pin,val):assert ctrl.set_pin_default_value(pin,val,False,False),pin
    def link(a,b):assert ctrl.add_link(a,b,False),(a,b)
    def source(pin):
        xs=[str(l.get_source_pin().get_pin_path()) for l in model.get_links() if str(l.get_target_pin().get_pin_path())==pin];assert len(xs)==1,pin;return xs[0]
    def replace(pin,val):report['rewired'][pin]=source(pin);assert ctrl.break_all_links(pin,True,False,False);link(val,pin)
    def qstr(q):return '(X=%.12f,Y=%.12f,Z=%.12f,W=%.12f)'%tuple(q)
    def op(cls,n,values):
        node=unit('RigVMFunction_Math'+cls,n)
        for pin,value in values.items():
            if isinstance(value,str) and '.' in value and model.find_node_by_name(value.split('.')[0]):link(value,node+'.'+pin)
            elif isinstance(value,(list,tuple)):default(node+'.'+pin,base.vstr(value))
            else:default(node+'.'+pin,str(value))
        return node+'.Result'
    auto=rig.get_auto_vm_recompile();rig.modify();setters=[]
    try:
        rig.set_auto_vm_recompile(False)
        with unreal.ScopedEditorTransaction('Add Max Line010 whole chin control'):
            st=unreal.RigControlSettings();st.control_type=unreal.RigControlType.POSITION;st.display_name=p['display_name'];st.shape_name='Box_Thick';st.shape_color=unreal.LinearColor(1,.35,.1,1);st.draw_limits=False
            st.limit_enabled=[unreal.RigControlLimitEnabled(minimum=True,maximum=True)]*3;st.minimum_value=h.make_control_value_from_vector(unreal.Vector(*p['minimum']));st.maximum_value=h.make_control_value_from_vector(unreal.Vector(*p['maximum']))
            ck=hc.add_control(p['control'],key('Root'),st,h.make_control_value_from_vector(unreal.Vector()),False,False);assert h.contains(ck)
            for initial in (True,False):
                tf=unreal.Transform();tf.translation=unreal.Vector(*p['control_rest']);h.set_control_offset_transform(ck,tf,initial,True)
                shape=unreal.Transform();shape.scale3d=unreal.Vector(.35,.12,.18);h.set_control_shape_transform(ck,shape,initial)
            h.set_control_value(ck,h.make_control_value_from_vector(unreal.Vector()),unreal.RigControlValueType.INITIAL)
            get=unit('RigUnit_GetControlVector','GET');default(get+'.Control',p['control']);default(get+'.Space','LocalSpace')
            scalars=[];halves={}
            gain=1/p.get('ui_units_per_source',10.0)
            for ax,row in enumerate(([0,gain,0],[0,0,gain],[-gain,0,0])):
                dot=op('VectorDot','SRC'+str(ax),dict(A=get+'.Vector',B=row));clamp=op('FloatClamp','CLAMP'+str(ax),dict(Value=dot,Minimum=p['source_minimum'][ax],Maximum=p['source_maximum'][ax]));scalars.append(clamp)
                for sg in (-1,1):halves[ax,sg]=op('FloatMin' if sg<0 else 'FloatMax','HALF'+str(ax)+str(sg),dict(A=clamp,B='0.0'))
            dp=None
            for ax in range(3):
                d=op('VectorScale','Shift'+str(ax),dict(Value=[row[ax] for row in p['helper_translation_matrix']],Factor=scalars[ax]));dp=op('VectorAdd','ShiftSum'+str(ax),dict(A=dp,B=d)) if dp else d
            esign=p['euler_sign']*180/3.141592653589793
            e0=op('VectorScale','EulerX',dict(Value=[-.1*esign,0,0],Factor=scalars[2]));e1=op('VectorScale','EulerZ',dict(Value=[0,0,-.1*esign],Factor=scalars[1]));e=op('VectorAdd','Euler',dict(A=e0,B=e1));q=op('QuaternionFromEuler','EulerQ',dict(Euler=e,RotationOrder='XYZ'))
            basis=p['euler_basis'];q=op('QuaternionMul','Basis',dict(A=qstr(basis),B=q));q=op('QuaternionMul','Global',dict(A=q,B=qstr([-x for x in basis[:3]]+[basis[3]])))
            groups={}
            for bone,d in p['bones'].items():
                if d['helper'] and d['helper'] not in groups:
                    dq=op('QuaternionSlerp','WeightRot_'+d['helper'],dict(A='(X=0,Y=0,Z=0,W=1)',B=q,T=d['rotation_weight']))
                    shift=op('VectorScale','WeightPos_'+d['helper'],dict(Value=dp,Factor=d['position_weight']));groups[d['helper']]=(dq,shift)
            for bone,d in p['bones'].items():
                pre=None
                for ti,t in enumerate(d['terms']):
                    part=op('VectorScale','Expr_'+bone+str(ti),dict(Value=t['p'],Factor=halves[t['axis'],t['sign']]))
                    pre=op('VectorAdd','ExprSum_'+bone+str(ti),dict(A=pre,B=part)) if pre else part
                if not d['helper'] and model.find_node_by_name('EYE_VADD_'+bone):
                    dest='EYE_VADD_'+bone+'.B';out=op('VectorAdd','EyeExpr_'+bone,dict(A=source(dest),B=pre));replace(dest,out);continue
                target=next((prefix+bone for prefix in ('LIP_MAKE_','CHEEK_MAKE_','EYE_MAKE_') if model.find_node_by_name(prefix+bone)),None)
                bt=unit('RigUnit_GetTransform','BT_'+bone);default(bt+'.Item','(Type=Bone,Name="%s")'%bone);default(bt+'.Space','GlobalSpace');default(bt+'.bInitial','True')
                oldpos=source(target+'.Translation') if target else bt+'.Transform.Translation';oldrot=source(target+'.Rotation') if target else bt+'.Transform.Rotation'
                if d['helper']:
                    dq,shift=groups[d['helper']];offset=[a-b for a,b in zip(d['source_rest'],d['pivot'])]
                    rel=op('VectorSub','ExistingDelta_'+bone,dict(A=oldpos,B=bt+'.Transform.Translation'));rel=op('VectorAdd','Relative_'+bone,dict(A=rel,B=offset))
                    if pre:rel=op('VectorAdd','Pre_'+bone,dict(A=rel,B=pre))
                    rotated=op('QuaternionRotateVector','Rotate_'+bone,dict(Transform=dq,Vector=rel));delta=op('VectorSub','Delta_'+bone,dict(A=rotated,B=offset));delta=op('VectorAdd','Shifted_'+bone,dict(A=delta,B=shift));out=op('VectorAdd','Position_'+bone,dict(A=bt+'.Transform.Translation',B=delta));outq=op('QuaternionMul','Rotation_'+bone,dict(A=dq,B=oldrot))
                else:out=op('VectorAdd','Position_'+bone,dict(A=oldpos,B=pre));outq=oldrot
                if target:replace(target+'.Translation',out);replace(target+'.Rotation',outq)
                else:
                    make=unit('RigVMFunction_MathTransformMake','MAKE_'+bone);link(out,make+'.Translation');link(outq,make+'.Rotation');link(bt+'.Transform.Scale3D',make+'.Scale')
                    stn=unit('RigUnit_SetTransform','SET_'+bone);default(stn+'.Item','(Type=Bone,Name="%s")'%bone);default(stn+'.Space','GlobalSpace');default(stn+'.bInitial','False');default(stn+'.bPropagateToChildren','False');default(stn+'.Weight','1.0');link(make+'.Result',stn+'.Value');setters.append(stn+'.ExecutePin')
            for output in {a for a,b in base.base.helper.exec_links(model)}|{a for a,b in old_links}:ctrl.break_all_links(output,False,False,False)
            for a,b in old_links:link(a,b)
            for a,b in zip([tail]+setters[:-1],setters):link(a,b)
            expected=old_links+list(zip([tail]+setters[:-1],setters));assert sorted(base.base.helper.exec_links(model))==sorted(expected)
            rig.recompile_vm();assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
    finally:rig.set_auto_vm_recompile(auto)
    report.update(nodes_after=len(model.get_nodes()),controls_after=len(h.get_controls()),new_setters=setters,expected_execution_links=expected);write();print(json.dumps({k:v for k,v in report.items() if k not in ('preview_values','rewired','old_execution_links','expected_execution_links')},ensure_ascii=False))
if __name__=='__main__':main()
