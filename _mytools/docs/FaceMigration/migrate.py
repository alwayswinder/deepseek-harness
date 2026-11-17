"""FaceMigration 的固定入口；复制整个目录后仍可运行。"""
from __future__ import annotations
import argparse
import datetime
import json
from pathlib import Path
import runpy
import shutil
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT/'Scripts'))
import face_paths as paths


def read_job(value):
    candidate = Path(value)
    if not candidate.is_file():
        candidate = ROOT/'Jobs'/(value if value.endswith('.json') else value+'.json')
    data = json.loads(candidate.read_text(encoding='utf-8-sig'))
    if data.get('schema_version') != 1:
        raise ValueError('不支持的任务配置版本')
    return data


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    check = commands.add_parser('check', help='离线验证导航、数据摘要、脚本和独立迁移条件')
    check.add_argument('--report', type=Path, help='可选：报告写到目标项目 Saved/FaceMigration，默认只输出控制台')
    run = commands.add_parser('run', help='使用共用脚本和任务配置；不生成项目专用脚本副本')
    run.add_argument('script', help='Scripts 下的文件名')
    run.add_argument('--offline', action='store_true')
    run.add_argument('--engine-root', type=Path)
    run.add_argument('--node-id')
    run.add_argument('--timeout', type=float, default=20)
    run.add_argument('--dry-run', action='store_true')
    run.add_argument('--script-arg', action='append', default=[], help='离线脚本参数，例如 --script-arg=--prepare')
    clean = commands.add_parser('cleanup', help='默认仅预览将删除的旧备份/归档')
    clean.add_argument('--apply', action='store_true')
    clean.add_argument('--keep', type=int, default=3)
    archive = commands.add_parser('archive', help='交付后显式归档当前结果，最多保留三份归档')
    archive.add_argument('--keep', type=int, default=3)
    for command in (check, run, clean, archive):
        command.add_argument('--project', type=Path)
        command.add_argument('--job', default='seven-local')
    args = parser.parse_args(argv)
    config = read_job(args.job)
    ctx = paths.configure(project=args.project or paths.find_project(), config=config)
    if args.command == 'check':
        from validate_face_docs import validate
        result = validate()
        if args.report:
            target = paths.output_path(args.report)
            target.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result['passed'] else 1
    if args.command == 'cleanup':
        if not (ctx.managed/'.face-migration.json').exists():
            print('没有本工具管理的任务输出，无需清理。')
            return 0
        print(json.dumps({'apply': args.apply, 'candidates': paths.cleanup(args.keep, args.apply)}, ensure_ascii=False, indent=2))
        return 0
    if args.command == 'archive':
        paths._verify_managed(ctx)
        if args.keep < 1:
            raise ValueError('至少保留一份归档')
        if not ctx.current.is_dir():
            raise ValueError('没有当前结果可归档')
        stamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S_%f')
        target = paths.contained(ctx.managed/'History'/('Run_'+stamp), ctx.managed)
        shutil.copytree(ctx.current, target)
        paths.cleanup(args.keep, apply=True)
        print(str(target))
        return 0
    script = paths.contained(ROOT/'Scripts'/args.script, ROOT/'Scripts')
    if not script.is_file() or script.suffix != '.py' or script.parent != ROOT/'Scripts':
        raise ValueError('只能选择 Scripts 顶层的 Python 脚本；历史重放副本不作为入口')
    compile(script.read_text(encoding='utf-8-sig'), str(script), 'exec')
    if args.dry_run:
        print(json.dumps({'script': str(script), 'project': str(ctx.project), 'job': config,
                          'inputs': str(ctx.data), 'outputs': str(ctx.current),
                          'editor_execution': False}, ensure_ascii=False, indent=2))
        return 0
    if args.offline:
        old_argv = sys.argv
        try:
            sys.argv = [str(script), *args.script_arg]
            runpy.run_path(str(script), run_name='__main__')
        finally:
            sys.argv = old_argv
        ok = True
    else:
        if args.script_arg:
            raise ValueError('--script-arg 当前用于离线脚本；UE 配方从任务配置读取目标')
        from ue_run import execute
        ok = execute(script, ctx.project, config, args.engine_root, args.timeout, args.node_id)
    if ok and (ctx.managed/'.face-migration.json').exists():
        paths.cleanup(config.get('retention', {}).get('keep_backups_per_group', 3), apply=True)
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
