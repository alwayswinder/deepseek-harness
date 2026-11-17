"""双眼总控源全变换对照、旧控回归、混合公式及手柄父子关系。"""

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
ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()));E=_fm_tool('Docs/Evidence/GazeMaster')
v=types.ModuleType('eyeball_verify');exec(compile((_fm_read(_fm_tool('Scripts/verify_eyeball_controls.py'))).read_text(encoding='utf-8'),'eyes','exec'),v.__dict__)
b=v.helpers
def main():
    p=json.loads((_fm_read(E/'parameters.json')).read_text(encoding='utf-8'));old=json.loads((_fm_read(_fm_tool('Docs/Evidence/Eyeballs/parameters.json'))).read_text(encoding='utf-8'));ref=json.loads((_fm_read(E/'max_samples.json')).read_text(encoding='utf-8'));cap=json.loads((_fm_read(E/'previous_controls.json')).read_text(encoding='utf-8'))
    rig=_fm_load_asset(b.ASSET);inst,h=b.instance(rig)
    # Check authored defaults BEFORE solve(), which explicitly clears inputs.
    defaults=[]
    for label,hh in (('blueprint',rig.get_hierarchy()),('fresh_instance',h)):
        for s in old['sides']+[dict(control=p['control'],control_rest=p['control_rest'])]:
            ck=b.key(s['control'],unreal.RigElementType.CONTROL)
            value=hh.get_vector_from_control_value(hh.get_control_value(ck,unreal.RigControlValueType.INITIAL))
            position=hh.get_global_transform(ck,True).translation
            assert value.length()<1e-6,(label,s['control'],'initial value',value)
            assert (position-unreal.Vector(*s['control_rest'])).length()<1e-5,(label,s['control'],'initial position',position)
            defaults.append(dict(hierarchy=label,control=s['control'],initial_value=value.to_tuple(),initial_position=position.to_tuple()))
    h.reset_pose_to_initial(unreal.RigElementType.CONTROL);assert inst.execute('Forwards Solve')
    for s in old['sides']:
        ck=b.key(s['control'],unreal.RigElementType.CONTROL)
        assert (h.get_global_transform(ck).translation-unreal.Vector(*s['control_rest'])).length()<1e-5,s['control']
    reset_pose=b.packed(h);b.solve(inst,h,{});neutral=b.packed(h)
    report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),asset=b.ASSET,nodes=len(rig.get_default_model().get_nodes()),controls=len(h.get_controls()),bones=len(neutral),authored_defaults=defaults,reset_without_manual_zero_passed=True,worst={},passed=False)
    for bone,t in reset_pose.items():assert (unreal.Vector(*t['p'])-unreal.Vector(*neutral[bone]['p'])).length()<1e-6,bone
    re=b.base.base.helper.rotation_error
    def errors(tf,t):return ((tf.translation-unreal.Vector(*t['p'])).length(),re(tf.rotation,unreal.Quat(*t['q'])),(tf.scale3d-unreal.Vector(*t['scale'])).length())
    def update(pre,err,bone):
        for k,val in zip(('position_cm','rotation_deg','scale'),err):
            if val>report.get(pre+k,-1):report[pre+k]=val;report['worst'][pre+k]=bone
    def qmap(q):return unreal.Quat(q[0],-q[1],q[2],q[3])
    def pack(pos,q,sc):return dict(p=pos.to_tuple(),q=[q.x,q.y,q.z,q.w],scale=sc)
    eyes={'yanqiu_L','yanqiu_R','Eye_L01','Eye_R01'};upper={bone for s in old['sides'] for g in s['groups'] if g['group']=='upper' for bone in g['bones']}
    driven=[node.find_pin('Item').get_default_value().split('Name="')[1].split('"')[0] for node in rig.get_default_model().get_nodes() if str(node.get_name()).startswith(('BROW_SET_','EYE_SET_','LIP_SET_','CHEEK_SET_','NOSE_SET_','GAZE_SET_'))]
    def exact_instance(values):
        ri,rh=b.instance(rig)
        # Force driven writes beyond FRigComputedTransform::Equals tolerance;
        # inputs and initial transforms remain unchanged.
        for bone in driven:
            k=b.key(bone);tf=rh.get_global_transform(k);tf.translation+=unreal.Vector(1,1,1);rh.set_global_transform(k,tf,False,False)
        b.solve(ri,rh,values);return ri,rh
    def mapped(x):
        values=b.input_values(x,old);values[p['control']]=[sum(a*c for a,c in zip(row,x['inputs'][2])) for row in p['source_world_basis']];return values
    for samples,pre in ((ref['samples'],'source_'),(ref['lid_samples'],'lid_')):
        for sample in samples:
            b.solve(inst,h,mapped(sample))
            for bone,t in sample['bones'].items():
                rest=ref['baseline'][bone];n=neutral[bone];dp=[a-c for a,c in zip(t['p'],rest['p'])]
                q=qmap(t['q'])*v.inverse(qmap(rest['q']))*unreal.Quat(*n['q']);pos=unreal.Vector(n['p'][0]+dp[0],n['p'][1]-dp[1],n['p'][2]+dp[2])
                cat='eyes_' if bone in eyes else 'upper_' if bone in upper else 'other_'
                update(pre+cat,errors(h.get_global_transform(b.key(bone)),pack(pos,q,n['scale'])),bone)
            prior=b.packed(h);assert inst.execute('Forwards Solve')
            for bone,t in prior.items():update('repeat_',errors(h.get_global_transform(b.key(bone)),t),bone)
    def displacement(terms,src):
        d=unreal.Vector()
        for t in terms:d+=unreal.Vector(*t['p'])*(min(src[t['axis']],0) if t['sign']<0 else max(src[t['axis']],0))
        return d
    mixes=((-8,3,6),(7,-4,-5))
    for case in cap['cases']:
        b.solve(inst,h,case['values'])
        for bone,t in case['bones'].items():update('regression_',errors(h.get_global_transform(b.key(bone)),t),bone)
        without={n:x for n,x in case['values'].items() if n not in ('CTRL_EYEBALL_L','CTRL_EYEBALL_R')}
        fresh,fh=exact_instance(without);plain=b.packed(fh)
        for mix in mixes:
            expected={bone:dict(t) for bone,t in plain.items()};ms=[sum(a*c for a,c in zip(row,mix)) for row in p['inverse_input_rows']]
            for ci,s in enumerate(old['sides']):
                side='L' if ci==0 else 'R';world=case['values'].get(s['control'],[0,0,0]);src=[sum(a*c for a,c in zip(row,world)) for row in s['inverse_input_rows']];total=[a+c for a,c in zip(src,ms)]
                target=unreal.Vector(*s['control_rest'])+unreal.Vector(*world)+unreal.Vector(*mix);pivot=unreal.Vector(*s['pivot']);x=target-pivot;x=x/x.length();y=unreal.Vector(*s['up']).cross(x);y=y/y.length();z=x.cross(y)
                matrix=unreal.Matrix(x_plane=unreal.Plane(x.x,x.y,x.z,0),y_plane=unreal.Plane(y.x,y.y,y.z,0),z_plane=unreal.Plane(z.x,z.y,z.z,0),w_plane=unreal.Plane(0,0,0,1))
                aim=unreal.MathLibrary.conv_matrix_to_transform(matrix).rotation;dq=aim*unreal.Quat(*s['aim_rest_inverse'])
                for bone in ('yanqiu_'+side,'Eye_'+side+'01'):
                    n=neutral[bone];pos=unreal.Vector(*n['p'])
                    eye_pivot=rig.get_hierarchy().get_global_transform(b.key('yanqiu_'+side),True).translation
                    if bone.startswith('Eye_'):pos=eye_pivot+dq.rotate_vector(pos-eye_pivot)
                    expected[bone]=pack(pos,dq*unreal.Quat(*n['q']),n['scale'])
                for gi,g in enumerate(s['groups']):
                    up=g['group']=='upper';name=('CTRL_EYE_LID_' if up else 'CTRL_EYE_LOWER_LID_')+side;lv=without.get(name,[0,0,0])[2];lid=max(-1.75,min(0,lv*.175)) if up else max(-1.72,min(0,lv*-.172))
                    e0=[0,0,lid*(.28 if up else -.29)];e=[total[2]*((1 if ci==0 else -1)*.01 if up else (-1 if ci==0 else 1)*.01),0 if up else total[2]*(1 if ci==0 else -1)*.007,e0[2]+total[1]*.01];basis=unreal.Quat(*g['basis'])
                    q=basis*v.eulerq([a*g['euler_sign'] for a in e])*v.inverse(basis);q0=basis*v.eulerq([a*g['euler_sign'] for a in e0])*v.inverse(basis);adj=q*v.inverse(q0)
                    for bone,terms in g['bones'].items():
                        pre=displacement(terms,src)+displacement(p['sides'][ci]['groups'][gi]['bones'][bone],ms);n=plain[bone]
                        expected[bone]=pack(pivot+adj.rotate_vector(unreal.Vector(*n['p'])-pivot)+q.rotate_vector(pre),adj*unreal.Quat(*n['q']),n['scale'])
                for bone,terms in s['linear_bones'].items():
                    n=plain[bone];expected[bone]=pack(unreal.Vector(*n['p'])+displacement(terms,src)+displacement(p['sides'][ci]['linear_bones'][bone],ms),unreal.Quat(*n['q']),n['scale'])
            fresh,fh=exact_instance(dict(case['values'],**{p['control']:mix}))
            for bone,t in expected.items():
                err=errors(fh.get_global_transform(b.key(bone)),t)
                if err[0]>report.get('mixed_position_cm',-1):report['worst_mixed_position']=dict(bone=bone,values=case['values'],master=mix,expected=t,actual=b.packed(fh)[bone])
                update('mixed_',err,bone)
    for val in ((1,0,0),(0,1,0),(0,0,1),(-25,5,20),(25,-5,-20)):
        b.solve(inst,h,{p['control']:val});master=b.key(p['control'],unreal.RigElementType.CONTROL)
        assert (h.get_vector_from_control_value(h.get_control_value(master))-unreal.Vector(*val)).length()<1e-6
        for s in old['sides']:
            ck=b.key(s['control'],unreal.RigElementType.CONTROL);assert h.get_first_parent(ck).name==master.name and h.get_first_parent(ck).type==master.type
            err=(h.get_global_transform(ck).translation-unreal.Vector(*s['control_rest'])-unreal.Vector(*val)).length();report['handle_follow_cm']=max(report.get('handle_follow_cm',0),err)
    b.solve(inst,h,{})
    for bone,t in neutral.items():update('return_neutral_',errors(h.get_global_transform(b.key(bone)),t),bone)
    report.update(source_cases=len(ref['samples']),source_lid_cases=len(ref['lid_samples']),regression_cases=len(cap['cases']),mixed_cases=2*len(cap['cases']),mixed_method='Independent instances, driven current bone translations shifted by (1,1,1) before solving to force sub-tolerance writes; initial transforms and inputs unchanged')
    path=E/'validation.json'
    def write():_fm_output(path).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    write()
    for prefix in ('source_eyes_','source_upper_','source_other_','lid_eyes_','lid_other_'):
        assert report[prefix+'position_cm']<.001 and report[prefix+'rotation_deg']<.001,(prefix,report)
        assert report[prefix+'scale']<1e-5,(prefix,report)
    assert report['lid_upper_position_cm']<.05 and report['lid_upper_rotation_deg']<.5,report
    assert report['lid_upper_scale']<1e-5
    for prefix in ('regression_','mixed_','repeat_','return_neutral_'):
        assert report[prefix+'position_cm']<1e-6 and report[prefix+'rotation_deg']<1e-4 and report[prefix+'scale']<1e-6,(prefix,report)
    assert report['handle_follow_cm']<1e-5
    assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
    report['passed']=True;write();print(json.dumps(report,ensure_ascii=False));return report
if __name__=='__main__':main()
