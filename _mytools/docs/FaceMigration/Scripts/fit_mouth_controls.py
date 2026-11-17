"""拟合三嘴控分段平移与源 Euler 层，独立全样本验证旋转基变换。"""

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

ROOT=_fm_project()
OUT=_fm_tool('Docs/Evidence/MouthControls')


def main():
    ref=json.loads((_fm_read(_fm_saved('mouth_samples_raw.json'))).read_text(encoding='utf-8'))
    baseline=ref['baseline']; samples=ref['samples']
    convert=lambda v: np.asarray(v)*[1,-1,1]
    quat=lambda t: R.from_quat(np.asarray(t['q'])*[1,-1,1,1])
    controls=[]
    for ci,(name,label) in enumerate(zip(('CTRL_MOUTH_L','CTRL_MOUTH_R','CTRL_MOUTH'),('左嘴角','右嘴角','嘴部整体'))):
        c=ref['controls'][ci]
        # 世界轴手柄：左右嘴角共享竖直蓝轴；左右横向方向也保持一致。
        # Max L/center: UE=(-z,x,y)*10; Max R: UE=(z,-x,y)*10.
        sign=1 if ci==1 else -1
        lo=[10*min(sign*c['minimum'][2],sign*c['maximum'][2]),10*min(-sign*c['minimum'][0],-sign*c['maximum'][0]),10*c['minimum'][1]]
        hi=[10*max(sign*c['minimum'][2],sign*c['maximum'][2]),10*max(-sign*c['minimum'][0],-sign*c['maximum'][0]),10*c['maximum'][1]]
        controls.append(dict(control=name,display_name=label,source=c['source'],control_rest=convert(c['rest']['p']).tolist(),minimum=lo,maximum=hi,sign=sign))
    bones={}; max_p=max_q=max_e=0.
    for b,rest in baseline.items():
        moving=max(np.linalg.norm(np.asarray(s['bones'][b]['p'])-rest['p']) for s in samples)>1e-5
        rotating=max((quat(s['bones'][b])*quat(rest).inv()).magnitude() for s in samples)>1e-5
        if not moving and not rotating: continue
        terms=[]
        for ci in range(3):
            for ax in range(3):
                for si in (-1,1):
                    s=samples[(ci*3+ax)*9+(0 if si<0 else 8)]; val=s['inputs'][ci][ax]
                    dp=(convert(s['bones'][b]['p'])-convert(rest['p']))/val
                    de=(np.asarray(s['bones'][b].get('euler',[0,0,0]))-rest.get('euler',[0,0,0]))/val
                    if np.linalg.norm(dp)>1e-5 or np.linalg.norm(de)>1e-4:
                        terms.append(dict(ci=ci,axis=ax,sign=si,p=dp.tolist(),e=de.tolist()))
        data=dict(terms=terms,rotating=bool(rotating),kpoint=rest.get('kpoint'))
        if rotating:
            # q(v)=B*Euler_XYZ(v)*B^-1*q(0). Fit B and verify on all combined inputs.
            es=np.array([s['bones'][b]['euler'] for s in samples])-rest['euler']
            target=R.from_quat([quat(s['bones'][b]).as_quat() for s in samples])*quat(rest).inv()
            candidates=[]
            for order in ('xyz','XYZ'):
                for sign in (-1,1):
                    euler=R.from_euler(order,es*sign,degrees=True)
                    def fun(v):
                        basis=R.from_rotvec(v)
                        return ((basis*euler*basis.inv()).inv()*target).as_rotvec().ravel()
                    fit=least_squares(fun,[0.1,0.2,0.3],max_nfev=300)
                    error=np.linalg.norm(fun(fit.x).reshape(-1,3),axis=1).max()*180/np.pi
                    candidates.append((error,order,sign,R.from_rotvec(fit.x)))
            error,order,sign,basis=min(candidates,key=lambda x:x[0])
            assert error<0.005,(b,error)
            data.update(basis=basis.as_quat().tolist(),euler_order=order,euler_sign=sign,rotation_fit_error_deg=error)
            max_q=max(max_q,error)
        bones[b]=data
        for s in samples:
            pred=convert(rest['p']).copy(); e=np.zeros(3)
            for t in terms:
                v=s['inputs'][t['ci']][t['axis']]
                v=min(v,0) if t['sign']<0 else max(v,0)
                pred+=v*np.array(t['p']);e+=v*np.array(t['e'])
            max_p=max(max_p,np.linalg.norm(pred-convert(s['bones'][b]['p'])))
            if rotating: max_e=max(max_e,np.linalg.norm(e-(np.asarray(s['bones'][b]['euler'])-rest['euler'])))
    assert max_p<0.001 and max_e<0.001,(max_p,max_e)
    assert not any(s['morph_changes'] for s in samples+ref['mixed_samples'])
    p=dict(controls=controls,bones=bones,max_fit_position_error_cm=max_p,max_fit_rotation_error_deg=max_q,max_fit_euler_error_deg=max_e,
           source_cases=len(samples),mixed_source_cases=len(ref['mixed_samples']),bones_checked=len(baseline),morph_channels_checked=ref['morph_channels_checked'])
    _fm_output(OUT).mkdir(parents=True,exist_ok=True)
    (_fm_output(OUT/'parameters.json')).write_text(json.dumps(p,ensure_ascii=False,indent=2),encoding='utf-8')
    (_fm_output(OUT/'max_samples.json')).write_text(json.dumps(ref,ensure_ascii=False,indent=2),encoding='utf-8')
    print({k:v for k,v in p.items() if k not in ('controls','bones')})
    print({b:(len(d['terms']),d.get('euler_order'),d.get('euler_sign'),d.get('rotation_fit_error_deg')) for b,d in bones.items()})


if __name__=='__main__': main()
