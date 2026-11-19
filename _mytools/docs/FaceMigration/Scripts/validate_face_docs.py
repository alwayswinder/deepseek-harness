"""离线验证整个可迁移包；默认只向控制台报告，不新增运行文件。"""
from __future__ import annotations
import argparse
import ast
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sys
import unicodedata
from urllib.parse import unquote

sys.dont_write_bytecode = True
from face_paths import PACKAGE_ROOT as ROOT, tool_path, output_path


def headings(text):
    result, seen, fenced = set(), Counter(), False
    for line in text.splitlines():
        if line.lstrip().startswith(('```','~~~')):
            fenced = not fenced
        if fenced:
            continue
        match = re.match(r'^#{1,6}\s+(.+?)\s*#*$', line)
        if not match:
            continue
        title = re.sub(r'[`*_]', '', match[1]).lower()
        slug = ''.join(c for c in title if c in '-_' or c.isspace() or unicodedata.category(c)[0] in 'LN').replace(' ','-')
        result.add(slug+('-'+str(seen[slug]) if seen[slug] else ''))
        seen[slug] += 1
    return result


def validate():
    errors = []
    counts = {}
    def require(condition, message):
        if not condition:
            errors.append(message)
    files = sorted(p for p in ROOT.rglob('*') if p.is_file() and '__pycache__' not in p.parts)
    counts['package_files'] = len(files)
    parsed = {}
    for path in files:
        if path.suffix == '.json':
            try:
                parsed[path] = json.loads(path.read_text(encoding='utf-8-sig'))
            except (ValueError,OSError) as exc:
                errors.append(f'{path.relative_to(ROOT)}: {exc}')
    counts['json_parsed'] = len(parsed)
    manifest = parsed.get(ROOT/'preservation.manifest.json',{})
    moved_out = set(manifest.get('moved_out',{}).get('files',{}))
    markdown = [p for p in files if p.suffix == '.md']
    links = 0
    for path in markdown:
        text = path.read_text(encoding='utf-8-sig')
        for match in re.finditer(r'!?\[[^\]]*\]\(([^)]+)\)',text):
            value = match[1].strip().strip('<>')
            if re.match(r'[A-Za-z][A-Za-z0-9+.-]*://',value):
                continue
            part,_,anchor = unquote(value).partition('#')
            target = (path.parent/part).resolve() if part else path
            links += 1
            require(target.is_relative_to(ROOT), f'{path.relative_to(ROOT)}: 包外文件链接 {value}')
            # 大文件可能已移到目标项目；链接仍指向包内相对位置，用 moved_out 清单认定有效。
            relocated = target.is_relative_to(ROOT) and target.relative_to(ROOT).as_posix() in moved_out
            require(target.exists() or relocated, f'{path.relative_to(ROOT)}: 断链 {value}')
            if anchor and target.is_file() and target.suffix == '.md':
                require(anchor in headings(target.read_text(encoding='utf-8-sig')),f'{path.relative_to(ROOT)}: 无效标题 {value}')
        for value in re.findall(r'`(Tools/FaceMigration/[^`\n]+)`',text):
            if any(c in value for c in '*{}<> ') or value.endswith(('/','\\')):
                continue
            if value.endswith(('.md','.json','.py','.ms','.ps1')):
                target = ROOT/value[len('Tools/FaceMigration/'):].replace('\\','/')
                require(target.exists() or target.relative_to(ROOT).as_posix() in moved_out,
                        f'{path.relative_to(ROOT)}: 失效内联路径 {value}')
    counts['markdown_files'] = len(markdown)
    counts['local_links'] = links

    def walk(value, origin):
        if isinstance(value,dict):
            for child in value.values(): walk(child,origin)
        elif isinstance(value,list):
            for child in value: walk(child,origin)
        elif isinstance(value,str) and value.startswith(('Docs/','Characters/','Scripts/','ProjectNotes/')) and not any(c in value for c in '*{}<> '):
            require((ROOT/value).exists(),f'{origin}: JSON 导航路径不存在 {value}')
    config = parsed.get(ROOT/'Docs/migration.config.json',{})
    reference = parsed.get(ROOT/'Characters/Seven/face-controls.json',{})
    template = parsed.get(ROOT/'Docs/Templates/CharacterFaceControllers.json',{})
    for origin,value in (('config',config),('reference',reference),('template',template)):
        require(bool(value),'缺少 '+origin)
        walk(value,origin)
    require(config.get('path_base')=='package_root','配置应相对工具包根目录')
    require(config.get('universal_builder_available') is False,'不能宣称已有任意角色通用构建器')
    rows,blanks = reference.get('bindings',[]),template.get('bindings',[])
    expected=config.get('reference_character',{}).get('expected_animation_controls',72)
    require(len(rows)==len(blanks)==expected,'角色与空模板控制数量不一致')
    for key in ('role_id','ue_control','max_name'):
        require(len({r[key] for r in rows})==len(rows),f'Seven {key} 重复')
    require(Counter(r['scope'] for r in rows)=={'requested_or_mirrored':46,'existing_base':26},'功能数量改变')
    require(all(not r['max_name'] for r in blanks),'空模板不得预填实际绑定')
    fields=('role_id','group','label','side','ue_control','recipe_doc','enabled','scope')
    require([tuple(r[k] for k in fields) for r in rows]==[tuple(r[k] for k in fields) for r in blanks],'模板功能定义改变')
    require([r['max_name'] for r in rows]==[r['reference_max_name'] for r in blanks],'模板示例名改变')
    require(set(config.get('build_order',[]))=={r['group'] for r in rows},'搭建分组覆盖不完整')
    require(len(config.get('build_order',[]))==len(set(config.get('build_order',[]))),'搭建顺序有重复')
    for origin,value in (('reference',reference),('template',template)):
        require(value.get('reference',{}).get('reuse_numeric_parameters') is False,f'{origin}: 禁止默认复用角色数值')
        for row in value.get('bindings',[]):
            require(config.get('recipes',{}).get(row['group'])==row['recipe_doc'],f'{origin}: 配方不一致 {row["role_id"]}')
    catalog=(ROOT/'Docs/Reference/ControllerNames.md').read_text(encoding='utf-8')
    md_template=(ROOT/'Docs/Templates/CharacterFaceControllers.md').read_text(encoding='utf-8')
    for row in rows:
        require(sum(f'`{row["max_name"]}`' in line and f'`{row["ue_control"]}`' in line for line in catalog.splitlines() if line.startswith('|'))==1,'名称总表缺少 '+row['role_id'])
        require(sum(f'`{row["role_id"]}`' in line and f'`{row["max_name"]}`' in line for line in md_template.splitlines() if line.startswith('|'))==1,'Markdown 模板缺少 '+row['role_id'])
    counts['reference_controls']=len(rows)
    counts['recipe_groups']=len(config.get('recipes',{}))

    scripts=0
    manifest=parsed.get(ROOT/'preservation.manifest.json',{})
    moved_out=set(manifest.get('moved_out',{}).get('files',{}))
    for path in (ROOT/'Scripts').glob('*.py'):
        try:
            tree=ast.parse(path.read_text(encoding='utf-8-sig'))
        except SyntaxError as exc:
            errors.append(f'{path.name}: {exc}')
            continue
        scripts+=1
        for node in ast.walk(tree):
            if isinstance(node,ast.Constant) and isinstance(node.value,str):
                value=node.value
                require(not re.match(r'^(?:[A-Za-z]:[\\/]|\\\\)', value),
                        f'{path.name}:{node.lineno}: 脚本中写死机器文件路径；改用项目路径或任务 source 配置')
            if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id=='_fm_tool' and node.args and isinstance(node.args[0],ast.Constant):
                value=node.args[0].value
                if isinstance(value,str):
                    target=tool_path(value)
                    relative=target.relative_to(ROOT).as_posix() if target.is_relative_to(ROOT) else ''
                    require(relative in moved_out or target.exists(),
                            f'{path.name}: 包内引用缺失 {value}（既不在包内也不在 moved_out 清单）')
    counts['python_scripts_parsed']=scripts
    manifest=parsed.get(ROOT/'preservation.manifest.json',{})
    require(bool(manifest.get('frozen_files')),'缺少保留摘要')
    for value,digest in manifest.get('frozen_files',{}).items():
        path=ROOT/value
        require(path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest()==digest,'原始证据被改变: '+value)
    counts['frozen_files_byte_identical']=len(manifest.get('frozen_files',{}))
    require(not any((ROOT/'Scripts').glob('replay_*.py')),'不能把运行重放副本放入正式 Scripts')
    require(not (ROOT/'Scripts/_tmp').exists(),'临时输出不应跟随工具包')
    return {'passed':not errors,'scope':'Offline package paths, mappings, syntax and frozen evidence only; no UE asset or visual revalidation.',
            'counts':counts,'errors':errors}


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report',type=Path)
    parser.add_argument('--verify-reorganization',action='store_true',help='兼容旧命令；当前始终核对工具包保留摘要')
    args=parser.parse_args(argv)
    result=validate()
    if args.report:
        output_path(args.report).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return 0 if result['passed'] else 1


if __name__=='__main__':
    sys.exit(main())
