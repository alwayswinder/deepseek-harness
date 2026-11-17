"""Build a fresh runtime rig from this job's newly sampled source transform model.

This builder never loads a reference Control Rig or historical numeric parameters.
The model includes the source's effective constraint hierarchy, not just its bones.
"""
import datetime,json,shutil
from pathlib import Path
import unreal
from face_paths import runtime_path,read_path,output_path

model=json.loads(read_path(runtime_path('Evidence/SourceModel/model.json')).read_text(encoding='utf-8'))
asset=unreal.load_asset(model['target']['control_rig'])
assert asset and isinstance(asset,unreal.ControlRigRuntimeAsset)
editor=asset.get_editor_asset();h=asset.hierarchy;hc=h.get_controller();g=editor.get_default_model();c=editor.get_controller()
assert not h.get_controls(), 'Only a fresh target is accepted'
assert len(g.get_nodes())==1, 'Refusing to replace an existing solve graph'
backup=runtime_path('Backups/SampledBuild_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'))
backup.mkdir(parents=True,exist_ok=True)
disk=Path(unreal.Paths.project_content_dir())/(model['target']['control_rig'][6:]+'.uasset')
if disk.exists():shutil.copy2(disk,backup/'disk.uasset')
assert unreal.EditorAssetLibrary.save_loaded_asset(asset,False)
shutil.copy2(disk,backup/'memory.uasset')
output_path(backup/'hierarchy.txt').write_text(hc.export_to_text(h.get_all_keys()))

def key(name,kind=unreal.RigElementType.NULL):return unreal.RigElementKey(name=name,type=kind)
def transform(d):
 t=unreal.Transform();t.translation=unreal.Vector(*d['p']);t.rotation=unreal.Quat(*d['q']);t.scale3d=unreal.Vector(*d['s']);return t
def text_transform(d):
 return '(Rotation=(X=%.12g,Y=%.12g,Z=%.12g,W=%.12g),Translation=(X=%.12g,Y=%.12g,Z=%.12g),Scale3D=(X=%.12g,Y=%.12g,Z=%.12g))'%tuple(d['q']+d['p']+d['s'])
def encode(t):return {'p':[t.translation.x,t.translation.y,t.translation.z],'q':[t.rotation.x,t.rotation.y,t.rotation.z,t.rotation.w],'s':[t.scale3d.x,t.scale3d.y,t.scale3d.z]}
def default(pin,val):
 value=str(val) if not isinstance(val,bool) else ('True' if val else 'False')
 assert c.set_pin_default_value(pin,value,True,False), (pin,val)
