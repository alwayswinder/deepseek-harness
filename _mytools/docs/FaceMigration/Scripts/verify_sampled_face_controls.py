"""Verify this job's runtime asset against newly held-out Max samples."""
import json,math,time
import unreal
from face_paths import runtime_path,read_path,output_path
root=runtime_path('Evidence')
model=json.loads(read_path(root/'SourceModel/model.json').read_text(encoding='utf-8'))
expected=json.loads(read_path(root/'SourceModel/source_validation.json').read_text(encoding='utf-8'))
build=json.loads(read_path(root/'build_report.json').read_text(encoding='utf-8'))
asset=unreal.load_asset(model['target']['control_rig']);ed=asset.get_editor_asset();ed.recompile_vm()
host=ed.create_rig_vm_host();host.request_init();rh=host.get_hierarchy()
if not rh.get_all_keys():rh.copy_hierarchy(asset.hierarchy);host.request_init()
assert len(rh.get_all_keys())==len(asset.hierarchy.get_all_keys())
def key(name,kind):return unreal.RigElementKey(name=name,type=kind)
controls={b['ue_control']:key(b['ue_control'],unreal.RigElementType.CONTROL) for b in model['bindings']}
bones=[key(name,unreal.RigElementType.BONE) for name in expected['bones']]
for k in [*controls.values(),*bones]:assert rh.contains(k),str(k)
axis_map={(a['control'],a['axis']):i for i,a in enumerate(model['axes'])}
execute_times=[]
def apply(inputs):
 values={name:[0.,0.,0.] for name in controls}
 for ci,ai,raw in inputs:
  index=axis_map[(ci,ai)]
  mapping=build['control_axes'].get(str(index))
  if mapping:
   values[mapping['control']][mapping['axis']]=raw/model['axes'][index]['scale']*mapping['gain']*mapping['sign']
 for name,vector in values.items():rh.set_control_value(controls[name],rh.make_control_value_from_vector(unreal.Vector(*vector)))
 begin=time.perf_counter()
 assert host.execute('Forwards Solve')
 execute_times.append((time.perf_counter()-begin)*1000)
def quat_error(actual,expected):
 dot=abs(actual.x*expected[0]+actual.y*expected[1]+actual.z*expected[2]+actual.w*expected[3])
 norm=math.sqrt((actual.x**2+actual.y**2+actual.z**2+actual.w**2)*sum(v*v for v in expected))
 assert norm>1e-12,'Invalid quaternion'
 dot/=norm
 return math.degrees(2*math.acos(min(1.,max(0.,dot))))
def quaternion_components(q):return [q.x,q.y,q.z,q.w]
def quaternion_product(a,b):
 x,y,z,w=a;X,Y,Z,W=b
 return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z]
def motion_rotation_error(actual,initial,target,reference):
 aq=quaternion_components(actual.rotation);iq=quaternion_components(initial.rotation)
 delta=quaternion_product(aq,[-iq[0],-iq[1],-iq[2],iq[3]])
 expected_delta=quaternion_product(target['q'],[-reference['q'][0],-reference['q'][1],-reference['q'][2],reference['q'][3]])
 return quat_error(unreal.Quat(*delta),expected_delta)
