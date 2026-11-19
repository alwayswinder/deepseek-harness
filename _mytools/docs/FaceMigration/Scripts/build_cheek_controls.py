"""左右脸颊：保留分段、眼袋门控及嘴唇叠加，只写诊断 Rig。"""

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
base=types.ModuleType('lip_helpers')
exec(compile((_fm_read(_fm_tool('Scripts/build_lip_controls.py'))).read_text(encoding='utf-8'),'build_lip_controls.py','exec'),base.__dict__)
ASSET=base.ASSET
key,vstr,instance,solve,pose,packed=base.key,base.vstr,base.instance,base.solve,base.pose,base.packed
PREFIX='CHEEK_'


def main():
    params=json.loads((_fm_read(EVIDENCE/'parameters.json')).read_text(encoding='utf-8'))
    rig=_fm_load_asset(ASSET)
    h,hc=rig.get_hierarchy(),rig.get_hierarchy_controller()
    model=rig.get_default_model()
    ctrl=rig.get_controller(model)
    assert not any(str(n.get_name()).startswith(PREFIX) for n in model.get_nodes()),'Cheek nodes already exist'
    nodes_before=len(model.get_nodes())
    old_exec=base.helper.exec_links(model)
    tails={b.split('.')[0] for a,b in old_exec}-{a.split('.')[0] for a,b in old_exec}
    assert len(tails)==1,tails
    tail=tails.pop()+'.ExecutePin'
    overlap={}
    for b in params['bones']:
        assert h.contains(key(b)),b
        if b.startswith('renzhong_'):
            target='LIP_MAKE_'+b
            incoming=[l for l in model.get_links() if str(l.get_target_node().get_name())==target and str(l.get_target_pin().get_name())=='Translation']
            assert len(incoming)==1,b
            l=incoming[0]
            overlap[b]=dict(input=target+'.Translation',source=str(l.get_source_node().get_name())+'.'+str(l.get_source_pin().get_name()))
    backup=_fm_saved('Backup')/('Cheeks_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'))
    _fm_output(backup).mkdir(parents=True)
    disk=_fm_disk('Content/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation.uasset')
    shutil.copy2(disk,backup/'disk_before.uasset')
    assert _fm_save_asset(rig,False)
    shutil.copy2(disk,backup/'memory_before.uasset')
    bi,bh=instance(rig)
    cases=[{}]
    for k in bh.get_all_keys():
        if k.type!=unreal.RigElementType.CONTROL:
            continue
        name=str(k.name)
        if name.startswith('CTRL_LIP_'):
            sign=-1 if '_LOW_' in name else 1
            vectors=[(0,0,sign*z) for z in (2.5,5,10)]
        elif name.startswith('CTRL_EYE_LOWER_LID_'):
            vectors=[(0,0,z) for z in (2.5,5,10)]
        elif name.startswith('CTRL_EYE_LID_'):
            vectors=[(0,0,z) for z in (-2.5,-5,-10)]
        elif name.endswith('_BEND'):
            vectors=[(0,0,-2),(0,0,2)]
        else:
            vectors=[(1,0,0),(0,1,0),(0,0,1)]
        cases.extend({name:v} for v in vectors)
    previous=[]
    for values in cases:
        solve(bi,bh,values)
        previous.append(dict(values=values,bones=packed(bh)))
    neutral=previous[0]['bones']
    captured=dict(neutral=neutral,cases=[dict(values=x['values'],bones={b:t for b,t in x['bones'].items() if t!=neutral[b]}) for x in previous])
    (_fm_output(EVIDENCE/'previous_controls.json')).write_text(json.dumps(captured,ensure_ascii=False,indent=2),encoding='utf-8')
    pending=dict(asset=ASSET,backup=str(backup),nodes_before=nodes_before,old_execution_links=old_exec,
                 overlap=overlap,regression_cases=len(previous),saved=False)
    (_fm_output(EVIDENCE/'build_report.json')).write_text(json.dumps(pending,ensure_ascii=False,indent=2),encoding='utf-8')

    def unit(cls,n,x,y):
        node=ctrl.add_unit_node_from_struct_path(getattr(unreal,cls).static_struct().get_path_name(),'Execute',unreal.Vector2D(x,y),PREFIX+n,False)
        assert node is not None,n
        return str(node.get_name())
    def default(pin,value):
        assert ctrl.set_pin_default_value(pin,value,False,False),pin
    def link(a,b):
        assert ctrl.add_link(a,b,False),(a,b)
    auto=rig.get_auto_vm_recompile()
    rig.modify()
    try:
        rig.set_auto_vm_recompile(False)
        with unreal.ScopedEditorTransaction('Add left and right cheek controls'):
            features={}
            for ci,c in enumerate(params['controls']):
                name=c['control']
                settings=unreal.RigControlSettings()
                settings.control_type=unreal.RigControlType.POSITION
                settings.display_name=c['display_name']
                settings.shape_name='Box_Thick'
                settings.shape_color=unreal.LinearColor(1,0.75,0.1,1)
                settings.primary_axis=unreal.RigControlAxis.Y
                settings.limit_enabled=[unreal.RigControlLimitEnabled(minimum=True,maximum=True)]*3
                settings.minimum_value=h.make_control_value_from_vector(unreal.Vector(-10,0,-10))
                settings.maximum_value=h.make_control_value_from_vector(unreal.Vector(10,0,10))
                settings.draw_limits=False
                ck=hc.add_control(name,key('Root'),settings,h.make_control_value_from_vector(unreal.Vector()),False,False)
                assert h.contains(ck)
                offset=unreal.Transform()
                offset.translation=unreal.Vector(*c['control_rest'])
                offset.rotation=unreal.Quat(*c['control_rotation'])
                for initial in (True,False):
                    h.set_control_offset_transform(ck,offset,initial,True)
                    shape=unreal.Transform()
                    shape.scale3d=unreal.Vector(0.16,0.06,0.16)
                    h.set_control_shape_transform(ck,shape,initial)
                y=-59000-ci*2200
                get=unit('RigUnit_GetControlVector','GET_'+name,200,y)
                default(get+'.Control',name)
                default(get+'.Space','LocalSpace')
                weights={}
                scalars={}
                for ai,(axis,vector) in enumerate([('X',(1,0,0)),('Z',(0,0,1))]):
                    ay=y-ai*800
                    dot=unit('RigVMFunction_MathVectorDot',name+'_'+axis,440,ay)
                    link(get+'.Vector',dot+'.A')
                    sign=c.get('input_sign',[1,1,1])[0 if axis=='X' else 2]
                    default(dot+'.B',vstr(tuple(sign*v for v in vector)))
                    norm=unit('RigVMFunction_MathFloatMul',name+'_'+axis+'_NORM',680,ay)
                    link(dot+'.Result',norm+'.A')
                    default(norm+'.B','0.1')
                    clamp=unit('RigVMFunction_MathFloatClamp',name+'_'+axis+'_CLAMP',920,ay)
                    link(norm+'.Result',clamp+'.Value')
                    default(clamp+'.Minimum','-1.0')
                    default(clamp+'.Maximum','1.0')
                    scalars[axis]=clamp+'.Result'
                    pos=unit('RigVMFunction_MathFloatClamp',name+'_'+axis+'_POS',1160,ay)
                    link(clamp+'.Result',pos+'.Value')
                    default(pos+'.Minimum','0.0')
                    default(pos+'.Maximum','1.0')
                    neg=unit('RigVMFunction_MathFloatMul',name+'_'+axis+'_NEGATE',1160,ay-250)
                    link(clamp+'.Result',neg+'.A')
                    default(neg+'.B','-1.0')
                    nclamp=unit('RigVMFunction_MathFloatClamp',name+'_'+axis+'_NEG',1400,ay-250)
                    link(neg+'.Result',nclamp+'.Value')
                    default(nclamp+'.Minimum','0.0')
                    default(nclamp+'.Maximum','1.0')
                    weights[axis+'P']=pos+'.Result'
                    weights[axis+'N']=nclamp+'.Result'
                less=unit('RigVMFunction_MathFloatLess',name+'_GATE_NEG_X',1640,y)
                link(scalars['X'],less+'.A')
                default(less+'.B','%.12f'%c['gate_threshold_source_x'])
                gate=unit('RigVMFunction_MathFloatSelectBool',name+'_GATE',1880,y)
                link(less+'.Result',gate+'.Condition')
                default(gate+'.IfTrue','0.0')
                link(weights['ZN' if c['gate_z_sign']<0 else 'ZP'],gate+'.IfFalse')
                weights['GATE']=gate+'.Result'
                features[name]=weights
            setters=[]
            for bi,b in enumerate(params['bones']):
                y=-64000-bi*1200
                if b in overlap:
                    position=overlap[b]['source']
                else:
                    bt=unit('RigUnit_GetTransform','BT_'+b,200,y)
                    default(bt+'.Item','(Type=Bone,Name="%s")'%b)
                    default(bt+'.Space','GlobalSpace')
                    default(bt+'.bInitial','True')
                    position=bt+'.Transform.Translation'
                j=0
                for c in params['controls']:
                    for feature,coeffs in c['features'].items():
                        if b not in coeffs:
                            continue
                        x=500+j*480
                        scale=unit('RigVMFunction_MathVectorScale','DELTA_'+b+'_'+str(j),x,y-250)
                        default(scale+'.Value',vstr(coeffs[b]))
                        link(features[c['control']][feature],scale+'.Factor')
                        add=unit('RigVMFunction_MathVectorAdd','ADD_'+b+'_'+str(j),x+240,y)
                        link(position,add+'.A')
                        link(scale+'.Result',add+'.B')
                        position=add+'.Result'
                        j+=1
                if b in overlap:
                    ctrl.break_all_links(overlap[b]['input'],True,False,False)
                    link(position,overlap[b]['input'])
                    continue
                make=unit('RigVMFunction_MathTransformMake','MAKE_'+b,3600,y)
                link(position,make+'.Translation')
                link(bt+'.Transform.Rotation',make+'.Rotation')
                link(bt+'.Transform.Scale3D',make+'.Scale')
                setter=unit('RigUnit_SetTransform','SET_'+b,3840,y)
                default(setter+'.Item','(Type=Bone,Name="%s")'%b)
                default(setter+'.Space','GlobalSpace')
                default(setter+'.bInitial','False')
                default(setter+'.Weight','1.0')
                default(setter+'.bPropagateToChildren','False')
                link(make+'.Result',setter+'.Value')
                setters.append(setter+'.ExecutePin')
            for output in {a for a,b in base.helper.exec_links(model)}|{a for a,b in old_exec}:
                ctrl.break_all_links(output,False,False,False)
            for a,b in old_exec:
                link(a,b)
            for a,b in zip([tail]+setters[:-1],setters):
                link(a,b)
            assert sorted(base.helper.exec_links(model))==sorted(old_exec+list(zip([tail]+setters[:-1],setters)))
            rig.recompile_vm()
            assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
    finally:
        rig.set_auto_vm_recompile(auto)
    module=types.ModuleType('cheek_verify')
    exec(compile((_fm_read(_fm_tool('Scripts/verify_cheek_controls.py'))).read_text(encoding='utf-8'),'verify_cheek_controls.py','exec'),module.__dict__)
    assert module.main()['passed']
    assert _fm_save_asset(rig,False)
    pending.update(nodes_after=len(model.get_nodes()),controls_after=len([k for k in h.get_all_keys() if k.type==unreal.RigElementType.CONTROL]),
                   new_controls=[c['control'] for c in params['controls']],original_execution_links_preserved=True,
                   added_setters=len(setters),saved=True)
    (_fm_output(EVIDENCE/'build_report.json')).write_text(json.dumps(pending,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(pending,ensure_ascii=False))


if __name__=='__main__':
    main()
