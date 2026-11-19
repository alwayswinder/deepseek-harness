"""新式 Seven Rig 的结构、全控制迁移对照和历史源样本验证。

历史验证器仅在内存中适配：目标用新资产，输出用独立目录；
原始验证脚本、历史采样及历史报告均不改写。
"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import ast
import contextlib
import datetime
import io
import json
import math
from pathlib import Path
import traceback
import types
import unreal
from slider_handle_layout import (HANDLE_FORWARD_CM, RAIL_CONTROL, slider_keys,
                                 validate_handle_depth, validate_rail_geometry, reference_shape_y,
                                 PHONEME_REFERENCE_CONTROL, validate_reference_depth)
from face_paths import context, PACKAGE_ROOT, rig_dependency_folder

ROOT = Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
SOURCE = _fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation')
TARGET = _fm_asset('/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset')
assert SOURCE != TARGET, '源和目标不能相同，禁止用自身对照证明迁移通过'
E = _fm_tool('Docs/Evidence/SevenRuntime')
EB = _fm_tool('Docs/Evidence')

class RuntimeRig:
    def __init__(self, asset):
        self.asset = asset
        self.editor = asset.get_editor_asset()

    def get_hierarchy(self):
        return self.asset.hierarchy

    def create_control_rig(self):
        host = self.editor.create_rig_vm_host()
        assert isinstance(host, unreal.ControlRig), str(host)
        return host

    def get_editor_property(self, name):
        if name == 'status':
            raise RuntimeError('新版资产无 BlueprintStatus，应通过真实实例执行检查编译')
        return self.asset.get_editor_property(name)

    def __getattr__(self, name):
        return getattr(self.editor, name)

def instance(asset):
    inst = asset.create_control_rig()
    inst.request_init()
    h = inst.get_hierarchy()
    if not h.get_all_keys():
        h.copy_hierarchy(asset.get_hierarchy())
        inst.request_init()
    expected = asset.get_hierarchy()
    for getter in ('get_bones', 'get_curves', 'get_controls'):
        assert [str(k.name) for k in getattr(h, getter)()] == [str(k.name) for k in getattr(expected, getter)()], getter
    names = {str(k.name) for k in h.get_controls()}
    assert len(names - {RAIL_CONTROL}) == 73
    return inst, h

def key(name, kind=unreal.RigElementType.BONE):
    return unreal.RigElementKey(type=kind, name=name)

def solve(inst, h, values):
    h.reset_pose_to_initial(unreal.RigElementType.CONTROL)
    for name, value in values.items():
        ck = key(name, unreal.RigElementType.CONTROL)
        assert h.contains(ck), name
        h.set_control_value(ck, h.make_control_value_from_vector(unreal.Vector(*value)))
    assert inst.execute('Forwards Solve')

def qerror(a, b):
    aa, bb = (a.x,a.y,a.z,a.w), (b.x,b.y,b.z,b.w)
    dot = abs(sum(x*y for x,y in zip(aa,bb))) / math.sqrt(sum(x*x for x in aa)*sum(x*x for x in bb))
    return math.degrees(2*math.acos(min(1,max(0,dot))))

def structural_and_transfer(phase):
    source = unreal.load_asset(SOURCE)
    target = RuntimeRig(unreal.load_asset(TARGET))
    sh, th = source.get_hierarchy(), target.get_hierarchy()
    sm, tm = source.get_default_model(), target.get_default_model()
    catalog = json.loads((PACKAGE_ROOT/'Characters'/context().character/'face-controls.json').read_text(encoding='utf-8'))
    wanted = {r['ue_control'] for r in catalog['bindings'] if r['enabled']}
    actual = {str(k.name) for k in th.get_controls() if th.get_control_settings(k).animation_type != unreal.RigControlAnimationType.VISUAL_CUE}
    assert wanted == actual and len(actual) == 72
    links = lambda m: sorted((str(l.get_source_pin().get_pin_path()),str(l.get_target_pin().get_pin_path())) for l in m.get_links())
    assert links(sm) == links(tm)
    edges = [(str(l.get_source_node().get_name()),str(l.get_target_node().get_name())) for l in tm.get_links() if 'Execute' in str(l.get_target_pin().get_name())]
    adjacent = dict(edges)
    assert len(adjacent) == len(edges)
    starts=set(adjacent)-set(adjacent.values())
    assert len(starts)==1
    cursor=starts.pop();chain=[]
    while cursor in adjacent:
        assert cursor not in chain
        chain.append(cursor);cursor=adjacent[cursor]
    chain.append(cursor)
    assert len(chain)==len(edges)+1
    driven=[]
    for node in tm.get_nodes():
        if str(node.get_name()).startswith(('BROW_SET_','EYE_SET_','LIP_SET_','CHEEK_SET_','NOSE_SET_','GAZE_SET_','CHIN_SET_')):
            assert str(node.get_name()) in chain
            driven.append(node.find_pin('Item').get_default_value().split('Name="')[1].split('"')[0])
    assert len(driven)==len(set(driven))==57
    cases=[{}]
    coverage={}
    for name in sorted(actual):
        ck=key(name,unreal.RigElementType.CONTROL)
        st=th.get_control_settings(ck)
        assert st.control_type == unreal.RigControlType.POSITION
        assert th.get_vector_from_control_value(th.get_control_value(ck,unreal.RigControlValueType.INITIAL)).length()<1e-6
        assert (th.get_global_control_offset_transform(ck,True).scale3d-unreal.Vector(1,1,1)).length()<1e-6
        lo=th.get_vector_from_control_value(st.minimum_value).to_tuple()
        hi=th.get_vector_from_control_value(st.maximum_value).to_tuple()
        coverage[name]=0
        for axis in range(3):
            limit=st.limit_enabled[axis]
            low=lo[axis] if limit.minimum else -8
            high=hi[axis] if limit.maximum else 8
            for value in sorted(set((low,low*.5,0,high*.5,high,low-2,high+2))):
                v=[0,0,0];v[axis]=value;cases.append({name:v});coverage[name]+=1
    import random
    rng=random.Random(20261109)
    for i in range(32):
        values={}
        for name in sorted(actual):
            st=th.get_control_settings(key(name,unreal.RigElementType.CONTROL))
            lo=th.get_vector_from_control_value(st.minimum_value).to_tuple();hi=th.get_vector_from_control_value(st.maximum_value).to_tuple()
            values[name]=[rng.uniform(lo[a] if st.limit_enabled[a].minimum else -3,hi[a] if st.limit_enabled[a].maximum else 3) for a in range(3)]
        cases.append(values)
    si,srh=instance(source);ti,trh=instance(target)
    worst=dict(position_cm=0,rotation_deg=0,scale=0,curve=0,control_position_cm=0)
    bone_keys=th.get_bones();curve_keys=th.get_curves();control_keys=sh.get_controls()
    for i,values in enumerate(cases):
        solve(si,srh,values);solve(ti,trh,values)
        for bk in bone_keys:
            a,b=srh.get_global_transform(bk),trh.get_global_transform(bk)
            worst['position_cm']=max(worst['position_cm'],(a.translation-b.translation).length())
            worst['rotation_deg']=max(worst['rotation_deg'],qerror(a.rotation,b.rotation))
            worst['scale']=max(worst['scale'],(a.scale3d-b.scale3d).length())
        for ck in curve_keys:worst['curve']=max(worst['curve'],abs(srh.get_curve_value(ck)-trh.get_curve_value(ck)))
        for ck in control_keys:worst['control_position_cm']=max(worst['control_position_cm'],(srh.get_global_transform(ck).translation-trh.get_global_transform(ck).translation).length())
    assert worst['position_cm']<1e-6 and worst['rotation_deg']<1e-4 and worst['scale']<1e-6 and worst['curve']<1e-6 and worst['control_position_cm']<1e-5,worst
    solve(ti,trh,{})
    curve_names={str(k.name) for k in curve_keys}
    mesh=target.asset.get_editor_property('preview_skeletal_mesh')
    morphs={str(m) for m in mesh.get_all_morph_target_names()}
    written_curves = {n.find_pin('Curve').get_default_value().strip('"') for n in tm.get_nodes()
                      if hasattr(n, 'get_script_struct') and n.get_script_struct()
                      and n.get_script_struct().get_name() == 'RigUnit_SetCurveValue'}
    assert written_curves <= curve_names and written_curves <= morphs, written_curves - morphs
    report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),target=TARGET,phase=phase,passed=True,
                animation_controls=len(actual),visual_cues=len(th.get_controls())-len(actual),bones=len(bone_keys),curves=len(curve_keys),nodes=len(tm.get_nodes()),links=len(tm.get_links()),
                execution_edges=len(edges),bone_writes=len(driven),cases=len(cases),coverage=coverage,worst=worst,
                driven_curves=sorted(written_curves), non_morph_curves=sorted(curve_names-morphs),
                curve_targets_exist=True,comparison='live legacy Seven reference; migration equivalence, not new Max capture',
                limits='compared with reference control values; role-specific verifiers assert functional limits')
    out=E/phase/'transfer_validation.json';_fm_output(out.parent).mkdir(parents=True,exist_ok=True)
    _fm_output(out).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return report

def animated_space_validation(phase):
    """Check animated input preservation and every UI element separately."""
    import wrap_face_head_space as w
    source = unreal.load_asset(SOURCE)
    target = RuntimeRig(unreal.load_asset(TARGET))
    job = PACKAGE_ROOT / 'Jobs' / (context().job_id + '.json')
    cfg = json.loads(job.read_text(encoding='utf-8-sig'))['validation']
    head_name = cfg['head_bone']
    head = key(head_name)
    si, sh = instance(source)
    ti, th = instance(target)
    space = key('FACE_SPACE', unreal.RigElementType.NULL)
    assert th.contains(space)
    parent = th.get_first_parent(space)
    assert parent.name == head.name and parent.type == head.type
    source_variables = {str(v.name): v for v in source.get_member_variables()}
    target_variables = {str(v.name): v for v in target.editor.get_asset_variables()}
    assert set(source_variables) == set(target_variables), '成员变量未完整迁移'
    metadata_differences = []
    for name, v in source_variables.items():
        other = target_variables[name]
        for field in ('cpp_type', 'cpp_type_object', 'default_value', 'public', 'private'):
            assert getattr(v, field) == getattr(other, field), (name, field)
        for field in ('expose_to_cinematics', 'exposed_on_spawn', 'category', 'tooltip'):
            if str(getattr(v,field)) != str(getattr(other,field)):
                metadata_differences.append(dict(variable=name,field=field,
                    source=str(getattr(v,field)),target=str(getattr(other,field))))
    initial = th.get_global_transform(head, True)
    poses = [('reference', {})]
    inventory = json.loads((_fm_read(EB/'reference_inventory.json')).read_text(encoding='utf-8'))
    target_pose = inventory['binding_check'].get('target_initial_pose')
    if target_pose:
        poses.append(('original_target_reference_pose', target_pose))
    for label, delta, rotation in (('head_turn', (30,-20,12), (15,35,8)),
                                    ('head_opposite', (-15,5,-10), (-25,-50,30))):
        tf = unreal.Transform()
        tf.translation = initial.translation + unreal.Vector(*delta)
        tf.rotation = unreal.Rotator(*rotation).quaternion() * initial.rotation
        tf.scale3d = initial.scale3d
        poses.append((label, {head_name: w.encoded(tf)}))
    animation_path = cfg.get('animation')
    times = []
    if animation_path:
        animation = unreal.load_asset(_fm_asset(animation_path))
        assert animation, animation_path
        options = unreal.AnimPoseEvaluationOptions()
        options.optional_skeletal_mesh = target.asset.get_editor_property('preview_skeletal_mesh')
        options.should_retarget = True
        length = animation.get_play_length()
        times = [0., length*.25, length*.5, length*.75, max(0., length-1./30.)]
        for time in times:
            pose = unreal.AnimPoseExtensions.get_anim_pose_at_time(animation, time, options)
            poses.append(('animation_'+str(time), {str(k.name): w.encoded(
                unreal.AnimPoseExtensions.get_bone_pose(pose, k.name, unreal.AnimPoseSpaces.WORLD))
                for k in th.get_bones()}))
    affected = w.subtree(th, head_name)
    rows = []
    worst = dict(head=[0.,0.,0.], body=[0.,0.,0.], transfer=[0.,0.,0.],
                 controls=[0.,0.,0.], shapes=[0.,0.,0.], repeated=[0.,0.,0.])
    def compare(section, a, b):
        errors = w.error(a,b)
        worst[section] = [max(x,y) for x,y in zip(worst[section],errors)]
        assert errors[0] < 1e-4 and errors[1] < 1e-3 and errors[2] < 1e-5, (section,errors)
    for label, values in w.cases(th):
        w.reset(th,values)
        assert ti.execute('Forwards Solve')
        reference = {kind: {str(k.name): w.encoded(fn(k)) for k in th.get_controls()}
                     for kind,fn in (('controls',th.get_global_transform),
                                     ('shapes',th.get_global_control_shape_transform))}
        for pose_label, pose in poses:
            for host,h in ((si,sh),(ti,th)):
                w.reset(h,values)
                for name,tf in pose.items():
                    h.set_global_transform(key(name),w.decoded(tf),False,True)
            input_head = th.get_global_transform(head)
            input_body = {str(k.name): w.encoded(th.get_global_transform(k))
                          for k in th.get_bones() if str(k.name) not in affected}
            assert si.execute('Forwards Solve') and ti.execute('Forwards Solve')
            compare('head',th.get_global_transform(head),input_head)
            for name,tf in input_body.items():
                compare('body',th.get_global_transform(key(name)),w.decoded(tf))
            for k in th.get_bones():
                compare('transfer',th.get_global_transform(k),sh.get_global_transform(k))
            for section,fn in (('controls',th.get_global_transform),
                               ('shapes',th.get_global_control_shape_transform)):
                for name,tf in reference[section].items():
                    expected = unreal.MathLibrary.compose_transforms(
                        unreal.MathLibrary.make_relative_transform(w.decoded(tf),initial),input_head)
                    compare(section,fn(key(name,unreal.RigElementType.CONTROL)),expected)
            before = {k: th.get_global_transform(k) for k in th.get_all_keys()
                      if k.type != unreal.RigElementType.CURVE}
            assert ti.execute('Forwards Solve')
            for k,tf in before.items():
                compare('repeated',th.get_global_transform(k),tf)
            assert w.inputs(th) == {str(k.name): values.get(str(k.name),[0.,0.,0.]) for k in th.get_controls()}
            rows.append(dict(input=label,pose=pose_label))
    report = dict(passed=True,phase=phase,target=TARGET,head_bone=head_name,
                  animation=animation_path,animation_times=times,cases=len(rows),worst=worst,
                  animated_head_space_passed=True,control_head_follow_passed=True,
                  member_variables=list(target_variables),sequencer='not_tested',
                  variable_metadata_differences=metadata_differences,
                  normal_frame='separate_preview_report',visual_acceptance='pending_user')
    _fm_output(E/phase/'animated_space_validation.json').write_text(
        json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return report

class AdaptVerifier(ast.NodeTransformer):
    def visit_Call(self,node):
        self.generic_visit(node)
        if isinstance(node.func,ast.Name) and node.func.id=='_fm_load_asset':
            node.func=ast.Name(id='_load_asset',ctx=ast.Load())
        if isinstance(node.func,ast.Attribute):
            if node.func.attr=='load_asset' and isinstance(node.func.value,ast.Name) and node.func.value.id=='unreal':
                node.func=ast.Name(id='_load_asset',ctx=ast.Load())
            elif node.func.attr=='write_text':
                node.func.value=ast.Call(func=ast.Name(id='_report_path',ctx=ast.Load()),args=[node.func.value],keywords=[])
            elif node.func.attr=='get_editor_property' and len(node.args)==1 and isinstance(node.args[0],ast.Constant) and node.args[0].value=='status':
                return ast.Constant(value='RuntimeAsset: fresh instance execution validated; no BlueprintStatus')
        return node

def panel_dependency_contract(target, phase):
    """读取已保存依赖的引用闭包，避免只有同名文件但仍引用示例资源。"""
    folder = rig_dependency_folder(TARGET)
    source_root = SOURCE.rsplit('/', 1)[0] + '/'
    assets = [unreal.load_asset(p) for p in unreal.EditorAssetLibrary.list_assets(folder, True, False)]
    packages = {a.get_path_name().split('.')[0] for a in assets if a}
    libraries = [lib.get_path_name().split('.')[0] for lib in target.get_editor_property('shape_libraries')]
    errors = [p for p in libraries if p.startswith('/Game/') and p not in packages]
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    options = unreal.AssetRegistryDependencyOptions(include_hard_package_references=True,
                                                   include_soft_package_references=True)
    references = {}
    for package in sorted(packages | ({TARGET} if phase == 'after_reload' else set())):
        dependencies = sorted(str(p) for p in (registry.get_dependencies(package, options) or []))
        references[package] = dependencies
        errors.extend(p for p in dependencies if p.startswith(source_root) or p.startswith(TARGET + '_UI/'))
    expected = {'T_expression', 'M_PhonemeReference', 'SM_PhonemeReference', 'SL_PhonemeReference',
                'M_SliderRails', 'SM_SliderRails', 'SL_SliderRails'}
    missing = sorted(expected - {p.rsplit('/', 1)[-1] for p in packages})
    errors.extend('missing:' + name for name in missing)
    report = dict(passed=not errors, phase=phase, target=TARGET, folder=folder,
                  assets=sorted(packages), shape_libraries=libraries,
                  disk_references=references, errors=errors)
    _fm_output(EB/('asset_layout_' + phase + '.json')).write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return report


def display_contract(phase='before_reload'):
    """Compare the reference and target display contract and write layout_validation.json."""
    source = unreal.load_asset(SOURCE)
    target = unreal.load_asset(TARGET)
    sh, th = source.get_hierarchy(), target.hierarchy

    def row(h, element):
        settings = h.get_control_settings(element)
        parent = h.get_first_parent(element)
        offset = h.get_global_control_offset_transform(element, True)
        shape = h.get_global_control_shape_transform(element, True)
        local_shape = h.get_local_control_shape_transform(element, True)
        return {'display_name': str(settings.display_name),
                'animation_type': str(settings.animation_type),
                'control_type': str(settings.control_type),
                'parent': [str(parent.name), str(parent.type)],
                'shape_name': str(settings.shape_name),
                'shape_color': [round(v, 4) for v in settings.shape_color.to_tuple()],
                'shape_scale': [round(v, 6) for v in shape.scale3d.to_tuple()],
                'shape_local_p': [round(v, 6) for v in local_shape.translation.to_tuple()],
                'offset_p': [round(v, 5) for v in offset.translation.to_tuple()],
                'offset_r': [round(v, 6) for v in (offset.rotation.x, offset.rotation.y, offset.rotation.z, offset.rotation.w)],
                'limits': [list(h.get_vector_from_control_value(settings.minimum_value).to_tuple()),
                           list(h.get_vector_from_control_value(settings.maximum_value).to_tuple()),
                           [[bool(settings.limit_enabled[i].minimum), bool(settings.limit_enabled[i].maximum)] for i in range(3)]],
                'draw_limits': bool(settings.draw_limits), 'shape_visible': bool(settings.shape_visible),
                'transient': bool(settings.is_transient_control),
                'group_with_parent': bool(settings.group_with_parent_control)}

    source_rows = {str(k.name): row(sh, k) for k in sh.get_controls()}
    target_rows = {str(k.name): row(th, k) for k in th.get_controls()}
    # 目标手柄向前浮起，属于明确的操作修正，不要求复制示例的共面缺陷。
    handle_keys = slider_keys(th, target.get_editor_asset().get_default_model())
    overrides = []
    reference_y = reference_shape_y(th, target.get_editor_asset().get_default_model())
    if reference_y is not None and PHONEME_REFERENCE_CONTROL in source_rows:
        reference = source_rows[PHONEME_REFERENCE_CONTROL]
        old = list(reference['shape_local_p'])
        reference['shape_local_p'][1] = reference_y
        overrides.append({'control': PHONEME_REFERENCE_CONTROL, 'field': 'shape_local_p',
                          'reference': old, 'expected': reference['shape_local_p']})
    for key in handle_keys:
        name = str(key.name)
        if name in source_rows:
            old = list(source_rows[name]['shape_local_p'])
            source_rows[name]['shape_local_p'][1] = HANDLE_FORWARD_CM
            overrides.append({'control': name, 'field': 'shape_local_p',
                              'reference': old, 'expected': source_rows[name]['shape_local_p']})
    try:
        depth_rows = validate_handle_depth(th, handle_keys)
        rail_geometry = validate_rail_geometry(target)
        reference_depth = validate_reference_depth(th, target.get_editor_asset().get_default_model())
        depth_passed = True
    except AssertionError as exc:
        depth_rows = [{'error': str(exc)}]
        rail_geometry = {'error': str(exc)}
        reference_depth = {'error': str(exc)}
        depth_passed = False
    diffs = []
    for name, reference in source_rows.items():
        got = target_rows.get(name)
        if got is None:
            diffs.append({'control': name, 'field': 'missing_in_target'})
            continue
        for field, value in reference.items():
            if isinstance(value, list) and value and isinstance(value[0], float):
                if any(abs(a - b) > 1e-5 for a, b in zip(value, got[field])):
                    diffs.append({'control': name, 'field': field, 'source': value, 'target': got[field]})
            elif value != got[field]:
                diffs.append({'control': name, 'field': field, 'source': value, 'target': got[field]})
    rails = [str(n.get_name()) for n in source.get_default_model().get_nodes() if str(n.get_name()).endswith('_RAIL')]
    target_rails = [str(n.get_name()) for n in target.get_editor_asset().get_default_model().get_nodes()
                    if str(n.get_name()).endswith('_RAIL')]
    expected_target_names = set(source_rows) | {RAIL_CONTROL}
    if RAIL_CONTROL not in target_rows or target_rows[RAIL_CONTROL]['animation_type'] != str(unreal.RigControlAnimationType.VISUAL_CUE):
        diffs.append({'control': RAIL_CONTROL, 'field': 'missing_visual_cue'})
    libraries = [lib.get_path_name() for lib in target.get_editor_property('shape_libraries')]
    shape_sets = {}
    for path in libraries:
        lib = unreal.load_asset(path)
        names = []
        if lib:
            try:
                names = [str(s.get_editor_property('shape_name')) for s in lib.get_editor_property('shapes')]
            except Exception as exc:
                names = ['ERR:' + str(exc)]
        shape_sets[path] = names

    def resolves(name):
        prefix, _, short = name.rpartition('.')
        if prefix:
            return any(short in v and prefix.split('.')[-1] in k for k, v in shape_sets.items())
        return any(name in v for v in shape_sets.values())

    used = sorted({r['shape_name'] for r in target_rows.values()})
    unresolved = [name for name in used if not resolves(name)]
    panel = panel_dependency_contract(target, phase)
    report = {'captured_at': datetime.datetime.now().astimezone().isoformat(), 'phase': phase,
              'reference': SOURCE, 'target': TARGET,
              'controls_source': len(source_rows), 'controls_target': len(target_rows),
              'control_names_equal': set(source_rows) == set(target_rows),
              'control_names_match_expected': expected_target_names == set(target_rows),
              'auxiliary_controls_added': sorted(expected_target_names - set(source_rows)), 'rail_geometry': rail_geometry,
              'phoneme_reference_depth': reference_depth,
              'display_differences': diffs, 'shape_libraries_target': libraries,
              'intentional_layout_overrides': overrides, 'slider_handle_depth_cm': HANDLE_FORWARD_CM,
              'slider_handle_depth_passed': depth_passed, 'slider_handles': depth_rows,
              'shape_library_contents': {k: len(v) for k, v in shape_sets.items()},
              'shape_names_used': used, 'shape_names_unresolved': unresolved,
              'rail_nodes_source': len(rails), 'rail_nodes_target': len(target_rails),
              'asset_layout': panel,
              'rails_equal': rails == target_rails,
              'visual_acceptance': 'pending_user'}
    report['passed'] = (not diffs and expected_target_names == set(target_rows) and rails == target_rails
                        and not unresolved and depth_passed and panel['passed'])
    # 固定报告名在 Evidence 根（Build.md 第 7 节）；同时保留 SevenRuntime 下的旧路径副本。
    for target_path in (_fm_output(EB/'layout_validation.json'), _fm_output(E/'layout_validation.json')):
        target_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return report


# 只有这些部位把 previous_controls.json 当回归基线；verify_lower_lids.py 只读 max_samples.json，
# 因此不参与谱系判定，但仍会运行。
LEGACY_EVIDENCE = {'verify_lip_controls.py': 'LipControls',
                   'verify_cheek_controls.py': 'Cheeks', 'verify_nose_controls.py': 'Nose',
                   'verify_mouth_controls.py': 'MouthControls', 'verify_eyeball_controls.py': 'Eyeballs',
                   'verify_gaze_master.py': 'GazeMaster', 'verify_chin_control.py': 'Chin',
                   'verify_expression_sliders.py': 'ExpressionSliders',
                   'verify_phoneme_sliders.py': 'PhonemeSliders',
                   'verify_eye_expression_sliders.py': 'EyeExpressions',
                   'verify_nose_side_controls.py': 'NoseSides'}


def legacy_applicability():
    """旧控回归只对“保留旧求解”的谱系有效；先证明基线同名同谱系，否则整段跳过。"""
    curves = {str(c.name) for c in unreal.load_asset(TARGET).hierarchy.get_curves()}
    empty_bones, stale_curves, missing = [], [], []
    for folder in sorted(set(LEGACY_EVIDENCE.values())):
        path = _fm_tool(f'Docs/Evidence/{folder}/previous_controls.json')
        try:
            data = json.loads(_fm_read(path).read_text(encoding='utf-8'))
        except FileNotFoundError:
            missing.append(folder)
            continue
        cases = data.get('cases', [])
        if cases and all(not case.get('bones') for case in cases):
            empty_bones.append(folder)
            continue
        stale = sorted({name for case in cases for name in (case.get('curves') or {})} - curves)
        if stale:
            stale_curves.append({'folder': folder, 'curves': stale[:5]})
    reasons = []
    if empty_bones:
        reasons.append('case.bones 为空（期望全部骨保持中性）: ' + ', '.join(empty_bones))
    if stale_curves:
        reasons.append('历史曲线名不在当前层级: ' + ', '.join(f"{row['folder']}={row['curves']}" for row in stale_curves))
    if missing:
        reasons.append('缺少 previous_controls.json（该部位没有回归基线）: ' + ', '.join(missing))
    status = 'applicable' if not reasons else 'not_applicable'
    return status, '; '.join(reasons)


def legacy_verifiers(phase):
    files=['verify_lower_lids.py','verify_lip_controls.py','verify_cheek_controls.py','verify_nose_controls.py',
           'verify_mouth_controls.py','verify_eyeball_controls.py','verify_gaze_master.py','verify_chin_control.py',
           'verify_expression_sliders.py','verify_phoneme_sliders.py','verify_eye_expression_sliders.py','verify_nose_side_controls.py']
    results=[]
    for filename in files:
        outdir=E/phase/Path(filename).stem;_fm_output(outdir).mkdir(parents=True,exist_ok=True)
        def report_path(path):
            return _fm_output(outdir/path.name)
        facade=RuntimeRig(unreal.load_asset(TARGET))
        def load_asset(path,*args,**kwargs):
            return facade if path in (SOURCE,TARGET) else unreal.load_asset(path,*args,**kwargs)
        module=types.ModuleType('runtime_test_'+Path(filename).stem)
        module.__dict__.update(_load_asset=load_asset,_report_path=report_path)
        tree=ast.fix_missing_locations(AdaptVerifier().visit(ast.parse((_fm_read(_fm_tool('Scripts')/filename)).read_text(encoding='utf-8-sig'))))
        started=datetime.datetime.now().astimezone().isoformat()
        output=io.StringIO()
        try:
            with contextlib.redirect_stdout(output):
                exec(compile(tree,filename,'exec'),module.__dict__)
                seen=set()
                def retarget(mod):
                    if id(mod) in seen or mod is unreal:return
                    seen.add(id(mod))
                    if getattr(mod,'ASSET',None)==SOURCE:mod.ASSET=TARGET
                    for value in list(vars(mod).values()):
                        if isinstance(value,types.ModuleType) and value.__name__ not in ('unreal','sys','os','json','math','types','datetime','importlib','shutil','pathlib'):
                            if any(k in vars(value) for k in ('ASSET','helpers','base','helper','b','v')):retarget(value)
                retarget(module)
                module.main()
            result=dict(script=filename,passed=True,started_at=started)
        except Exception:
            result=dict(script=filename,passed=False,started_at=started,error=traceback.format_exc())
        (_fm_output(outdir/'console.txt')).write_text(output.getvalue(),encoding='utf-8')
        (_fm_output(outdir/'result.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        results.append(result)
        print(json.dumps(result,ensure_ascii=False))
    (_fm_output(E/phase/'source_verifiers.json')).write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    return results

def main(phase='before_reload'):
    _fm_output(E).mkdir(parents=True,exist_ok=True)
    transfer=structural_and_transfer(phase)
    display=display_contract(phase)
    animated=animated_space_validation(phase)
    legacy_status,legacy_reason=legacy_applicability()
    if legacy_status=='applicable':
        source=legacy_verifiers(phase)
        legacy_passed=all(r['passed'] for r in source)
    else:
        source=[]
        legacy_passed=True
        (_fm_output(E/phase/'source_verifiers.json')).write_text(json.dumps([],ensure_ascii=False,indent=2),encoding='utf-8')
    report=dict(captured_at=datetime.datetime.now().astimezone().isoformat(),target=TARGET,phase=phase,
                passed=transfer['passed'] and display['passed'] and animated['passed'] and legacy_passed,
                animated_space_passed=animated['passed'],animated_space_cases=animated['cases'],
                transfer_passed=transfer['passed'],transfer_cases=transfer['cases'],
                display_passed=display['passed'],display_differences=len(display['display_differences']),
                display_unresolved_shapes=display['shape_names_unresolved'],
                legacy_status=legacy_status,legacy_reason=legacy_reason,
                legacy_passed=legacy_passed if legacy_status=='applicable' else None,
                source_verifiers_passed=sum(r['passed'] for r in source),source_verifiers_total=len(source))
    (_fm_output(E/phase/'summary.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))
    return report

if __name__=='__main__':main()
