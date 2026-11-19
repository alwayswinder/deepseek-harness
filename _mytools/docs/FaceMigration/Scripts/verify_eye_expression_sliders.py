"""八个眼神：源 Morph、左右独立及组合、旧控与曲线、初始及行程检查。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import datetime,json,types
from pathlib import Path
import unreal
ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()));E=_fm_tool('Docs/Evidence/EyeExpressions')
b=types.ModuleType('builder');exec(compile((_fm_read(_fm_tool('Scripts/build_eye_expression_sliders.py'))).read_text(encoding='utf-8'),'builder','exec'),b.__dict__)

def main():
    p=json.loads((_fm_read(E/'parameters.json')).read_text(encoding='utf-8'));ref=json.loads((_fm_read(E/'max_samples.json')).read_text(encoding='utf-8'));old=json.loads((_fm_read(E/'previous_controls.json')).read_text(encoding='utf-8'))
    rig=_fm_load_asset(b.ASSET);inst,h=b.b.instance(rig);rows=p['rows'];curves=[m['name'] for r in rows for m in r['morphs']]
    animation_controls=[k for k in h.get_controls() if h.get_control_settings(k).animation_type!=unreal.RigControlAnimationType.VISUAL_CUE]
    assert len(animation_controls)>=70 and len(h.get_bones())==149
    report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),asset=b.ASSET,nodes=len(rig.get_default_model().get_nodes()),controls=len(h.get_controls()),bones=149,curve_count=len(h.get_curves()),curves=curves,source_cases=len(ref['samples']),regression_cases=len(old['cases']),source_curve_error=0,bone_position_error_cm=0,bone_rotation_error_deg=0,bone_scale_error=0,endpoint_error_cm=0,repeat_curve_error=0,passed=False)
    key=b.b.key;solve=b.b.solve;packed=b.b.packed
    def values(weights):return {r['control']:[v*p['travel_cm'],0,0] for r,v in zip(rows,weights)}
    def outputs():return {n:h.get_curve_value(key(n,unreal.RigElementType.CURVE)) for n in curves}
    def check_bones(expected):
        for bone,t in expected.items():
            tf=h.get_global_transform(key(bone));report['bone_position_error_cm']=max(report['bone_position_error_cm'],(tf.translation-unreal.Vector(*t['p'])).length());report['bone_rotation_error_deg']=max(report['bone_rotation_error_deg'],b.b.base.base.helper.rotation_error(tf.rotation,unreal.Quat(*t['q'])));report['bone_scale_error']=max(report['bone_scale_error'],(tf.scale3d-unreal.Vector(*t['scale'])).length())
    # 初始值先于主动清零检查。
    for hh in (rig.get_hierarchy(),h):
        for r in rows:
            ck=key(r['control'],unreal.RigElementType.CONTROL);v=hh.get_vector_from_control_value(hh.get_control_value(ck,unreal.RigControlValueType.INITIAL));assert v.length()<1e-7
            assert (hh.get_global_transform(ck,True).translation-unreal.Vector(*r['origin'])).length()<1e-5
    solve(inst,h,{});neutral=packed(h)
    for sample in ref['samples']:
        solve(inst,h,values(sample['weights']));actual=outputs();expected={m['name']:m['value']/100 for m in sample['morphs'] if m['name'] in curves}
        report['source_curve_error']=max(report['source_curve_error'],*(abs(actual[n]-expected[n]) for n in curves));check_bones(neutral)
        assert inst.execute('Forwards Solve');again=outputs();report['repeat_curve_error']=max(report['repeat_curve_error'],*(abs(actual[n]-again[n]) for n in curves))
    for ci,case in enumerate(old['cases']):
        solve(inst,h,case['values']);check_bones(case['bones']);assert max(abs(v) for v in outputs().values())<1e-7
        for n,v in case['curves'].items():assert abs(h.get_curve_value(key(n,unreal.RigElementType.CURVE))-v)<1e-7
        weights=[((ci+j*3)%11)/10 for j in range(12)];solve(inst,h,dict(case['values'],**values(weights)));check_bones(case['bones'])
        actual=outputs()
        for n,v in case['curves'].items():assert abs(h.get_curve_value(key(n,unreal.RigElementType.CURVE))-v)<1e-7
        for row,w in zip(rows,weights):
            for m in row['morphs']:assert abs(actual[m['name']]-w*m['gain'])<1e-6
    for row in rows:
        ck=key(row['control'],unreal.RigElementType.CONTROL)
        for x in (-10,0,4,8,20):
            solve(inst,h,{row['control']:[x,3,-2]});v=h.get_vector_from_control_value(h.get_control_value(ck));clamped=max(0,min(8,x));assert (v-unreal.Vector(clamped,0,0)).length()<1e-6
            want=unreal.Vector(*row['origin'])+unreal.Vector(clamped,0,0);report['endpoint_error_cm']=max(report['endpoint_error_cm'],(h.get_global_transform(ck).translation-want).length())
            for m in row['morphs']:assert abs(outputs()[m['name']]-clamped/8*m['gain'])<1e-6
    h.reset_pose_to_initial(unreal.RigElementType.CONTROL);assert inst.execute('Forwards Solve');assert max(abs(v) for v in outputs().values())<1e-7;check_bones(neutral)
    assert report['source_curve_error']<1e-6 and report['repeat_curve_error']<1e-7 and report['endpoint_error_cm']<1e-5
    assert report['bone_position_error_cm']<1e-6 and report['bone_rotation_error_deg']<1e-4 and report['bone_scale_error']<1e-6,report
    report.update(passed=True,mixed_cases=len(old['cases']),reset_passed=True,limits_passed=True)
    (_fm_output(E/'validation.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False));return report

if __name__=='__main__':main()
