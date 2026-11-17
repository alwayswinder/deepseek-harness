"""眼球/眼皮源对照，42 旧控与混合回归，独立实例与重复求解。"""

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
EVIDENCE=_fm_tool('Docs/Evidence/Eyeballs')
helpers=types.ModuleType('eyeball_helpers')
exec(compile((_fm_read(_fm_tool('Scripts/build_eyeball_controls.py'))).read_text(encoding='utf-8'),'build_eyeball_controls.py','exec'),helpers.__dict__)
def inverse(q):return unreal.Quat(-q.x,-q.y,-q.z,q.w)
def eulerq(e):
    x,y,z=[v*.5 for v in e];cx,cy,cz=math.cos(x),math.cos(y),math.cos(z);sx,sy,sz=math.sin(x),math.sin(y),math.sin(z)
    return unreal.Quat(sx*cy*cz-cx*sy*sz,cx*sy*cz+sx*cy*sz,cx*cy*sz-sx*sy*cz,cx*cy*cz+sx*sy*sz)
def main():
    params=json.loads((_fm_read(EVIDENCE/'parameters.json')).read_text(encoding='utf-8'));ref=json.loads((_fm_read(EVIDENCE/'max_samples.json')).read_text(encoding='utf-8'))
    captured=json.loads((_fm_read(EVIDENCE/'previous_controls.json')).read_text(encoding='utf-8'))
    previous=[dict(values=x['values'],bones=dict(captured['neutral'],**x['bones'])) for x in captured['cases']]+captured['lid_cases']
    rig=_fm_load_asset(helpers.ASSET);inst,h=helpers.instance(rig);helpers.solve(inst,h,{});neutral=helpers.packed(h);assert len(neutral)==149
    report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),asset=helpers.ASSET,status=str(rig.get_editor_property('status')),nodes=len(rig.get_default_model().get_nodes()),controls=len([k for k in h.get_all_keys() if k.type==unreal.RigElementType.CONTROL]),bones=len(neutral),worst={})
    rotation_error=helpers.base.base.helper.rotation_error
    def errors(actual,t):return ((actual.translation-unreal.Vector(*t['p'])).length(),rotation_error(actual.rotation,unreal.Quat(*t['q'])),(actual.scale3d-unreal.Vector(*t['scale'])).length())
    def update(prefix,errs,b=''):
        for k,e in zip(('position_cm','rotation_deg','scale_error'),errs):
            if e>report.get(prefix+k,-1):report[prefix+k]=e;report['worst'][prefix+k]=b
    def packtf(p,q,sc):return dict(p=[p.x,p.y,p.z],q=[q.x,q.y,q.z,q.w],scale=sc)
    def mq(q):return unreal.Quat(q[0],-q[1],q[2],q[3])
    eye_bones={'yanqiu_L','yanqiu_R','Eye_L01','Eye_R01'}
    upper_bones={b for s in params['sides'] for g in s['groups'] if g['group']=='upper' for b in g['bones']}
    for samples,prefix in ((ref['samples'],'source_'),(ref['lid_samples'],'lid_')):
        for sample in samples:
            helpers.solve(inst,h,helpers.input_values(sample,params))
            for b,t in sample['bones'].items():
                rest=ref['baseline'][b];ue=neutral[b];dp=[v-a for v,a in zip(t['p'],rest['p'])]
                q=mq(t['q'])*inverse(mq(rest['q']))*unreal.Quat(*ue['q'])
                expected=packtf(unreal.Vector(ue['p'][0]+dp[0],ue['p'][1]-dp[1],ue['p'][2]+dp[2]),q,ue['scale'])
                category=('eyes_' if b in eye_bones else 'upper_' if b in upper_bones else 'other_') if prefix=='lid_' else ''
                update(prefix+category,errors(h.get_global_transform(helpers.key(b)),expected),b)
                if prefix=='source_' and b not in params['bones']:update('non_target_',errors(h.get_global_transform(helpers.key(b)),ue),b)
            current=helpers.packed(h);assert inst.execute('Forwards Solve')
            for b,t in current.items():update('repeat_',errors(h.get_global_transform(helpers.key(b)),t),b)
    mixes=[{'CTRL_EYEBALL_L':[8,3,6],'CTRL_EYEBALL_R':[-6,-2,-7]},{'CTRL_EYEBALL_L':[-10,-4,-8],'CTRL_EYEBALL_R':[9,4,5]}]
    for case in previous:
        helpers.solve(inst,h,case['values'])
        for b,t in case['bones'].items():update('regression_',errors(h.get_global_transform(helpers.key(b)),t),b)
        for mix in mixes:
            helpers.solve(inst,h,mix);single=helpers.packed(h)
            expected={b:dict(t) for b,t in case['bones'].items()}
            for ci,s in enumerate(params['sides']):
                side='L' if ci==0 else 'R';w=mix[s['control']]
                source=[sum(a*b for a,b in zip(row,w)) for row in s['inverse_input_rows']]
                for b in ('yanqiu_'+side,'Eye_'+side+'01'):
                    expected[b]=dict(single[b])
                for b in s['linear_bones']:
                    expected[b]['p']=[a+v-n for a,v,n in zip(case['bones'][b]['p'],single[b]['p'],neutral[b]['p'])]
                for g in s['groups']:
                    upper=g['group']=='upper';name='CTRL_EYE_LID_'+side if upper else 'CTRL_EYE_LOWER_LID_'+side
                    v=case['values'].get(name,[0,0,0])[2]
                    lid=max(-1.75,min(0,v*.175)) if upper else max(-1.72,min(0,v*-.172))
                    sign=g['euler_sign'];basis=unreal.Quat(*g['basis']);e0=[0,0,lid*(.28 if upper else -.29)]
                    e=[source[2]*((1 if ci==0 else -1)*.01 if upper else (-1 if ci==0 else 1)*.01),0 if upper else source[2]*(1 if ci==0 else -1)*.007,source[1]*.01+e0[2]]
                    total=basis*eulerq([v*sign for v in e])*inverse(basis);old=basis*eulerq([v*sign for v in e0])*inverse(basis);adjust=total*inverse(old)
                    pivot=unreal.Vector(*s['pivot'])
                    for b,terms in g['bones'].items():
                        pre=unreal.Vector()
                        for t in terms:
                            value=min(source[t['axis']],0) if t['sign']<0 else max(source[t['axis']],0)
                            pre+=unreal.Vector(*t['p'])*value
                        tf=case['bones'][b]
                        p=pivot+adjust.rotate_vector(unreal.Vector(*tf['p'])-pivot)+total.rotate_vector(pre)
                        q=adjust*unreal.Quat(*tf['q']);expected[b]=packtf(p,q,tf['scale'])
            helpers.solve(inst,h,dict(case['values'],**mix))
            # SetTransform can retain a previous pose within 0.0001 per
            # component (FRigComputedTransform::Equals). Check that bound for
            # a warmed hierarchy, then check the formula in a fresh instance.
            fresh,fh=helpers.instance(rig);helpers.solve(fresh,fh,dict(case['values'],**mix))
            for b,t in helpers.packed(fh).items():
                actual=h.get_global_transform(helpers.key(b))
                update('warm_cache_',errors(actual,t),b)
                assert max(abs(v) for v in (actual.translation-unreal.Vector(*t['p'])).to_tuple())<.000101,b
                aq=[actual.rotation.x,actual.rotation.y,actual.rotation.z,actual.rotation.w]
                assert min(max(abs(a-v) for a,v in zip(aq,t['q'])),max(abs(a+v) for a,v in zip(aq,t['q'])))<.000101,b
                assert (actual.scale3d-unreal.Vector(*t['scale'])).length()<1e-6,b
            for b,t in expected.items():
                err=errors(fh.get_global_transform(helpers.key(b)),t)
                if err[1]>report.get('regression_mixed_rotation_deg',-1):
                    report['worst_mixed_case']=dict(values=case['values'],gaze=mix,bone=b,expected=t,actual=helpers.packed(fh)[b])
                update('regression_mixed_',err,b)
    report['unlimited_values']=[]
    for s in params['sides']:
        ck=helpers.key(s['control'],unreal.RigElementType.CONTROL)
        for value in ((-25,5,20),(25,-5,-20)):
            helpers.solve(inst,h,{s['control']:value});got=h.get_vector_from_control_value(h.get_control_value(ck));assert (got-unreal.Vector(*value)).length()<1e-6
            report['unlimited_values'].append(dict(control=s['control'],input=value))
        for value in ((1,0,0),(0,1,0),(0,0,1)):
            helpers.solve(inst,h,{});p=h.get_global_transform(ck).translation;helpers.solve(inst,h,{s['control']:value})
            report['handle_axis_error_cm']=max(report.get('handle_axis_error_cm',0),(h.get_global_transform(ck).translation-p-unreal.Vector(*value)).length())
    helpers.solve(inst,h,{})
    for b,t in neutral.items():update('return_neutral_',errors(h.get_global_transform(helpers.key(b)),t),b)
    report.update(source_cases=len(ref['samples']),source_lid_cases=len(ref['lid_samples']),regression_cases=len(previous),regression_mixed_cases=2*len(previous),warm_cache_component_tolerance=.0001,warm_cache_reference='FRigComputedTransform::Equals, RigHierarchyElements.h; fresh instances used for strict mixed formula checks',passed=False)
    path=EVIDENCE/'validation.json';_fm_output(path).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    for prefix in ('source_','lid_eyes_','lid_other_'):
        assert report[prefix+'position_cm']<.001,(prefix,report)
        assert report[prefix+'rotation_deg']<.001,(prefix,report)
        assert report[prefix+'scale_error']<1e-5,(prefix,report)
    # Preserve accepted upper-lid approximation; its inherited error is recorded explicitly.
    assert report['lid_upper_position_cm']<.05 and report['lid_upper_rotation_deg']<.5,report
    for prefix in ('non_target_','repeat_','regression_','regression_mixed_','return_neutral_'):
        assert report[prefix+'position_cm']<1e-6,(prefix,report)
        assert report[prefix+'rotation_deg']<1e-4,(prefix,report)
        assert report[prefix+'scale_error']<1e-6,(prefix,report)
    assert report['handle_axis_error_cm']<1e-6
    assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
    report['passed']=True;_fm_output(path).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False));return report
if __name__=='__main__':main()
