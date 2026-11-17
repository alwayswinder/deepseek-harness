"""无需 UE 的行为测试：防写回基准、防串项目和保留规则。"""
from __future__ import annotations
import json
import contextlib
import hashlib
import io
import os
from pathlib import Path
import runpy
import shutil
import subprocess
import sys
import tempfile
import types
import unittest
from unittest import mock

sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'Scripts'))
import face_paths as paths
import prepare_max
import ue_run


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='FaceMigrationTest_')
        self.root=Path(self.temp.name).resolve()
        self.project=self.root/'TargetProject'
        self.project.mkdir()
        (self.project/'Target.uproject').write_text('{"EngineAssociation":"5.8"}')
        self.package=self.project/'Tools/FaceMigration'
        self.data=self.package/'Characters/Seven/Evidence/LipControls'
        self.data.mkdir(parents=True)
        self.patch=mock.patch.object(paths,'PACKAGE_ROOT',self.package)
        self.patch.start()
        self.previous=paths._context
        self.ctx=paths.configure(project=self.project,config={'job_id':'test','character':'Seven'})

    def tearDown(self):
        paths._context=self.previous
        self.patch.stop()
        self.temp.cleanup()

    def test_output_isolated_and_current_input_preferred(self):
        baseline=self.data/'parameters.json'
        baseline.write_text('old')
        self.assertEqual(paths.read_path(baseline),baseline)
        output=paths.output_path(baseline)
        output.write_text('new')
        self.assertEqual(baseline.read_text(),'old')
        self.assertEqual(paths.read_path(baseline).read_text(),'new')
        self.assertTrue(output.is_relative_to(self.project/'Saved/FaceMigration'))
        with self.assertRaises(ValueError):
            paths.output_path(self.package/'Scripts/new.py')
        with self.assertRaises(ValueError):
            paths.output_path(self.project/'Content/data.json')

    def test_rig_panel_folders_isolate_characters_and_accept_object_paths(self):
        seven = paths.rig_dependency_folder('/Game/Cast/SevenECR/CR_Seven_Expression')
        other = paths.rig_dependency_folder('/Game/Cast/Seven01ECR/CR_Seven01_Expression.CR_Seven01_Expression')
        self.assertEqual(seven, '/Game/Cast/SevenECR/ToolsPanel')
        self.assertEqual(other, '/Game/Cast/Seven01ECR/ToolsPanel')
        self.assertNotEqual(seven, other)
        for invalid in ('/Engine/CR_Test', '/Game/Cast/', '/Game/Cast/../CR_Test'):
            with self.assertRaises(ValueError):
                paths.rig_dependency_folder(invalid)

    def test_project_side_evidence_wins_over_package_baseline(self):
        baseline=self.data/'max_samples.json';baseline.write_text('package')
        side=self.project/'Saved/FaceMigration/Characters/Seven/LipControls/max_samples.json'
        side.parent.mkdir(parents=True);side.write_text('project')
        self.assertEqual(paths.read_path(baseline).read_text(),'project')
        self.ctx.initialize()
        paths.output_path(baseline).write_text('task')
        self.assertEqual(paths.read_path(baseline).read_text(),'task')
        self.assertEqual(paths.character_output_path('LipControls/x.json').parent,side.parent)

    def test_current_report_cannot_fall_back_to_history(self):
        report=self.data/'build_report.json'
        report.write_text('{"passed":true}')
        with self.assertRaises(FileNotFoundError):
            paths.read_path(report)
        paths.output_path(report).write_text('{"passed":false}')
        self.assertFalse(json.loads(paths.read_path(report).read_text())['passed'])

    def test_dynamic_legacy_paths_resolve_without_root_docs(self):
        baseline=self.data/'parameters.json';baseline.write_text('reference')
        group='LipControls'
        legacy=self.project/f'Docs/Evidence/{group}/parameters.json'
        self.assertEqual(paths.read_path(legacy),baseline)
        paths.output_path(legacy).write_text('new')
        self.assertEqual(paths.read_path(legacy).read_text(),'new')
        self.assertFalse((self.project/'Docs').exists())

    def test_project_and_job_inputs_do_not_leak(self):
        source=self.data/'parameters.json'
        source.write_text('reference')
        paths.output_path(source).write_text('project A')
        other=self.root/'OtherProject';other.mkdir()
        (other/'Other.uproject').write_text('{}')
        paths.configure(project=other,config={'job_id':'test','character':'Seven'})
        self.assertEqual(paths.read_path(source).read_text(),'reference')
        self.assertNotEqual(paths.output_path(source),self.ctx.current/'Evidence/LipControls/parameters.json')

    def test_changing_assets_requires_new_job_id(self):
        source=self.data/'parameters.json';source.write_text('reference')
        paths.output_path(source).write_text('old target')
        paths.configure(project=self.project,config={'job_id':'test','character':'Seven',
            'asset_overrides':{'/Game/Old':'/Game/New'}})
        with self.assertRaises(ValueError): paths.read_path(source)
        with self.assertRaises(ValueError): paths.output_path(source)

    def test_path_traversal_is_rejected(self):
        with self.assertRaises(ValueError): paths.tool_path('../outside')
        with self.assertRaises(ValueError): paths.runtime_path('../../../../outside')
        with self.assertRaises(ValueError):
            paths.configure(project=self.project,config={'job_id':'../Other'})

    def test_retention_keeps_three_per_group_and_pinned_and_unmanaged(self):
        self.ctx.initialize()
        parent=self.ctx.current/'Backups';parent.mkdir()
        for group in ('Lip','Nose'):
            for number in range(1,6):
                folder=parent/f'{group}_20261110_10000{number}';folder.mkdir()
                (folder/'disk.uasset').write_text('backup')
        pinned=parent/'Lip_20261110_090000';pinned.mkdir();(pinned/'.keep').touch()
        unrelated=parent/'ManualBackup';unrelated.mkdir()
        imported=self.project/'Saved/FaceMigration/Imported';imported.mkdir();(imported/'keep.txt').write_text('keep')
        candidates=paths.cleanup(keep=3,apply=False)
        self.assertEqual(len(candidates),4)
        self.assertEqual(len(list(parent.iterdir())),12)
        paths.cleanup(keep=3,apply=True)
        self.assertEqual(len(list(parent.iterdir())),8)
        self.assertTrue(pinned.exists())
        self.assertTrue(unrelated.exists())
        self.assertTrue((imported/'keep.txt').exists())
        self.assertEqual(paths.cleanup(keep=3,apply=True),[])

    def test_cleanup_rejects_wrong_marker(self):
        self.ctx.initialize()
        marker=self.ctx.managed/'.face-migration.json'
        marker.write_text('{}')
        with self.assertRaises(ValueError): paths.cleanup(apply=True)

    def test_cleanup_refuses_links_inside_deletion_candidates(self):
        self.ctx.initialize()
        parent=self.ctx.current/'Backups';parent.mkdir()
        old=parent/'Lip_20261110_100001';old.mkdir();(old/'linked').touch()
        (parent/'Lip_20261110_100002').mkdir()
        actual=paths.is_link
        with mock.patch.object(paths,'is_link',side_effect=lambda p:p.name=='linked' or actual(p)):
            with self.assertRaises(ValueError):paths.cleanup(keep=1,apply=True)
        self.assertTrue(old.exists())

    def test_asset_package_and_disk_mappings_stay_in_target(self):
        paths.configure(project=self.project,config={'job_id':'mapped','character':'Seven',
            'asset_overrides':{'/Game/Old/Rig':'/Game/New/Rig'}})
        self.assertEqual(paths.asset_path('/Game/Old/Rig'),'/Game/New/Rig')
        self.assertEqual(paths.asset_disk_path('Content/Old/Rig.uasset'),self.project/'Content/New/Rig.uasset')
        self.assertEqual(paths.tool_path('Docs/Evidence/LipControls'),self.data)
        self.assertEqual(paths.tool_path('Scripts/helper.py'),self.package/'Scripts/helper.py')

    def test_engine_resolution_has_no_old_machine_dependency(self):
        engine=self.root/'CustomEngine'
        folder=engine/'Engine/Plugins/Experimental/PythonScriptPlugin/Content/Python'
        folder.mkdir(parents=True);(folder/'remote_execution.py').touch()
        self.assertEqual(ue_run.engine_python(self.project,engine),folder)
        with self.assertRaises(FileNotFoundError): ue_run.engine_python(self.project,self.root/'Missing')

    def test_ue_connection_selects_project_and_closes_on_ambiguity(self):
        class Connection:
            remote_nodes=[{'node_id':'wrong','project_root':str(self.root/'Other')},
                          {'node_id':'right','project_root':str(self.project)}]
            def start(instance): pass
            def stop(instance): instance.stopped=True
            def open_command_connection(instance,node): instance.selected=node
        connection=Connection()
        remote=types.SimpleNamespace(RemoteExecution=lambda:connection)
        self.assertEqual(ue_run.connect(remote,1,self.project).selected,'right')
        connection.remote_nodes.append({'node_id':'duplicate','project_root':str(self.project)})
        with self.assertRaises(RuntimeError): ue_run.connect(remote,1,self.project)
        self.assertTrue(connection.stopped)

    def test_max_context_uses_target_and_dry_run_writes_nothing(self):
        script=self.root/'probe.ms';script.write_text('print FaceMigrationTempDir')
        job=self.root/'job.json';job.write_text('{"schema_version":1,"job_id":"max-test","character":"Seven"}')
        result=prepare_max.prepare(script,self.project,str(job),create=False)
        self.assertIn(self.project.as_posix(),result['code'])
        self.assertFalse((self.project/'Saved').exists())

    def test_source_files_resolve_from_target_and_missing_input_fails(self):
        source=self.project/'Source Files/角色.fbx'
        source.parent.mkdir();source.write_bytes(b'fbx fixture')
        paths.configure(project=self.project,config={'job_id':'source-test','character':'Seven',
            'source':{'fbx':'Source Files/角色.fbx'}})
        self.assertEqual(paths.source_path('fbx'),source.resolve())
        with self.assertRaises(ValueError):paths.source_path('fbx_check')
        with self.assertRaises(FileNotFoundError):paths.source_path('fbx','missing.fbx')
        self.assertFalse((self.project/'Saved').exists())
        paths.output_path(self.data/'parameters.json').write_text('fit')
        paths.configure(project=self.project,config={'job_id':'source-test','character':'Seven',
            'source':{'fbx':'Source Files/different.fbx'}})
        with self.assertRaises(ValueError):paths.read_path(self.data/'parameters.json')

    def test_max_source_path_and_failed_preparation_do_not_depend_on_cwd(self):
        source=self.project/'Source Files/角色.max'
        source.parent.mkdir();source.touch()
        script=self.root/'sample.ms';script.write_text('print FaceMigrationSourceScene')
        job=self.root/'job.json';job.write_text(json.dumps({'schema_version':1,'job_id':'max-source',
            'character':'Seven','source':{'max_scene':'Source Files/角色.max'}}),encoding='utf-8')
        result=prepare_max.prepare(script,self.project,str(job),create=False)
        self.assertIn(source.as_posix(),result['code'])
        self.assertFalse((self.project/'Saved').exists())
        with self.assertRaises(FileNotFoundError):
            prepare_max.prepare(self.root/'missing.ms',self.project,str(job))
        self.assertFalse((self.project/'Saved').exists())

    def test_imports_use_configured_source_and_mapped_destination_name(self):
        scripts=Path(__file__).resolve().parents[1]/'Scripts'
        source=self.project/'Source Files/角色.fbx'
        source.parent.mkdir();source.touch()
        imported=[]
        unreal=types.SimpleNamespace(AssetImportTask=lambda:types.SimpleNamespace(imported_object_paths=[]),
            AssetToolsHelpers=types.SimpleNamespace(get_asset_tools=lambda:
                types.SimpleNamespace(import_asset_tasks=lambda tasks:imported.extend(tasks))),
            load_asset=lambda *args,**kwargs:None)
        for script,key,old in [('import_seven_check.py','fbx_check','/Game/_MyTest/Temp/SevenCheck'),
                               ('import_seven_replace.py','fbx','/Game/_MyTest/Mouth/Mesh/Seven')]:
            paths.configure(project=self.project,config={'job_id':'import-test','character':'Seven',
                'source':{key:'Source Files/角色.fbx'},'asset_overrides':{old:'/Game/Other/Renamed'}})
            with mock.patch.dict(sys.modules,{'unreal':unreal}),contextlib.redirect_stdout(io.StringIO()):
                runpy.run_path(str(scripts/script),run_name='__main__')
            self.assertEqual(imported[-1].filename,str(source.resolve()))
            self.assertEqual(imported[-1].destination_path,'/Game/Other')
            self.assertEqual(imported[-1].destination_name,'Renamed')


