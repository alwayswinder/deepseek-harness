"""Incrementally apply a reviewed reference design to an existing sampled solver.

Requires this job's design_plan.json, solver_before.json and fresh Max expectations.
The plan contains explicit source-input matrices; it is not an automatic retargeter.
"""
import datetime,hashlib,json,shutil
from pathlib import Path
import unreal
from face_paths import runtime_path,read_path,output_path,asset_path,project_root

root=runtime_path('Evidence')
plan=json.loads(read_path(root/'design_plan.json').read_text(encoding='utf8'))
before=json.loads(read_path(root/'solver_before.json').read_text(encoding='utf8'))
assert read_path(root/'source_validation.json').is_file(),'Fresh Max samples are required'
source=unreal.load_asset(asset_path(plan['source']));target=unreal.load_asset(asset_path(plan['target']))
assert source and target and source!=target and isinstance(target,unreal.ControlRigRuntimeAsset)
editor=target.get_editor_asset();h=target.hierarchy;hc=h.get_controller();sh=source.get_hierarchy()
g=editor.get_default_model();c=editor.get_controller(g)
assert not any(str(n.get_name()).startswith('DESIGN_') for n in g.get_nodes()),'Design already adapted; compare and edit incrementally'
assert len(g.get_nodes())==before['nodes'],'Target changed since the reviewed baseline'
def key(name,kind=unreal.RigElementType.CONTROL):return unreal.RigElementKey(name=name,type=kind)
def vectors(hierarchy):
 return {str(k.name):list(hierarchy.get_vector_from_control_value(hierarchy.get_control_value(k)).to_tuple()) for k in hierarchy.get_controls() if hierarchy.get_control_settings(k).control_type==unreal.RigControlType.POSITION}
def links():return [(str(l.get_source_pin().get_pin_path()),str(l.get_target_pin().get_pin_path())) for l in g.get_links()]
oldlinks=links();oldexec=[x for x in oldlinks if 'Execute' in x[1]]
preview=[]
for comp in unreal.ObjectIterator(unreal.SkeletalMeshComponent):
 if 'AnimationEditorPreviewActor' not in comp.get_path_name():continue
 anim=comp.get_anim_instance()
 if not anim:continue
 for host in unreal.RigVMHost.find_rig_vm_hosts(anim,unreal.ControlRig):
  if host.get_vm().get_outer()==target:preview.append({'component':comp.get_path_name(),'rig':host.get_path_name(),'values':vectors(host.get_hierarchy())})
backup=output_path(runtime_path('Backups/ReferenceDesign_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S')))
backup.mkdir(parents=True,exist_ok=False)
def disk(package):return project_root()/'Content'/(package.removeprefix('/Game/')+'.uasset')
source_hash=hashlib.sha256(disk(plan['source']).read_bytes()).hexdigest()
shutil.copy2(disk(plan['target']),backup/'disk_before.uasset')
assert unreal.EditorAssetLibrary.save_loaded_asset(target,False)
shutil.copy2(disk(plan['target']),backup/'memory_before.uasset')
(backup/'hierarchy.txt').write_text(hc.export_to_text(h.get_all_keys()),encoding='utf8')
(backup/'graph.txt').write_text(c.export_nodes_to_text([n.get_fname() for n in g.get_nodes()]),encoding='utf8')
(backup/'preview.json').write_text(json.dumps({'asset_values':vectors(h),'instances':preview},indent=2),encoding='utf8')
sub=unreal.get_editor_subsystem(unreal.AssetEditorSubsystem);sub.close_all_editors_for_asset(target)
rows={r['name']:r for r in plan['controls']}
def remap(values):
 raw={n:[0.,0.,0.] for n in rows}
 for ai,mapping in before['control_axes'].items():
  a=plan['source_axes'][int(ai)];raw[mapping['control']][a['axis']]=values.get(mapping['control'],[0,0,0])[mapping['axis']]/mapping['gain']*mapping['sign']*a['scale']
 return {name:[sum(row[j]*v[j] for j in range(3)) for row in rows[name]['inverse']] for name,v in raw.items()}
