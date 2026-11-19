"""下巴：源全骨/组合、旧45控、解析组合、初始值及重置验证。"""

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
ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()));E=_fm_tool('Docs/Evidence/Chin')
b=types.ModuleType('chin');exec(compile((_fm_read(_fm_tool('Scripts/build_chin_control.py'))).read_text(encoding='utf-8'),'chin','exec'),b.__dict__)
def inv(q):return unreal.Quat(-q.x,-q.y,-q.z,q.w)
def eulerq(e):
    x,y,z=[v*.5 for v in e];cx,cy,cz=math.cos(x),math.cos(y),math.cos(z);sx,sy,sz=math.sin(x),math.sin(y),math.sin(z)
    return unreal.Quat(sx*cy*cz-cx*sy*sz,cx*sy*cz+sx*cy*sz,cx*cy*sz-sx*sy*cz,cx*cy*cz+sx*sy*sz)
def scaleq(q,w):
    if q.w<0:q=unreal.Quat(-q.x,-q.y,-q.z,-q.w)
    theta=math.acos(max(-1,min(1,q.w)));s=math.sin(theta)
    if abs(s)<1e-10:return unreal.Quat(0,0,0,1)
    k=math.sin(theta*w)/s;return unreal.Quat(q.x*k,q.y*k,q.z*k,math.cos(theta*w))
