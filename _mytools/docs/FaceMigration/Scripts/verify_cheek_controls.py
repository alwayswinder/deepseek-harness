"""脸颊单控/组合、门控零点、旧控回归、嘴唇叠加、重复求解及限位。"""

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
import math
from pathlib import Path
import types
import unreal

ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
EVIDENCE=_fm_tool('Docs/Evidence/Cheeks')
helpers=types.ModuleType('cheek_helpers')
exec(compile((_fm_read(_fm_tool('Scripts/build_cheek_controls.py'))).read_text(encoding='utf-8'),'build_cheek_controls.py','exec'),helpers.__dict__)
fit=types.ModuleType('cheek_fit')
fit.__file__=str(_fm_tool('Scripts/fit_cheek_controls.py'))
exec(compile(_fm_read(Path(fit.__file__)).read_text(encoding='utf-8'),fit.__file__,'exec'),fit.__dict__)


def main():
    params=json.loads((_fm_read(EVIDENCE/'parameters.json')).read_text(encoding='utf-8'))
    ref=json.loads((_fm_read(EVIDENCE/'max_samples.json')).read_text(encoding='utf-8'))
    captured=json.loads((_fm_read(EVIDENCE/'previous_controls.json')).read_text(encoding='utf-8'))
    previous=[dict(values=x['values'],bones=dict(captured['neutral'],**x['bones'])) for x in captured['cases']]
    rig=_fm_load_asset(helpers.ASSET)
    inst,h=helpers.instance(rig)
    helpers.solve(inst,h,{})
    neutral=helpers.pose(h)
    targets=set(params['bones'])
    controls=params['controls']
    report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),asset=helpers.ASSET,
                status=str(rig.get_editor_property('status')),nodes=len(rig.get_default_model().get_nodes()),
                controls=len([k for k in h.get_all_keys() if k.type==unreal.RigElementType.CONTROL]),
                bones=len(neutral),source_cases=len(ref['samples']),max_position_error_cm=0.0,
                max_rotation_error_deg=0.0,max_scale_error=0.0,non_target_max_position_cm=0.0,
                max_position_delta_error_cm=0.0,max_rotation_delta_error_deg=0.0,
                source_max_rotation_change_deg=0.0,source_max_scale_change=0.0,
                non_target_max_rotation_deg=0.0,non_target_max_scale_error=0.0,
                regression_max_position_cm=0.0,regression_max_rotation_deg=0.0,regression_max_scale_error=0.0,
                mixed_max_position_cm=0.0,mixed_max_rotation_deg=0.0,mixed_max_scale_error=0.0,
                control_basis_max_error=0.0,repeat_solve_max_position_cm=0.0,limits=[])
    def errors(tf,t,convert=False):
        p,q,s=t['p'],t['q'],t['scale']
        if convert:
            p=[p[0],-p[1],p[2]]
            q=[q[0],-q[1],q[2],q[3]]
        return ((tf.translation-unreal.Vector(*p)).length(),
                helpers.base.helper.rotation_error(tf.rotation,unreal.Quat(*q)),
                (tf.scale3d-unreal.Vector(*s)).length())
    def update(prefix,errs):
        for k,e in zip(('position_cm','rotation_deg','scale_error'),errs):
            report[prefix+k]=max(report[prefix+k],e)
    report['neutral_reference_differences']={}
    for b,t in ref['baseline'].items():
        dp,dq,ds=errors(neutral[b],t,True)
        report['neutral_reference_differences'][b]=dict(position_cm=dp,rotation_deg=dq,scale_error=ds)
    for sample in ref['samples']:
        values={c['control']:tuple(10*v*sign for v,sign in zip(s,c.get('input_sign',[1,1,1]))) for c,s in zip(controls,sample['input'])}
        helpers.solve(inst,h,values)
        for b,t in sample['bones'].items():
            dp,dq,ds=errors(h.get_global_transform(helpers.key(b)),t,True)
            report['max_position_error_cm']=max(report['max_position_error_cm'],dp)
            report['max_rotation_error_deg']=max(report['max_rotation_error_deg'],dq)
            report['max_scale_error']=max(report['max_scale_error'],ds)
            src_rest=ref['baseline'][b]
            delta=[v-a for v,a in zip(t['p'],src_rest['p'])]
            expected=neutral[b].translation+unreal.Vector(delta[0],-delta[1],delta[2])
            actual=h.get_global_transform(helpers.key(b))
            report['max_position_delta_error_cm']=max(report['max_position_delta_error_cm'],(actual.translation-expected).length())
            report['max_rotation_delta_error_deg']=max(report['max_rotation_delta_error_deg'],helpers.base.helper.rotation_error(actual.rotation,neutral[b].rotation))
            report['source_max_rotation_change_deg']=max(report['source_max_rotation_change_deg'],helpers.base.helper.rotation_error(unreal.Quat(*t['q']),unreal.Quat(*src_rest['q'])))
            report['source_max_scale_change']=max(report['source_max_scale_change'],math.dist(t['scale'],src_rest['scale']))
        current=helpers.packed(h)
        for b,t in current.items():
            if b not in targets:
                update('non_target_max_',errors(neutral[b],t))
        # The graph must remain stable when evaluated again without resetting controls.
        for _ in range(2):
            assert inst.execute('Forwards Solve')
            for b,t in current.items():
                report['repeat_solve_max_position_cm']=max(report['repeat_solve_max_position_cm'],errors(h.get_global_transform(helpers.key(b)),t)[0])
    for c in controls:
        ck=helpers.key(c['control'],unreal.RigElementType.CONTROL)
        for inp in ((-20,5,20),(20,-5,-20)):
            helpers.solve(inst,h,{c['control']:inp})
            v=h.get_vector_from_control_value(h.get_control_value(ck))
            actual=[v.x,v.y,v.z]
            expected=[max(-10,min(10,inp[0])),0,max(-10,min(10,inp[2]))]
            assert math.dist(actual,expected)<1e-6,(c['control'],actual,expected)
            report['limits'].append(dict(control=c['control'],input=inp,actual=actual))
        for a,vec in [('x',(1,0,0)),('z',(0,0,1))]:
            helpers.solve(inst,h,{})
            rest=h.get_global_transform(ck).translation
            helpers.solve(inst,h,{c['control']:vec})
            delta=h.get_global_transform(ck).translation-rest
            sign=c.get('input_sign',[1,1,1])[0 if a=='x' else 2]
            report['control_basis_max_error']=max(report['control_basis_max_error'],(delta-unreal.Vector(*c['source_basis_'+a])*sign).length())
    mixes=[[[0.6,0,-0.8],[-0.4,0,0.7]],[[-0.7,0,0.3],[0.8,0,-0.5]]]
    for case in previous:
        helpers.solve(inst,h,case['values'])
        for b,t in case['bones'].items():
            update('regression_max_',errors(h.get_global_transform(helpers.key(b)),t))
        for inputs in mixes:
            cheek_values={c['control']:tuple(10*v*sign for v,sign in zip(s,c.get('input_sign',[1,1,1]))) for c,s in zip(controls,inputs)}
            helpers.solve(inst,h,dict(case['values'],**cheek_values))
            delta=fit.evaluate(params,inputs)
            for b,t in case['bones'].items():
                expected=dict(t)
                expected['p']=[a+d for a,d in zip(t['p'],delta.get(b,[0,0,0]))]
                update('mixed_max_',errors(h.get_global_transform(helpers.key(b)),expected))
    helpers.solve(inst,h,{})
    report['return_neutral_max_position_cm']=max((h.get_global_transform(helpers.key(b)).translation-t.translation).length() for b,t in neutral.items())
    # Preserve the existing UE reference pose, including its right-cheek bind residual.
    # Compare the requested control's movement independently from that static residual.
    for b,delta in report['neutral_reference_differences'].items():
        if b!='lianjia_R':
            assert delta['position_cm']<0.001 and delta['rotation_deg']<0.01,(b,delta)
    assert report['max_position_delta_error_cm']<0.001,report
    assert report['max_rotation_delta_error_deg']<1e-4,report
    assert report['source_max_rotation_change_deg']<1e-4,report
    assert report['source_max_scale_change']<1e-6,report
    assert report['max_scale_error']<1e-4,report
    for prefix in ('non_target_max_','regression_max_','mixed_max_'):
        assert report[prefix+'position_cm']<1e-6,(prefix,report)
        assert report[prefix+'rotation_deg']<1e-4,(prefix,report)
        assert report[prefix+'scale_error']<1e-6,(prefix,report)
    assert report['control_basis_max_error']<1e-5,report
    assert report['repeat_solve_max_position_cm']<1e-6,report
    assert report['return_neutral_max_position_cm']<1e-6,report
    assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
    report.update(regression_cases=len(previous),mixed_cases=len(previous)*len(mixes),passed=True)
    (_fm_output(EVIDENCE/'validation.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))
    return report


if __name__=='__main__':
    main()
