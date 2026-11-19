"""左右鼻侧的源全姿态、原控制与组合、限位及复位验证。"""

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
from slider_handle_layout import RAIL_CONTROL
ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()));E=_fm_tool('Docs/Evidence/NoseSides')
b=types.ModuleType('nose_sides');exec(compile((_fm_read(_fm_tool('Scripts/build_nose_side_controls.py'))).read_text(encoding='utf-8'),'nose_sides','exec'),b.__dict__)
def main():
    p=json.loads((_fm_read(E/'parameters.json')).read_text(encoding='utf-8'));ref=json.loads((_fm_read(E/'max_samples.json')).read_text(encoding='utf-8'));old=json.loads((_fm_read(E/'previous_controls.json')).read_text(encoding='utf-8'))
    rig=_fm_load_asset(b.ASSET);inst,h=b.instance(rig);b.solve(inst,h,{});neutral=b.packed(h)
    report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),asset=b.ASSET,nodes=len(rig.get_default_model().get_nodes()),controls=len(h.get_controls()),bones=len(h.get_bones()),curves=len(h.get_curves()),source_cases=len(ref['samples']),regression_cases=len(old['cases']),passed=False)
    rot_error=b.b.base.base.helper.rotation_error
    def errors(tf,t):return ((tf.translation-unreal.Vector(*t['p'])).length(),rot_error(tf.rotation,unreal.Quat(*t['q'])),(tf.scale3d-unreal.Vector(*t['scale'])).length())
    def update(pre,errs):
        for name,e in zip(('position_cm','rotation_deg','scale'),errs):report[pre+name]=max(report.get(pre+name,0),e)
    def mq(q):return unreal.Quat(q[0],-q[1],q[2],q[3])
    assert len(h.get_bones())==149 and len(h.get_curves())==28
    assert len({str(k.name) for k in h.get_controls()} - {RAIL_CONTROL})==73
    for hh in (rig.get_hierarchy(),h):
        for row in p['controls']:
            k=b.key(row['control'],unreal.RigElementType.CONTROL)
            assert hh.get_vector_from_control_value(hh.get_control_value(k,unreal.RigControlValueType.INITIAL)).length()<1e-7
            assert (hh.get_global_control_offset_transform(k,True).translation-unreal.Vector(*row['origin'])).length()<1e-5
    for sample in ref['samples']:
        right,left,nose=sample['inputs'];values={p['controls'][0]['control']:[0,0,10*right[1]],p['controls'][1]['control']:[0,0,10*left[1]],'CTRL_NOSE':[-10*nose[2],10*nose[0],10*nose[1]]}
        b.solve(inst,h,values);t=sample['bones']['bijian'];expected=dict(p=[t['p'][0],-t['p'][1],t['p'][2]],q=[t['q'][0],-t['q'][1],t['q'][2],t['q'][3]],scale=t['scale'])
        update('source_absolute_',errors(h.get_global_transform(b.key('bijian')),expected))
        for bone,n in neutral.items():
            if bone!='bijian':update('non_target_',errors(h.get_global_transform(b.key(bone)),n))
        assert max(abs(h.get_curve_value(k)) for k in h.get_curves())<1e-7
        actual=b.packed(h);assert inst.execute('Forwards Solve')
        for bone,t in actual.items():update('repeat_',errors(h.get_global_transform(b.key(bone)),t))
    for case in old['cases']:
        b.solve(inst,h,case['values'])
        for bone,t in case['bones'].items():update('regression_',errors(h.get_global_transform(b.key(bone)),t))
        for n,v in case['curves'].items():assert abs(h.get_curve_value(b.key(n,unreal.RigElementType.CURVE))-v)<1e-7
        for r,l in ((10,-10),(-6,3)):
            b.solve(inst,h,dict(case['values'],**{p['controls'][0]['control']:[0,0,r],p['controls'][1]['control']:[0,0,l]}))
            dq=unreal.Quat(0,math.sin(.01*(r-l)),0,math.cos(.01*(r-l)))
            for bone,t in case['bones'].items():
                want=dict(t)
                if bone=='bijian':
                    q=dq*unreal.Quat(*t['q']);want['q']=[q.x,q.y,q.z,q.w]
                update('mixed_',errors(h.get_global_transform(b.key(bone)),want))
            for n,v in case['curves'].items():assert abs(h.get_curve_value(b.key(n,unreal.RigElementType.CURVE))-v)<1e-7
    for row in p['controls']:
        k=b.key(row['control'],unreal.RigElementType.CONTROL)
        for v in ((-3,4,-20),(3,-4,20),(0,0,5)):
            b.solve(inst,h,{row['control']:v});got=h.get_vector_from_control_value(h.get_control_value(k));want=unreal.Vector(0,0,max(-10,min(10,v[2])))
            assert (got-want).length()<1e-6
            assert (h.get_global_transform(k).translation-unreal.Vector(*row['origin'])-want).length()<1e-5
    b.solve(inst,h,{p['controls'][0]['control']:[0,0,7],p['controls'][1]['control']:[0,0,7]})
    for bone,t in neutral.items():update('cancel_',errors(h.get_global_transform(b.key(bone)),t))
    h.reset_pose_to_initial(unreal.RigElementType.CONTROL);assert inst.execute('Forwards Solve')
    for bone,t in neutral.items():update('reset_',errors(h.get_global_transform(b.key(bone)),t))
    assert report['source_absolute_position_cm']<.001 and report['source_absolute_rotation_deg']<.001 and report['source_absolute_scale']<1e-5,report
    for prefix in ('non_target_','repeat_','regression_','mixed_','cancel_','reset_'):
        assert report[prefix+'position_cm']<1e-6 and report[prefix+'rotation_deg']<1e-4 and report[prefix+'scale']<1e-6,(prefix,report)
    report.update(passed=True,mixed_cases=2*len(old['cases']),limits_passed=True,initials_passed=True,reset_passed=True,matched_equal_inputs_cancel=True)
    (_fm_output(E/'validation.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False));return report
if __name__=='__main__':main()