def main():
    p=json.loads((_fm_read(E/'parameters.json')).read_text(encoding='utf-8'));ref=json.loads((_fm_read(E/'max_samples.json')).read_text(encoding='utf-8'));cap=json.loads((_fm_read(E/'previous_controls.json')).read_text(encoding='utf-8'))
    rig=_fm_load_asset(b.ASSET);model=rig.get_default_model();driven=[]
    for node in model.get_nodes():
        if str(node.get_name()).startswith(('BROW_SET_','EYE_SET_','LIP_SET_','CHEEK_SET_','NOSE_SET_','GAZE_SET_','CHIN_SET_')):driven.append(node.find_pin('Item').get_default_value().split('Name="')[1].split('"')[0])
    assert len(set(driven))==len(driven),'Duplicate bone writes'
    def exact(values):
        ri,rh=b.instance(rig)
        for bone in driven:
            k=b.key(bone);tf=rh.get_global_transform(k);tf.translation+=unreal.Vector(1,1,1);rh.set_global_transform(k,tf,False,False)
        b.solve(ri,rh,values);return ri,rh
    inst,h=exact({});neutral=b.packed(h);assert len(neutral)==149
    report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),asset=b.ASSET,status=str(rig.get_editor_property('status')),nodes=len(model.get_nodes()),controls=len(h.get_controls()),bones=149,driven_bones=len(driven),worst={},passed=False)
    re=b.base.base.helper.rotation_error
    def errors(tf,t):return ((tf.translation-unreal.Vector(*t['p'])).length(),re(tf.rotation,unreal.Quat(*t['q'])),(tf.scale3d-unreal.Vector(*t['scale'])).length())
    def update(pre,err,bone):
        for k,val in zip(('position_cm','rotation_deg','scale'),err):
            if val>report.get(pre+k,-1):report[pre+k]=val;report['worst'][pre+k]=bone
    def pack(pos,q,sc):return dict(p=pos.to_tuple(),q=[q.x,q.y,q.z,q.w],scale=sc)
    def mq(q):return unreal.Quat(q[0],-q[1],q[2],q[3])
    ck=b.key(p['control'],unreal.RigElementType.CONTROL)
    report['initials']=[]
    for label,hh in (('blueprint',rig.get_hierarchy()),('fresh',h)):
        value=hh.get_vector_from_control_value(hh.get_control_value(ck,unreal.RigControlValueType.INITIAL));pos=hh.get_global_transform(ck,True).translation
        assert value.length()<1e-6 and (pos-unreal.Vector(*p['control_rest'])).length()<1e-5
        report['initials'].append(dict(hierarchy=label,value=value.to_tuple(),position=pos.to_tuple()))
        for side in ('L','R'):
            eye=b.key('CTRL_EYEBALL_'+side,unreal.RigElementType.CONTROL);assert hh.get_vector_from_control_value(hh.get_control_value(eye,unreal.RigControlValueType.INITIAL)).length()<1e-6
    upper={f'Bone{i:03}' for i in (27,28,29,36,37,38)}
    for samples,pre in ((ref['samples'],'source_'),(ref['mixed_samples'],'source_mixed_')):
        for sample in samples:
            ri,rh=exact(b.inputs(sample))
            for bone,t in sample['bones'].items():
                n=neutral[bone];rest=ref['baseline'][bone];dp=[a-c for a,c in zip(t['p'],rest['p'])];pos=unreal.Vector(n['p'][0]+dp[0],n['p'][1]-dp[1],n['p'][2]+dp[2]);q=mq(t['q'])*inv(mq(rest['q']))*unreal.Quat(*n['q']);expected=pack(pos,q,n['scale'])
                category='upper_' if pre=='source_mixed_' and bone in upper else 'all_'
                err=errors(rh.get_global_transform(b.key(bone)),expected)
                if err[0]>report.get(pre+category+'position_cm',-1):report['worst_'+pre+category]=dict(bone=bone,input=sample['inputs'][0],expected=expected,actual=b.packed(rh)[bone])
                update(pre+category,err,bone)
                if pre=='source_' and bone not in p['bones']:update('non_target_',errors(rh.get_global_transform(b.key(bone)),n),bone)
            current=b.packed(rh);assert ri.execute('Forwards Solve')
            for bone,t in current.items():update('repeat_',errors(rh.get_global_transform(b.key(bone)),t),bone)
    eyes=json.loads((_fm_read(_fm_tool('Docs/Evidence/Eyeballs/parameters.json'))).read_text(encoding='utf-8'));master=json.loads((_fm_read(_fm_tool('Docs/Evidence/GazeMaster/parameters.json'))).read_text(encoding='utf-8'));lower=json.loads((_fm_read(_fm_tool('Docs/Evidence/XYP/parameters.json'))).read_text(encoding='utf-8'))
    lower_rotations={}
    for case in cap['cases']:
        b.solve(inst,h,case['values'])
        for bone,t in case['bones'].items():update('regression_',errors(h.get_global_transform(b.key(bone)),t),bone)
        # Exact original pose avoids inherited hierarchy cache deadbands.
        ri,rh=exact(case['values']);original=b.packed(rh)
        for old_ui in ((-6,30,-35),(7,15,-12)):
            units=p.get('ui_units_per_source',10.0);ui=[x*units/10 for x in old_ui]
            src=[ui[1]/units,ui[2]/units,-ui[0]/units];basis=unreal.Quat(*p['euler_basis']);q=basis*eulerq([-.1*src[2]*p['euler_sign'],0,-.1*src[1]*p['euler_sign']])*inv(basis)
            dp=unreal.Vector(*[sum(a*c for a,c in zip(row,src)) for row in p['helper_translation_matrix']]);expected={bone:dict(t) for bone,t in original.items()}
            for bone,d in p['bones'].items():
                pre=unreal.Vector()
                for t in d['terms']:pre+=unreal.Vector(*t['p'])*(min(src[t['axis']],0) if t['sign']<0 else max(src[t['axis']],0))
                t=original[bone];pos=unreal.Vector(*t['p']);oldq=unreal.Quat(*t['q'])
                if d['helper']:
                    dq=scaleq(q,d['rotation_weight']);off=unreal.Vector(*d['source_rest'])-unreal.Vector(*d['pivot']);np=unreal.Vector(*neutral[bone]['p']);pos=np+dp*d['position_weight']+dq.rotate_vector(pos-np+off+pre)-off;oldq=dq*oldq
                elif bone in ('Bone030','Bone031','Bone032','Bone039','Bone040','Bone041'):
                    side='R' if bone in ('Bone030','Bone031','Bone032') else 'L';ci=0 if side=='L' else 1;s=eyes['sides'][ci];g=s['groups'][1]
                    world=case['values'].get(s['control'],[0,0,0]);wm=case['values'].get(master['control'],[0,0,0]);sv=[sum(a*c for a,c in zip(row,world)) for row in s['inverse_input_rows']];mv=[sum(a*c for a,c in zip(row,wm)) for row in master['inverse_input_rows']];sv=[a+c for a,c in zip(sv,mv)]
                    lv=max(0,min(10,case['values'].get('CTRL_EYE_LOWER_LID_'+side,[0,0,0])[2]));lid=-.172*lv;e0=[0,0,-.29*lid];e=[sv[2]*(-1 if ci==0 else 1)*.01,sv[2]*(1 if ci==0 else -1)*.007,sv[1]*.01+e0[2]];bs=unreal.Quat(*g['basis']);total=bs*eulerq([a*g['euler_sign'] for a in e])*inv(bs);old=bs*eulerq([a*g['euler_sign'] for a in e0])*inv(bs)
                    ls=next(x for x in lower['sides'] if x['source_control']=='XYP_'+side+'001');axis=unreal.Vector(*ls['orbit_axis']);ang=ls['orbit_radians_full']*lv*.1;orbit=unreal.Quat(axis.x*math.sin(ang/2),axis.y*math.sin(ang/2),axis.z*math.sin(ang/2),math.cos(ang/2))
                    pos+=(total*inv(old)*orbit).rotate_vector(pre)
                else:pos+=pre
                expected[bone]=pack(pos,oldq,t['scale'])
            ri,rh=exact(dict(case['values'],**{p['control']:ui}))
            for bone,t in expected.items():
                err=errors(rh.get_global_transform(b.key(bone)),t)
                if err[0]>report.get('mixed_position_cm',-1):report['worst_mixed']=dict(bone=bone,values=case['values'],chin=ui,expected=t,actual=b.packed(rh)[bone])
                update('mixed_',err,bone)
    report['limits']=[]
    for value in ((-100,-100,-100),(100,100,100)):
        b.solve(inst,h,{p['control']:value});got=h.get_vector_from_control_value(h.get_control_value(ck));want=[max(lo,min(hi,v)) for lo,hi,v in zip(p['minimum'],p['maximum'],value)];assert (got-unreal.Vector(*want)).length()<1e-6;report['limits'].append(want)
    for val in ((1,0,0),(0,1,0),(0,0,-1)):
        b.solve(inst,h,{p['control']:val});err=(h.get_global_transform(ck).translation-unreal.Vector(*p['control_rest'])-unreal.Vector(*val)).length();report['handle_axis_error_cm']=max(report.get('handle_axis_error_cm',0),err)
    h.reset_pose_to_initial(unreal.RigElementType.CONTROL);assert inst.execute('Forwards Solve')
    assert h.get_vector_from_control_value(h.get_control_value(ck)).length()<1e-6
    for bone,t in neutral.items():update('reset_',errors(h.get_global_transform(b.key(bone)),t),bone)
    report.update(source_cases=len(ref['samples']),source_mixed_cases=len(ref['mixed_samples']),regression_cases=len(cap['cases']),mixed_cases=2*len(cap['cases']))
    def write():(_fm_output(E/'validation.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    write()
    for prefix in ('source_all_','source_mixed_all_'):
        assert report[prefix+'position_cm']<.001 and report[prefix+'rotation_deg']<.001 and report[prefix+'scale']<1e-5,(prefix,report)
    assert report['source_mixed_upper_position_cm']<.05 and report['source_mixed_upper_rotation_deg']<.5
    for prefix in ('non_target_','repeat_','regression_','mixed_','reset_'):
        assert report[prefix+'position_cm']<1e-6 and report[prefix+'rotation_deg']<1e-4 and report[prefix+'scale']<1e-6,(prefix,report)
    assert report['handle_axis_error_cm']<1e-5
    assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
    report['passed']=True;write();print(json.dumps({k:v for k,v in report.items() if not k.startswith('worst')},ensure_ascii=False));return report
if __name__=='__main__':main()