rows=[];worst_position=0.;worst_rotation=0.;worst_scale=0.;worst_curve=0.
worst_motion_position=worst_motion_rotation=0.
start=time.monotonic()
try:
 apply([])
 actual_reference=[rh.get_global_transform(k) for k in bones]
 expected_reference=next(case for case in expected['cases'] if not case['inputs'])['bones']
 for case in expected['cases']:
  apply(case['inputs']);pos=rot=scale=curve=0.;worst_bone=''
  motion_position=motion_rotation=0.
  for k,target,initial,reference in zip(bones,case['bones'],actual_reference,expected_reference):
   actual=rh.get_global_transform(k)
   pe=(actual.translation-unreal.Vector(*target['p'])).length()*10
   qe=quat_error(actual.rotation,target['q'])
   se=(actual.scale3d-unreal.Vector(*target['s'])).length()
   motion_position=max(motion_position,((actual.translation-initial.translation)-(unreal.Vector(*target['p'])-unreal.Vector(*reference['p']))).length()*10)
   motion_rotation=max(motion_rotation,motion_rotation_error(actual,initial,target,reference))
   if pe>pos:worst_bone=str(k.name)
   pos=max(pos,pe);rot=max(rot,qe);scale=max(scale,se)
  for name,target in case['curves'].items():
   ck=key(name,unreal.RigElementType.CURVE);assert rh.contains(ck)
   curve=max(curve,abs(rh.get_curve_value(ck)-target))
  worst_position=max(worst_position,pos);worst_rotation=max(worst_rotation,rot);worst_scale=max(worst_scale,scale);worst_curve=max(worst_curve,curve)
  worst_motion_position=max(worst_motion_position,motion_position);worst_motion_rotation=max(worst_motion_rotation,motion_rotation)
  rows.append({'id':case['id'],'max_position_mm':pos,'max_rotation_degrees':rot,'max_motion_position_mm':motion_position,'max_motion_rotation_degrees':motion_rotation,'max_scale':scale,'max_curve':curve,'worst_position_bone':worst_bone})
 endpoint_lookup={(case['inputs'][0][0],case['inputs'][0][1],case['inputs'][0][2]):case for case in expected['cases'] if len(case['inputs'])==1}
 limit_rows=[]
 for ai,mapping in build['control_axes'].items():
  ai=int(ai);a=model['axes'][ai];bounds=model.get('wide_gaze_limits',{}).get(str(ai),[a['lo'],a['hi']])
  for side,bound in enumerate(bounds):
   endpoint=next(case for case in expected['cases'] if not case['inputs']) if abs(bound)<1e-12 else endpoint_lookup[(a['control'],a['axis'],bound)]
   outside=bound+(-1 if side==0 else 1)*max(bounds[1]-bounds[0],.1)*.2
   apply([[a['control'],a['axis'],outside]])
   pe=qe=ce=0.
   for k,target in zip(bones,endpoint['bones']):
    actual=rh.get_global_transform(k)
    pe=max(pe,(actual.translation-unreal.Vector(*target['p'])).length()*10);qe=max(qe,quat_error(actual.rotation,target['q']))
   for name,target in endpoint['curves'].items():ce=max(ce,abs(rh.get_curve_value(key(name,unreal.RigElementType.CURVE))-target))
   limit_rows.append({'control':mapping['control'],'source_axis':a['axis'],'source_input_outside_ui_range':outside,'clamped_source_input':bound,'position_mm':pe,'rotation_degrees':qe,'curve_error':ce})
 apply([])
 neutral=[rh.get_global_transform(k) for k in bones]
 for _ in range(5):assert host.execute('Forwards Solve')
 repeat=max((rh.get_global_transform(k).translation-t.translation).length() for k,t in zip(bones,neutral))*10
 repeat_rotation=max(quat_error(rh.get_global_transform(k).rotation,quaternion_components(t.rotation)) for k,t in zip(bones,neutral))
 head=key(model['target']['head_bone'],unreal.RigElementType.BONE)
 head_before=rh.get_global_transform(head)
 head_moved=unreal.Transform();head_moved.translation=head_before.translation+unreal.Vector(30,-20,12);head_moved.rotation=unreal.Rotator(15,35,8).quaternion()*head_before.rotation;head_moved.scale3d=head_before.scale3d
 rh.set_global_transform(head,head_moved,False,True)
 assert host.execute('Forwards Solve')
 follow_position=follow_rotation=0.
 for k,t in zip(bones,neutral):
  relative=unreal.MathLibrary.make_relative_transform(t,head_before)
  target=unreal.MathLibrary.compose_transforms(relative,head_moved)
  actual=rh.get_global_transform(k)
  follow_position=max(follow_position,(actual.translation-target.translation).length()*10)
  follow_rotation=max(follow_rotation,quat_error(actual.rotation,[target.rotation.x,target.rotation.y,target.rotation.z,target.rotation.w]))
 rh.set_global_transform(head,head_before,False,True);apply([])
 report={'target':asset.get_path_name(),'source_scene':expected['source_scene'],'copied_reference_rigs':False,'cases':len(rows),'controls':len(controls),'source_transform_nodes':len(model['neutral']),'max_position_mm':worst_position,'max_rotation_degrees':worst_rotation,'max_scale':worst_scale,'max_curve':worst_curve,'repeat_neutral_mm':repeat,'head_follow_position_mm':follow_position,'head_follow_rotation_degrees':follow_rotation,'seconds':time.monotonic()-start,'rows':rows,'scope':expected['range_notes']}
 report['passed']=worst_position<.05 and worst_rotation<.05 and worst_scale<.001 and worst_curve<.0001 and follow_position<.05 and follow_rotation<.05 and repeat<.01
 report['host_execute_mean_ms']=sum(execute_times)/len(execute_times)
 report['host_execute_max_ms']=max(execute_times)
 report['max_motion_position_mm']=worst_motion_position
 report['max_motion_rotation_degrees']=worst_motion_rotation
 report['passed']=report['passed'] and worst_motion_position<.05 and worst_motion_rotation<.05
 report['ui_limit_cases']=limit_rows
 report['repeat_neutral_rotation_degrees']=repeat_rotation
 report['passed']=report['passed'] and repeat_rotation<.01
 report['passed']=report['passed'] and all(r['position_mm']<.05 and r['rotation_degrees']<.05 and r['curve_error']<.0001 for r in limit_rows)
 phase_file=runtime_path('Temp/verify_phase.txt')
 phase=phase_file.read_text().strip() if phase_file.exists() else 'before_reload'
 assert phase in ('before_reload','after_reload')
 output_path(root/(phase+'_validation.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')
 print(json.dumps({k:v for k,v in report.items() if k not in ('rows','ui_limit_cases')}))
 assert report['passed'],'Current source-sample verification failed; see report'
finally:
 apply([])
