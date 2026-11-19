"""独立实例数值对照：六唇控、组合、完整变换、旧控制回归及混合输入。"""

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
EVIDENCE=_fm_tool('Docs/Evidence/LipControls')
helpers=types.ModuleType('lip_build_helpers')
exec(compile((_fm_read(_fm_tool('Scripts/build_lip_controls.py'))).read_text(encoding='utf-8'),'build_lip_controls.py','exec'),helpers.__dict__)


def main():
    rig=_fm_load_asset(helpers.ASSET)
    inst,h=helpers.instance(rig)
    ref=json.loads((_fm_read(EVIDENCE/'max_samples.json')).read_text(encoding='utf-8'))
    params=json.loads((_fm_read(EVIDENCE/'parameters.json')).read_text(encoding='utf-8'))
    captured=json.loads((_fm_read(EVIDENCE/'previous_controls.json')).read_text(encoding='utf-8'))
    previous=[dict(values=x['values'],bones=dict(captured['neutral'],**x['bones'])) for x in captured['cases']]
    controls=params['controls']
    helpers.solve(inst,h,{})
    neutral=helpers.pose(h)
    targets=set(params['bones'])
    report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),asset=helpers.ASSET,
                status=str(rig.get_editor_property('status')),nodes=len(rig.get_default_model().get_nodes()),
                controls=len([k for k in h.get_all_keys() if k.type==unreal.RigElementType.CONTROL]),
                sample_cases=0,max_position_error_cm=0.0,max_rotation_error_deg=0.0,max_scale_error=0.0,
                non_target_max_position_cm=0.0,non_target_max_rotation_deg=0.0,non_target_max_scale_error=0.0,
                regression_max_position_cm=0.0,regression_max_rotation_deg=0.0,regression_max_scale_error=0.0,
                mixed_max_position_cm=0.0,mixed_max_rotation_deg=0.0,mixed_max_scale_error=0.0,limits=[])

    def errors(tf,t,convert=False):
        p,q,s=t['p'],t['q'],t['scale']
        if convert:
            p=[p[0],-p[1],p[2]]
            q=[q[0],-q[1],q[2],q[3]]
        return ((tf.translation-unreal.Vector(*p)).length(),
                helpers.helper.rotation_error(tf.rotation,unreal.Quat(*q)),
                (tf.scale3d-unreal.Vector(*s)).length())
    def update(prefix,err):
        for k,e in zip(('position_cm','rotation_deg','scale_error'),err):
            n=prefix+k
            report[n]=max(report[n],e)
    cases=[]
    for ci,c in enumerate(ref['controls']):
        for sample in c['samples']:
            weights=[sample['s'] if j==ci else 0 for j in range(6)]
            cases.append((sample,weights))
    cases.extend((sample,sample['s']) for sample in ref['combinations'])
    for sample,weights in cases:
        values={c['control']:(0,0,10*c['sign']*s) for c,s in zip(controls,weights)}
        helpers.solve(inst,h,values)
        for b,t in sample['bones'].items():
            dp,dq,ds=errors(h.get_global_transform(helpers.key(b)),t,True)
            report['max_position_error_cm']=max(report['max_position_error_cm'],dp)
            report['max_rotation_error_deg']=max(report['max_rotation_error_deg'],dq)
            report['max_scale_error']=max(report['max_scale_error'],ds)
        for b,tf in helpers.packed(h).items():
            if b not in targets:
                update('non_target_max_',errors(neutral[b],tf))
        report['sample_cases']+=1
    for c in controls:
        for z in (-20,20):
            helpers.solve(inst,h,{c['control']:(3,-4,z)})
            k=helpers.key(c['control'],unreal.RigElementType.CONTROL)
            v=h.get_vector_from_control_value(h.get_control_value(k))
            actual=[v.x,v.y,v.z]
            expected=[0,0,max(0,min(10,z)) if c['sign']>0 else max(-10,min(0,z))]
            assert math.dist(actual,expected)<1e-6,(c['control'],actual,expected)
            report['limits'].append(dict(control=c['control'],input=[3,-4,z],actual=actual))
    mixed_values={c['control']:(0,0,c['sign']*5) for c in controls}
    for case in previous:
        helpers.solve(inst,h,case['values'])
        for b,t in case['bones'].items():
            update('regression_max_',errors(h.get_global_transform(helpers.key(b)),t))
        helpers.solve(inst,h,dict(case['values'],**mixed_values))
        for b,t in case['bones'].items():
            expected=dict(t)
            expected['p']=[v+sum(0.5*c['delta_full'].get(b,[0,0,0])[i] for c in controls) for i,v in enumerate(t['p'])]
            update('mixed_max_',errors(h.get_global_transform(helpers.key(b)),expected))
    helpers.solve(inst,h,{})
    report['return_neutral_max_position_cm']=max((h.get_global_transform(helpers.key(b)).translation-t.translation).length() for b,t in neutral.items())
    assert report['max_position_error_cm']<0.001,report
    assert report['max_rotation_error_deg']<0.01,report
    assert report['max_scale_error']<1e-4,report
    for prefix in ('non_target_max_','regression_max_','mixed_max_'):
        assert report[prefix+'position_cm']<1e-6,(prefix,report)
        assert report[prefix+'rotation_deg']<1e-4,(prefix,report)
        assert report[prefix+'scale_error']<1e-6,(prefix,report)
    assert report['return_neutral_max_position_cm']<1e-6
    assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
    report['regression_cases']=len(previous)
    report['mixed_cases']=len(previous)
    report['passed']=True
    (_fm_output(EVIDENCE/'validation.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))
    return report


if __name__=='__main__':
    main()
