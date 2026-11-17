"""按项目和任务连接 UE；引擎路径从参数、环境或安装注册信息发现。"""
from __future__ import annotations
import argparse
import importlib
import json
import os
from pathlib import Path
import sys
import time

sys.dont_write_bytecode = True
from face_paths import PACKAGE_ROOT, configure, find_project, cleanup


def engine_python(project, engine_root=None):
    candidates = []
    explicit = engine_root or os.environ.get('UE_ENGINE_ROOT')
    if explicit:
        candidates.append(Path(explicit))
    else:
        files = list(Path(project).glob('*.uproject'))
        association = json.loads(files[0].read_text(encoding='utf-8-sig')).get('EngineAssociation', '')
        if os.name == 'nt':
            import winreg
            for hive, key, value in (
                (winreg.HKEY_LOCAL_MACHINE, rf'SOFTWARE\EpicGames\Unreal Engine\{association}', 'InstalledDirectory'),
                (winreg.HKEY_CURRENT_USER, r'SOFTWARE\Epic Games\Unreal Engine\Builds', association),
            ):
                try:
                    with winreg.OpenKey(hive, key) as handle:
                        candidates.append(Path(winreg.QueryValueEx(handle, value)[0]))
                except OSError:
                    pass
        if association and not association.startswith('{'):
            for parent in Path(project).parents:
                candidates.append(parent/('UE_'+association))
    for candidate in candidates:
        folder = candidate/'Engine/Plugins/Experimental/PythonScriptPlugin/Content/Python'
        if (folder/'remote_execution.py').is_file():
            return folder.resolve()
    raise FileNotFoundError('找不到 UE PythonScriptPlugin；请传 --engine-root 或设置 UE_ENGINE_ROOT')


def connect(remote, timeout, project, node_id=None):
    connection = remote.RemoteExecution()
    connection.start()
    deadline = time.monotonic()+timeout
    expected = os.path.normcase(str(Path(project).resolve()))
    nodes = []
    try:
        while time.monotonic() < deadline:
            nodes = [n for n in connection.remote_nodes
                     if n.get('project_root') and os.path.normcase(str(Path(n['project_root']).resolve())) == expected
                     and (node_id is None or n.get('node_id') == node_id)]
            if nodes:
                break
            time.sleep(0.25)
        if len(nodes) != 1:
            raise RuntimeError(f'需要唯一目标 UE 节点，发现 {len(nodes)} 个：{expected}；多实例用 --node-id')
        connection.open_command_connection(nodes[0]['node_id'])
        return connection
    except BaseException:
        connection.stop()
        raise


def bootstrap(script, project, config):
    """建立显式上下文；脚本内容不复制到磁盘，嵌套导入使用同一工具包。"""
    return '\n'.join([
        'import sys, os',
        'sys.dont_write_bytecode = True',
        f'_fm_scripts = {str(PACKAGE_ROOT / "Scripts")!r}',
        'if _fm_scripts in sys.path: sys.path.remove(_fm_scripts)',
        'sys.path.insert(0, _fm_scripts)',
        'for _fm_name in ("face_paths", "runtime_compat", "slider_handle_layout", "face_design_space", "wrap_face_head_space", "verify_runtime_face_controls", "update_slider_handle_depth"): sys.modules.pop(_fm_name, None)',
        'import face_paths',
        f'face_paths.configure(project={str(project)!r}, config={config!r})',
        'import unreal',
        f'assert os.path.normcase(os.path.realpath(unreal.Paths.project_dir())) == os.path.normcase(os.path.realpath({str(project)!r})), "UE project mismatch"',
        f'_fm_script = {str(script)!r}',
        '_fm_namespace = {"__name__": "__main__", "__file__": _fm_script}',
        'exec(compile(open(_fm_script, encoding="utf-8-sig").read(), _fm_script, "exec"), _fm_namespace)',
    ])


def execute(script, project, config, engine_root=None, timeout=20, node_id=None):
    folder = engine_python(project, engine_root)
    sys.path.insert(0, str(folder))
    remote = importlib.import_module('remote_execution')
    connection = connect(remote, timeout, project, node_id)
    try:
        result = connection.run_command(bootstrap(script, project, config),
                                        exec_mode=remote.MODE_EXEC_FILE, raise_on_failure=False)
    finally:
        connection.stop()
    if not isinstance(result, dict):
        result = {k: getattr(result, k, None) for k in ('success', 'output', 'error', 'result')}
    if result.get('output'):
        print(result['output'])
    if result.get('error'):
        print(result['error'], file=sys.stderr)
    if not result.get('success') and result.get('result'):
        print(result['result'], file=sys.stderr)
    return bool(result.get('success'))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('script')
    parser.add_argument('--project', type=Path)
    parser.add_argument('--job', type=Path)
    parser.add_argument('--engine-root', type=Path)
    parser.add_argument('--timeout', type=float, default=20)
    parser.add_argument('--node-id')
    args = parser.parse_args(argv)
    config = json.loads(args.job.read_text(encoding='utf-8-sig')) if args.job else {'job_id': 'seven-local', 'character': 'Seven'}
    ctx = configure(project=args.project or find_project(), config=config)
    script = Path(args.script)
    if not script.is_file():
        script = PACKAGE_ROOT/'Scripts'/args.script
    if not script.is_file():
        raise FileNotFoundError(script)
    ok = execute(script.resolve(), ctx.project, config, args.engine_root, args.timeout, args.node_id)
    if ok and (ctx.managed/'.face-migration.json').exists():
        cleanup(keep=3, apply=True)
    print('UE_REMOTE_OK' if ok else 'UE_REMOTE_FAILED')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
