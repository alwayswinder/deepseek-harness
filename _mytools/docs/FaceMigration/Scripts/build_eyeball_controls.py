"""左右眼球注视目标与眼皮跟随；只增量修改 LidDiagnostic。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import datetime,json,shutil,types,re
from pathlib import Path
import unreal
ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
EVIDENCE=_fm_tool('Docs/Evidence/Eyeballs')
base=types.ModuleType('mouth_helpers')
exec(compile((_fm_read(_fm_tool('Scripts/build_mouth_controls.py'))).read_text(encoding='utf-8'),'build_mouth_controls.py','exec'),base.__dict__)
ASSET=base.ASSET
key,vstr,instance,solve,pose,packed=base.key,base.vstr,base.instance,base.solve,base.pose,base.packed
PREFIX='GAZE_'
def input_values(sample,params,with_gaze=True):
    result={}
    if with_gaze:
        for i,s in enumerate(params['sides']):
            result[s['control']]=[sum(a*b for a,b in zip(row,sample['inputs'][i])) for row in s['source_world_basis']]
    for n,si,factor in (('CTRL_EYE_LID_L',3,10/1.75),('CTRL_EYE_LID_R',4,10/1.75),('CTRL_EYE_LOWER_LID_L',5,-10/1.72),('CTRL_EYE_LOWER_LID_R',6,-10/1.72)):
        result[n]=[0,0,sample['inputs'][si][1]*factor]
    return result
def main():
    params=json.loads((_fm_read(EVIDENCE/'parameters.json')).read_text(encoding='utf-8'))
    ref=json.loads((_fm_read(EVIDENCE/'max_samples.json')).read_text(encoding='utf-8'))
    rig=_fm_load_asset(ASSET);h=rig.get_hierarchy();hc=rig.get_hierarchy_controller();model=rig.get_default_model();ctrl=rig.get_controller(model)
    assert not any(str(n.get_name()).startswith(PREFIX) for n in model.get_nodes()),'Gaze already exists'
    old_exec=base.base.helper.exec_links(model);nodes_before=len(model.get_nodes())
    tails={b.split('.')[0] for a,b in old_exec}-{a.split('.')[0] for a,b in old_exec};assert len(tails)==1
    tail=tails.pop()+'.ExecutePin'
    backup=_fm_saved('Backup')/('Eyeballs_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'));_fm_output(backup).mkdir(parents=True)
    disk=_fm_disk('Content/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation.uasset')
    shutil.copy2(disk,backup/'disk_before.uasset');preview=base.preview_values(rig)
    assert _fm_save_asset(rig,False);shutil.copy2(disk,backup/'memory_before.uasset')
    cases=[x['values'] for x in json.loads((_fm_read(_fm_tool('Docs/Evidence/MouthControls/previous_controls.json'))).read_text(encoding='utf-8'))['cases']]
    for n in ('CTRL_MOUTH_L','CTRL_MOUTH_R','CTRL_MOUTH'):
        cases.extend({n:v} for v in ((-10,0,0),(10,0,0),(0,-10,0),(0,10,0),(0,0,-10),(0,0,10),(-5,7,9),(8,-6,-4)))
    bi,bh=instance(rig);previous=[]
    for v in cases:solve(bi,bh,v);previous.append(dict(values=v,bones=packed(bh)))
    neutral=previous[0]['bones'];lid_previous=[]
    for sample in ref['lid_samples']:
        values=input_values(sample,params,False);solve(bi,bh,values);lid_previous.append(dict(values=values,bones=packed(bh)))
    captured=dict(neutral=neutral,cases=[dict(values=x['values'],bones={b:t for b,t in x['bones'].items() if t!=neutral[b]}) for x in previous],lid_cases=lid_previous)
    (_fm_output(EVIDENCE/'previous_controls.json')).write_text(json.dumps(captured,ensure_ascii=False,indent=2),encoding='utf-8')
    report=dict(asset=ASSET,backup=str(backup),nodes_before=nodes_before,old_execution_links=old_exec,preview_values=preview,regression_cases=len(cases),saved=False,rewired={})
    def write_report():(_fm_output(EVIDENCE/'build_report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    write_report()
    def unit(cls,n,x=200,y=-140000):
        node=ctrl.add_unit_node_from_struct_path(getattr(unreal,cls).static_struct().get_path_name(),'Execute',unreal.Vector2D(x,y),PREFIX+n,False)
        assert node is not None,(cls,n)
        return str(node.get_name())
    def default(p,v):assert ctrl.set_pin_default_value(p,v,False,False),p
    def link(a,b):assert ctrl.add_link(a,b,False),(a,b)
    def vec(pin,v):default(pin,vstr(v))
    def qstr(q):return '(X=%.12f,Y=%.12f,Z=%.12f,W=%.12f)'%tuple(q)
    def incoming(pin):
        ls=[l for l in model.get_links() if str(l.get_target_pin().get_pin_path())==pin];assert len(ls)==1,pin
        return str(ls[0].get_source_pin().get_pin_path())
    def replace(pin,out):
        report['rewired'][pin]=incoming(pin);ctrl.break_all_links(pin,True,False,False);link(out,pin)
    counter=[0]
    def op(cls,n,inputs):
        counter[0]+=1;node=unit('RigVMFunction_Math'+cls,n,1600+(counter[0]%10)*250,-140000-(counter[0]//10)*350)
        for pin,value in inputs.items():
            if isinstance(value,str) and '.' in value and model.find_node_by_name(value.split('.')[0]) is not None:link(value,node+'.'+pin)
            elif isinstance(value,(list,tuple)):vec(node+'.'+pin,value)
            else:default(node+'.'+pin,str(value))
        return node+'.Result'
    def conjugate(euler,basis,n):
        q=op('QuaternionFromEuler',n+'Euler',dict(Euler=euler,RotationOrder='XYZ'))
        left=op('QuaternionMul',n+'Basis',dict(A=qstr(basis),B=q))
        return op('QuaternionMul',n+'Global',dict(A=left,B=qstr([-v for v in basis[:3]]+[basis[3]])))
    setters=[];auto=rig.get_auto_vm_recompile();rig.modify()
    try:
        rig.set_auto_vm_recompile(False)
        with unreal.ScopedEditorTransaction('Add left and right Max eyeball targets'):
            for si,s in enumerate(params['sides']):
                side='L' if si==0 else 'R';bone='yanqiu_'+side;child='Eye_'+side+'01'
                settings=unreal.RigControlSettings();settings.control_type=unreal.RigControlType.POSITION
                settings.display_name=s['display_name'];settings.shape_name='Box_Thick';settings.shape_color=unreal.LinearColor(.25,1,.75,1)
                settings.primary_axis=unreal.RigControlAxis.Z;settings.draw_limits=False
                settings.limit_enabled=[unreal.RigControlLimitEnabled(minimum=False,maximum=False)]*3
                ck=hc.add_control(s['control'],key('Root'),settings,h.make_control_value_from_vector(unreal.Vector()),False,False);assert h.contains(ck)
                tf=unreal.Transform();tf.translation=unreal.Vector(*s['control_rest'])
                for initial in (True,False):
                    h.set_control_offset_transform(ck,tf,initial,True)
                    shape=unreal.Transform();shape.scale3d=unreal.Vector(.25,.1,.25);h.set_control_shape_transform(ck,shape,initial)
                get=unit('RigUnit_GetControlVector','GET_'+side);default(get+'.Control',s['control']);default(get+'.Space','LocalSpace');world=get+'.Vector'
                source=[op('VectorDot','SRC_'+side+str(ax),dict(A=world,B=row)) for ax,row in enumerate(s['inverse_input_rows'])]
                halves={(ax,sg):op('FloatMin' if sg<0 else 'FloatMax','HALF_'+side+str(ax)+str(sg),dict(A=source[ax],B='0.0')) for ax in range(3) for sg in (-1,1)}
                def displacement(terms,n):
                    result=None
                    for ti,t in enumerate(terms):
                        value=op('VectorScale',n+'Scale'+str(ti),dict(Value=t['p'],Factor=halves[t['axis'],t['sign']]))
                        result=op('VectorAdd',n+'Add'+str(ti),dict(A=result,B=value)) if result else value
                    return result
                target=op('VectorAdd','Target_'+side,dict(A=world,B=s['control_rest']))
                direction=op('VectorSub','Dir_'+side,dict(A=target,B=s['pivot']))
                x=op('VectorUnit','X_'+side,dict(Value=direction))
                cross=op('VectorCross','Cross_'+side,dict(A=s['up'],B=x))
                y=op('VectorUnit','Y_'+side,dict(Value=cross))
                z=op('VectorCross','Z_'+side,dict(A=x,B=y))
                matrix=op('MatrixFromVectors','Axes_'+side,dict(X=x,Y=y,Z=z))
                aim=op('MatrixToTransform','Aim_'+side,dict(Value=matrix))
                delta=op('QuaternionMul','AimDelta_'+side,dict(A=aim+'.Rotation',B=qstr(s['aim_rest_inverse'])))
                for b in (bone,child):
                    bt=unit('RigUnit_GetTransform','BT_'+b);default(bt+'.Item','(Type=Bone,Name="%s")'%b);default(bt+'.Space','GlobalSpace');default(bt+'.bInitial','True')
                    position=bt+'.Transform.Translation'
                    if b==child:
                        pivot=unit('RigUnit_GetTransform','Pivot_'+b);default(pivot+'.Item','(Type=Bone,Name="%s")'%bone);default(pivot+'.Space','GlobalSpace');default(pivot+'.bInitial','True')
                        rel=op('VectorSub','ChildRel_'+side,dict(A=position,B=pivot+'.Transform.Translation'))
                        rotated=op('QuaternionRotateVector','ChildRot_'+side,dict(Transform=delta,Vector=rel))
                        position=op('VectorAdd','ChildPos_'+side,dict(A=rotated,B=pivot+'.Transform.Translation'))
                    rotation=op('QuaternionMul','EyeRot_'+b,dict(A=delta,B=bt+'.Transform.Rotation'))
                    make=unit('RigVMFunction_MathTransformMake','MAKE_'+b);link(position,make+'.Translation');link(rotation,make+'.Rotation');link(bt+'.Transform.Scale3D',make+'.Scale')
                    setter=unit('RigUnit_SetTransform','SET_'+b);default(setter+'.Item','(Type=Bone,Name="%s")'%b);default(setter+'.Space','GlobalSpace');default(setter+'.bInitial','False');default(setter+'.Weight','1.0');default(setter+'.bPropagateToChildren','False');link(make+'.Result',setter+'.Value');setters.append(setter+'.ExecutePin')
                for g in s['groups']:
                    upper=g['group']=='upper';gn=g['group']+side
                    lid_control='CTRL_EYE_LID_'+side if upper else 'CTRL_EYE_LOWER_LID_'+side
                    getlid=unit('RigUnit_GetControlVector','Lid_'+gn);default(getlid+'.Control',lid_control);default(getlid+'.Space','LocalSpace')
                    lid=op('VectorDot','LidScalar_'+gn,dict(A=getlid+'.Vector',B=[0,0,.175 if upper else -.172]))
                    # Existing lid controls clamp at their UI limits, mirror that clamp for coupled rotation.
                    lid=op('FloatClamp','LidClamp_'+gn,dict(Value=lid,Minimum='-1.75' if upper else '-1.72',Maximum='0.0'))
                    esign=g['euler_sign']*180/3.141592653589793
                    xcoef=(1 if si==0 else -1)*.01 if upper else (-1 if si==0 else 1)*.01
                    ycoef=0 if upper else (1 if si==0 else -1)*.007
                    gaze_x=op('VectorScale','EulerXZ_'+gn,dict(Value=[xcoef*esign,ycoef*esign,0],Factor=source[2]))
                    gaze_z=op('VectorScale','EulerY_'+gn,dict(Value=[0,0,.01*esign],Factor=source[1]))
                    gaze_euler=op('VectorAdd','GazeEuler_'+gn,dict(A=gaze_x,B=gaze_z))
                    old_euler=op('VectorScale','OldEuler_'+gn,dict(Value=[0,0,(.28 if upper else -.29)*esign],Factor=lid))
                    total_euler=op('VectorAdd','TotalEuler_'+gn,dict(A=gaze_euler,B=old_euler))
                    total=conjugate(total_euler,g['basis'],'Total_'+gn)
                    old=conjugate(old_euler,g['basis'],'Old_'+gn)
                    old_inverse=op('QuaternionInverse','OldInv_'+gn,dict(Value=old))
                    adjustment=op('QuaternionMul','Adjustment_'+gn,dict(A=total,B=old_inverse))
                    for b,terms in g['bones'].items():
                        target='EYE_MAKE_'+b;position=incoming(target+'.Translation');rotation=incoming(target+'.Rotation')
                        rel=op('VectorSub','Rel_'+b,dict(A=position,B=s['pivot']))
                        rotated=op('QuaternionRotateVector','Follow_'+b,dict(Transform=adjustment,Vector=rel))
                        pre=displacement(terms,'Pre_'+b)
                        if pre:
                            pre=op('QuaternionRotateVector','PreRot_'+b,dict(Transform=total,Vector=pre))
                            rotated=op('VectorAdd','PreAdd_'+b,dict(A=rotated,B=pre))
                        result=op('VectorAdd','LidPosition_'+b,dict(A=rotated,B=s['pivot']))
                        qresult=op('QuaternionMul','LidRotation_'+b,dict(A=adjustment,B=rotation))
                        replace(target+'.Translation',result);replace(target+'.Rotation',qresult)
                for b,terms in s['linear_bones'].items():
                    target=('CHEEK_MAKE_' if b.startswith('yandai') else 'EYE_MAKE_')+b
                    d=displacement(terms,'Linear_'+b)
                    out=op('VectorAdd','LinearOut_'+b,dict(A=incoming(target+'.Translation'),B=d))
                    replace(target+'.Translation',out)
            for a in {a for a,b in base.base.helper.exec_links(model)}|{a for a,b in old_exec}:ctrl.break_all_links(a,False,False,False)
            for a,b in old_exec:link(a,b)
            for a,b in zip([tail]+setters[:-1],setters):link(a,b)
            expected=old_exec+list(zip([tail]+setters[:-1],setters));assert sorted(base.base.helper.exec_links(model))==sorted(expected)
            rig.recompile_vm();assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
    finally:rig.set_auto_vm_recompile(auto)
    report.update(nodes_after=len(model.get_nodes()),controls_after=len([k for k in h.get_all_keys() if k.type==unreal.RigElementType.CONTROL]),new_controls=[s['control'] for s in params['sides']],added_setters=len(setters),expected_execution_links=expected)
    write_report()
    module=types.ModuleType('eyeball_reload');exec(compile((_fm_read(_fm_tool('Scripts/reload_eyeball_target.py'))).read_text(encoding='utf-8'),'reload_eyeball_target.py','exec'),module.__dict__);module.main()
if __name__=='__main__':main()
