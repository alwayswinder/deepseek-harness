"""工具包、只读角色基准和项目输出的统一路径；不依赖安装机器的绝对路径。"""
from __future__ import annotations

from dataclasses import dataclass, field
import json
import os
from pathlib import Path
import re
import shutil
import stat

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
_NAME = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$')
_CURRENT_REPORTS = {'build_report.json', 'reload_report.json', 'summary.json', 'validation.json',
                    'preview_morph_check.json', 'preview_controls_validation.json',
                    'preview_binding.json', 'delivery_check.json'}


def checked_name(value: str) -> str:
    if not _NAME.fullmatch(value) or value in ('.', '..'):
        raise ValueError('标识只允许字母、数字、点、下划线和连字符: ' + value)
    return value


def contained(path: Path, root: Path) -> Path:
    path, root = path.resolve(), root.resolve()
    if not path.is_relative_to(root):
        raise ValueError(f'路径越界: {path} (root={root})')
    return path


def find_project(start: Path | None = None) -> Path:
    env = os.environ.get('FACE_MIGRATION_PROJECT')
    if env:
        return Path(env).resolve()
    for candidate in (start or PACKAGE_ROOT, *(start or PACKAGE_ROOT).parents):
        if list(candidate.glob('*.uproject')):
            return candidate.resolve()
    raise ValueError('未找到 .uproject；请用 --project 显式指定目标项目')


@dataclass
class Context:
    project: Path
    job_id: str = 'seven-local'
    character: str = 'Seven'
    asset_overrides: dict[str, str] = field(default_factory=dict)
    legacy_runtime_adapter: bool = False
    explicit_job: bool = False
    source: dict[str, str] = field(default_factory=dict)
    layout: dict[str, str] = field(default_factory=dict)

    def __post_init__(self):
        self.project = Path(self.project).resolve()
        checked_name(self.job_id)
        checked_name(self.character)
        if not list(self.project.glob('*.uproject')):
            raise ValueError('目标项目目录中没有 .uproject: ' + str(self.project))
        for source, target in self.asset_overrides.items():
            if not source.startswith('/Game/') or not target.startswith('/Game/') or '..' in target.split('/'):
                raise ValueError('资产映射必须是 /Game/ 下的包路径')

    @property
    def data(self):
        return PACKAGE_ROOT/'Characters'/self.character/'Evidence'

    @property
    def character_data(self):
        """项目侧角色证据：原始采样等大文件不随包迁移，放在目标项目里。"""
        return self.project/'Saved/FaceMigration/Characters'/self.character

    @property
    def managed(self):
        return self.project/'Saved/FaceMigration/Jobs'/self.job_id

    @property
    def current(self):
        return self.managed/'Current'

    def initialize(self):
        contained(self.managed, self.project/'Saved/FaceMigration/Jobs')
        self.managed.mkdir(parents=True, exist_ok=True)
        marker = self.managed/'.face-migration.json'
        record = self.record()
        if marker.exists() and json.loads(marker.read_text(encoding='utf-8')) != record:
            raise ValueError('运行目录归属与当前项目/角色不一致；请使用独立 job_id')
        marker.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
        self.current.mkdir(exist_ok=True)

    def record(self):
        return {'schema_version': 1, 'job_id': self.job_id, 'character': self.character,
                'project': str(self.project), 'asset_overrides': self.asset_overrides,
                'legacy_runtime_adapter': self.legacy_runtime_adapter,
                **({'source': self.source} if self.source else {}),
                **({'layout': self.layout} if self.layout else {})}


_context: Context | None = None


def configure(project=None, job=None, config=None):
    global _context
    if config is None:
        config = json.loads(Path(job).read_text(encoding='utf-8-sig')) if job else {}
    _context = Context(project=Path(project).resolve() if project else find_project(),
                       job_id=config.get('job_id', 'seven-local'),
                       character=config.get('character', 'Seven'),
                       asset_overrides=config.get('asset_overrides', {}),
                       legacy_runtime_adapter=config.get('legacy_runtime_adapter', False),
                       source=config.get('source', {}),
                       layout=config.get('layout', {}),
                       explicit_job=bool(job or config))
    return _context


def context():
    global _context
    if _context is None:
        _context = configure()
    return _context


def project_root():
    return context().project


def source_path(key, value=None):
    """显式外部输入；相对路径以目标项目为基准，不沿用原机器路径或工作目录。"""
    value = value or context().source.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f'请在任务配置 source.{key} 中指定源文件')
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = project_root()/path
    path = path.resolve()
    if not path.is_file():
        raise FileNotFoundError(f'source.{key} 源文件不存在: {path}')
    return path


def tool_path(relative=''):
    """兼容旧脚本的包内导航；所有返回值都位于工具包中。"""
    value = str(relative).replace('\\', '/').strip('/')
    if value == 'Docs/Evidence' or value.startswith('Docs/Evidence/'):
        return contained(context().data/value[len('Docs/Evidence'):].lstrip('/'), PACKAGE_ROOT)
    if value == 'Docs/Characters/Seven.face-controls.json':
        value = 'Characters/Seven/face-controls.json'
    elif value == 'Docs/Characters' or value.startswith('Docs/Characters/'):
        value = 'Characters'+value[len('Docs/Characters'):]
    return contained(PACKAGE_ROOT/value, PACKAGE_ROOT)


def runtime_path(relative=''):
    ctx = context()
    ctx.initialize()
    path = contained(ctx.current/relative, ctx.current)
    return path


def legacy_saved_path(relative=''):
    value = str(relative).replace('\\', '/').strip('/')
    if value == 'Backup' or value.startswith('Backup/'):
        return runtime_path('Backups'+value[len('Backup'):])
    return runtime_path(str(Path('Temp')/value))


