"""Generate a guarded MAXScript builder from a measured body55 profile."""

import argparse
import json
import math
from pathlib import Path


def skeleton_parents():
    """Return the Seven-compatible body hierarchy, excluding facial bones."""
    parents = {'Root': None, 'pelvis': 'Root', 'spine_01': 'pelvis',
               'spine_02': 'spine_01', 'spine_03': 'spine_02',
               'neck_01': 'spine_03', 'head': 'neck_01'}
    for side in ('l', 'r'):
        for name, parent in [('clavicle', 'spine_03'), ('upperarm', 'clavicle'),
                             ('lowerarm', 'upperarm'), ('hand', 'lowerarm'),
                             ('lowerarm_twist_01', 'lowerarm'), ('thigh', 'pelvis'),
                             ('calf', 'thigh'), ('foot', 'calf'), ('ball', 'foot')]:
            parents[f'{name}_{side}'] = parent if parent in ('spine_03', 'pelvis') else f'{parent}_{side}'
        for finger in ('thumb', 'index', 'middle', 'ring', 'pinky'):
            for index in range(1, 4):
                parents[f'{finger}_{index:02d}_{side}'] = f'hand_{side}' if index == 1 else f'{finger}_{index-1:02d}_{side}'
    return parents


def vector(value, subject):
    """Reject non-finite or non-numeric three-component vectors."""
    if not isinstance(value, list) or len(value) != 3 or any(
        isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) for x in value
    ):
        raise ValueError(f'{subject}: expected three finite numbers')
    return value


def dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def matrix(value, subject):
    """Require right-handed, orthonormal row axes without scale or shear."""
    if not isinstance(value, list) or len(value) != 3:
        raise ValueError(f'{subject}: expected three row axes')
    axes = [vector(row, subject) for row in value]
    if any(abs(dot(axes[i], axes[j]) - (1 if i == j else 0)) > 1e-5
           for i in range(3) for j in range(3)):
        raise ValueError(f'{subject}: axes must be orthonormal; remove scale and shear')
    a, b, c = axes
    determinant = dot([a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]], c)
    if determinant < .99999:
        raise ValueError(f'{subject}: axes must be right-handed; do not reflect a rotation matrix')


def validate(profile):
    """Validate measured input before generating executable scene operations."""
    if not isinstance(profile, dict) or profile.get('format') != 'body55-v1':
        raise ValueError('profile.format: expected body55-v1')
    if not isinstance(profile.get('layer'), str) or not profile['layer'].strip():
        raise ValueError('profile.layer: expected a non-empty layer name')
    meshes = profile.get('meshes')
    if not isinstance(meshes, list) or not meshes:
        raise ValueError('profile.meshes: provide every static mesh')
    mesh_names = []
    for mesh in meshes:
        if not isinstance(mesh, dict) or not isinstance(mesh.get('name'), str) or not mesh['name'].strip():
            raise ValueError('profile.meshes: each mesh needs a non-empty name')
        mesh_names.append(mesh['name'].casefold())
        for field in ('vertices', 'faces'):
            if type(mesh.get(field)) is not int or mesh[field] < 1:
                raise ValueError(f'{mesh["name"]}.{field}: expected a positive integer')
        vector(mesh.get('position'), mesh['name']+'.position')
        matrix(mesh.get('axes'), mesh['name']+'.axes')
    if len(set(mesh_names)) != len(mesh_names):
        raise ValueError('profile.meshes: names must be unique ignoring case')
    nodes = profile.get('nodes')
    if not isinstance(nodes, list) or len(nodes) != 55 or any(not isinstance(n, dict) for n in nodes):
        raise ValueError('profile.nodes: expected 55 node records')
    names = [n.get('name') for n in nodes]
    parents = skeleton_parents()
    if any(not isinstance(n, str) for n in names) or len(set(names)) != 55 or set(names) != set(parents):
        raise ValueError('profile.nodes: names must match the 55 canonical body bones exactly')
    if set(mesh_names) & {name.casefold() for name in names}:
        raise ValueError('profile.meshes: mesh names must not collide with bone names')
    for n in nodes:
        name = n['name']
        if n.get('parent') != parents[name]:
            raise ValueError(f'{name}.parent: expected {parents[name]!r}')
        vector(n.get('position'), name+'.position')
        matrix(n.get('axes'), name+'.axes')
    by_name = {n['name']: n for n in nodes}
    for side in ('l', 'r'):
        for a, b in [('upperarm', 'lowerarm'), ('lowerarm', 'hand'), ('thigh', 'calf'), ('calf', 'foot')]:
            n, child = by_name[f'{a}_{side}'], by_name[f'{b}_{side}']
            direction = [y-x for x, y in zip(n['position'], child['position'])]
            length = math.sqrt(dot(direction, direction))
            if length < 1e-6 or dot(n['axes'][0], direction)/length < math.cos(math.radians(.1)):
                raise ValueError(f'{a}_{side}: local +X must point toward {b}_{side} within 0.1 degrees')
    return profile


