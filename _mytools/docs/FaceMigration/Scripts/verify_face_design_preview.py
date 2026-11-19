"""Asynchronous real preview frames: fresh Max poses, mesh bones and final curves."""
import json,math,time,traceback
import unreal
from face_paths import runtime_path,read_path,output_path

class DesignPreview:
 def __init__(self):
  self.root=runtime_path('Evidence');self.plan=json.loads(read_path(self.root/'design_plan.json').read_text())
  self.expected=json.loads(read_path(self.root/'source_validation.json').read_text())
  self.adaptation=json.loads(read_path(self.root/'adaptation_report.json').read_text())
  self.asset=unreal.load_asset(self.plan['target']);candidates=[]
  for comp in unreal.ObjectIterator(unreal.SkeletalMeshComponent):
   if 'AnimationEditorPreviewActor' not in comp.get_path_name() or comp.get_skinned_asset()!=self.asset.get_editor_property('preview_skeletal_mesh'):continue
   anim=comp.get_anim_instance()
   if not anim:continue
   for host in unreal.RigVMHost.find_rig_vm_hosts(anim,unreal.ControlRig):
    if host.get_vm().get_outer()==self.asset:candidates.append((comp,host))
  assert len(candidates)==1,str(candidates)
  self.comp,self.host=candidates[0];self.h=self.host.get_hierarchy()
  assert len(self.h.get_controls())==73
  self.curves=json.loads(read_path(self.root/'solver_before.json').read_text())['curves']
  self.saved={str(k.name):self.h.get_control_value(k) for k in self.h.get_controls()}
  self.saved_curves={n:self.comp.get_anim_instance().get_curve_value(n) for n in self.curves}
  self.cases=[]
  for d in self.plan['controls']:
   cs=[c for c in self.expected['cases'] if set(c['values'])=={d['name']}]
   assert cs,d['name']
   self.cases.append(max(cs,key=lambda c:sum(abs(v) for v in c['values'][d['name']])))
  self.cases.extend(c for c in self.expected['cases'] if c['id'] in ('combination_0','combination_1','combination_2','neutral'))
  self.rows=[];self.index=0;self.frames=0;self.start=time.monotonic();self.start_time=self.host.get_absolute_time();self.last_time=self.start_time;self.restoring=False
  self.prefs=unreal.get_default_object(unreal.load_class(None,'/Script/UnrealEd.EditorPerformanceSettings'))
  self.old_throttle=self.prefs.get_editor_property('bThrottleCPUWhenNotForeground');self.old_update=self.comp.get_editor_property('update_animation_in_editor')
  self.prefs.set_editor_property('bThrottleCPUWhenNotForeground',False);self.comp.set_update_animation_in_editor(True)
  self.result={'pending':True,'passed':False,'target':self.plan['target'],'component':self.comp.get_path_name(),'rig':self.host.get_path_name()}
  self.write();self.apply(self.cases[0]['values']);self.handle=unreal.register_slate_post_tick_callback(self.tick)
 def key(self,name,kind=unreal.RigElementType.CONTROL):return unreal.RigElementKey(name=name,type=kind)
 def write(self):output_path(self.root/'preview_validation.json').write_text(json.dumps(self.result,indent=2))
 def apply(self,values):
  self.h.reset_pose_to_initial(unreal.RigElementType.CONTROL)
  for n,v in values.items():self.h.set_control_value(self.key(n),self.h.make_control_value_from_vector(unreal.Vector(*v)))
  self.host.request_run_once_event('Forwards Solve')
 def restore(self):
  for n,v in self.saved.items():self.h.set_control_value(self.key(n),v)
  self.host.request_run_once_event('Forwards Solve')
 def qerror(self,q,target):
  av=[q.x,q.y,q.z,q.w];dot=abs(sum(a*b for a,b in zip(av,target)))/math.sqrt(sum(a*a for a in av)*sum(a*a for a in target))
  return math.degrees(2*math.acos(min(1,max(0,dot))))
 def finish(self,error=None):
  self.restore();unreal.unregister_slate_post_tick_callback(self.handle)
  self.prefs.set_editor_property('bThrottleCPUWhenNotForeground',self.old_throttle);self.comp.set_update_animation_in_editor(self.old_update)
  self.result.update(pending=False,error=error,rows=self.rows,cases=len(self.rows),time_start=self.start_time,time_end=self.host.get_absolute_time(),seconds=time.monotonic()-self.start,editor_preferences_restored=True,inputs_restored=True,normal_editor_frames=True)
  active={str(n) for n in self.comp.get_anim_instance().get_active_curve_names(unreal.AnimCurveType.MORPH_TARGET_CURVE)}
  self.result['missing_morph_types']=sorted(set(self.curves)-active)
  self.result['passed']=not error and not self.result['missing_morph_types'] and len(self.rows)==len(self.cases) and self.result['time_end']>self.start_time and self.result.get('restored_curve_error',1)<1e-4 and all(r['position_mm']<.05 and r['rotation_degrees']<.05 and r['mesh_position_mm']<.05 and r['mesh_rotation_degrees']<.05 and r['curve_error']<1e-4 for r in self.rows)
  self.write()
 def tick(self,delta):
  try:
   if time.monotonic()-self.start>180:raise RuntimeError('Preview frames timed out')
   self.frames+=1;now=self.host.get_absolute_time()
   if self.frames<4 or now<=self.last_time:return
   self.last_time=now;self.frames=0
   if self.restoring:
    self.result['restored_curve_error']=max(abs(self.comp.get_anim_instance().get_curve_value(n)-v) for n,v in self.saved_curves.items())
    assert max((self.h.get_vector_from_control_value(self.h.get_control_value(self.key(n)))-self.h.get_vector_from_control_value(v)).length() for n,v in self.saved.items())<1e-6
    self.finish();return
   cs=self.cases[self.index];pe=qe=me=mq=0
   for name,t in zip(self.expected['bones'],cs['bones']):
    actual=self.h.get_global_transform(self.key(name,unreal.RigElementType.BONE));mesh=self.comp.get_socket_transform(name,unreal.RelativeTransformSpace.RTS_COMPONENT)
    pe=max(pe,(actual.translation-unreal.Vector(*t['p'])).length()*10);qe=max(qe,self.qerror(actual.rotation,t['q']))
    me=max(me,(mesh.translation-actual.translation).length()*10);mq=max(mq,self.qerror(mesh.rotation,[actual.rotation.x,actual.rotation.y,actual.rotation.z,actual.rotation.w]))
   ce=max(abs(self.comp.get_anim_instance().get_curve_value(n)-cs['curves'].get(n,0)) for n in self.curves)
   self.rows.append({'id':cs['id'],'controls':list(cs['values']),'time':now,'position_mm':pe,'rotation_degrees':qe,'mesh_position_mm':me,'mesh_rotation_degrees':mq,'curve_error':ce})
   self.index+=1
   if self.index==len(self.cases):self.restore();self.restoring=True
   else:self.apply(self.cases[self.index]['values'])
  except Exception:self.finish(traceback.format_exc())

_face_design_preview=DesignPreview()
print('Scheduled real preview validation and input restoration')
