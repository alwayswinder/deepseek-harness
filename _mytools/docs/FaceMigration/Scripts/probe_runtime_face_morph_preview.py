"""在新资产的正常预览动画帧检查 28 条 Morph，并帧后检查输入恢复。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import datetime
import json
from pathlib import Path
import traceback
import unreal
from face_paths import PACKAGE_ROOT, context, rig_dependency_folder

_preview_job = json.loads((PACKAGE_ROOT / 'Jobs' / (context().job_id + '.json')).read_text(encoding='utf-8-sig'))
PREVIEW_HOST = _preview_job.get('preview', {}).get('host', 'asset_editor')
assert PREVIEW_HOST in ('asset_editor', 'pie'), PREVIEW_HOST
if _preview_job.get('preview', {}).get('blocked_reason'):
    raise RuntimeError('预览已阻止：' + _preview_job['preview']['blocked_reason'])

class RuntimeFacePreviewProbe:
    def __init__(self):
        self.root=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
        self.out=_fm_output(_fm_tool('Docs/Evidence/SevenRuntime/' + ('pie_morph_check.json' if PREVIEW_HOST == 'pie' else 'preview_morph_check.json')))
        self.target=unreal.load_asset(_fm_asset('/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset'))
        candidates=[]
        for comp in unreal.ObjectIterator(unreal.SkeletalMeshComponent):
            if comp.get_skinned_asset()!=self.target.get_editor_property('preview_skeletal_mesh'):continue
            if PREVIEW_HOST == 'pie' and 'UEDPIE_' not in comp.get_path_name():continue
            if PREVIEW_HOST == 'asset_editor' and 'AnimationEditorPreviewActor' not in comp.get_path_name():continue
            anim=comp.get_anim_instance()
            if not anim:continue
            for host in unreal.RigVMHost.find_rig_vm_hosts(anim,unreal.ControlRig):
                if host.get_vm().get_outer()==self.target and len(host.get_hierarchy().get_controls())==len(self.target.hierarchy.get_controls()):
                    candidates.append((comp,anim,host))
        if len(candidates)>1 and self.out.exists():
            previous=json.loads(_fm_read(self.out).read_text(encoding='utf-8'))
            candidates=[row for row in candidates if row[0].get_path_name()==previous.get('preview_component')]
        assert len(candidates)==1,str(candidates)
        self.comp,self.anim,self.live=candidates[0]
        self.h=self.live.get_hierarchy()
        self.saved={str(k.name):list(self.h.get_vector_from_control_value(self.h.get_control_value(k)).to_tuple()) for k in self.h.get_controls()}
        self.old_update=self.comp.get_editor_property('update_animation_in_editor')
        catalog = json.loads((PACKAGE_ROOT/'Characters'/context().character/'face-controls.json').read_text(encoding='utf-8'))
        self.rows = [{'control': b['ue_control']} for b in catalog['bindings']
                     if b.get('enabled', True) and b['group'] in ('expressions', 'phonemes', 'eye_expressions')]
        source = _fm_load_asset(catalog['reference']['control_rig'])
        oracle = source.create_control_rig()
        oracle.request_init()
        oh = oracle.get_hierarchy()
        assert len(oh.get_controls()) == len(source.get_hierarchy().get_controls())
        oh.reset_pose_to_initial(unreal.RigElementType.CONTROL)
        for name, value in self.saved.items():
            oh.set_control_value(self.key(name), oh.make_control_value_from_vector(unreal.Vector(*value)))
        assert oracle.execute('Forwards Solve')
        curves = {n.find_pin('Curve').get_default_value().strip('"') for n in source.get_default_model().get_nodes()
                  if hasattr(n, 'get_script_struct') and n.get_script_struct()
                  and n.get_script_struct().get_name() == 'RigUnit_SetCurveValue'}
        assert curves
        self.expected_restored = {name: oh.get_curve_value(unreal.RigElementKey(type=unreal.RigElementType.CURVE, name=name))
                                  for name in curves}
        for row in self.rows:
            oh.set_control_value(self.key(row['control']), oh.make_control_value_from_vector(unreal.Vector(4,0,0)))
        assert oracle.execute('Forwards Solve')
        self.expected = {name: oh.get_curve_value(unreal.RigElementKey(type=unreal.RigElementType.CURVE, name=name))
                         for name in curves}
        self.phase='half';self.frames=0;self.result=dict(target=self.target.get_path_name(),host_kind=PREVIEW_HOST,pending=True,started_at=datetime.datetime.now().astimezone().isoformat(),preview_component=self.comp.get_path_name(),preview_host=self.live.get_path_name())
        self.time_before = self.live.get_absolute_time()

    def key(self,name):
        return unreal.RigElementKey(type=unreal.RigElementType.CONTROL,name=name)

    def write(self):
        _fm_output(self.out).write_text(json.dumps(self.result,ensure_ascii=False,indent=2),encoding='utf-8')

    def restore(self):
        for name,value in self.saved.items():
            self.h.set_control_value(self.key(name),self.h.make_control_value_from_vector(unreal.Vector(*value)))
        self.live.request_run_once_event('Forwards Solve')

    def diagnose_stall(self):
        """Preview stall has two layers: no evaluation, and no curve transfer to the mesh.

        Force one solve on the live host and record Rig-hierarchy curves vs anim curves so the
        report separates "solver did not run" from "mesh curves were not updated".
        """
        try:
            rig_after={name:self.h.get_curve_value(unreal.RigElementKey(type=unreal.RigElementType.CURVE,name=name)) for name in self.expected}
            self.live.execute('Forwards Solve')
            rig_solved={name:self.h.get_curve_value(unreal.RigElementKey(type=unreal.RigElementType.CURVE,name=name)) for name in self.expected}
            anim_after={name:self.anim.get_curve_value(name) for name in self.expected}
            return {'host_time':self.live.get_absolute_time(),
                    'rig_curves_before_execute_max':max(rig_after.values()),
                    'rig_curves_after_execute_max':max(rig_solved.values()),
                    'anim_curves_after_execute_max':max(anim_after.values()),
                    'sample':{name:rig_solved[name] for name in list(rig_solved)[:2]},
                    'verdict':('solver_runs_but_mesh_curves_stale'
                               if max(rig_solved.values())>1e-5 and max(anim_after.values())<1e-5
                               else 'solver_did_not_run' if max(rig_solved.values())<1e-5 else 'curves_transfer_partial')}
        except Exception as exc:
            return {'error':traceback.format_exc()[-400:]}

    def start(self):
        self.write()
        self.comp.set_update_animation_in_editor(True)
        for row in self.rows:
            self.h.set_control_value(self.key(row['control']),self.h.make_control_value_from_vector(unreal.Vector(4,0,0)))
        self.live.request_run_once_event('Forwards Solve')
        self.handle=unreal.register_slate_post_tick_callback(self.tick)

    def tick(self,delta):
        self.frames+=1
        if self.frames<25:return
        try:
            actual={name:self.anim.get_curve_value(name) for name in self.expected}
            if self.phase=='half':
                active={str(n) for n in self.anim.get_active_curve_names(unreal.AnimCurveType.MORPH_TARGET_CURVE)}
                self.result.update(expected_half=self.expected,actual_half=actual,
                                   half_error=max(abs(actual[n]-v) for n,v in self.expected.items()),
                                   missing_morph_type=sorted(set(self.expected)-active),
                                   rig_half={name:self.h.get_curve_value(unreal.RigElementKey(type=unreal.RigElementType.CURVE,name=name)) for name in self.expected},
                                   half_inputs={row['control']:list(self.h.get_vector_from_control_value(self.h.get_control_value(self.key(row['control']))).to_tuple()) for row in self.rows},
                                   rig_absolute_time=self.live.get_absolute_time())
                self.result['rig_clock_advancing'] = self.live.get_absolute_time() > self.time_before
                if self.result['half_error']>1e-5:
                    self.result['stall_diagnosis']=self.diagnose_stall()
                self.restore();self.phase='restored';self.frames=0;self.write();return
            restored=self.expected_restored
            err=max((self.h.get_vector_from_control_value(self.h.get_control_value(self.key(n)))-unreal.Vector(*v)).length() for n,v in self.saved.items())
            self.result.update(actual_restored=actual,expected_restored=restored,
                               restored_curve_error=max(abs(actual[n]-v) for n,v in restored.items()),
                               restored_input_error=err,saved_inputs=self.saved,pending=False,
                               captured_at=datetime.datetime.now().astimezone().isoformat())
            self.result['passed']=self.result['rig_clock_advancing'] and self.result['half_error']<1e-5 and not self.result['missing_morph_type'] and self.result['restored_curve_error']<1e-5 and err<1e-6
            unreal.unregister_slate_post_tick_callback(self.handle)
            self.comp.set_update_animation_in_editor(self.old_update)
            self.write()
        except Exception:
            self.restore()
            unreal.unregister_slate_post_tick_callback(self.handle)
            self.comp.set_update_animation_in_editor(self.old_update)
            self.result.update(pending=False,passed=False,error=traceback.format_exc())
            self.write()

def prepare_pie_preview():
    """Build an owned AnimBP host and use a temporary actor without saving the map."""
    from editor_toolset.toolsets.blueprint import BlueprintTools
    from face_paths import runtime_path
    target = unreal.load_asset(_fm_asset('/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset'))
    mesh = target.get_editor_property('preview_skeletal_mesh')
    folder = rig_dependency_folder(target.get_path_name())
    path = folder + '/ABP_FacePreview'
    bp = unreal.load_asset(path)
    if not bp:
        factory = unreal.AnimBlueprintFactory()
        factory.set_editor_property('target_skeleton', mesh.get_editor_property('skeleton'))
        factory.set_editor_property('preview_skeletal_mesh', mesh)
        factory.set_editor_property('parent_class', unreal.AnimInstance)
        bp = unreal.AssetToolsHelpers.get_asset_tools().create_asset('ABP_FacePreview', folder, unreal.AnimBlueprint, factory)
        unreal.EditorAssetLibrary.set_metadata_tag(bp, 'FaceMigrationPreviewOwner', target.get_path_name())
    assert unreal.EditorAssetLibrary.get_metadata_tag(bp, 'FaceMigrationPreviewOwner') == target.get_path_name(), 'Unowned preview asset'
    graph = unreal.BlueprintEditorLibrary.find_graph(bp, 'AnimGraph')
    graph_editor = unreal.BlueprintGraphEditor.get_graph_editor(graph)
    nodes = list(graph_editor.list_all_nodes())
    assert all(n.get_class().get_name() in ('AnimGraphNode_Root', 'AnimGraphNode_ControlRig') for n in nodes)
    rigs = [n for n in nodes if n.get_class().get_name() == 'AnimGraphNode_ControlRig']
    assert len(rigs) <= 1
    node = rigs[0] if rigs else BlueprintTools.create_node(graph, 'Misc.|ControlRig', unreal.IntPoint(-300, 0))
    reference = unreal.ControlRigAssetStrongReference()
    assert reference.import_text('(BlueprintRigClass=None,ControlRigAsset="' + target.get_path_name() + '")')
    settings = node.get_editor_property('node')
    settings.set_editor_property('control_rig_asset_reference', reference)
    settings.set_editor_property('transfer_input_pose', False)
    settings.set_editor_property('transfer_input_curves', False)
    node.set_editor_property('node', settings)
    root = next(n for n in nodes if n.get_class().get_name() == 'AnimGraphNode_Root')
    assert node.list_output_pins()[0].try_create_connection(root.list_input_pins()[0])
    unreal.BlueprintEditorLibrary.compile_blueprint(bp)
    assert not graph_editor.list_nodes_with_errors()
    assert unreal.EditorAssetLibrary.save_loaded_asset(bp, False)
    level = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    assert not level.is_in_play_in_editor(), 'Do not replace a user-owned PIE session'
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    # RF_Transient actors are excluded from PIE duplication. Remove this owned
    # actor after testing instead; the user's level is never saved by this probe.
    actor = actors.spawn_actor_from_class(unreal.SkeletalMeshActor, unreal.Vector(0, 0, 0), unreal.Rotator(), transient=False)
    actor.set_actor_label('FaceMigrationPreview_' + context().job_id)
    comp = actor.skeletal_mesh_component
    comp.set_skeletal_mesh_asset(mesh)
    comp.set_anim_instance_class(bp.generated_class())
    comp.set_editor_property('visibility_based_anim_tick_option', unreal.VisibilityBasedAnimTickOption.ALWAYS_TICK_POSE_AND_REFRESH_BONES)
    comp.set_editor_property('enable_update_rate_optimizations', False)
    report = dict(actor=actor.get_path_name(), animation_blueprint=path, temporary=True, owns_pie=True,
                  target=target.get_path_name(), captured_at=datetime.datetime.now().astimezone().isoformat())
    (runtime_path('Evidence') / 'pie_preview_host.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    level.editor_play_simulate()
    global _runtime_pie_wait_state
    state = _runtime_pie_wait_state = {'frames': 0}
    def wait_for_host(delta):
        state['frames'] += 1
        if state['frames'] < 15:
            return
        try:
            global _runtime_face_preview_probe
            _runtime_face_preview_probe = RuntimeFacePreviewProbe()
        except AssertionError:
            if state['frames'] < 300:
                return
            unreal.unregister_slate_post_tick_callback(state['handle'])
            report.update(passed=False, pending=False, error=traceback.format_exc(), cleanup_requested=True)
            (runtime_path('Evidence') / 'pie_preview_host.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
            level.editor_request_end_play()
            actors.destroy_actor(actor)
            return
        unreal.unregister_slate_post_tick_callback(state['handle'])
        from wrap_face_head_space import decoded
        inventory = json.loads((runtime_path('Evidence')/'reference_inventory.json').read_text(encoding='utf-8'))
        pose = inventory['binding_check'].get('target_initial_pose', {})
        for bone in _runtime_face_preview_probe.h.get_bones():
            if str(bone.name) in pose:
                _runtime_face_preview_probe.h.set_global_transform(bone, decoded(pose[str(bone.name)]), False, True)
        report['input_pose'] = 'original target reference pose injected into the live Rig hierarchy'
        (runtime_path('Evidence')/'pie_preview_host.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        _runtime_face_preview_probe.start()
    state['handle'] = unreal.register_slate_post_tick_callback(wait_for_host)


if PREVIEW_HOST == 'pie' and _preview_job.get('preview', {}).get('prepare', False):
    prepare_pie_preview()
else:
    _runtime_face_preview_probe=RuntimeFacePreviewProbe()
    _runtime_face_preview_probe.start()
print('Scheduled normal-frame Morph preview and restoration checks: ' + PREVIEW_HOST)