class RelocationTests(unittest.TestCase):
    def test_copied_package_cli_and_outputs_in_unrelated_project(self):
        original=Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory(prefix='FaceMigrationRelocation_') as folder:
            root=Path(folder)
            project=root/'目标项目 with spaces';project.mkdir()
            (project/'OtherProject.uproject').write_text('{"EngineAssociation":"5.8"}')
            package=project/'Tools/FaceMigration'
            shutil.copytree(original,package,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
            env=dict(os.environ, PYTHONIOENCODING='utf-8')
            env.pop('FACE_MIGRATION_PROJECT',None)
            def snapshot():
                return {p.relative_to(package).as_posix():hashlib.sha256(p.read_bytes()).hexdigest()
                        for p in package.rglob('*') if p.is_file()}
            before=snapshot()
            def run(*args):
                result=subprocess.run([sys.executable,'-B',str(package/'migrate.py'),*args],
                    cwd=root,env=env,capture_output=True,encoding='utf-8')
                self.assertEqual(result.returncode,0,result.stdout+'\n'+result.stderr)
                return result.stdout
            self.assertTrue(json.loads(run('check'))['passed'])
            dry=json.loads(run('run','probe_cr_migration.py','--dry-run'))
            self.assertEqual(Path(dry['project']),project)
            self.assertTrue(Path(dry['outputs']).is_relative_to(project/'Saved/FaceMigration'))
            self.assertFalse((project/'Saved').exists())
            max_dry=subprocess.run(['pwsh','-NoProfile','-File',str(package/'Scripts/max_run.ps1'),
                '-ScriptFile','probe_mouth_samples.ms','-DryRun'],cwd=root,env=env,
                capture_output=True,encoding='utf-8')
            self.assertEqual(max_dry.returncode,0,max_dry.stdout+'\n'+max_dry.stderr)
            self.assertIn(project.as_posix(),json.loads(max_dry.stdout)['code'])
            self.assertFalse((project/'Saved').exists())
            run('run','fit_cheek_controls.py','--offline','--script-arg=--prepare')
            output=project/'Saved/FaceMigration/Jobs/seven-local/Current/Temp/cheek_bone_names.txt'
            self.assertTrue(output.is_file())
            first=output.read_bytes()
            run('run','fit_cheek_controls.py','--offline','--script-arg=--prepare')
            self.assertEqual(output.read_bytes(),first)
            self.assertEqual(list(output.parent.iterdir()),[output])
            for number in range(4):run('archive')
            history=output.parents[2]/'History'
            self.assertEqual(len(list(history.iterdir())),3)
            self.assertEqual(json.loads(run('cleanup'))['candidates'],[])
            other=root/'第二项目';other.mkdir();(other/'Second.uproject').write_text('{}')
            run('run','fit_cheek_controls.py','--offline','--script-arg=--prepare','--project',str(other))
            self.assertTrue((other/'Saved/FaceMigration/Jobs/seven-local/Current/Temp/cheek_bone_names.txt').is_file())
            self.assertFalse((project/'Docs').exists())
            self.assertFalse((project/'Scripts').exists())
            self.assertEqual(snapshot(),before,'运行不应修改工具包或角色基准')


if __name__=='__main__': unittest.main()
