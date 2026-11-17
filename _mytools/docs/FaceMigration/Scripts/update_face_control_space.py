"""Incrementally install and verify head-following UI on a Blueprint face rig.

The existing solver must already handle animated head transforms. The graph is
preserved; this operation does not add facial pose back-solving.
"""
import datetime
import hashlib
import json
import shutil
import unreal
from face_paths import context, asset_path, asset_disk_path, output_path, save_asset
from face_design_space import attach_face_control_space
import wrap_face_head_space as w


def dump(path, data):
    output_path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def control_state(h):
    result = {}
    for k in h.get_controls():
        parent = h.get_first_parent(k)
        parent_type = next(name for name in ('BONE', 'CONTROL', 'NULL')
                           if parent.type == getattr(unreal.RigElementType, name))
        row = dict(parent=dict(name=str(parent.name), type=parent_type), offsets={}, values={}, shapes={})
        for initial, label, vt in ((True, 'initial', unreal.RigControlValueType.INITIAL),
                                    (False, 'current', unreal.RigControlValueType.CURRENT)):
            row['offsets'][label] = w.encoded(unreal.MathLibrary.make_relative_transform(
                h.get_global_control_offset_transform(k, initial), h.get_global_transform(parent, initial)))
            row['values'][label] = list(h.get_vector_from_control_value(h.get_control_value(k, vt)).to_tuple())
            row['shapes'][label] = w.encoded(unreal.MathLibrary.make_relative_transform(
                h.get_global_control_shape_transform(k, initial), h.get_global_transform(k, initial)))
        st = h.get_control_settings(k)
        row['interface'] = dict(type=str(st.control_type), animation_type=str(st.animation_type),
            display_name=str(st.display_name), shape_name=str(st.shape_name),
            color=list(st.shape_color.to_tuple()), visible=st.shape_visible, draw_limits=st.draw_limits,
            limits=[[x.minimum, x.maximum] for x in st.limit_enabled],
            minimum=list(h.get_vector_from_control_value(st.minimum_value).to_tuple()),
            maximum=list(h.get_vector_from_control_value(st.maximum_value).to_tuple()))
        result[str(k.name)] = row
    return result


def check_interface(h, before):
    after = control_state(h)
    assert set(after) == set(before), 'Control names changed'
    for name, row in before.items():
        assert row['values'] == after[name]['values'], ('Control values changed', name)
        assert row['interface'] == after[name]['interface'], ('Control settings changed', name)
        for label in ('initial', 'current'):
            errors = w.error(w.decoded(row['shapes'][label]), w.decoded(after[name]['shapes'][label]))
            assert errors[0] < 1e-7 and errors[1] < 1e-4 and errors[2] < 1e-7, (name, errors)
        if row['parent']['type'] == 'CONTROL':
            assert row['parent'] == after[name]['parent'], ('Nested control parent changed', name)


def live_hosts(bp):
    hosts = {}
    preview = bp.get_debugged_control_rig()
    if preview:
        hosts[preview.get_path_name()] = preview
    sequence = unreal.LevelSequenceEditorBlueprintLibrary.get_current_level_sequence()
    if sequence:
        for proxy in unreal.ControlRigSequencerLibrary.get_control_rigs(sequence):
            host = proxy.control_rig
            if host.get_class() == bp.generated_class():
                hosts[host.get_path_name()] = host
    return hosts


def pose_cases(bp, head_name, animation_path):
    host, h = w.instance(bp)
    hi = h.get_global_transform(w.key(head_name), True)
    poses = [('reference', {})]
    for label, translation, rotation in (
            ('head_turn', (30, -20, 12), (15, 35, 8)),
            ('head_opposite', (-15, 5, -10), (-25, -50, 30))):
        tf = unreal.Transform()
        tf.translation = hi.translation + unreal.Vector(*translation)
        tf.rotation = unreal.Rotator(*rotation).quaternion() * hi.rotation
        tf.scale3d = hi.scale3d
        poses.append((label, {head_name: w.encoded(tf)}))
    if animation_path:
        animation = unreal.load_asset(asset_path(animation_path))
        assert animation, animation_path
        options = unreal.AnimPoseEvaluationOptions()
        options.optional_skeletal_mesh = bp.get_preview_mesh()
        options.should_retarget = True
        length = animation.get_play_length()
        for time in (0., length*.25, length*.5, length*.75, max(0., length-1./30.)):
            pose = unreal.AnimPoseExtensions.get_anim_pose_at_time(animation, time, options)
            poses.append(('animation_'+str(time), {str(k.name): w.encoded(
                unreal.AnimPoseExtensions.get_bone_pose(pose, k.name, unreal.AnimPoseSpaces.WORLD))
                for k in h.get_bones()}))
    return poses


