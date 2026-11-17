"""鼻子 Max 对照、限位、独立性、旧控和混合输入、重复求解与回零。"""

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
EVIDENCE=_fm_tool('Docs/Evidence/Nose')
helpers=types.ModuleType('nose_helpers')
exec(compile((_fm_read(_fm_tool('Scripts/build_nose_controls.py'))).read_text(encoding='utf-8'),'build_nose_controls.py','exec'),helpers.__dict__)


def main():
    params=json.loads((_fm_read(EVIDENCE/'parameters.json')).read_text(encoding='utf-8'))
    ref=json.loads((_fm_read(EVIDENCE/'max_samples.json')).read_text(encoding='utf-8'))
    captured=json.loads((_fm_read(EVIDENCE/'previous_controls.json')).read_text(encoding='utf-8'))
    previous=[dict(values=x['values'],bones=dict(captured['neutral'],**x['bones'])) for x in captured['cases']]
    rig=_fm_load_asset(helpers.ASSET)
    inst,h=helpers.instance(rig)
    helpers.solve(inst,h,{})
    neutral=helpers.packed(h)
    report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),asset=helpers.ASSET,
                status=str(rig.get_editor_property('status')),nodes=len(rig.get_default_model().get_nodes()),
                controls=len([k for k in h.get_all_keys() if k.type==unreal.RigElementType.CONTROL]),bones=len(neutral),
                source_cases=len(ref['samples']),max_position_error_cm=0.0,max_rotation_error_deg=0.0,max_scale_error=0.0,
                non_target_max_position_cm=0.0,non_target_max_rotation_deg=0.0,non_target_max_scale_error=0.0,
                regression_max_position_cm=0.0,regression_max_rotation_deg=0.0,regression_max_scale_error=0.0,
                mixed_max_position_cm=0.0,mixed_max_rotation_deg=0.0,mixed_max_scale_error=0.0,
                repeat_solve_max_position_cm=0.0,handle_axes_max_error_cm=0.0,limits=[])
    def errors(tf,t,convert=False):
        p,q,s=t['p'],t['q'],t['scale']
        if convert:
            p=[p[0],-p[1],p[2]]
            q=[q[0],-q[1],q[2],q[3]]
        return ((tf.translation-unreal.Vector(*p)).length(),helpers.base.helper.rotation_error(tf.rotation,unreal.Quat(*q)),(tf.scale3d-unreal.Vector(*s)).length())
    def update(prefix,errs):
        for k,e in zip(('position_cm','rotation_deg','scale_error'),errs):
            report[prefix+k]=max(report[prefix+k],e)
    for sample in ref['samples']:
        x,y,z=sample['input']
        helpers.solve(inst,h,{params['control']:(-10*z,10*x,10*y)})
        dp,dq,ds=errors(h.get_global_transform(helpers.key('bijian')),sample['bones']['bijian'],True)
        report['max_position_error_cm']=max(report['max_position_error_cm'],dp)
        report['max_rotation_error_deg']=max(report['max_rotation_error_deg'],dq)
        report['max_scale_error']=max(report['max_scale_error'],ds)
        current=helpers.packed(h)
        for b,t in neutral.items():
            if b!='bijian':
                update('non_target_max_',errors(h.get_global_transform(helpers.key(b)),t))
        assert inst.execute('Forwards Solve')
        report['repeat_solve_max_position_cm']=max(report['repeat_solve_max_position_cm'],max(errors(h.get_global_transform(helpers.key(b)),t)[0] for b,t in current.items()))
    ck=helpers.key(params['control'],unreal.RigElementType.CONTROL)
    for inp in ((-20,-20,-20),(20,20,20)):
        helpers.solve(inst,h,{params['control']:inp})
        v=h.get_vector_from_control_value(h.get_control_value(ck))
        got=[v.x,v.y,v.z]
        expected=[max(lo,min(hi,val)) for lo,hi,val in zip(params['minimum'],params['maximum'],inp)]
        assert math.dist(got,expected)<1e-6,(got,expected)
        report['limits'].append(dict(input=inp,actual=got))
    for vec in ((1,0,0),(0,1,0),(0,0,1)):
        helpers.solve(inst,h,{})
        p=h.get_global_transform(ck).translation
        helpers.solve(inst,h,{params['control']:vec})
        delta=h.get_global_transform(ck).translation-p
        report['handle_axes_max_error_cm']=max(report['handle_axes_max_error_cm'],(delta-unreal.Vector(*vec)).length())
    mixes=[(-7,6,4),(8,2,-9)]
    for case in previous:
        helpers.solve(inst,h,case['values'])
        for b,t in case['bones'].items():
            update('regression_max_',errors(h.get_global_transform(helpers.key(b)),t))
        for v in mixes:
            helpers.solve(inst,h,dict(case['values'],**{params['control']:v}))
            for b,t in case['bones'].items():
                expected=dict(t)
                if b=='bijian':
                    expected['p']=[a+0.1*d for a,d in zip(t['p'],v)]
                update('mixed_max_',errors(h.get_global_transform(helpers.key(b)),expected))
    helpers.solve(inst,h,{})
    report['return_neutral_max_position_cm']=max(errors(h.get_global_transform(helpers.key(b)),t)[0] for b,t in neutral.items())
    assert report['max_position_error_cm']<0.001,report
    assert report['max_rotation_error_deg']<0.01,report
    assert report['max_scale_error']<1e-4,report
    for prefix in ('non_target_max_','regression_max_','mixed_max_'):
        assert report[prefix+'position_cm']<1e-6,(prefix,report)
        assert report[prefix+'rotation_deg']<1e-4,(prefix,report)
        assert report[prefix+'scale_error']<1e-6,(prefix,report)
    assert report['repeat_solve_max_position_cm']<1e-6,report
    assert report['return_neutral_max_position_cm']<1e-6,report
    assert report['handle_axes_max_error_cm']<1e-6,report
    assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
    report.update(regression_cases=len(previous),mixed_cases=len(previous)*len(mixes),passed=True)
    (_fm_output(EVIDENCE/'validation.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))
    return report


if __name__=='__main__':
    main()