def link(src,dst):assert c.add_link(src,dst,False,create_cast_node=True),(src,dst)
counter=0
def node(cls,label=''):
 global counter
 counter+=1
 n=c.add_unit_node_from_struct_path(cls,position=unreal.Vector2D((counter%12)*260,(counter//12)*140),node_name=label,setup_undo_redo=False)
 assert n,cls
 return n.get_name()
def math(op,a,b=None):
 if not isinstance(a,str) and (b is None or not isinstance(b,str)):
  return {'Add':lambda:a+b,'Mul':lambda:a*b,'Abs':lambda:abs(a)}[op]()
 if op=='Add' and a==0:return b
 if op=='Add' and b==0:return a
 if op=='Mul' and (a==0 or b==0):return 0.0
 if op=='Mul' and a==1:return b
 if op=='Mul' and b==1:return a
 n=node('/Script/RigVM.RigVMFunction_MathFloat'+op)
 for pin,v in ([('Value',a)] if b is None else [('A',a),('B',b)]):
  if isinstance(v,str):link(v,n+'.'+pin)
  else:default(n+'.'+pin,format(v,'.12g'))
 return n+'.Result'
def sum_values(values):
 if not values:return 0.0
 while len(values)>1:values=[math('Add',values[i],values[i+1]) if i+1<len(values) else values[i] for i in range(0,len(values),2)]
 return values[0]
def set_value(pin,value):
 if isinstance(value,str):link(value,pin)
 else:default(pin,format(value,'.12g'))

editor.set_auto_vm_recompile(False)
try:
 head=key(model['target']['head_bone'],unreal.RigElementType.BONE)
 assert h.contains(head)
 anchor=hc.add_null('SRC_SPACE',head,unreal.Transform(),True,False)
 proxy={}
 for b,d in zip(model['reference']['bones'],model['neutral']):
  parent=proxy[b['parent']] if b['parent'] in proxy else anchor
  proxy[b['name']]=hc.add_null('SRC_'+b['name'],parent,transform(d),False,False)
 # Standard engine shapes only; no authored rig is read.
 library=unreal.load_asset('/ControlRig/Controls/DefaultGizmoLibrary')
 assert library
 asset.set_editor_property('shape_libraries',[library])
 shape_names=[str(s.shape_name) for s in library.get_editor_property('shapes')]
 shape=next((s for s in shape_names if s.lower()=='circle_thick'),shape_names[0])
 controls=[];control_axes={};inputs={};getters={}
 active_axes={term[0] for output in model['outputs'] for expression,coef in output for term in expression}
 source=model['source']['controls']
 for ci,b in enumerate(model['bindings']):
  settings=unreal.RigControlSettings()
  settings.control_type=unreal.RigControlType.POSITION
  settings.animation_type=unreal.RigControlAnimationType.ANIMATION_CONTROL
  settings.display_name=b['ue_control'];settings.shape_name=shape;settings.shape_visible=True
  settings.shape_color=unreal.LinearColor(0.1,0.45,1.0,1.0) if b['side']=='L' else unreal.LinearColor(1.0,0.18,0.1,1.0)
  axes=[(ai,a) for ai,a in enumerate(model['axes']) if a['control']==ci and ai in active_axes]
  slider=b['group'] in ('expressions','phonemes','eye_expressions')
  lo=[0.,0.,0.];hi=[0.,0.,0.]
  for ai,a in axes:
   ui_axis=0 if slider else a['axis'];gain=8.0 if slider else 1.0
   # Slider handles use the same positive, screen-right convention.
   sign=(-1.0 if a['hi']==0 else 1.0) if slider else source[ci]['input_signs'][a['axis']]
   lo[ui_axis]=min(a['lo']/a['scale']*gain*sign,a['hi']/a['scale']*gain*sign)
   hi[ui_axis]=max(a['lo']/a['scale']*gain*sign,a['hi']/a['scale']*gain*sign)
   control_axes[str(ai)]={'control':b['ue_control'],'axis':ui_axis,'gain':gain,'sign':sign}
  settings.minimum_value=h.make_control_value_from_vector(unreal.Vector(*lo));settings.maximum_value=h.make_control_value_from_vector(unreal.Vector(*hi))
  settings.limit_enabled=[unreal.RigControlLimitEnabled(minimum=True,maximum=True) for _ in range(3)]
  settings.draw_limits=True
  ctrl=hc.add_control(b['ue_control'],head,settings,h.make_control_value_from_vector(unreal.Vector()),False)
  controls.append(ctrl)
  tm=source[ci]['tm'];pos=[tm[3][0],-tm[3][1],tm[3][2]]
  if slider:
   group=b['group'];same=[bb for bb in model['bindings'][:ci] if bb['group']==group]
   index=len(same)
   if group=='eye_expressions':pos=[-22.0-(index//4)*11.0,15.0,166.0-(index%4)*3.0]
   else:pos=[16.0+(14.0 if group=='phonemes' else 0.0),15.0,174.0-index*3.0]
  global_offset=transform({'p':pos,'q':[0,0,0,1] if slider else source[ci]['parent_rotation'],'s':[1,1,1]})
  local_offset=unreal.MathLibrary.make_relative_transform(global_offset,h.get_global_transform(head,True))
  for initial in (True,False):
   h.set_control_offset_transform(ctrl,local_offset,initial)
   h.set_control_shape_transform(ctrl,unreal.Transform(scale=unreal.Vector(.35,.35,.35)),initial)
  get=node('/Script/ControlRig.RigUnit_GetControlVector','Input_'+b['role_id']);default(get+'.Control',b['ue_control']);default(get+'.Space','LocalSpace');getters[ci]=get
 for ai in sorted(active_axes):
  a=model['axes'][ai];mapping=control_axes[str(ai)]
  get=getters[a['control']]
  convert=node('/Script/RigVM.RigVMFunction_MathDoubleToFloat')
  link(get+'.Vector.'+'XYZ'[mapping['axis']],convert+'.Value')
  raw=math('Mul',convert+'.Result',mapping['sign']/mapping['gain'])
  clamp=node('/Script/RigVM.RigVMFunction_MathFloatClamp')
  set_value(clamp+'.Value',raw);default(clamp+'.Minimum',a['lo']/a['scale']);default(clamp+'.Maximum',a['hi']/a['scale'])
  inputs[ai]=clamp+'.Result'
 atoms={};terms={}
 def atom(ai,power,absolute):
  k=(ai,power,absolute)
  if k in atoms:return atoms[k]
  if absolute==2:
   gate=node('/Script/RigVM.RigVMFunction_MathFloatGreaterEqual');link(inputs[ai],gate+'.A');default(gate+'.B',model.get('gate_thresholds',{}).get(str(ai),-1e-9*model['axes'][ai]['scale'])/model['axes'][ai]['scale'])
   conv=node('/Script/RigVM.RigVMFunction_MathBoolToFloat');link(gate+'.Result',conv+'.Value');v=conv+'.Result'
  elif power==1:v=math('Abs',inputs[ai]) if absolute else inputs[ai]
  else:v=math('Mul',atom(ai,power-1,absolute),inputs[ai])
  atoms[k]=v;return v
 def term_value(term):
  k=tuple(tuple(a) for a in term)
  if k not in terms:
   v=1.0
   for ai,power,absolute in term:v=math('Mul',v,atom(ai,power,absolute))
   terms[k]=v
  return terms[k]
 def output(oi,base=0.0):return sum_values([base]+[math('Mul',term_value(t),coefficient) for t,coefficient in model['outputs'][oi]])
 execution=g.get_nodes()[0].get_name()+'.ExecutePin'
 for bi,(b,neutral) in enumerate(zip(model['reference']['bones'],model['neutral'])):
  if not any(model['outputs'][bi*10:bi*10+10]):continue
  n=node('/Script/ControlRig.RigUnit_SetTransform','SolveSource_'+b['name']);default(n+'.Item.Type','Null');default(n+'.Item.Name',str(proxy[b['name']].name));default(n+'.Space','LocalSpace');default(n+'.Value',text_transform(neutral))
  for j,axis in enumerate('XYZ'):set_value(n+'.Value.Translation.'+axis,output(bi*10+j,neutral['p'][j]))
  if any(model['outputs'][bi*10+3:bi*10+7]):
   rotations=[]
   for j,axis in enumerate('XYZ'):
    q=node('/Script/RigVM.RigVMFunction_MathQuaternionFromAxisAndAngle');default(q+'.Axis','(X=%d,Y=%d,Z=%d)'%tuple(int(i==j) for i in range(3)));set_value(q+'.Angle',output(bi*10+3+j));rotations.append(q+'.Result')
   mul_yx=node('/Script/RigVM.RigVMFunction_MathQuaternionMul');link(rotations[1],mul_yx+'.A');link(rotations[0],mul_yx+'.B')
   mul_zyx=node('/Script/RigVM.RigVMFunction_MathQuaternionMul');link(rotations[2],mul_zyx+'.A');link(mul_yx+'.Result',mul_zyx+'.B')
   mul=node('/Script/RigVM.RigVMFunction_MathQuaternionMul');default(mul+'.A','(X=%.12g,Y=%.12g,Z=%.12g,W=%.12g)'%tuple(neutral['q']));link(mul_zyx+'.Result',mul+'.B');link(mul+'.Result',n+'.Value.Rotation')
  for j,axis in enumerate('XYZ'):set_value(n+'.Value.Scale3D.'+axis,output(bi*10+7+j,neutral['s'][j]))
  link(execution,n+'.ExecutePin');execution=n+'.ExecutePin'
 # All contributions are resolved before writing real skeletal bones.
 for name in model['driven_bones']:
  bone=key(name,unreal.RigElementType.BONE);assert h.contains(bone)
  get=node('/Script/ControlRig.RigUnit_GetTransform','SourceResult_'+name);default(get+'.Item.Type','Null');default(get+'.Item.Name',str(proxy[name].name));default(get+'.Space','GlobalSpace')
  correction=unreal.MathLibrary.make_relative_transform(h.get_global_transform(bone,True),h.get_global_transform(proxy[name],True))
  mul=node('/Script/RigVM.RigVMFunction_MathTransformMul');default(mul+'.A',text_transform(encode(correction)));link(get+'.Transform',mul+'.B')
  setbone=node('/Script/ControlRig.RigUnit_SetTransform','Output_'+name);default(setbone+'.Item.Name',name);link(mul+'.Result',setbone+'.Value');link(execution,setbone+'.ExecutePin');execution=setbone+'.ExecutePin'
 offset=len(model['neutral'])*10;written=set()
 for ci,channel in enumerate(model['channels']):
  if not model['outputs'][offset+ci]:continue
  assert channel[2] not in written,'Duplicate animated curve source must be resolved explicitly'
  written.add(channel[2]);n=node('/Script/ControlRig.RigUnit_SetCurveValue','Curve_'+channel[2]);default(n+'.Curve',channel[2]);set_value(n+'.Value',output(offset+ci));link(execution,n+'.ExecutePin');execution=n+'.ExecutePin'
 editor.set_preview_mesh(unreal.load_asset(model['target']['skeletal_mesh']))
 editor.recompile_vm()
 assert len(h.get_controls())==len(model['bindings'])
 assert unreal.EditorAssetLibrary.save_loaded_asset(asset,False)
 report={'target':asset.get_path_name(),'source_scene':model['source']['scene'],'copied_reference_rigs':False,'animation_controls':len(controls),'source_transform_nodes':len(proxy),'nodes':len(g.get_nodes()),'driven_bones':model['driven_bones'],'curves':sorted(written),'control_axes':control_axes,'backup':str(backup),'validation':'pending'}
 output_path(runtime_path('Evidence/build_report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(report,ensure_ascii=False))
finally:editor.set_auto_vm_recompile(True)
