"""增量添加左右嘴角与整体嘴控；在原 MAKE 前合并贡献，保留执行链。"""

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
EVIDENCE=_fm_tool('Docs/Evidence/MouthControls')
base=types.ModuleType('lip_helpers')
exec(compile((_fm_read(_fm_tool('Scripts/build_lip_controls.py'))).read_text(encoding='utf-8'),'build_lip_controls.py','exec'),base.__dict__)
ASSET=base.ASSET
key,vstr,instance,solve,pose,packed=base.key,base.vstr,base.instance,base.solve,base.pose,base.packed
PREFIX='MOUTH_'


def preview_values(rig):
    live=rig.get_debugged_control_rig()
    if not live:return {}
    h=live.get_hierarchy();result={}
    for k in h.get_all_keys():
        if k.type==unreal.RigElementType.CONTROL:
            v=h.get_vector_from_control_value(h.get_control_value(k))
            result[str(k.name)]=[v.x,v.y,v.z]
    return result


def main():
    params=json.loads((_fm_read(EVIDENCE/'parameters.json')).read_text(encoding='utf-8'))
    source_controls=json.loads((_fm_read(EVIDENCE/'max_samples.json')).read_text(encoding='utf-8'))['controls']
    rig=_fm_load_asset(ASSET);h=rig.get_hierarchy();hc=rig.get_hierarchy_controller()
    model=rig.get_default_model();ctrl=rig.get_controller(model)
    assert not any(str(n.get_name()).startswith(PREFIX) for n in model.get_nodes()),'Mouth already exists'
    old_exec=base.helper.exec_links(model);nodes_before=len(model.get_nodes())
    backup=_fm_saved('Backup')/('MouthControls_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'))
    _fm_output(backup).mkdir(parents=True)
    disk=_fm_disk('Content/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation.uasset')
    shutil.copy2(disk,backup/'disk_before.uasset')
    values=preview_values(rig)
    assert _fm_save_asset(rig,False)
    shutil.copy2(disk,backup/'memory_before.uasset')
    captured=json.loads((_fm_read(_fm_tool('Docs/Evidence/Nose/previous_controls.json'))).read_text(encoding='utf-8'))
    cases=[x['values'] for x in captured['cases']]
    cases.extend({'CTRL_NOSE':v} for v in ((-10,0,0),(10,0,0),(0,10,0),(0,0,-10),(0,0,10),(-7,6,4),(8,2,-9)))
    bi,bh=instance(rig);previous=[]
    for vals in cases:
        solve(bi,bh,vals);previous.append(dict(values=vals,bones=packed(bh)))
    neutral=previous[0]['bones']
    saved=dict(neutral=neutral,cases=[dict(values=x['values'],bones={b:t for b,t in x['bones'].items() if t!=neutral[b]}) for x in previous])
    (_fm_output(EVIDENCE/'previous_controls.json')).write_text(json.dumps(saved,ensure_ascii=False,indent=2),encoding='utf-8')
    report=dict(asset=ASSET,backup=str(backup),nodes_before=nodes_before,old_execution_links=old_exec,preview_values=values,regression_cases=len(cases),saved=False,rewired={})
    def write_report(): (_fm_output(EVIDENCE/'build_report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    write_report()
    def unit(cls,n,x,y):
        node=ctrl.add_unit_node_from_struct_path(getattr(unreal,cls).static_struct().get_path_name(),'Execute',unreal.Vector2D(x,y),PREFIX+n,False)
        assert node is not None,n
        return str(node.get_name())
    def default(p,v):assert ctrl.set_pin_default_value(p,v,False,False),p
    def link(a,b):assert ctrl.add_link(a,b,False),(a,b)
    def incoming(pin):
        links=[l for l in model.get_links() if str(l.get_target_pin().get_pin_path())==pin]
        assert len(links)==1,(pin,len(links))
        return str(links[0].get_source_pin().get_pin_path())
    auto=rig.get_auto_vm_recompile();rig.modify()
    try:
        rig.set_auto_vm_recompile(False)
        with unreal.ScopedEditorTransaction('Add three Max mouth controls'):
            scalars={}
            for ci,c in enumerate(params['controls']):
                settings=unreal.RigControlSettings()
                settings.control_type=unreal.RigControlType.POSITION
                settings.display_name=c['display_name'];settings.shape_name='Box_Thick'
                settings.shape_color=unreal.LinearColor(0.2,0.8,1.0,1) if ci==2 else unreal.LinearColor(1,0.3,0.5,1)
                settings.primary_axis=unreal.RigControlAxis.Z
                settings.limit_enabled=[unreal.RigControlLimitEnabled(minimum=True,maximum=True)]*3
                settings.minimum_value=h.make_control_value_from_vector(unreal.Vector(*c['minimum']))
                settings.maximum_value=h.make_control_value_from_vector(unreal.Vector(*c['maximum']))
                settings.draw_limits=False
                ck=hc.add_control(c['control'],key('Root'),settings,h.make_control_value_from_vector(unreal.Vector()),False,False)
                assert h.contains(ck)
                offset=unreal.Transform();offset.translation=unreal.Vector(*c['control_rest'])
                for initial in (True,False):
                    h.set_control_offset_transform(ck,offset,initial,True)
                    shape=unreal.Transform();shape.scale3d=unreal.Vector(*( (0.23,0.08,0.08) if ci==2 else (0.12,0.1,0.07)))
                    h.set_control_shape_transform(ck,shape,initial)
                y=-84000-ci*1400
                get=unit('RigUnit_GetControlVector','GET_'+str(ci),200,y)
                default(get+'.Control',c['control']);default(get+'.Space','LocalSpace')
                for ax in range(3):
                    # Source X=-sign*UE.Y/10; Y=UE.Z/10; Z=sign*UE.X/10.
                    projection=[(0,-c['sign']*0.1,0),(0,0,0.1),(c['sign']*0.1,0,0)][ax]
                    dot=unit('RigVMFunction_MathVectorDot','AX_%d_%d'%(ci,ax),440,y-ax*300)
                    link(get+'.Vector',dot+'.A');default(dot+'.B',vstr(projection))
                    source=source_controls[ci]
                    clamp=unit('RigVMFunction_MathFloatClamp','CLAMP_%d_%d'%(ci,ax),680,y-ax*300)
                    link(dot+'.Result',clamp+'.Value');default(clamp+'.Minimum',str(source['minimum'][ax]));default(clamp+'.Maximum',str(source['maximum'][ax]))
                    for si in (-1,1):
                        n=unit('RigVMFunction_MathFloatMin' if si<0 else 'RigVMFunction_MathFloatMax','HALF_%d_%d_%d'%(ci,ax,si),920+(si+1)*120,y-ax*300)
                        link(clamp+'.Result',n+'.A');default(n+'.B','0.0')
                        scalars[ci,ax,si]=n+'.Result'
            for bi,(b,data) in enumerate(params['bones'].items()):
                target=('LIP_MAKE_' if model.find_node_by_name('LIP_MAKE_'+b) else 'CHEEK_MAKE_')+b
                assert model.find_node_by_name(target),b
                y=-89000-bi*2200
                position=incoming(target+'.Translation');rotation=incoming(target+'.Rotation')
                report['rewired'][b]=dict(target=target,position=position,rotation=rotation)
                euler=None
                for ti,t in enumerate(data['terms']):
                    x=1600+ti*500
                    scalar=scalars[t['ci'],t['axis'],t['sign']]
                    for channel,vec in (('P',t['p']),('E',t['e'])):
                        if sum(v*v for v in vec)<(1e-10 if channel=='P' else 1e-8):continue
                        if channel=='E':vec=[v*data['euler_sign'] for v in vec]
                        scale=unit('RigVMFunction_MathVectorScale',channel+'S_'+b+'_'+str(ti),x,y-(0 if channel=='P' else 800))
                        default(scale+'.Value',vstr(vec));link(scalar,scale+'.Factor')
                        prior=position if channel=='P' else euler
                        result=scale+'.Result'
                        if prior:
                            add=unit('RigVMFunction_MathVectorAdd',channel+'A_'+b+'_'+str(ti),x+240,y-(0 if channel=='P' else 800))
                            link(prior,add+'.A');link(result,add+'.B');result=add+'.Result'
                        if channel=='P':position=result
                        else:euler=result
                ctrl.break_all_links(target+'.Translation',True,False,False);link(position,target+'.Translation')
                if data['rotating']:
                    assert euler and data['euler_order']=='xyz'
                    q=unit('RigVMFunction_MathQuaternionFromEuler','Q_'+b,7000,y-900)
                    default(q+'.RotationOrder','XYZ');link(euler,q+'.Euler')
                    basis=data['basis'];inverse=[-v for v in basis[:3]]+[basis[3]]
                    def qstr(v):return '(X=%.12f,Y=%.12f,Z=%.12f,W=%.12f)'%tuple(v)
                    left=unit('RigVMFunction_MathQuaternionMul','QB_'+b,7240,y-900)
                    default(left+'.A',qstr(basis));link(q+'.Result',left+'.B')
                    right=unit('RigVMFunction_MathQuaternionMul','QD_'+b,7480,y-900)
                    link(left+'.Result',right+'.A');default(right+'.B',qstr(inverse))
                    final=unit('RigVMFunction_MathQuaternionMul','QR_'+b,7720,y-900)
                    link(right+'.Result',final+'.A');link(rotation,final+'.B')
                    ctrl.break_all_links(target+'.Rotation',True,False,False);link(final+'.Result',target+'.Rotation')
            assert sorted(base.helper.exec_links(model))==sorted(old_exec)
            rig.recompile_vm()
            assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
    finally:rig.set_auto_vm_recompile(auto)
    report.update(nodes_after=len(model.get_nodes()),controls_after=len([k for k in h.get_all_keys() if k.type==unreal.RigElementType.CONTROL]),original_execution_links_preserved=True)
    write_report()
    module=types.ModuleType('mouth_reload')
    exec(compile((_fm_read(_fm_tool('Scripts/reload_mouth_target.py'))).read_text(encoding='utf-8'),'reload_mouth_target.py','exec'),module.__dict__)
    module.main()


if __name__=='__main__':main()