def node_name(name):
    return 'RigUnit_BeginExecution' if name == 'Begin' and context().legacy_runtime_adapter else name


def break_link(controller, path):
    if context().legacy_runtime_adapter:
        return controller.break_all_links(path, True, False, False)
    return controller.break_link(path)


def read_path(path):
    """读取顺序：本任务当前输出 → 项目侧角色证据 → 包内角色基准。

    原始采样（max_samples / previous_controls 等）不随包迁移，放在
    <目标项目>/Saved/FaceMigration/Characters/<角色>/；同名的包内文件只在
    项目侧缺失时作为只读基准回退。
    """
    path = normalize_legacy_path(path)
    ctx = context()
    if path.is_relative_to(ctx.data):
        relative = path.relative_to(ctx.data)
        output = ctx.current/'Evidence'/relative
        if output.is_file():
            _verify_managed(ctx)
            return output
        project_side = ctx.character_data/relative
        if project_side.is_file():
            return project_side
        if ctx.explicit_job and path.name in _CURRENT_REPORTS:
            raise FileNotFoundError('本项目本任务没有本轮报告，禁止沿用历史通过状态: ' + str(output))
    return path


def character_output_path(relative=''):
    """写项目侧角色证据；新采集的采样与参数不写进工具包。"""
    ctx = context()
    path = contained(ctx.character_data/str(relative).replace('\\', '/').strip('/'), ctx.project)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def output_path(path):
    path = normalize_legacy_path(path)
    ctx = context()
    if path.is_relative_to(ctx.data):
        path = runtime_path('Evidence')/path.relative_to(ctx.data)
    elif path.is_relative_to(PACKAGE_ROOT):
        raise ValueError('工具包是输入，运行结果不得写回包内: ' + str(path))
    elif not path.is_relative_to(ctx.project/'Saved/FaceMigration'):
        raise ValueError('脚本文件输出必须位于目标项目 Saved/FaceMigration: ' + str(path))
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def normalize_legacy_path(path):
    """覆盖旧代码中的动态 f-string 路径；不需要在项目根创建兼容目录。"""
    path = Path(path).resolve()
    ctx = context()
    for folder in ('Docs', 'Scripts'):
        old = ctx.project/folder
        if path.is_relative_to(old):
            return tool_path(folder+'/'+path.relative_to(old).as_posix())
    old = ctx.project/'Saved/Codex'
    if path.is_relative_to(old):
        return legacy_saved_path(path.relative_to(old).as_posix())
    return path


def asset_path(path):
    return context().asset_overrides.get(path, path)


def rig_dependency_folder(rig_package):
    """角色 CR 同级 ToolsPanel；传实际包路径，不再动态创建 <CR>_UI。"""
    package = str(rig_package).split('.')[0]
    if not package.startswith('/Game/') or '..' in package.split('/') or package.endswith('/'):
        raise ValueError('CR 必须是 /Game/ 下的完整资产包路径: ' + package)
    return package.rsplit('/', 1)[0] + '/ToolsPanel'


def asset_disk_path(relative):
    path = Path(relative).as_posix()
    if path.startswith('Content/') and path.endswith('.uasset'):
        asset = '/Game/'+path[len('Content/'):-len('.uasset')]
        target = asset_path(asset)
        return project_root()/('Content/'+target[len('/Game/'):]+'.uasset')
    return project_root()/relative


def load_asset(path, *args, **kwargs):
    import unreal
    asset = unreal.load_asset(asset_path(path), *args, **kwargs)
    if context().legacy_runtime_adapter and isinstance(asset, unreal.ControlRigRuntimeAsset):
        from runtime_compat import RuntimeRig
        return RuntimeRig(asset)
    return asset


def save_asset(asset, *args, **kwargs):
    import unreal
    return unreal.EditorAssetLibrary.save_loaded_asset(getattr(asset, '_fm_asset', asset), *args, **kwargs)


def _verify_managed(ctx):
    root = contained(ctx.managed, ctx.project/'Saved/FaceMigration/Jobs')
    marker = root/'.face-migration.json'
    if not marker.is_file():
        raise ValueError('拒绝清理未标记的运行目录: ' + str(root))
    expected = ctx.record()
    if json.loads(marker.read_text(encoding='utf-8')) != expected:
        raise ValueError('运行目录标记不匹配')
    return root


def cleanup(keep=3, apply=False):
    """只轮换有归属标记的任务备份/归档；源数据和 Imported 永远不在清理范围。"""
    if keep < 1:
        raise ValueError('至少保留一份')
    ctx = context()
    root = _verify_managed(ctx)
    groups = {}
    for parent in (ctx.current/'Backups', root/'History'):
        if not parent.is_dir():
            continue
        contained(parent, root)
        for p in parent.iterdir():
            if not p.is_dir() or is_link(p) or (p/'.keep').exists():
                continue
            match = re.fullmatch(r'(.+?)_(\d{8}_\d{6}(?:_\d+)?)', p.name)
            if not match:
                continue
            groups.setdefault((str(parent), match[1]), []).append(p)
    candidates = []
    for items in groups.values():
        candidates.extend(sorted(items, key=lambda p: p.name, reverse=True)[keep:])
    for path in candidates:
        contained(path, root)
        if path == root or any(is_link(p) for p in path.rglob('*')):
            raise ValueError('拒绝清理包含链接的目录: ' + str(path))
    if apply:
        for path in candidates:
            shutil.rmtree(path)
    return [str(p) for p in candidates]


def is_link(path):
    info = path.lstat()
    return path.is_symlink() or bool(getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0x400))