restore_values=remap(preview[-1]['values'] if preview else vectors(h))
report={'source':plan['source'],'target':plan['target'],'backup':str(backup),'source_sha256':source_hash,'nodes_before':len(g.get_nodes()),'old_execution_links':oldexec,'restore_values':restore_values,'passed':False}
output_path(root/'adaptation_report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
def default(pin,value):assert c.set_pin_default_value(pin,str(value),True,False),pin
def link(a,b):assert c.add_link(a,b,False,create_cast_node=True),(a,b)
count=0
def unit(struct,label):
 global count
 count+=1
 n=c.add_unit_node_from_struct_path('/Script/RigVM.RigVMFunction_'+struct,position=unreal.Vector2D(-3000,(count//5)*110),node_name='DESIGN_'+label+'_'+str(count),setup_undo_redo=False)
 assert n,struct
 return str(n.get_name())
auto=editor.get_auto_vm_recompile();editor.set_auto_vm_recompile(False)
try:
 with unreal.ScopedEditorTransaction('Restore authored face design with source input conversion'):
  target.modify();editor.modify()
  target.set_editor_property('shape_libraries',source.get_editor_property('shape_libraries'))
  head=key(plan['head_bone'],unreal.RigElementType.BONE)
  for sk in sh.get_controls():
   st=sh.get_control_settings(sk);parent=sh.get_first_parent(sk)
   if parent.type==unreal.RigElementType.BONE:parent=head
   if not h.contains(sk):
    assert st.animation_type==unreal.RigControlAnimationType.VISUAL_CUE,'Unmapped animation interface'
    hc.add_control(sk.name,parent,st,sh.get_control_value(sk,unreal.RigControlValueType.INITIAL),False)
   else:
    current_parent=h.get_first_parent(sk)
    if str(current_parent.name)!=str(parent.name) or current_parent.type!=parent.type:
     assert hc.set_parent(sk,parent,True,False,False),(str(sk.name),str(parent.name))
    h.set_control_settings(sk,st)
   for initial in (True,False):
    h.set_control_value(sk,sh.get_control_value(sk,unreal.RigControlValueType.INITIAL),unreal.RigControlValueType.INITIAL)
    h.set_control_value(sk,sh.get_control_value(sk,unreal.RigControlValueType.INITIAL))
    off=unreal.MathLibrary.make_relative_transform(sh.get_global_control_offset_transform(sk,True),h.get_global_transform(parent,True))
    h.set_control_offset_transform(sk,off,initial,True)
    shape=unreal.MathLibrary.make_relative_transform(sh.get_global_control_shape_transform(sk,True),sh.get_global_transform(sk,True))
    h.set_control_shape_transform(sk,shape,initial)
  # Rewire each existing normalized source input. Retain every solver/output node.
  rewired=[]
  adjacency={}
  for a,b in oldlinks:adjacency.setdefault(a.split('.')[0],[]).append((a,b))
  for ai,mapping in before['control_axes'].items():
   a=plan['source_axes'][int(ai)];row=rows[mapping['control']];getter='Input_'+row['role_id']
   start=getter+'.Vector.'+'XYZ'[mapping['axis']]
   todo=[b.split('.')[0] for src,b in oldlinks if src==start];seen=set();clamps=[]
   while todo:
    name=todo.pop(0)
    if name in seen:continue
    seen.add(name);node=g.find_node_by_name(name)
    if node and node.find_pin('Minimum') and node.find_pin('Maximum') and node.find_pin('Value'):
     clamps.append(name);continue
    assert len(seen)<12,'Ambiguous source input chain'
    todo.extend(b.split('.')[0] for src,b in adjacency.get(name,[]))
   assert len(clamps)==1,(ai,start,clamps)
   clamp=clamps[0];terms=[]
   for axis,coef in enumerate(row['matrix'][a['axis']]):
    if abs(coef)<1e-12:continue
    conv=unit('MathDoubleToFloat',str(ai)+'_Axis'+str(axis));link(getter+'.Vector.'+'XYZ'[axis],conv+'.Value')
    mul=unit('MathFloatMul',str(ai)+'_Gain'+str(axis));link(conv+'.Result',mul+'.A');default(mul+'.B',format(coef/a['scale'],'.12g'));terms.append(mul+'.Result')
   while len(terms)>1:
    n=unit('MathFloatAdd',str(ai)+'_Sum');link(terms.pop(0),n+'.A');link(terms.pop(0),n+'.B');terms.append(n+'.Result')
   for src,dst in oldlinks:
    if dst==clamp+'.Value':assert c.break_link(src,dst,False)
   if terms:link(terms[0],clamp+'.Value')
   else:default(clamp+'.Value',0)
   # Source constraints remain; remove the former arbitrary fitting-range clamp.
   bounds=row['source_bounds'][a['axis']]
   default(clamp+'.Minimum',bounds[0]/a['scale']);default(clamp+'.Maximum',bounds[1]/a['scale'])
   if ai in plan.get('gate_thresholds',{}):
    for src,dst in oldlinks:
     if src==clamp+'.Result':
      gate=g.find_node_by_name(dst.split('.')[0])
      if hasattr(gate,'get_script_struct') and 'MathFloatGreaterEqual' in gate.get_script_struct().get_name():
       default(str(gate.get_name())+'.B',plan['gate_thresholds'][ai]/a['scale'])
   rewired.append({'axis_index':int(ai),'clamp':clamp,'row':row['matrix'][a['axis']],'source_bounds':bounds})
  rails=[n for n in source.get_default_model().get_nodes() if str(n.get_name()).endswith('_RAIL')]
  assert len(rails)==24,len(rails)
  text=source.get_controller(source.get_default_model()).export_nodes_to_text([n.get_fname() for n in rails])
  imported=c.import_nodes_from_text(text,False,False);assert len(imported)==len(rails)
  imported_names={str(n) for n in imported}
  for src,dst in list(links()):
   if 'Execute' in dst and (src.split('.')[0] in imported_names or dst.split('.')[0] in imported_names):c.break_link(src,dst,False)
  tail=({b.split('.')[0] for a,b in oldexec}-{a.split('.')[0] for a,b in oldexec}).pop()+'.ExecutePin'
  for n in imported:
   name=str(n);link(tail,name+'.ExecutePin');tail=name+'.ExecutePin'
  from face_design_space import attach_head_relative_rails
  attach_head_relative_rails(editor,plan['head_bone'])
  for n,v in restore_values.items():h.set_control_value(key(n),h.make_control_value_from_vector(unreal.Vector(*v)))
  editor.recompile_vm()
  assert set(oldexec).issubset(set(links())),'Existing execution chain changed'
  assert hashlib.sha256(disk(plan['source']).read_bytes()).hexdigest()==source_hash
  assert len(h.get_controls())==73
  report.update(passed=True,nodes_after=len(g.get_nodes()),rewired_inputs=rewired,rails=len(imported),controls=73,preserved_solver=True,source_unchanged=True,saved=False)
finally:editor.set_auto_vm_recompile(auto)
output_path(root/'adaptation_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in report.items() if k not in ('rewired_inputs','old_execution_links','restore_values')}))