def ms_string(value):
    """Encode a literal MAXScript string, including Unicode file paths."""
    return '"'+value.replace('\\', '\\\\').replace('"', '\\"').replace('\r', '\\r').replace('\n', '\\n')+'"'


def ms_vector(value):
    return '['+','.join(format(x, '.12g') for x in value)+']'


def ms_matrix(record):
    return '(matrix3 '+' '.join(ms_vector(row) for row in record['axes'])+' '+ms_vector(record['position'])+')'


def generate(profile, source_scene, scene_copy):
    """Render a builder whose loading only inspects the source or output scene."""
    validate(profile)
    if source_scene.resolve() == scene_copy.resolve():
        raise ValueError('scene-copy must differ from source-scene')
    if source_scene.suffix.lower() != '.max' or scene_copy.suffix.lower() != '.max':
        raise ValueError('source-scene and scene-copy must use the .max extension')
    if not source_scene.is_file():
        raise ValueError(f'source-scene does not exist: {source_scene}')
    if scene_copy.exists():
        raise ValueError(f'scene-copy already exists: {scene_copy}; choose a new output')
    if not scene_copy.parent.is_dir():
        raise ValueError(f'scene-copy parent does not exist: {scene_copy.parent}')
    by_name = {n['name']: n for n in profile['nodes']}
    records = []
    for name, parent in skeleton_parents().items():
        node = by_name[name]
        finger = any(name.startswith(f) for f in ('thumb', 'index', 'middle', 'ring', 'pinky'))
        size = .7 if finger else 1.7 if name.startswith(('hand_', 'ball_', 'lowerarm_twist_')) else 2.5
        color = [50, 210, 245] if name.endswith('_l') else [245, 100, 90] if name.endswith('_r') else [240, 210, 75]
        records.append('#('+','.join([ms_string(name), ms_string(parent or '-'), ms_matrix(node), str(size), ms_vector(color)])+')')
    mesh_records = ['#('+','.join([ms_string(m['name']), str(m['vertices']), str(m['faces']), ms_matrix(m)])+')' for m in profile['meshes']]
    result = Path(__file__).with_name('build.ms').read_text(encoding='utf-8')
    values = {'@@NODES@@': ',\n'.join(records), '@@MESHES@@': ',\n'.join(mesh_records),
              '@@SOURCE@@': ms_string(source_scene.resolve().as_posix()),
              '@@COPY@@': ms_string(scene_copy.resolve().as_posix()), '@@LAYER@@': ms_string(profile['layer'])}
    for token, value in values.items():
        result = result.replace(token, value)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile', type=Path, required=True)
    parser.add_argument('--source-scene', type=Path, required=True)
    parser.add_argument('--scene-copy', type=Path, required=True)
    parser.add_argument('--script', type=Path, required=True)
    args = parser.parse_args()
    try:
        profile = json.loads(args.profile.read_text(encoding='utf-8-sig'))
        script = generate(profile, args.source_scene, args.scene_copy)
        args.script.parent.mkdir(parents=True, exist_ok=True)
        with args.script.open('x', encoding='utf-8', newline='\n') as output:
            output.write(script)
    except (OSError, ValueError, TypeError, KeyError) as error:
        parser.exit(2, f'body55: {error}\n')
    print(f'Generated {args.script}; load it in the target Max instance for read-only inspection.')


if __name__ == '__main__':
    main()
