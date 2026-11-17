"""眼球注视目标、固定 up 轴、眼皮 Euler 枢轴及附加位置项分解。"""

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
OUT=_fm_tool('Docs/Evidence/Eyeballs')
def pos(t):return np.asarray(t['p'])*[1,-1,1]
def quat(t):return R.from_quat(np.asarray(t['q'])*[1,-1,1,1])
def aim(target,pivot,up):
    x=np.asarray(target)-pivot;x/=np.linalg.norm(x)
    y=np.cross(up,x);y/=np.linalg.norm(y)
    return R.from_matrix(np.column_stack((x,y,np.cross(x,y))))
def main():
    ref=json.loads((_fm_read(_fm_saved('eyeball_samples_raw.json'))).read_text())
    samples=ref['samples'];all_samples=samples+ref['lid_samples'];baseline=ref['baseline']
    moving=[b for b,t in baseline.items() if max(np.linalg.norm(pos(s['bones'][b])-pos(t)) for s in samples)>1e-5 or max((quat(s['bones'][b])*quat(t).inv()).magnitude() for s in samples)>1e-5]
    sides=[];fit_errors={}
    for ci,side in enumerate(('L','R')):
        c=ref['controls'][ci];bone='yanqiu_'+side;pivot=pos(baseline[bone])
        # Max parent row-vector matrix equals transpose of the mapped quaternion matrix.
        # Establish actual world input basis from measured handle samples.
        columns=[]
        for ax in range(3):
            s=samples[(ci*3+ax)*9+8]
            columns.append((pos(s['handles'][c['source']])-pos(c['rest']))/10)
        matrix=np.column_stack(columns)
        up=quat(ref['helper_rest']['Point514' if ci==0 else 'Point513']).apply([0,0,1])
        a0=aim(pos(c['rest']),pivot,up)
        error=max(((aim(pos(s['handles'][c['source']]),pivot,up)*a0.inv()*quat(baseline[bone])).inv()*quat(s['bones'][bone])).magnitude()*180/np.pi for s in samples)
        assert error<0.001,(side,error)
        fit_errors['aim_'+side+'_deg']=error
        data=dict(source=c['source'],control='CTRL_EYEBALL_'+side,display_name='左眼球' if ci==0 else '右眼球',control_rest=pos(c['rest']).tolist(),
                  source_world_basis=matrix.tolist(),inverse_input_rows=np.linalg.inv(matrix).tolist(),pivot=pivot.tolist(),up=up.tolist(),aim_rest_inverse=a0.inv().as_quat().tolist(),groups=[])
        for group,helper,bones in (
            ('upper','Point004' if ci==0 else 'Point164', ['Bone036','Bone037','Bone038'] if ci==0 else ['Bone027','Bone028','Bone029']),
            ('lower','Point162' if ci==0 else 'Point163', ['Bone039','Bone040','Bone041'] if ci==0 else ['Bone030','Bone031','Bone032'])):
            def euler(s):
                _,y,z=s['inputs'][ci]
                lid=s['inputs'][(3+ci) if group=='upper' else (5+ci)][1]
                if group=='upper':return np.array([(1 if ci==0 else -1)*z*.01,0,y*.01+lid*.28])
                return np.array([(-1 if ci==0 else 1)*z*.01,(1 if ci==0 else -1)*z*.007,y*.01-lid*.29])
            es=np.array([euler(s) for s in all_samples])
            target=R.from_quat([quat(s['helpers'][helper]).as_quat() for s in all_samples])*quat(ref['helper_rest'][helper]).inv()
            candidates=[]
            for sign in (-1,1):
                er=R.from_euler('xyz',es*sign)
                def fun(v):
                    b=R.from_rotvec(v)
                    return ((b*er*b.inv()).inv()*target).as_rotvec().ravel()
                fit=least_squares(fun,[.1,.2,.3],max_nfev=500)
                err=np.linalg.norm(fun(fit.x).reshape(-1,3),axis=1).max()*180/np.pi
                candidates.append((err,sign,R.from_rotvec(fit.x)))
            err,sign,basis=min(candidates,key=lambda x:x[0]);assert err<0.001,(side,group,err)
            fit_errors[group+'_'+side+'_deg']=err
            g=dict(group=group,helper=helper,basis=basis.as_quat().tolist(),euler_sign=sign,bones={})
            for b in bones:
                rest=pos(baseline[b]);terms=[]
                for ax in range(3):
                    for si in (-1,1):
                        s=samples[(ci*3+ax)*9+(0 if si<0 else 8)]
                        d=quat(s['helpers'][helper])*quat(ref['helper_rest'][helper]).inv()
                        pre=(d.inv().apply(pos(s['bones'][b])-pivot)-(rest-pivot))/(si*10)
                        if np.linalg.norm(pre)>1e-5:terms.append(dict(axis=ax,sign=si,p=pre.tolist()))
                error=0.
                for s in samples:
                    d=quat(s['helpers'][helper])*quat(ref['helper_rest'][helper]).inv()
                    pre=sum((np.array(t['p'])*(min(s['inputs'][ci][t['axis']],0) if t['sign']<0 else max(s['inputs'][ci][t['axis']],0)) for t in terms),np.zeros(3))
                    pred=pivot+d.apply(rest-pivot+pre)
                    error=max(error,np.linalg.norm(pred-pos(s['bones'][b])))
                assert error<0.001,(b,error)
                g['bones'][b]=terms;fit_errors[b+'_cm']=error
            data['groups'].append(g)
        linear={}
        excluded={bone,'Eye_'+side+'01'}|{b for g in data['groups'] for b in g['bones']}
        for b in moving:
            if b in excluded or not b.endswith(side) and not b in (['Bone044','Bone045'] if ci==0 else ['Bone042','Bone043']):continue
            if b in ('yanqiu_'+('R' if ci==0 else 'L'),'Eye_'+('R' if ci==0 else 'L')+'01'):continue
            terms=[]
            for ax in range(3):
                for si in (-1,1):
                    s=samples[(ci*3+ax)*9+(0 if si<0 else 8)]
                    dp=(pos(s['bones'][b])-pos(baseline[b]))/(si*10)
                    if np.linalg.norm(dp)>1e-5:terms.append(dict(axis=ax,sign=si,p=dp.tolist()))
            if terms:linear[b]=terms
        data['linear_bones']=linear;sides.append(data)
    p=dict(sides=sides,bones=moving,fit_errors=fit_errors,source_cases=len(samples),lid_cases=len(ref['lid_samples']),source_has_position_limits=False)
    _fm_output(OUT).mkdir(parents=True,exist_ok=True)
    (_fm_output(OUT/'parameters.json')).write_text(json.dumps(p,ensure_ascii=False,indent=2),encoding='utf-8')
    (_fm_output(OUT/'max_samples.json')).write_text(json.dumps(ref,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(bones=moving,fit_errors=fit_errors),ensure_ascii=False))
if __name__=='__main__':main()
