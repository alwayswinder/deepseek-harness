"""根据完整源姿态拟合左右鼻侧输入；普通 Python 执行。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json,math
from pathlib import Path
ROOT=_fm_project();E=_fm_tool('Docs/Evidence/NoseSides')
def mul(a,b):
    x,y,z,w=a;X,Y,Z,W=b
    return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z]
def mq(q):return [q[0],-q[1],q[2],q[3]]
def err(a,b):return math.degrees(2*math.acos(min(1,abs(sum(x*y for x,y in zip(a,b)))/math.sqrt(sum(v*v for v in a)*sum(v*v for v in b)))))
def main():
    s=json.loads((_fm_read(E/'max_samples.json')).read_text(encoding='utf-8'));base=s['baseline'];maxp=maxq=maxs=other=0
    for sample in s['samples']:
        r,l,n=sample['inputs'];angle=.2*(r[1]-l[1]);q=[0,math.sin(angle/2),0,math.cos(angle/2)]
        for bone,t in base['bones'].items():
            expected=[t['p'][0]-n[2],t['p'][1]-n[0],t['p'][2]+n[1]] if bone=='bijian' else t['p']
            dp=math.dist(expected,sample['bones'][bone]['p'])
            dq=err(mul(q,mq(t['q'])),mq(sample['bones'][bone]['q'])) if bone=='bijian' else err(t['q'],sample['bones'][bone]['q'])
            if bone=='bijian':maxp=max(maxp,dp);maxq=max(maxq,dq)
            else:other=max(other,dp,dq)
            maxs=max(maxs,math.dist(t['scale'],sample['bones'][bone]['scale']))
        assert all(abs(m['value']-bm['value'])<1e-7 for m,bm in zip(sample['morphs'],base['morphs']))
    assert maxp<.0001 and maxq<.0001 and other<.0001 and maxs<1e-5,(maxp,maxq,other,maxs)
    nose=json.loads((_fm_read(_fm_tool('Docs/Evidence/Nose/parameters.json'))).read_text(encoding='utf-8'));x,y,z=nose['control_rest']
    p=dict(asset=_fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation'),source_scene=s['scene'],source_layer=3,source_axis='Y',source_range=[-1,1],source_to_ui='UE.Z = Max.Y * 10',axis_rig_global=[0,1,0],radians_per_ui_unit=.02,bone='bijian',rotation_target='NOSE_MAKE_bijian.Rotation',minimum=[0,0,-10],maximum=[0,0,10],shape_diameter_cm=.8,controls=[dict(source='Animcraft_Right_Nose_Ctrl',control='CTRL_NOSE_SIDE_R',display_name='右鼻侧',sign=1,origin=[x-1.25,y,z-1.8],color=[.15,.85,1,1]),dict(source='Animcraft_Left_Nose_Ctrl',control='CTRL_NOSE_SIDE_L',display_name='左鼻侧',sign=-1,origin=[x+1.25,y,z-1.8],color=[.3,1,.55,1])])
    (_fm_output(E/'parameters.json')).write_text(json.dumps(p,ensure_ascii=False,indent=2),encoding='utf-8')
    report=dict(passed=True,samples=len(s['samples']),bones=len(base['bones']),morph_channels=len(base['morphs']),position_fit_error_cm=maxp,rotation_fit_error_deg=maxq,scale_error=maxs,other_bone_error=other,morphs_changed=False,raw_inputs_restored=True,formula='AngleRadians=0.2*(MaxRight.Y-MaxLeft.Y); UE delta around global +Y')
    (_fm_output(E/'source_validation.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(report)
if __name__=='__main__':main()
