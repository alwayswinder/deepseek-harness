"""增量添加六个嘴唇控制，只修改 LidDiagnostic 资产。通过 ue_run.py 执行。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import datetime
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import unreal

ROOT = Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
EVIDENCE = _fm_tool('Docs/Evidence/LipControls')
spec = importlib.util.spec_from_file_location('lid_helpers', _fm_tool('Scripts/build_lower_lids.py'))
helper = importlib.util.module_from_spec(spec)
old = sys.dont_write_bytecode
try:
    sys.dont_write_bytecode = True
    spec.loader.exec_module(helper)
finally:
    sys.dont_write_bytecode = old
ASSET = helper.ASSET
PREFIX = 'LIP_'
key, vstr, instance, solve, pose = helper.key, helper.vstr, helper.instance, helper.solve, helper.pose


def packed(h):
    return {b: dict(p=[t.translation.x, t.translation.y, t.translation.z],
                    q=[t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w],
                    scale=[t.scale3d.x, t.scale3d.y, t.scale3d.z]) for b,t in pose(h).items()}


def main():
    params = json.loads((_fm_read(EVIDENCE / 'parameters.json')).read_text(encoding='utf-8'))
    rig = _fm_load_asset(ASSET)
    h, hc = rig.get_hierarchy(), rig.get_hierarchy_controller()
    model = rig.get_default_model()
    ctrl = rig.get_controller(model)
    assert not any(str(n.get_name()).startswith(PREFIX) for n in model.get_nodes()), 'Lip nodes already exist'
    for b in params['bones']:
        assert h.contains(key(b)), b
    old_exec = helper.exec_links(model)
    nodes_before = len(model.get_nodes())
    targets = {b.split('.')[0] for a,b in old_exec}
    sources = {a.split('.')[0] for a,b in old_exec}
    tails = targets - sources
    assert len(tails) == 1, tails
    tail = tails.pop() + '.ExecutePin'
    backup = _fm_saved('Backup') / ('LipControls_' + datetime.datetime.now().strftime('%Y%m%d_%H%M%S'))
    _fm_output(backup).mkdir(parents=True)
    disk = _fm_disk('Content/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation.uasset')
    shutil.copy2(disk, backup / 'disk_before.uasset')
    assert _fm_save_asset(rig, False)
    shutil.copy2(disk, backup / 'memory_before.uasset')
    bi, bh = instance(rig)
    cases = [{}]
    for k in bh.get_all_keys():
        if k.type != unreal.RigElementType.CONTROL:
            continue
        n = str(k.name)
        if n.startswith('CTRL_EYE_LOWER_LID_'):
            vectors = [(0,0,z) for z in (2.5,5,10)]
        elif n.startswith('CTRL_EYE_LID_'):
            vectors = [(0,0,z) for z in (-2.5,-5,-10)]
        elif n.endswith('_BEND'):
            vectors = [(0,0,-2),(0,0,2)]
        else:
            vectors = [(1,0,0),(0,1,0),(0,0,1)]
        cases.extend({n:v} for v in vectors)
    previous = []
    for values in cases:
        solve(bi,bh,values)
        previous.append(dict(values=values, bones=packed(bh)))
    baseline=previous[0]['bones']
    compact=dict(neutral=baseline,cases=[dict(values=x['values'],bones={b:t for b,t in x['bones'].items() if t!=baseline[b]}) for x in previous])
    (_fm_output(EVIDENCE/'previous_controls.json')).write_text(json.dumps(compact,ensure_ascii=False,indent=2),encoding='utf-8')

    def unit(cls,n,x,y):
        node=ctrl.add_unit_node_from_struct_path(getattr(unreal,cls).static_struct().get_path_name(),
                                                 'Execute',unreal.Vector2D(x,y),PREFIX+n,False)
        assert node is not None, n
        return str(node.get_name())
    def default(p,v):
        assert ctrl.set_pin_default_value(p,v,False,False),p
    def link(a,b):
        assert ctrl.add_link(a,b,False),(a,b)

    auto=rig.get_auto_vm_recompile()
    rig.modify()
    try:
        rig.set_auto_vm_recompile(False)
        with unreal.ScopedEditorTransaction('Add six Max lip controls'):
            scalars={}
            labels=['左上唇','中央上唇','右上唇','右下唇','中央下唇','左下唇']
            for ci,c in enumerate(params['controls']):
                name=c['control']
                setting=unreal.RigControlSettings()
                setting.control_type=unreal.RigControlType.POSITION
                setting.display_name=labels[ci]
                setting.shape_name='Box_Thick'
                setting.shape_color=unreal.LinearColor(1.0,0.55,0.15,1)
                setting.primary_axis=unreal.RigControlAxis.Z
                setting.limit_enabled=[unreal.RigControlLimitEnabled(minimum=True,maximum=True)]*3
                lo,hi=(0,10) if c['sign']>0 else (-10,0)
                setting.minimum_value=h.make_control_value_from_vector(unreal.Vector(0,0,lo))
                setting.maximum_value=h.make_control_value_from_vector(unreal.Vector(0,0,hi))
                setting.draw_limits=False
                ck=hc.add_control(name,key('Root'),setting,h.make_control_value_from_vector(unreal.Vector()),False,False)
                assert h.contains(ck)
                offset=unreal.Transform()
                offset.translation=unreal.Vector(*c['control_rest'])
                for initial in (True,False):
                    h.set_control_offset_transform(ck,offset,initial,True)
                    shape=unreal.Transform()
                    shape.scale3d=unreal.Vector(0.12,0.10,0.05)
                    h.set_control_shape_transform(ck,shape,initial)
                y=-33000-ci*700
                get=unit('RigUnit_GetControlVector','GET_'+name,200,y)
                default(get+'.Control',name)
                default(get+'.Space','LocalSpace')
                dot=unit('RigVMFunction_MathVectorDot','Z_'+name,440,y)
                link(get+'.Vector',dot+'.A')
                default(dot+'.B',vstr((0,0,1)))
                clamp=unit('RigVMFunction_MathFloatClamp','CLAMP_'+name,680,y)
                link(dot+'.Result',clamp+'.Value')
                default(clamp+'.Minimum',str(float(lo)))
                default(clamp+'.Maximum',str(float(hi)))
                scalar=unit('RigVMFunction_MathFloatMul','S_'+name,920,y)
                link(clamp+'.Result',scalar+'.A')
                default(scalar+'.B',str(0.1*c['sign']))
                scalars[name]=scalar+'.Result'
            setters=[]
            for bi,b in enumerate(params['bones']):
                y=-38000-bi*1600
                bt=unit('RigUnit_GetTransform','BT_'+b,1100,y)
                default(bt+'.Item','(Type=Bone,Name="%s")'%b)
                default(bt+'.Space','GlobalSpace')
                default(bt+'.bInitial','True')
                position=bt+'.Transform.Translation'
                for ci,c in enumerate(params['controls']):
                    if b not in c['delta_full']:
                        continue
                    x=1400+ci*480
                    scale=unit('RigVMFunction_MathVectorScale','DELTA_'+b+'_'+str(ci),x,y-300)
                    default(scale+'.Value',vstr(c['delta_full'][b]))
                    link(scalars[c['control']],scale+'.Factor')
                    add=unit('RigVMFunction_MathVectorAdd','ADD_'+b+'_'+str(ci),x+240,y)
                    link(position,add+'.A')
                    link(scale+'.Result',add+'.B')
                    position=add+'.Result'
                make=unit('RigVMFunction_MathTransformMake','MAKE_'+b,4500,y)
                link(position,make+'.Translation')
                link(bt+'.Transform.Rotation',make+'.Rotation')
                link(bt+'.Transform.Scale3D',make+'.Scale')
                setter=unit('RigUnit_SetTransform','SET_'+b,4800,y)
                default(setter+'.Item','(Type=Bone,Name="%s")'%b)
                default(setter+'.Space','GlobalSpace')
                default(setter+'.bInitial','False')
                default(setter+'.Weight','1.0')
                default(setter+'.bPropagateToChildren','False')
                link(make+'.Result',setter+'.Value')
                setters.append(setter+'.ExecutePin')
            # Node insertion can auto-wire execution; rebuild it explicitly.
            for output in {a for a,b in helper.exec_links(model)} | {a for a,b in old_exec}:
                ctrl.break_all_links(output,False,False,False)
            for a,b in old_exec:
                link(a,b)
            last=tail
            for setter in setters:
                link(last,setter)
                last=setter
            expected=old_exec+list(zip([tail]+setters[:-1],setters))
            assert sorted(helper.exec_links(model))==sorted(expected)
            rig.recompile_vm()
            assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
    finally:
        rig.set_auto_vm_recompile(auto)
    # Verification runs before any asset save.
    import types
    module=types.ModuleType('lip_verify')
    exec(compile((_fm_read(_fm_tool('Scripts/verify_lip_controls.py'))).read_text(encoding='utf-8'),'verify_lip_controls.py','exec'),module.__dict__)
    validation=module.main()
    assert validation['passed']
    assert _fm_save_asset(rig,False)
    report=dict(asset=ASSET,backup=str(backup),nodes_before=nodes_before,nodes_after=len(model.get_nodes()),
                controls_after=len([k for k in h.get_all_keys() if k.type==unreal.RigElementType.CONTROL]),
                new_controls=[c['control'] for c in params['controls']],original_execution_links_preserved=True,
                added_setters=len(setters),regression_cases=len(previous),saved=True)
    (_fm_output(EVIDENCE/'build_report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))


if __name__=='__main__':
    main()
