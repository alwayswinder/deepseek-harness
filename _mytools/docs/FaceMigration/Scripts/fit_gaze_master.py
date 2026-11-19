"""从总控样本分解目标点位移与眼周表达式；普通 Python / NumPy / SciPy。"""

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
ROOT=_fm_project()
OUT=_fm_tool('Docs/Evidence/GazeMaster')
def pos(t):return np.array(t['p'])*[1,-1,1]
def rot(t):return R.from_quat(np.array(t['q'])*[1,-1,1,1])
def main():
    ref=json.loads((_fm_read(_fm_saved('gaze_master_samples_raw.json'))).read_text(encoding='utf-8'))
    old=json.loads((_fm_read(_fm_tool('Docs/Evidence/Eyeballs/parameters.json'))).read_text(encoding='utf-8'))
    samples=ref['samples'];baseline=ref['baseline'];c=ref['controls'][2]
    matrix=np.column_stack([(pos(samples[ax*9+8]['handles'][c['source']])-pos(c['rest']))/10 for ax in range(3)])
    result=dict(source=c['source'],control='CTRL_EYEBALL_MASTER',display_name='双眼总控',control_rest=pos(c['rest']).tolist(),source_world_basis=matrix.tolist(),inverse_input_rows=np.linalg.inv(matrix).tolist(),sides=[],fit_errors={})
    for ci,s in enumerate(old['sides']):
        gs=[]
        for g in s['groups']:
            helper=g['helper'];pivot=np.array(s['pivot']);bones={}
            for b in g['bones']:
                terms=[]
                for ax in range(3):
                    for sg,idx in ((-1,0),(1,8)):
                        x=samples[ax*9+idx];delta=rot(x['helpers'][helper])*rot(ref['helper_rest'][helper]).inv()
                        pre=(delta.inv().apply(pos(x['bones'][b])-pivot)-(pos(baseline[b])-pivot))/(sg*10)
                        if np.linalg.norm(pre)>1e-5:terms.append(dict(axis=ax,sign=sg,p=pre.tolist()))
                bones[b]=terms
            gs.append(dict(group=g['group'],bones=bones))
        linear={}
        for b in s['linear_bones']:
            terms=[]
            for ax in range(3):
                for sg,idx in ((-1,0),(1,8)):
                    dp=(pos(samples[ax*9+idx]['bones'][b])-pos(baseline[b]))/(sg*10)
                    if np.linalg.norm(dp)>1e-5:terms.append(dict(axis=ax,sign=sg,p=dp.tolist()))
            linear[b]=terms
        result['sides'].append(dict(groups=gs,linear_bones=linear))
    # 确认总控父级平移与两个子目标的相对输入可直接相加。
    maxhandle=0.;maxhelper=0.;maxpos=0.
    for x in samples+ref['lid_samples']:
        for ci,s in enumerate(old['sides']):
            w=np.array(s['source_world_basis'])@x['inputs'][ci]+matrix@x['inputs'][2]
            maxhandle=max(maxhandle,np.linalg.norm(pos(x['handles'][s['source']])-pos(ref['controls'][ci]['rest'])-w))
            total=np.array(x['inputs'][ci])+np.array(x['inputs'][2])
            for gi,g in enumerate(s['groups']):
                up=g['group']=='upper';lid=x['inputs'][(3+ci) if up else (5+ci)][1]
                e=[total[2]*((1 if ci==0 else -1)*.01 if up else (-1 if ci==0 else 1)*.01),0 if up else total[2]*(1 if ci==0 else -1)*.007,total[1]*.01+lid*(.28 if up else -.29)]
                basis=R.from_quat(g['basis']);q=basis*R.from_euler('xyz',np.array(e)*g['euler_sign'])*basis.inv()
                actual=rot(x['helpers'][g['helper']])*rot(ref['helper_rest'][g['helper']]).inv()
                maxhelper=max(maxhelper,(q.inv()*actual).magnitude()*180/np.pi)
                if x in ref['lid_samples']:continue
                for b,terms in g['bones'].items():
                    pre=np.zeros(3)
                    for ts,inputs in ((terms,x['inputs'][ci]),(result['sides'][ci]['groups'][gi]['bones'][b],x['inputs'][2])):
                        for t in ts:pre+=np.array(t['p'])*(min(inputs[t['axis']],0) if t['sign']<0 else max(inputs[t['axis']],0))
                    pred=np.array(s['pivot'])+q.apply(pos(baseline[b])-s['pivot']+pre)
                    maxpos=max(maxpos,np.linalg.norm(pred-pos(x['bones'][b])))
    result['fit_errors']=dict(handle_cm=maxhandle,helper_deg=maxhelper,pre_expression_cm=maxpos)
    assert maxhandle<.001 and maxhelper<.001 and maxpos<.001,result['fit_errors']
    _fm_output(OUT).mkdir(parents=True,exist_ok=True)
    (_fm_output(OUT/'max_samples.json')).write_text(json.dumps(ref,ensure_ascii=False,indent=2),encoding='utf-8')
    (_fm_output(OUT/'parameters.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))
if __name__=='__main__':main()
