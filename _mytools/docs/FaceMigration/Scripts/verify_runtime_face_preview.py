"""在正常预览帧逐个驱动全部 72 控制，检查 Rig 与网格骨骼/最终曲线并恢复输入。"""

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
import math
from pathlib import Path
import traceback
import unreal
from face_paths import PACKAGE_ROOT, context, runtime_path

_preview_job = json.loads((PACKAGE_ROOT / 'Jobs' / (context().job_id + '.json')).read_text(encoding='utf-8-sig'))
PREVIEW_HOST = _preview_job.get('preview', {}).get('host', 'asset_editor')
assert PREVIEW_HOST in ('asset_editor', 'pie'), PREVIEW_HOST


class RuntimeFaceFrameValidation:
    def __init__(self):
        self.root = Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
        self.out = _fm_output(_fm_tool('Docs/Evidence/SevenRuntime/' + ('pie_controls_validation.json' if PREVIEW_HOST == 'pie' else 'preview_controls_validation.json')))
        self.asset = unreal.load_asset(_fm_asset('/Game/_MyTest/Mouth/TMp/NewControlRigRuntimeAsset'))
        # 重开编辑器后旧 PreviewWorld 可能尚未回收；沿用已通过曲线检查的精确组件。
        preview = json.loads((_fm_read(_fm_tool('Docs/Evidence/SevenRuntime/' + ('pie_morph_check.json' if PREVIEW_HOST == 'pie' else 'preview_morph_check.json')))).read_text(encoding='utf-8'))
        assert preview['passed'] and not preview['pending']
        candidates = []
        for comp in unreal.ObjectIterator(unreal.SkeletalMeshComponent):
            if comp.get_path_name() != preview['preview_component'] or not comp.get_anim_instance():
                continue
            for host in unreal.RigVMHost.find_rig_vm_hosts(comp.get_anim_instance(), unreal.ControlRig):
                if host.get_vm().get_outer() == self.asset:
                    candidates.append((comp, host))
        assert len(candidates) == 1, str(candidates)
        self.comp, self.live = candidates[0]
        self.preview = preview
        self.h = self.live.get_hierarchy()
        self.temp = self.asset.get_editor_asset().create_rig_vm_host()
        self.temp.request_init()
        self.th = self.temp.get_hierarchy()
        assert len(self.th.get_bones()) == len(self.h.get_bones()) == 149
        self.saved = {str(k.name): self.h.get_vector_from_control_value(self.h.get_control_value(k)).to_tuple() for k in self.h.get_controls()}
        self.cases = [('neutral', {})]
        mixed = {}
        for ck in self.h.get_controls():
            st = self.h.get_control_settings(ck)
            if st.animation_type == unreal.RigControlAnimationType.VISUAL_CUE:
                continue
            lo = self.h.get_vector_from_control_value(st.minimum_value).to_tuple()
            hi = self.h.get_vector_from_control_value(st.maximum_value).to_tuple()
            values = [0.37 * (hi[a] if st.limit_enabled[a].maximum else 3) + 0.13 * (lo[a] if st.limit_enabled[a].minimum else -3) for a in range(3)]
            self.cases.append((str(ck.name), {str(ck.name): values}))
            mixed[str(ck.name)] = values
        assert len(self.cases) == 73
        validation = _preview_job.get('validation', {})
        self.head = (unreal.RigElementKey(type=unreal.RigElementType.BONE, name=validation['head_bone'])
                     if validation.get('head_bone') else None)
        self.saved_head = self.h.get_global_transform(self.head) if self.head else None
        self.head_poses = {}
        if self.head and PREVIEW_HOST == 'pie':
            for label, delta, rotation in (('head_turn', (30,-20,12), (15,35,8)),
                                            ('head_opposite', (-15,5,-10), (-25,-50,30))):
                transform = unreal.Transform()
                transform.translation = self.saved_head.translation + unreal.Vector(*delta)
                transform.rotation = unreal.Rotator(*rotation).quaternion() * self.saved_head.rotation
                transform.scale3d = self.saved_head.scale3d
                for suffix, values in (('neutral', {}), ('single', self.cases[1][1]),
                                        ('combined', mixed)):
                    name = label+'/'+suffix
                    self.head_poses[name] = transform
                    self.cases.append((name,values))
        self.cases.extend([('combined', mixed), ('restored', self.saved)])
        self.index = 0
        self.frames = 0
        self.rows = []
        self.result = dict(target=self.asset.get_path_name(), started_at=datetime.datetime.now().astimezone().isoformat(), pending=True,
                           tolerance=dict(position_cm=0.001, rotation_deg=0.01, scale=0.0001, curve=0.00001), rows=self.rows)

    def set_values(self, h, values):
        for ck in h.get_controls():
            value = values.get(str(ck.name), (0, 0, 0))
            h.set_control_value(ck, h.make_control_value_from_vector(unreal.Vector(*value)))

    def write(self):
        _fm_output(self.out).write_text(json.dumps(self.result, ensure_ascii=False, indent=2), encoding='utf-8')

    def cleanup_owned_pie(self):
        if PREVIEW_HOST != 'pie':
            return
        path = runtime_path('Evidence') / 'pie_preview_host.json'
        if not path.is_file():
            return
        report = json.loads(path.read_text(encoding='utf-8'))
        if not report.get('owns_pie') or report.get('target') != self.asset.get_path_name():
            return
        level = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
        level.editor_request_end_play()
        report['cleanup_requested'] = True
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        state = {}
        def after_pie(delta):
            if level.is_in_play_in_editor():
                return
            unreal.unregister_slate_post_tick_callback(state['handle'])
            actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
            for actor in unreal.ObjectIterator(unreal.SkeletalMeshActor):
                if actor.get_path_name() == report['actor']:
                    assert actors.destroy_actor(actor)
            report.update(cleanup_complete=True, level_not_saved=True)
            path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        state['handle'] = unreal.register_slate_post_tick_callback(after_pie)

    def qerror(self, a, b):
        aa, bb = (a.x,a.y,a.z,a.w), (b.x,b.y,b.z,b.w)
        dot = abs(sum(x*y for x,y in zip(aa,bb))) / math.sqrt(sum(x*x for x in aa)*sum(x*x for x in bb))
        return math.degrees(2*math.acos(min(1, max(0, dot))))

    def begin_case(self):
        if self.head:
            pose = self.head_poses.get(self.cases[self.index][0], self.saved_head)
            self.h.set_global_transform(self.head, pose, False, True)
            self.th.set_global_transform(self.head, pose, False, True)
        self.set_values(self.h, self.cases[self.index][1])
        self.set_values(self.th, self.cases[self.index][1])
        assert self.temp.execute('Forwards Solve')
        self.frames = 0
        self.time_before = self.live.get_absolute_time()

    def start(self):
        self.write()
        self.begin_case()
        self.handle = unreal.register_slate_post_tick_callback(self.tick)

    def tick(self, delta):
        self.frames += 1
        if self.frames < 5:
            return
        try:
            row = dict(case=self.cases[self.index][0], inputs=self.cases[self.index][1], position_cm=0.0, rotation_deg=0.0, scale=0.0, curve=0.0,
                       rig_position_cm=0.0, rig_rotation_deg=0.0, ui_position_cm=0.0, ui_rotation_deg=0.0,
                       time_advanced=self.live.get_absolute_time() > self.time_before)
            for bk in self.th.get_bones():
                expected = self.th.get_global_transform(bk)
                actual = self.comp.get_socket_transform(bk.name, unreal.RelativeTransformSpace.RTS_COMPONENT)
                live = self.h.get_global_transform(bk)
                row['position_cm'] = max(row['position_cm'], (actual.translation-expected.translation).length())
                row['rotation_deg'] = max(row['rotation_deg'], self.qerror(actual.rotation, expected.rotation))
                row['scale'] = max(row['scale'], (actual.scale3d-expected.scale3d).length())
                row['rig_position_cm'] = max(row['rig_position_cm'], (live.translation-expected.translation).length())
                row['rig_rotation_deg'] = max(row['rig_rotation_deg'], self.qerror(live.rotation, expected.rotation))
            for ck in self.th.get_curves():
                expected = self.th.get_curve_value(ck)
                row['curve'] = max(row['curve'], abs(self.comp.get_anim_instance().get_curve_value(ck.name)-expected))
            for ck in self.th.get_controls():
                for fn in ('get_global_transform','get_global_control_shape_transform'):
                    expected = getattr(self.th,fn)(ck)
                    actual = getattr(self.h,fn)(ck)
                    row['ui_position_cm'] = max(row['ui_position_cm'],(actual.translation-expected.translation).length())
                    row['ui_rotation_deg'] = max(row['ui_rotation_deg'],self.qerror(actual.rotation,expected.rotation))
            t = self.result['tolerance']
            row['passed'] = (row['time_advanced'] and all(row[k] <= v for k, v in t.items())
                             and max(row['rig_position_cm'],row['ui_position_cm']) <= t['position_cm']
                             and max(row['rig_rotation_deg'],row['ui_rotation_deg']) <= t['rotation_deg'])
            self.rows.append(row)
            self.index += 1
            if self.index < len(self.cases):
                self.write()
                self.begin_case()
                return
            self.result.update(pending=False, passed=all(r['passed'] for r in self.rows), controls=72, cases=len(self.rows), bones_per_case=149, curves_per_case=28,
                               restored_input_error=max((self.h.get_vector_from_control_value(self.h.get_control_value(k))-unreal.Vector(*self.saved[str(k.name)])).length() for k in self.h.get_controls()),
                               captured_at=datetime.datetime.now().astimezone().isoformat())
            self.result['passed'] = self.result['passed'] and self.result['restored_input_error'] < 1e-6
            unreal.unregister_slate_post_tick_callback(self.handle)
            self.write()
            if PREVIEW_HOST == 'pie':
                worst = {name: max(row[name] for row in self.rows) for name in self.result['tolerance']}
                report = dict(target=self.asset.get_path_name(), passed=self.result['passed'] and self.preview['passed'],
                              host=self.comp.get_path_name(), controls_set=72, cases=len(self.rows),
                              mesh_curves_equal_rig=worst['curve'] <= self.result['tolerance']['curve'],
                              rig_clock_advancing=all(r['time_advanced'] for r in self.rows),
                              result=worst, restored_input_error=self.result['restored_input_error'],
                              captured_at=self.result['captured_at'])
                report['head_space_cases'] = len(self.head_poses)
                report['head_space_normal_frame_passed'] = (all(r['passed'] for r in self.rows if r['case'] in self.head_poses)
                                                            if self.head_poses else None)
                report['animation_sequence_host_tested'] = False
                report['sequencer_tested'] = False
                report['head_input_method'] = 'live Rig hierarchy; reference-pose AnimBP with transfer_input_pose=False'
                (runtime_path('Evidence') / 'pie_preview_check.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
                self.cleanup_owned_pie()
        except Exception:
            if self.head:
                self.h.set_global_transform(self.head,self.saved_head,False,True)
            self.set_values(self.h, self.saved)
            self.live.execute('Forwards Solve')
            unreal.unregister_slate_post_tick_callback(self.handle)
            self.result.update(pending=False, passed=False, error=traceback.format_exc())
            self.write()
            self.cleanup_owned_pie()


_runtime_face_frame_validation = RuntimeFaceFrameValidation()
_runtime_face_frame_validation.start()
print('Scheduled ' + str(len(_runtime_face_frame_validation.cases)) + ' normal-frame preview cases')
