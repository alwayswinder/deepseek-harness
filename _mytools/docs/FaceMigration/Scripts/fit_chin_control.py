"""分解 Line010 枢轴旋转、位置/朝向约束权重及局部表达式。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json
from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation as R
from scipy.optimize import least_squares
ROOT=_fm_project();OUT=_fm_tool('Docs/Evidence/Chin')
def pos(t):return np.array(t['p'])*[1,-1,1]
def rot(t):return R.from_quat(np.array(t['q'])*[1,-1,1,1])
def main():
    ref=json.loads((_fm_read(_fm_saved('chin_samples_raw.json'))).read_text(encoding='utf-8'));samples=ref['samples'];rest=ref['baseline'];hr=ref['helper_rest']
    candidates=[]
    es=np.array([[-s['inputs'][0][2]*.1,0,-s['inputs'][0][1]*.1] for s in samples]);target=R.from_quat([(rot(s['helpers']['100'])*rot(hr['100']).inv()).as_quat() for s in samples])
    for sign in (-1,1):
        er=R.from_euler('xyz',es*sign)
        def fun(v):
            basis=R.from_rotvec(v);return ((basis*er*basis.inv()).inv()*target).as_rotvec().ravel()
        fit=least_squares(fun,[.1,.2,.3],max_nfev=500);err=np.linalg.norm(fun(fit.x).reshape(-1,3),axis=1).max()*180/np.pi
        candidates.append((err,sign,R.from_rotvec(fit.x)))
    err,sign,basis=min(candidates,key=lambda t:t[0]);assert err<.001,err
    axes=[(0,1,8),(1,-1,9),(2,-1,18),(2,1,26)]
    dp100=np.column_stack([(pos(samples[idx]['helpers']['100'])-pos(hr['100']))/samples[idx]['inputs'][0][ax] for ax,_,idx in axes[:2]+axes[3:]])
    groups={'100':(1,1),'20':(.05,.03),'30':(.1,.2),'50':(.2,.4),'70':(.7,.8),'80':(.85,.9),'Point490':(1,1)}
    bones={};worstp=worstq=worstmix=0
    for bone,t in rest.items():
        moving=max(np.linalg.norm(pos(s['bones'][bone])-pos(t)) for s in samples)>1e-5
        rotating=max((rot(s['bones'][bone])*rot(t).inv()).magnitude() for s in samples)>1e-5
        if not moving and not rotating:continue
        fits=[]
        for helper in groups if rotating else [None]:
            ts=[]
            for ax,sg,idx in axes:
                s=samples[idx];val=s['inputs'][0][ax];dq=rot(s['helpers'][helper])*rot(hr[helper]).inv() if helper else R.identity()
                a=pos(hr[helper]) if helper else np.zeros(3);dp=pos(s['helpers'][helper])-a if helper else np.zeros(3)
                pre=(dq.inv().apply(pos(s['bones'][bone])-a-dp)-(pos(t)-a))/val
                if np.linalg.norm(pre)>1e-5:ts.append(dict(axis=ax,sign=sg,p=pre.tolist()))
            ep=eq=0
            for s in samples:
                dq=rot(s['helpers'][helper])*rot(hr[helper]).inv() if helper else R.identity();a=pos(hr[helper]) if helper else np.zeros(3);dp=pos(s['helpers'][helper])-a if helper else np.zeros(3)
                pre=sum((np.array(z['p'])*(min(s['inputs'][0][z['axis']],0) if z['sign']<0 else max(s['inputs'][0][z['axis']],0)) for z in ts),np.zeros(3))
                pred=a+dp+dq.apply(pos(t)-a+pre);ep=max(ep,np.linalg.norm(pred-pos(s['bones'][bone])));eq=max(eq,((dq*rot(t)).inv()*rot(s['bones'][bone])).magnitude()*180/np.pi)
            fits.append((ep+eq,helper,ts,ep,eq))
        _,helper,terms,ep,eq=min(fits,key=lambda x:x[0]);assert ep<.001 and eq<.001,(bone,helper,ep,eq)
        data=dict(helper=helper,terms=terms,source_rest=pos(t).tolist(),position_error_cm=ep,rotation_error_deg=eq)
        if helper:data.update(pivot=pos(hr[helper]).tolist(),position_weight=groups[helper][0],rotation_weight=groups[helper][1])
        bones[bone]=data;worstp=max(worstp,ep);worstq=max(worstq,eq)
        if helper:
            mixerr=0
            for s in ref['mixed_samples']:
                previous=s['without_chin']['bones'][bone];dq=rot(s['helpers'][helper])*rot(s['without_chin']['helpers'][helper]).inv();a=pos(hr[helper]);dp=pos(s['helpers'][helper])-pos(s['without_chin']['helpers'][helper])
                pre=sum((np.array(z['p'])*(min(s['inputs'][0][z['axis']],0) if z['sign']<0 else max(s['inputs'][0][z['axis']],0)) for z in terms),np.zeros(3))
                pred=a+dp+dq.apply(pos(previous)-a+pre);mixerr=max(mixerr,np.linalg.norm(pred-pos(s['bones'][bone])))
            data['mixed_formula_error_cm']=mixerr;worstmix=max(worstmix,mixerr)
    p=dict(source='Line010',control='CTRL_CHIN',display_name='下巴整体',control_rest=pos(ref['controls'][0]['rest']).tolist(),ui_units_per_source=10/3,minimum=[-10/3,0,-20],maximum=[10/3,50/3,0],source_minimum=ref['minimum'],source_maximum=ref['maximum'],euler_basis=basis.as_quat().tolist(),euler_sign=sign,helper_translation_matrix=dp100.tolist(),bones=bones,fit_errors=dict(position_cm=worstp,rotation_deg=worstq,helper_rotation_deg=err,mixed_formula_cm=worstmix))
    assert not any(s['morph_changes'] for s in samples+ref['mixed_samples'])
    _fm_output(OUT).mkdir(parents=True,exist_ok=True)
    (_fm_output(OUT/'parameters.json')).write_text(json.dumps(p,ensure_ascii=False,indent=2),encoding='utf-8');(_fm_output(OUT/'max_samples.json')).write_text(json.dumps(ref,ensure_ascii=False,indent=2),encoding='utf-8')
    print('fit',p['fit_errors']);print({b:(d['helper'],len(d['terms']),d.get('mixed_formula_error_cm')) for b,d in bones.items()})
if __name__=='__main__':main()
