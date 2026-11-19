"""独立实例验证全149骨：源完整变换增量、旧控、混合、限位、重复求解。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import datetime,json,math,types
from pathlib import Path
import unreal

ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
EVIDENCE=_fm_tool('Docs/Evidence/MouthControls')
helpers=types.ModuleType('mouth_helpers')
exec(compile((_fm_read(_fm_tool('Scripts/build_mouth_controls.py'))).read_text(encoding='utf-8'),'build_mouth_controls.py','exec'),helpers.__dict__)


def main():
    params=json.loads((_fm_read(EVIDENCE/'parameters.json')).read_text(encoding='utf-8'))
    ref=json.loads((_fm_read(EVIDENCE/'max_samples.json')).read_text(encoding='utf-8'))
    captured=json.loads((_fm_read(EVIDENCE/'previous_controls.json')).read_text(encoding='utf-8'))
    previous=[dict(values=x['values'],bones=dict(captured['neutral'],**x['bones'])) for x in captured['cases']]
    rig=_fm_load_asset(helpers.ASSET);inst,h=helpers.instance(rig)
    helpers.solve(inst,h,{});neutral=helpers.packed(h)
    assert len(neutral)==149
    report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),asset=helpers.ASSET,status=str(rig.get_editor_property('status')),
                nodes=len(rig.get_default_model().get_nodes()),controls=len([k for k in h.get_all_keys() if k.type==unreal.RigElementType.CONTROL]),bones=len(neutral))
    def uq(q):return unreal.Quat(q[0],-q[1],q[2],q[3])
    def inverse(q):return unreal.Quat(-q.x,-q.y,-q.z,q.w)
    def errors(actual,t):
        return ((actual.translation-unreal.Vector(*t['p'])).length(),helpers.base.helper.rotation_error(actual.rotation,unreal.Quat(*t['q'])),(actual.scale3d-unreal.Vector(*t['scale'])).length())
    def update(prefix,errs):
        for name,value in zip(('position_cm','rotation_deg','scale_error'),errs):report[prefix+name]=max(report.get(prefix+name,0),value)
    def inputs(sample,include_old=True):
        result={}
        for c,v in zip(params['controls'],sample['inputs']):
            result[c['control']]=[10*c['sign']*v[2],-10*c['sign']*v[0],10*v[1]]
        if include_old:
            x,y,z=sample['inputs'][3];result['CTRL_NOSE']=[-10*z,10*x,10*y]
            for n,v in zip(('CTRL_CHEEK_R','CTRL_CHEEK_L'),sample['inputs'][4:6]):result[n]=[10*v[0],0,-10*v[2]]
            for n,v in zip(('CTRL_LIP_UP_L','CTRL_LIP_UP_C','CTRL_LIP_UP_R','CTRL_LIP_LOW_R','CTRL_LIP_LOW_C','CTRL_LIP_LOW_L'),sample['inputs'][6:]):result[n]=[0,0,10*v[1]]
        return result
    # Report inherited absolute differences separately from control-induced errors.
    report['neutral_reference_differences']={}
    for b,t in ref['baseline'].items():
        tt=dict(p=[t['p'][0],-t['p'][1],t['p'][2]],q=[t['q'][0],-t['q'][1],t['q'][2],t['q'][3]],scale=t['scale'])
        report['neutral_reference_differences'][b]=errors(h.get_global_transform(helpers.key(b)),tt)
    for group,prefix in ((ref['samples'],'source_'),(ref['mixed_samples'],'source_mixed_')):
        for sample in group:
            helpers.solve(inst,h,inputs(sample))
            for b,t in sample['bones'].items():
                rest=ref['baseline'][b];ue=neutral[b]
                dp=[a-z for a,z in zip(t['p'],rest['p'])]
                qdelta=uq(t['q'])*inverse(uq(rest['q']))
                expected_q=qdelta*unreal.Quat(*ue['q'])
                expected=dict(p=[ue['p'][0]+dp[0],ue['p'][1]-dp[1],ue['p'][2]+dp[2]],q=[expected_q.x,expected_q.y,expected_q.z,expected_q.w],scale=ue['scale'])
                update(prefix,errors(h.get_global_transform(helpers.key(b)),expected))
                update(prefix+'absolute_',errors(h.get_global_transform(helpers.key(b)),dict(p=[t['p'][0],-t['p'][1],t['p'][2]],q=[t['q'][0],-t['q'][1],t['q'][2],t['q'][3]],scale=t['scale'])))
                if prefix=='source_' and b not in params['bones']:update('non_target_',errors(h.get_global_transform(helpers.key(b)),ue))
            current=helpers.packed(h)
            assert inst.execute('Forwards Solve')
            for b,t in current.items():update('repeat_',errors(h.get_global_transform(helpers.key(b)),t))
    for case in previous:
        helpers.solve(inst,h,case['values'])
        for b,t in case['bones'].items():update('regression_',errors(h.get_global_transform(helpers.key(b)),t))
        for mix in (ref['samples'][-2],ref['samples'][-8]):
            mouth=inputs(mix,False)
            helpers.solve(inst,h,mouth);single=helpers.packed(h)
            helpers.solve(inst,h,dict(case['values'],**mouth))
            for b,t in case['bones'].items():
                dq=unreal.Quat(*single[b]['q'])*inverse(unreal.Quat(*neutral[b]['q']))
                q=dq*unreal.Quat(*t['q'])
                expected=dict(p=[a+s-z for a,s,z in zip(t['p'],single[b]['p'],neutral[b]['p'])],q=[q.x,q.y,q.z,q.w],scale=t['scale'])
                update('regression_mixed_',errors(h.get_global_transform(helpers.key(b)),expected))
    report['limits']=[]
    for c in params['controls']:
        ck=helpers.key(c['control'],unreal.RigElementType.CONTROL)
        for v in ((-100,-100,-100),(100,100,100)):
            helpers.solve(inst,h,{c['control']:v})
            got=h.get_vector_from_control_value(h.get_control_value(ck))
            expected=[max(lo,min(hi,x)) for lo,hi,x in zip(c['minimum'],c['maximum'],v)]
            assert (got-unreal.Vector(*expected)).length()<1e-6
            report['limits'].append(dict(control=c['control'],input=v,actual=expected))
        for v in ((1,0,0),(0,1,0),(0,0,1)):
            helpers.solve(inst,h,{});p=h.get_global_transform(ck).translation
            helpers.solve(inst,h,{c['control']:v})
            err=(h.get_global_transform(ck).translation-p-unreal.Vector(*v)).length()
            report['handle_axis_error_cm']=max(report.get('handle_axis_error_cm',0),err)
    helpers.solve(inst,h,{})
    for b,t in neutral.items():update('return_neutral_',errors(h.get_global_transform(helpers.key(b)),t))
    report.update(source_cases=len(ref['samples']),source_mixed_cases=len(ref['mixed_samples']),regression_cases=len(previous),regression_mixed_cases=2*len(previous),passed=False)
    path=EVIDENCE/'validation.json'
    _fm_output(path).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    for prefix in ('source_','source_mixed_'):
        assert report[prefix+'position_cm']<0.001,(prefix,report)
        assert report[prefix+'rotation_deg']<0.005,(prefix,report)
        assert report[prefix+'scale_error']<1e-5,(prefix,report)
    for prefix in ('non_target_','repeat_','regression_','regression_mixed_','return_neutral_'):
        assert report[prefix+'position_cm']<1e-6,(prefix,report)
        assert report[prefix+'rotation_deg']<0.0001,(prefix,report)
        assert report[prefix+'scale_error']<1e-6,(prefix,report)
    assert report['handle_axis_error_cm']<1e-6
    assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
    report['passed']=True
    _fm_output(path).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='neutral_reference_differences'},ensure_ascii=False))
    return report


if __name__=='__main__':main()
