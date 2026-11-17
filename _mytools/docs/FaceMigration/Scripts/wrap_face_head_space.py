"""Wrap an existing Blueprint facial solve in a cached animated head space.

Configured through layout.target/head_bone/readonly_asset. The original solver
must operate in reference rig space and only write bones below the head anchor.
Backups and numerical evidence are scoped to the current migration job.
"""
import datetime
import hashlib
import json
import math
import shutil

import unreal
from face_paths import context, asset_path, asset_disk_path, output_path, save_asset

PREFIX = 'HSPACE_'
VARIABLE = 'FACE_AnimatedHead'


def key(name, kind=unreal.RigElementType.BONE):
    return unreal.RigElementKey(name=name, type=kind)


def encoded(t):
    return dict(p=list(t.translation.to_tuple()),
                q=[t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w],
                s=list(t.scale3d.to_tuple()))


def decoded(t):
    result = unreal.Transform()
    result.translation = unreal.Vector(*t['p'])
    result.rotation = unreal.Quat(*t['q'])
    result.scale3d = unreal.Vector(*t['s'])
    return result


def error(a, b):
    qa, qb = a.rotation, b.rotation
    dot = abs(qa.x*qb.x + qa.y*qb.y + qa.z*qb.z + qa.w*qb.w)
    norm = math.sqrt((qa.x**2+qa.y**2+qa.z**2+qa.w**2) *
                     (qb.x**2+qb.y**2+qb.z**2+qb.w**2))
    return [(a.translation-b.translation).length(),
            math.degrees(2*math.acos(min(1., max(0., dot/norm)))),
            (a.scale3d-b.scale3d).length()]


def inputs(h):
    return {str(k.name): list(h.get_vector_from_control_value(h.get_control_value(k)).to_tuple())
            for k in h.get_controls()}


def restore_inputs(h, values):
    for name, vector in values.items():
        k = key(name, unreal.RigElementType.CONTROL)
        assert h.contains(k), name
        h.set_control_value(k, h.make_control_value_from_vector(unreal.Vector(*vector)))
    assert inputs(h) == values, 'Control input restore failed'


def instance(bp):
    host = bp.create_control_rig()
    host.request_init()
    return host, host.get_hierarchy()


def links(model):
    return sorted((str(l.get_source_pin().get_pin_path()), str(l.get_target_pin().get_pin_path()))
                  for l in model.get_links())


def defaults(model):
    return {str(n.get_name()): {str(p.get_name()): p.get_default_value() for p in n.get_pins()}
            for n in model.get_nodes()}


def execution_chain(model):
    edges = [(a, b) for a, b in links(model) if 'Execute' in a and 'Execute' in b]
    adjacency = dict(edges)
    assert len(adjacency) == len(edges), 'Branched execution requires a dedicated wrapper'
    cursor = 'Begin.ExecutePin'
    chain = [cursor]
    while cursor in adjacency:
        cursor = adjacency[cursor]
        assert cursor not in chain, 'Execution cycle'
        chain.append(cursor)
    assert len(chain) == len(edges)+1, 'Disconnected mutable nodes require review'
    return chain


def snapshot(h):
    return dict(bones={str(k.name): encoded(h.get_global_transform(k)) for k in h.get_bones()},
                curves={str(k.name): h.get_curve_value(k) for k in h.get_curves()})


def cases(h):
    result = [('neutral', {})]
    combined = {}
    for k in h.get_controls():
        settings = h.get_control_settings(k)
        if settings.animation_type == unreal.RigControlAnimationType.VISUAL_CUE:
            continue
        assert settings.control_type == unreal.RigControlType.POSITION, str(k.name)
        hi = h.get_vector_from_control_value(settings.maximum_value).to_tuple()
        lo = h.get_vector_from_control_value(settings.minimum_value).to_tuple()
        values = [0., 0., 0.]
        for axis in range(3):
            if abs(hi[axis])+abs(lo[axis]) > 1e-5:
                values[axis] = .25*(hi[axis] if hi[axis] > 0 else lo[axis])
                break
            limit = settings.limit_enabled[axis]
            if not limit.minimum and not limit.maximum:
                values[axis] = 1.
                break
        assert any(values), str(k.name)
        name = str(k.name)
        result.append((name, {name: values}))
        combined[name] = values
    result.append(('combined', combined))
    return result