def evaluate(bp, head_name, samples, poses, baseline=None):
    host, h = w.instance(bp)
    head = w.key(head_name)
    hi = h.get_global_transform(head, True)
    rows, snapshots = [], {}
    for pose_label, pose in poses:
        for label, values in samples:
            w.reset(h, values)
            for name, transform in pose.items():
                # Match AnimNode input transfer: propagate to non-bone children.
                # False preserves their world transforms and rewrites null locals,
                # which does not simulate the animation node's input pose update.
                h.set_global_transform(w.key(name), w.decoded(transform), False, True)
            assert host.execute('Forwards Solve'), (pose_label, label)
            token = pose_label+'/'+label
            data = w.snapshot(h)
            data['controls'] = {str(k.name): w.encoded(h.get_global_transform(k)) for k in h.get_controls()}
            data['shapes'] = {str(k.name): w.encoded(h.get_global_control_shape_transform(k)) for k in h.get_controls()}
            if baseline is None:
                snapshots[token] = data
                continue
            expected = baseline[token]
            max_bone, max_control, max_shape = [0.]*3, [0.]*3, [0.]*3
            for name, transform in expected['bones'].items():
                max_bone = [max(a, b) for a, b in zip(max_bone, w.error(w.decoded(data['bones'][name]), w.decoded(transform)))]
            for name, value in expected['curves'].items():
                assert abs(data['curves'][name]-value) < 1e-6, (token, name)
            animated_head = h.get_global_transform(head)
            for section, errors in (('controls', max_control), ('shapes', max_shape)):
                reference = baseline['reference/'+label][section]
                for name, transform in reference.items():
                    target = unreal.MathLibrary.compose_transforms(
                        unreal.MathLibrary.make_relative_transform(w.decoded(transform), hi), animated_head)
                    errors[:] = [max(a, b) for a, b in zip(errors, w.error(w.decoded(data[section][name]), target))]
            for errors in (max_bone, max_control, max_shape):
                assert errors[0] < 1e-4 and errors[1] < 1e-3 and errors[2] < 1e-5, (token, errors)
            assert w.inputs(h) == {str(k.name): values.get(str(k.name), [0., 0., 0.]) for k in h.get_controls()}
            rows.append(dict(case=token, bone=max_bone, control=max_control, shape=max_shape))
    if baseline is None:
        return snapshots
    before = w.snapshot(h)
    controls_before = {str(k.name): w.encoded(h.get_global_transform(k)) for k in h.get_controls()}
    for _ in range(5):
        assert host.execute('Forwards Solve')
    for name, transform in before['bones'].items():
        errors = w.error(h.get_global_transform(w.key(name)), w.decoded(transform))
        assert errors[0] < 1e-4 and errors[1] < 1e-3, ('Repeated bone evaluation', name, errors)
    for name, transform in controls_before.items():
        errors = w.error(h.get_global_transform(w.key(name, unreal.RigElementType.CONTROL)), w.decoded(transform))
        assert errors[0] < 1e-4 and errors[1] < 1e-3, ('Repeated control evaluation', name, errors)
    return dict(passed=True, cases=len(rows), rows=rows,
                max_bone_cm=max(r['bone'][0] for r in rows),
                max_control_cm=max(r['control'][0] for r in rows),
                max_shape_cm=max(r['shape'][0] for r in rows), repeated_evaluation_passed=True)


