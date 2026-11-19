"""Finish source-relative gaze and presentation for a freshly sampled face rig."""
import datetime,json,shutil
from pathlib import Path
import unreal
from face_paths import runtime_path,output_path,read_path
root=runtime_path('Evidence')
model=json.loads(read_path(root/'SourceModel/model.json').read_text(encoding='utf-8'))
report=json.loads(read_path(root/'build_report.json').read_text(encoding='utf-8'))
asset=unreal.load_asset(model['target']['control_rig']);editor=asset.get_editor_asset();h=asset.hierarchy;c=editor.get_controller();g=editor.get_default_model()
assert not any(n.get_name().startswith('ExactAim_') for n in g.get_nodes()),'Aim extension is already present'
assert len(h.get_controls())==len(model['bindings'])==report['animation_controls']
backup=runtime_path('Backups/BeforeFinalize_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'));backup.mkdir(parents=True,exist_ok=True)
disk=Path(unreal.Paths.project_content_dir())/(model['target']['control_rig'][6:]+'.uasset')
shutil.copy2(disk,backup/'before.uasset')
def default(pin,value):assert c.set_pin_default_value(pin,str(value),True,False),(pin,value)
def link(src,dst):assert c.add_link(src,dst,False,create_cast_node=True),(src,dst)
extension_node_index=0
extension_y=(len(g.get_nodes())//12+2)*140
def node(cls,name=''):
 global extension_node_index
 position=unreal.Vector2D((extension_node_index%12)*260,extension_y+(extension_node_index//12)*140)
 extension_node_index+=1
 n=c.add_unit_node_from_struct_path(cls,node_name=name,position=position,setup_undo_redo=False);assert n,cls;return n.get_name()
def vector(v):return '(X=%.12g,Y=%.12g,Z=%.12g)'%tuple(v)
active=sorted({a[0] for output in model['outputs'] for term,coefficient in output for a in term})
clamps=[n.get_name() for n in g.get_nodes() if isinstance(n,unreal.RigVMUnitNode) and n.get_script_struct().get_path_name()=='/Script/RigVM.RigVMFunction_MathFloatClamp']
assert len(clamps)==len(active)
inputs=dict(zip(active,clamps))
# Derive the player's screen-right direction from the newly probed gaze targets.
# The source is mirrored into UE; this character faces +Y in component space.
screen_x_sign=-1.0 if sum(a['target_base'][1]+a['bone_tm'][3][1] for a in model['aims'])>0 else 1.0
slider_groups=('expressions','phonemes','eye_expressions')
first='Output_'+model['driven_bones'][0]+'.ExecutePin'
incoming=[lnk for lnk in g.get_links() if lnk.get_target_pin().get_pin_path()==first]
assert len(incoming)==1
previous=incoming[0].get_source_pin().get_pin_path()
editor.set_auto_vm_recompile(False)
try:
 assert c.break_link(previous,first,False)
 for aim in model['aims']:
  contributions=[]
  for term in aim['terms']:
   n=node('/Script/RigVM.RigVMFunction_MathVectorScale');default(n+'.Value',vector(term['coefficient']));link(inputs[term['input_axis']]+'.Result',n+'.Factor');contributions.append(n+'.Result')
  current=None
  for value in contributions:
   n=node('/Script/RigVM.RigVMFunction_MathVectorAdd')
   if current:link(current,n+'.A')
   else:default(n+'.A',vector(aim['target_base']))
   link(value,n+'.B');current=n+'.Result'
  get=node('/Script/ControlRig.RigUnit_GetTransform','ExactAim_Input_'+aim['bone']);default(get+'.Item.Type','Null');default(get+'.Item.Name','SRC_'+aim['bone'])
  solve=node('/Script/ControlRig.RigUnit_AimBoneMath','ExactAim_'+aim['bone']);link(get+'.Transform',solve+'.InputTransform')
  default(solve+'.Primary.Axis',vector(aim['primary_axis']));default(solve+'.Primary.Space','(Type=Null,Name="SRC_SPACE")');default(solve+'.Primary.Kind','Location');link(current,solve+'.Primary.Target')
  default(solve+'.Secondary.Axis',vector(aim['secondary_axis']));default(solve+'.Secondary.Target',vector(aim['up_vector']));default(solve+'.Secondary.Space','(Type=Null,Name="SRC_SPACE")');default(solve+'.Secondary.Kind','Direction')
  setnode=node('/Script/ControlRig.RigUnit_SetTransform','ExactAim_Output_'+aim['bone']);default(setnode+'.Item.Type','Null');default(setnode+'.Item.Name','SRC_'+aim['bone']);link(solve+'.Result',setnode+'.Value');link(previous,setnode+'.ExecutePin');previous=setnode+'.ExecutePin'
 link(previous,first)
 for ai,bounds in model['wide_gaze_limits'].items():
  ai=int(ai);a=model['axes'][ai];default(inputs[ai]+'.Minimum',bounds[0]/a['scale']);default(inputs[ai]+'.Maximum',bounds[1]/a['scale'])
 for ai,mapping in report['control_axes'].items():
  ai=int(ai);a=model['axes'][ai]
  if model['bindings'][a['control']]['group'] not in slider_groups:continue
  mapping['sign']*=screen_x_sign
  incoming=[lnk for lnk in g.get_links() if lnk.get_target_pin().get_pin_path()==inputs[ai]+'.Value']
  assert len(incoming)==1
  multiplier=incoming[0].get_source_pin().get_pin_path().rsplit('.',1)[0]
  default(multiplier+'.B',mapping['sign']/mapping['gain'])
 chin_ui_ratios={}
 for ai,mapping in report['control_axes'].items():
  ai=int(ai);a=model['axes'][ai]
  if model['bindings'][a['control']]['group']!='chin':continue
  gain=a['scale']/3.0
  ratio=gain/mapping['gain']
  incoming=[lnk for lnk in g.get_links() if lnk.get_target_pin().get_pin_path()==inputs[ai]+'.Value']
  assert len(incoming)==1
  source=incoming[0].get_source_pin().get_pin_path()
  assert c.break_link(source,inputs[ai]+'.Value',False)
  multiply=node('/Script/RigVM.RigVMFunction_MathFloatMul','ChinTravel_'+str(ai));link(source,multiply+'.A');default(multiply+'.B',1.0/ratio);link(multiply+'.Result',inputs[ai]+'.Value')
  mapping['gain']=gain
  chin_ui_ratios[(mapping['control'],mapping['axis'])]=ratio
 library=unreal.load_asset('/ControlRig/Controls/DefaultGizmoLibraryNormalized');assert library
 asset.set_editor_property('shape_libraries',[library])
 for b in model['bindings']:
  k=unreal.RigElementKey(name=b['ue_control'],type=unreal.RigElementType.CONTROL)
  settings=h.get_control_settings(k);slider=b['group'] in ('expressions','phonemes','eye_expressions')
  settings.shape_name='Circle_Thick' if slider else 'Sphere_Thin';settings.display_name=b['label']
  low=h.get_vector_from_control_value(settings.minimum_value);high=h.get_vector_from_control_value(settings.maximum_value)
  lo=[low.x,low.y,low.z];hi=[high.x,high.y,high.z]
  if slider:
   lo[0],hi[0]=min(lo[0]*screen_x_sign,hi[0]*screen_x_sign),max(lo[0]*screen_x_sign,hi[0]*screen_x_sign)
   offset=h.get_global_transform(k,True)
   offset.translation=unreal.Vector(offset.translation.x*screen_x_sign,offset.translation.y,offset.translation.z)
   head=unreal.RigElementKey(name=model['target']['head_bone'],type=unreal.RigElementType.BONE)
   offset=unreal.MathLibrary.make_relative_transform(offset,h.get_global_transform(head,True))
   for initial in (True,False):h.set_control_offset_transform(k,offset,initial)
  if b['group']=='chin':
   for axis in range(3):
    ratio=chin_ui_ratios.get((b['ue_control'],axis),1.0)
    lo[axis]*=ratio;hi[axis]*=ratio
  for ai,bounds in model['wide_gaze_limits'].items():
   ai=int(ai);a=model['axes'][ai]
   if model['bindings'][a['control']]['ue_control']!=b['ue_control']:continue
   mapping=report['control_axes'][str(ai)];v=[x/a['scale']*mapping['gain']*mapping['sign'] for x in bounds];lo[mapping['axis']]=min(v);hi[mapping['axis']]=max(v)
  settings.minimum_value=h.make_control_value_from_vector(unreal.Vector(*lo));settings.maximum_value=h.make_control_value_from_vector(unreal.Vector(*hi));h.get_controller().set_control_settings(k,settings,False)
  shape=unreal.Transform(scale=unreal.Vector(.3,.3,.3))
  if slider:shape.rotation=unreal.Rotator(0,0,90).quaternion()
  for initial in (True,False):h.set_control_shape_transform(k,shape,initial)
 editor.recompile_vm();assert unreal.EditorAssetLibrary.save_loaded_asset(asset,False)
 report.update({'nodes':len(g.get_nodes()),'exact_source_relative_aims':len(model['aims']),'wide_gaze_limits':model['wide_gaze_limits'],'shape_library':library.get_path_name(),'finalize_backup':str(backup),'screen_right_component_x_sign':screen_x_sign,'chin_ui_travel':'One third of the sampled source input travel, with inverse gain compensation.','layout':'Expressions/phonemes on player screen-right; eye expressions on screen-left; slider weights increase screen-left to screen-right.'})
 output_path(root/'build_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print('FINALIZED',len(g.get_nodes()),'nodes; exact source-relative gaze; normalized shapes')
finally:editor.set_auto_vm_recompile(True)