def reset(h, values):
    h.reset_pose_to_initial(unreal.RigElementType.ALL)
    for name, vector in values.items():
        h.set_control_value(key(name, unreal.RigElementType.CONTROL),
                            h.make_control_value_from_vector(unreal.Vector(*vector)))


def subtree(h, head):
    names = set()
    for k in h.get_bones():
        parent = k
        while h.contains(parent):
            if str(parent.name) == head:
                names.add(str(k.name))
                break
            parent = h.get_first_parent(parent)
    assert len(names) > 1
    return names


def validate(bp, head_name, samples, baselines):
    host, h = instance(bp)
    head = key(head_name)
    initial = h.get_global_transform(head, True)
    affected = subtree(h, head_name)
    rows = []
    for label, values in samples:
        for moved in (False, True):
            reset(h, values)
            target_head = initial
            if moved:
                target_head = unreal.Transform()
                target_head.translation = initial.translation+unreal.Vector(30, -20, 12)
                target_head.rotation = unreal.Rotator(15, 35, 8).quaternion()*initial.rotation
                target_head.scale3d = initial.scale3d
                h.set_global_transform(head, target_head, False, True)
            assert host.execute('Forwards Solve'), label
            pe = re = se = ce = 0.
            worst = ''
            for name, data in baselines[label]['bones'].items():
                expected = decoded(data)
                if moved and name in affected:
                    expected = unreal.MathLibrary.compose_transforms(
                        unreal.MathLibrary.make_relative_transform(expected, initial), target_head)
                errors = error(h.get_global_transform(key(name)), expected)
                if errors[0] > pe:
                    pe, worst = errors[0], name
                re, se = max(re, errors[1]), max(se, errors[2])
            for name, value in baselines[label]['curves'].items():
                ce = max(ce, abs(h.get_curve_value(key(name, unreal.RigElementType.CURVE))-value))
            row = dict(case=label, moved=moved, position_cm=pe, rotation_deg=re,
                       scale=se, curve=ce, worst_bone=worst)
            rows.append(row)
            assert pe < 1e-4 and re < 1e-3 and se < 1e-5 and ce < 1e-6, row
    # Repeated evaluation must not accumulate offsets or lose the cached head.
    before = snapshot(h)
    for _ in range(5):
        assert host.execute('Forwards Solve')
    repeat = [0., 0., 0.]
    for name, data in before['bones'].items():
        repeat = [max(x, y) for x, y in zip(repeat, error(h.get_global_transform(key(name)), decoded(data)))]
    assert repeat[0] < 1e-4 and repeat[1] < 1e-3 and repeat[2] < 1e-5, repeat
    return dict(passed=True, cases=len(rows), head_subtree_bones=len(affected),
                max_position_cm=max(r['position_cm'] for r in rows),
                max_rotation_deg=max(r['rotation_deg'] for r in rows),
                max_curve_error=max(r['curve'] for r in rows), repeat_error=repeat, rows=rows)