def main():
    cfg = context().layout
    target = asset_path(cfg['target'])
    bp = unreal.load_asset(target)
    assert isinstance(bp, unreal.ControlRigBlueprint), 'Blueprint facial rigs only'
    model = bp.get_default_model()
    h = bp.get_hierarchy()
    space = w.key('FACE_SPACE', unreal.RigElementType.NULL)
    assert not h.contains(space), 'Already installed; verify instead of reinstalling'
    before = control_state(h)
    saved_settings = {str(k.name): h.get_control_settings(k) for k in h.get_controls()}
    original_defaults, original_links = w.defaults(model), w.links(model)
    hosts = {name: w.inputs(host.get_hierarchy()) for name, host in live_hosts(bp).items()}
    disk = asset_disk_path('Content/'+target[len('/Game/'):]+'.uasset')
    protected = asset_path(cfg['readonly_asset'])
    assert protected != target
    protected_disk = asset_disk_path('Content/'+protected[len('/Game/'):]+'.uasset')
    protected_hash = hashlib.sha256(protected_disk.read_bytes()).hexdigest()
    backup = output_path(context().current/'Backups'/('ControlSpace_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S')))
    backup.mkdir()
    shutil.copy2(disk, backup/'disk_before.uasset')
    dump(backup/'control_state.json', before)
    dump(backup/'live_inputs.json', hosts)
    (backup/'hierarchy_before.txt').write_text(bp.get_hierarchy_controller().export_to_text(h.get_all_keys()), encoding='utf-8')
    (backup/'graph_before.txt').write_text(bp.get_controller(model).export_nodes_to_text([n.get_fname() for n in model.get_nodes()]), encoding='utf-8')
    assert save_asset(bp, False)
    shutil.copy2(disk, backup/'memory_before.uasset')
    samples = w.cases(h)
    poses = pose_cases(bp, cfg['head_bone'], cfg.get('animation'))
    baseline = evaluate(bp, cfg['head_bone'], samples, poses)
    dump(context().current/'Evidence/control_space_baseline.json', baseline)
    report = dict(target=target, backup=str(backup), passed=False, animation=cfg.get('animation'),
                  visual_acceptance='pending_user', sequencer_open=bool(unreal.LevelSequenceEditorBlueprintLibrary.get_current_level_sequence()))
    old_auto = bp.get_auto_vm_recompile()
    try:
        bp.set_auto_vm_recompile(False)
        with unreal.ScopedEditorTransaction('Make face controls follow animated head'):
            bp.modify()
            report['installation'] = attach_face_control_space(bp, cfg['head_bone'])
            bp.recompile_vm()
            assert bp.get_editor_property('status') != unreal.BlueprintStatus.BS_ERROR
        assert w.defaults(model) == original_defaults and w.links(model) == original_links, 'Graph changed'
        check_interface(h, before)
        report['before_reload'] = evaluate(bp, cfg['head_bone'], samples, poses, baseline)
        dump(context().current/'Evidence/control_space_report.json', report)
        assert save_asset(bp, False)
        sub = unreal.get_editor_subsystem(unreal.AssetEditorSubsystem)
        sub.close_all_editors_for_asset(bp)
        result = unreal.EditorLoadingAndSavingUtils.reload_packages([bp.get_outer()], unreal.ReloadPackagesInteractionMode.ASSUME_POSITIVE)
        assert result[0], str(result)
        bp = unreal.load_asset(target)
        h = bp.get_hierarchy()
        check_interface(h, before)
        assert w.defaults(bp.get_default_model()) == original_defaults and w.links(bp.get_default_model()) == original_links
        report['after_reload'] = evaluate(bp, cfg['head_bone'], samples, poses, baseline)
        assert hashlib.sha256(protected_disk.read_bytes()).hexdigest() == protected_hash
        assert sub.open_editor_for_assets([bp])
        for name, host in live_hosts(bp).items():
            saved = hosts.get(name)
            if saved is None and len(hosts) == 1:
                saved = next(iter(hosts.values()))
            if saved is not None:
                w.restore_inputs(host.get_hierarchy(), saved)
                host.request_run_once_event('Forwards Solve')
        report.update(passed=True, saved=True, reloaded=True, graph_unchanged=True,
                      interface_preserved=True, protected_asset_unchanged=True,
                      nodes=len(bp.get_default_model().get_nodes()), controls=len(h.get_controls()))
    except Exception as exc:
        report['error'] = repr(exc)
        bp = unreal.load_asset(target)
        h = bp.get_hierarchy()
        hc = bp.get_hierarchy_controller()
        for name, row in before.items():
            control = w.key(name, unreal.RigElementType.CONTROL)
            parent = w.key(row['parent']['name'], getattr(unreal.RigElementType, row['parent']['type']))
            current = h.get_first_parent(control)
            if current.name != parent.name or current.type != parent.type:
                assert hc.set_parent(control, parent, False, False, False)
            for initial, label, vt in ((True, 'initial', unreal.RigControlValueType.INITIAL),
                                      (False, 'current', unreal.RigControlValueType.CURRENT)):
                h.set_control_offset_transform(control, w.decoded(row['offsets'][label]), initial, True)
                h.set_control_value(control, h.make_control_value_from_vector(unreal.Vector(*row['values'][label])), vt)
            assert hc.set_control_settings(control, saved_settings[name], False)
        if h.contains(space):
            assert hc.remove_element(space, False, False)
        bp.recompile_vm()
        check_interface(h, before)
        assert save_asset(bp, False)
        report['rolled_back'] = True
        raise
    finally:
        bp.set_auto_vm_recompile(old_auto)
        dump(context().current/'Evidence/control_space_report.json', report)
    print(json.dumps({k: v for k, v in report.items() if k not in ('before_reload', 'after_reload')}, ensure_ascii=False))
    print(json.dumps({k: v for k, v in report['after_reload'].items() if k != 'rows'}))


if __name__ == '__main__':
    main()
