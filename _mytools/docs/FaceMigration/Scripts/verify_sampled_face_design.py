"""Validate restored reference design and this job's fresh Max poses separately."""
import json,math,time,hashlib
import unreal
from face_paths import runtime_path,read_path,output_path,asset_path,project_root

def key(name,kind=unreal.RigElementType.CONTROL):return unreal.RigElementKey(name=name,type=kind)
def qerror(a,b):
 av=[a.x,a.y,a.z,a.w];bv=[b.x,b.y,b.z,b.w] if isinstance(b,unreal.Quat) else b
 dot=abs(sum(x*y for x,y in zip(av,bv)))/math.sqrt(sum(x*x for x in av)*sum(x*x for x in bv))
 return math.degrees(2*math.acos(min(1,max(0,dot))))
def main():
 root=runtime_path('Evidence');plan=json.loads(read_path(root/'design_plan.json').read_text(encoding='utf8'))
 expected=json.loads(read_path(root/'source_validation.json').read_text(encoding='utf8'))
 adaptation=json.loads(read_path(root/'adaptation_report.json').read_text(encoding='utf8'))
 target=unreal.load_asset(asset_path(plan['target']));source=unreal.load_asset(asset_path(plan['source']));ed=target.get_editor_asset()
 ed.recompile_vm();host=ed.create_rig_vm_host();host.request_init();h=host.get_hierarchy();sh=source.get_hierarchy()
 if not h.get_all_keys():h.copy_hierarchy(target.hierarchy);host.request_init()
 assert len(h.get_bones())==149 and len(h.get_controls())==73
 controls={d['name']:key(d['name']) for d in plan['controls']}
 def apply(values):
  h.reset_pose_to_initial(unreal.RigElementType.CONTROL)
  for n,v in values.items():h.set_control_value(controls[n],h.make_control_value_from_vector(unreal.Vector(*v)))
  assert host.execute('Forwards Solve')
 apply({})
 design=[]
 for sk in sh.get_controls():
  ss=sh.get_control_settings(sk);ts=h.get_control_settings(sk)
  errors=[]
  for field in ('control_type','animation_type','shape_name','display_name','draw_limits','primary_axis','shape_visible','filtered_channels'):
   if str(getattr(ss,field))!=str(getattr(ts,field)):errors.append(field)
  if max(abs(getattr(ss.shape_color,a)-getattr(ts.shape_color,a)) for a in ('r','g','b','a'))>1e-6:errors.append('shape_color')
  for field in ('minimum_value','maximum_value'):
   if (sh.get_vector_from_control_value(getattr(ss,field))-h.get_vector_from_control_value(getattr(ts,field))).length()>1e-5:errors.append(field)
  if [(v.minimum,v.maximum) for v in ss.limit_enabled]!=[(v.minimum,v.maximum) for v in ts.limit_enabled]:errors.append('limits')
  off_a,off_b=sh.get_global_control_offset_transform(sk,True),h.get_global_control_offset_transform(sk,True)
  shape_a,shape_b=sh.get_global_control_shape_transform(sk,True),h.get_global_control_shape_transform(sk,True)
  pe=(off_a.translation-off_b.translation).length();se=(shape_a.scale3d-shape_b.scale3d).length();qe=qerror(off_a.rotation,off_b.rotation)
  if pe>.0002 or se>.0001 or qe>.003:errors.append('display_transform')
  if h.get_vector_from_control_value(h.get_control_value(sk,unreal.RigControlValueType.INITIAL)).length()>1e-5:errors.append('initial_value')
  design.append({'control':str(sk.name),'errors':errors,'offset_error_cm':pe,'shape_scale_error':se,'rotation_error_degrees':qe})
 g=ed.get_default_model();links={(str(l.get_source_pin().get_pin_path()),str(l.get_target_pin().get_pin_path())) for l in g.get_links()}
 assert set(map(tuple,adaptation['old_execution_links'])).issubset(links)
 rail_count=len([n for n in g.get_nodes() if str(n.get_name()).endswith('_RAIL')])
 rails=[n for n in g.get_nodes() if str(n.get_name()).endswith('_RAIL')]
 reference_graph=source.get_default_model();rail_defaults_match=True
 for rail in rails:
  ref=reference_graph.find_node_by_name(rail.get_name())
  if not ref or any(rail.find_pin(p).get_default_value()!=ref.find_pin(p).get_default_value() for p in ('Points','Color','Thickness')):rail_defaults_match=False
 rail_head_links=all(('DESIGN_HEAD_DELTA.Result',str(n.get_name())+'.WorldOffset') in links for n in rails)
 library_paths=[x.get_path_name() for x in target.get_editor_property('shape_libraries')]
 libraries_match=library_paths==[x.get_path_name() for x in source.get_editor_property('shape_libraries')]
 layout={'passed':not any(r['errors'] for r in design) and rail_count==24 and rail_defaults_match and rail_head_links and libraries_match,'rows':design,'rails':rail_count,'rail_defaults_match':rail_defaults_match,'head_relative_rails':rail_head_links,'shape_libraries':library_paths,'libraries_match':libraries_match,'user_visual_acceptance':'pending','scope':'Asset settings and initial display transforms compared to reference; live picking and final image remain user acceptance.'}
 output_path(root/'layout_validation.json').write_text(json.dumps(layout,ensure_ascii=False,indent=2),encoding='utf8')
 active_curves=set(json.loads(read_path(root/'solver_before.json').read_text())['curves'])
 neutral_curves=expected['cases'][0]['curves']
 unbound=set(neutral_curves)-active_curves
 unbound_variation=max((abs(cs['curves'][n]-neutral_curves[n]) for cs in expected['cases'] for n in unbound),default=0)
 assert unbound_variation<1e-5,'Source controls drive curves missing from the current interface'
 bones=[key(n,unreal.RigElementType.BONE) for n in expected['bones']];rows=[];started=time.monotonic()
 for case in expected['cases']:
  apply(case['values']);pe=qe=se=ce=0.;worst=''
  for k,t in zip(bones,case['bones']):
   a=h.get_global_transform(k);err=(a.translation-unreal.Vector(*t['p'])).length()*10
   if err>pe:worst=str(k.name)
   pe=max(pe,err);qe=max(qe,qerror(a.rotation,t['q']));se=max(se,(a.scale3d-unreal.Vector(*t['s'])).length())
  for n,v in case['curves'].items():
   if n in active_curves:ce=max(ce,abs(h.get_curve_value(key(n,unreal.RigElementType.CURVE))-v))
  rows.append({'id':case['id'],'position_mm':pe,'rotation_degrees':qe,'scale':se,'curve':ce,'worst_bone':worst})
 apply({});neutral=[h.get_global_transform(k) for k in bones]
 for _ in range(5):assert host.execute('Forwards Solve')
 repeat=max((h.get_global_transform(k).translation-a.translation).length()*10 for k,a in zip(bones,neutral))
 head=key(plan['head_bone'],unreal.RigElementType.BONE);head_before=h.get_global_transform(head)
 moved=unreal.Transform();moved.translation=head_before.translation+unreal.Vector(30,-20,12);moved.rotation=unreal.Rotator(15,35,8).quaternion()*head_before.rotation;moved.scale3d=head_before.scale3d
 h.set_global_transform(head,moved,False,True);assert host.execute('Forwards Solve')
 follow=follow_q=0.;driven=set(json.loads(read_path(root/'solver_before.json').read_text())['driven_bones'])
 for k,a in zip(bones,neutral):
  if str(k.name) not in ('head',) and str(k.name) not in driven:continue
  desired=unreal.MathLibrary.compose_transforms(unreal.MathLibrary.make_relative_transform(a,head_before),moved)
  actual=h.get_global_transform(k);follow=max(follow,(actual.translation-desired.translation).length()*10);follow_q=max(follow_q,qerror(actual.rotation,desired.rotation))
 h.set_global_transform(head,head_before,False,True);apply({})
 source_disk=project_root()/'Content'/(plan['source'].removeprefix('/Game/')+'.uasset')
 unchanged=hashlib.sha256(source_disk.read_bytes()).hexdigest()==adaptation['source_sha256']
 report={'passed':all(r['position_mm']<.05 and r['rotation_degrees']<.05 and r['scale']<.001 and r['curve']<.0001 for r in rows) and repeat<.01 and follow<.05 and follow_q<.05 and unchanged,'cases':len(rows),'rows':rows,'max_position_mm':max(r['position_mm'] for r in rows),'max_rotation_degrees':max(r['rotation_degrees'] for r in rows),'max_curve_error':max(r['curve'] for r in rows),'neutral_repeat_mm':repeat,'head_follow_mm':follow,'head_follow_degrees':follow_q,'reference_unchanged':unchanged,'layout_settings_passed':layout['passed'],'seconds':time.monotonic()-started,'source_scene':expected['scene'],'source_frame':expected['frame'],'fresh_source_samples':True}
 report.update(animated_curves=sorted(active_curves),unbound_source_curve_variation=unbound_variation,constant_nonzero_unbound_source_curves={n:neutral_curves[n] for n in sorted(unbound) if abs(neutral_curves[n])>1e-6})
 phase_path=runtime_path('Temp/verify_phase.txt');phase=phase_path.read_text().strip() if phase_path.exists() else 'before_reload'
 assert phase in ('before_reload','after_reload')
 output_path(root/(phase+'_validation.json')).write_text(json.dumps(report,indent=2),encoding='utf8')
 print(json.dumps({k:v for k,v in report.items() if k!='rows'}))
 print('Design mismatches',[(r['control'],r['errors']) for r in design if r['errors']])
 assert report['passed'] and layout['passed'],'Review current reports before saving'
 return report

if __name__=='__main__':main()