def verify_saved_and_animation(animation, original_rig):
    """Reload the saved target and sample the supplied clip without editing its sequence."""
    cfg = context().layout
    bp = unreal.load_asset(asset_path(cfg['target']))
    before_inputs = inputs(bp.get_hierarchy())
    subsystem = unreal.get_editor_subsystem(unreal.AssetEditorSubsystem)
    subsystem.close_all_editors_for_asset(bp)
    result = unreal.EditorLoadingAndSavingUtils.reload_packages(
        [bp.get_outer()], unreal.ReloadPackagesInteractionMode.ASSUME_POSITIVE)
    assert result[0], str(result)
    bp = unreal.load_asset(asset_path(cfg['target']))
    assert inputs(bp.get_hierarchy()) == before_inputs, 'Saved control inputs changed on reload'
    assert bp.get_editor_property('status') != unreal.BlueprintStatus.BS_ERROR
    baselines = json.loads(output_path(context().current/'Evidence'/'baseline.json').read_text(encoding='utf-8'))
    samples = cases(bp.get_hierarchy())
    report = dict(reloaded=True, validation=validate(bp, cfg['head_bone'], samples, baselines),
                  animation=animation.get_path_name(), animation_rows=[])
    host, h = instance(bp)
    oracle, original_h = instance(original_rig)
    assert not any(str(n.get_name()).startswith(PREFIX) for n in original_rig.get_default_model().get_nodes())
    affected = subtree(h, cfg['head_bone'])
    original_initial_head = original_h.get_global_transform(key(cfg['head_bone']), True)
    report['animation_comparison'] = 'Pre-change solver with the head-space wrapper applied explicitly in an independent host'
    options = unreal.AnimPoseEvaluationOptions()
    options.optional_skeletal_mesh = bp.get_preview_mesh()
    options.should_retarget = True
    length = animation.get_play_length()
    chosen = [samples[0], next(s for s in samples if s[0] == 'CTRL_BROW_L'),
              next(s for s in samples if s[0] == 'CTRL_MOUTH'),
              next(s for s in samples if s[0] == 'CTRL_EYEBALL_MASTER'), samples[-1]]
    for time in (0., length*.25, length*.5, length*.75, max(0., length-1./30.)):
        pose = unreal.AnimPoseExtensions.get_anim_pose_at_time(animation, time, options)
        clip_transforms = {str(k.name): unreal.AnimPoseExtensions.get_bone_pose(
            pose, k.name, unreal.AnimPoseSpaces.WORLD) for k in h.get_bones()}
        for label, values in chosen:
            reset(h, values)
            reset(original_h, values)
            for name, transform in clip_transforms.items():
                h.set_global_transform(key(name), transform, False, False)
                original_h.set_global_transform(key(name), transform, False, False)
            animated_head = original_h.get_global_transform(key(cfg['head_bone']))
            original_h.set_global_transform(key(cfg['head_bone']), original_initial_head, False, True)
            assert oracle.execute('Forwards Solve')
            original_h.set_global_transform(key(cfg['head_bone']), animated_head, False, True)
            assert host.execute('Forwards Solve')
            pe = re = se = ce = neutral_change = 0.
            worst = ''
            for name, input_transform in clip_transforms.items():
                expected = original_h.get_global_transform(key(name))
                actual = h.get_global_transform(key(name))
                errors = error(actual, expected)
                if errors[0] > pe:
                    pe, worst = errors[0], name
                re, se = max(re, errors[1]), max(se, errors[2])
                if label == 'neutral' and name in affected:
                    neutral_change = max(neutral_change, (actual.translation-input_transform.translation).length())
            for curve in original_h.get_curves():
                name, value = str(curve.name), original_h.get_curve_value(curve)
                ce = max(ce, abs(h.get_curve_value(key(name, unreal.RigElementType.CURVE))-value))
            row = dict(time=time, case=label, position_cm=pe, rotation_deg=re, scale=se,
                       curve=ce, worst_bone=worst, neutral_input_position_change_cm=neutral_change)
            report['animation_rows'].append(row)
            assert pe < 1e-4 and re < 1e-3 and se < 1e-5 and ce < 1e-6, row
    report['passed'] = True
    output_path(context().current/'Evidence'/'saved_animation_validation.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    subsystem.open_editor_for_assets([bp])
    print(json.dumps(dict(reloaded=True, passed=True, synthetic_cases=report['validation']['cases'],
                         animation_cases=len(report['animation_rows']),
                         max_animation_position_cm=max(r['position_cm'] for r in report['animation_rows']),
                         max_animation_rotation_deg=max(r['rotation_deg'] for r in report['animation_rows']),
                         neutral_input_position_change_cm=max(r['neutral_input_position_change_cm'] for r in report['animation_rows'])),
                     ensure_ascii=False))
    return report


def main():
    cfg = context().layout
    target_path = asset_path(cfg['target'])
    readonly = asset_path(cfg['readonly_asset'])
    head_name = cfg['head_bone']
    assert target_path != readonly
    bp = unreal.load_asset(target_path)
    assert isinstance(bp, unreal.ControlRigBlueprint), 'This installer currently supports Blueprint rigs'
    model = bp.get_default_model()
    controller = bp.get_controller(model)
    before_defaults, before_links = defaults(model), links(model)
    assert not any(n.startswith(PREFIX) for n in before_defaults), 'Wrapper already exists; do not apply twice'
    assert VARIABLE not in [str(n) for n in bp.list_member_variable_names()]
    chain = execution_chain(model)
    h = bp.get_hierarchy()
    affected = subtree(h, head_name)
    # The protected head itself and the body must not be authored by the wrapped solver.
    for n in model.get_nodes():
        if str(n.get_name())+'.ExecutePin' not in chain:
            continue
        item = n.find_pin('Item')
        if item and 'Type=Bone' in item.get_default_value():
            name = item.get_default_value().split('Name="')[1].split('"')[0]
            assert name in affected and name != head_name, (str(n.get_name()), name)
    disk = asset_disk_path('Content/'+target_path[len('/Game/'):]+'.uasset')
    protected_disk = asset_disk_path('Content/'+readonly[len('/Game/'):]+'.uasset')
    protected_hash = hashlib.sha256(protected_disk.read_bytes()).hexdigest()
    backup = output_path(context().current/'Backups'/('HeadSpace_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S')))
    backup.mkdir()
    shutil.copy2(disk, backup/'disk_before.uasset')
    (backup/'graph_before.txt').write_text(controller.export_nodes_to_text([n.get_fname() for n in model.get_nodes()]), encoding='utf-8')
    saved_inputs = inputs(h)
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
    live_inputs = {path: inputs(host.get_hierarchy()) for path, host in hosts.items()}
    (backup/'inputs.json').write_text(json.dumps(dict(asset=saved_inputs, live=live_inputs), ensure_ascii=False, indent=2), encoding='utf-8')
    assert save_asset(bp, False)
    shutil.copy2(disk, backup/'memory_before.uasset')
    samples = cases(h)
    original, oh = instance(bp)
    baselines = {}
    for label, values in samples:
        reset(oh, values)
        assert original.execute('Forwards Solve')
        baselines[label] = snapshot(oh)
    output_path(context().current/'Evidence'/'baseline.json').write_text(json.dumps(baselines), encoding='utf-8')

    old_auto = bp.get_auto_vm_recompile()
    first, last = chain[1], chain[-1]
    report = dict(asset=target_path, head=head_name, backup=str(backup),
                  original_first=first, original_last=last, inputs_restored=False, saved=False)
    added = []
    def unit(cls, name, x, y):
        node = controller.add_unit_node_from_struct_path(getattr(unreal, cls).static_struct().get_path_name(),
                  'Execute', unreal.Vector2D(x, y), PREFIX+name, True)
        assert node
        added.append(str(node.get_name()))
        return node
    def default(node, pin, value):
        assert controller.set_pin_default_value(str(node.get_name())+'.'+pin, value, True, True)
    def wire(a, b):
        assert controller.add_link(a, b, True), (a, b)
    def path(n, pin):
        return str(n.get_name())+'.'+pin
    def exec_path(n):
        return next(str(p.get_pin_path()) for p in n.get_pins() if 'ExecuteContext' in p.get_cpp_type())
    try:
        with unreal.ScopedEditorTransaction('Preserve animated head around Seven facial solve'):
            bp.modify()
            bp.set_auto_vm_recompile(False)
            # This API takes a type OBJECT PATH for structs. Passing FTransform
            # loses CPPTypeObject and asserts in UE 5.8's external variable code.
            name = bp.add_member_variable(VARIABLE, '/Script/CoreUObject.Transform', False, False, '')
            assert str(name) == VARIABLE, str(name)
            bp.set_blueprint_variable_instance_editable(VARIABLE, False)
            bp.set_blueprint_variable_expose_to_cinematics(VARIABLE, False)
            current = unit('RigUnit_GetTransform', 'GetAnimatedHead', -1700, -1200)
            initial = unit('RigUnit_GetTransform', 'GetReferenceHead', -1700, -650)
            normalize = unit('RigUnit_SetTransform', 'NormalizeHead', -700, -850)
            restore = unit('RigUnit_SetTransform', 'RestoreAnimatedHead', -700, -2000)
            for node, is_initial in ((current, False), (initial, True)):
                default(node, 'Item', '(Type=Bone,Name="'+head_name+'")')
                default(node, 'Space', 'GlobalSpace')
                default(node, 'bInitial', str(is_initial))
            for node in (normalize, restore):
                default(node, 'Item', '(Type=Bone,Name="'+head_name+'")')
                default(node, 'Space', 'GlobalSpace')
                default(node, 'bInitial', 'False')
                default(node, 'Weight', '1.0')
                default(node, 'bPropagateToChildren', 'True')
            variable_nodes = []
            for getter, suffix, position in ((False, 'CacheAnimatedHead', (-1200,-1200)),
                                              (True, 'ReadAnimatedHead', (-1200,-2000))):
                node = controller.add_variable_node(VARIABLE, 'FTransform', unreal.Transform.static_struct(),
                          getter, '', unreal.Vector2D(*position), PREFIX+suffix, True)
                assert node
                added.append(str(node.get_name()))
                variable_nodes.append(node)
            store, read = variable_nodes
            wire(path(current,'Transform'), path(store,'Value'))
            wire(path(initial,'Transform'), path(normalize,'Value'))
            wire(path(read,'Value'), path(restore,'Value'))
            report['links_before_splice'] = [pair for pair in links(model)
                                             if pair[0] == chain[0] or pair[1] == first]
            broken = controller.break_link(chain[0], first, True)
            report['break_return'] = broken
            assert (chain[0], first) not in links(model), report['links_before_splice']
            wire(chain[0], exec_path(store))
            wire(exec_path(store), path(normalize,'ExecutePin'))
            wire(path(normalize,'ExecutePin'), first)
            wire(last, path(restore,'ExecutePin'))
            bp.recompile_vm()
            assert bp.get_editor_property('status') != unreal.BlueprintStatus.BS_ERROR
        after_defaults = defaults(model)
        assert {n:after_defaults[n] for n in before_defaults} == before_defaults
        removed = set(before_links)-set(links(model))
        assert removed == {(chain[0], first)}, removed
        execution_chain(model)
        report['before_save'] = validate(bp, head_name, samples, baselines)
        restore_inputs(bp.get_hierarchy(), saved_inputs)
        for host_path, values in live_inputs.items():
            host = unreal.find_object(None, host_path)
            if host:
                restore_inputs(host.get_hierarchy(), values)
        assert save_asset(bp, False)
        report['saved'] = True
        report['new_nodes'] = added
        report['nodes'] = len(model.get_nodes())
        report['links'] = len(model.get_links())
        report['inputs_restored'] = True
        assert hashlib.sha256(protected_disk.read_bytes()).hexdigest() == protected_hash
        report['protected_asset_unchanged'] = True
        report['passed'] = True
    except Exception as exc:
        report['error'] = repr(exc)
        for n in reversed(added):
            node = model.find_node_by_name(n)
            if node:
                controller.remove_node(node, False)
        if VARIABLE in [str(n) for n in bp.list_member_variable_names()]:
            bp.remove_member_variable(VARIABLE)
        if (chain[0], first) not in links(model):
            assert controller.add_link(chain[0], first, False)
        bp.recompile_vm()
        restore_inputs(bp.get_hierarchy(), saved_inputs)
        assert defaults(model) == before_defaults and links(model) == before_links
        assert save_asset(bp, False)
        report['rolled_back'] = True
        raise
    finally:
        bp.set_auto_vm_recompile(old_auto)
        output_path(context().current/'Evidence'/'head_space_report.json').write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k != 'before_save'}, ensure_ascii=False))
    print(json.dumps({k:v for k,v in report['before_save'].items() if k != 'rows'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
