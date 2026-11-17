"""为现有 Max 命名管道客户端提供同一项目/任务的路径上下文。"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
from face_paths import PACKAGE_ROOT, configure, find_project, runtime_path, source_path


def prepare(script, project=None, job='seven-local', source_scene=None, create=True):
    config_path=Path(job)
    if not config_path.is_file():
        config_path=PACKAGE_ROOT/'Jobs'/(job if job.endswith('.json') else job+'.json')
    config=json.loads(config_path.read_text(encoding='utf-8-sig'))
    if config.get('schema_version') != 1:
        raise ValueError('不支持的任务配置版本')
    ctx=configure(project=project or find_project(),config=config)
    script=Path(script)
    if not script.is_file():
        script=PACKAGE_ROOT/'Scripts'/script
    code=script.read_text(encoding='utf-8-sig')
    source_scene=source_scene or ctx.source.get('max_scene','')
    if source_scene:
        source_scene=source_path('max_scene',str(source_scene)).as_posix()
    temp=ctx.current/'Temp'
    if create:
        temp=runtime_path('Temp')
        temp.mkdir(parents=True,exist_ok=True)
    # MaxScript uses forward-slash Windows paths. JSON quoting supplies safe double-quoted literals.
    prefix='global FaceMigrationTempDir = '+json.dumps(temp.as_posix()+'/',ensure_ascii=False)+'\n'
    prefix+='global FaceMigrationSourceScene = '+json.dumps(str(source_scene).replace('\\','/'),ensure_ascii=False)+'\n'
    return {'temp':str(temp),'project':str(ctx.project),'job_id':ctx.job_id,
            'code':prefix+code}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--script',required=True)
    parser.add_argument('--project',type=Path)
    parser.add_argument('--job',default='seven-local')
    parser.add_argument('--source-scene')
    parser.add_argument('--dry-run',action='store_true')
    args=parser.parse_args()
    print(json.dumps(prepare(args.script,args.project,args.job,args.source_scene,not args.dry_run),ensure_ascii=False))


if __name__=='__main__':
    main()
