"""滑块手柄与滑轨分层；生成器和已有资产修复使用同一个绝对偏移。"""
import hashlib
import json
import re
import unreal
from face_paths import rig_dependency_folder

# 面板朝向局部 +Y。约 1 cm 直径的球体前移 1 cm，球体后缘与轨道留约 0.5 cm。
HANDLE_FORWARD_CM = 1.0
RAIL_PREFIXES = ('EXPR_', 'PHON_', 'EEXPR_')
RAIL_CONTROL = 'VIS_SLIDER_RAILS'
RAIL_WIDTH_CM = 0.12
PHONEME_REFERENCE_CONTROL = 'VIS_PHONEME_REFERENCE'
REFERENCE_BEHIND_RAIL_CM = 1.0
OWNER_TAG = 'FaceMigration.SliderRails.Owner'
SPEC_TAG = 'FaceMigration.SliderRails.Spec'


def repair_owned_shape_names(asset, reference):
    """修复 UE 复制库重绑引用时自动追加的 _1，仅处理本工具归属的库。"""
    owner = asset.get_path_name().split('.')[0]
    source_libraries = {lib.get_name(): lib for lib in reference.get_editor_property('shape_libraries')}
    repaired = []
    for lib in asset.get_editor_property('shape_libraries'):
        if unreal.EditorAssetLibrary.get_metadata_tag(lib, 'FaceMigration.Delivery.Owner') != owner:
            continue
        source = source_libraries.get(lib.get_name())
        assert source, '复制的库缺少示例对照'
        expected = [str(s.shape_name) for s in source.get_editor_property('shapes')]
        shapes = list(lib.get_editor_property('shapes'))
        actual = [str(s.shape_name) for s in shapes]
        assert len(expected) == len(actual)
        if expected == actual:
            continue
        for shape, old, name in zip(shapes, actual, expected):
            assert old == name or re.fullmatch(re.escape(name) + r'_\d+', old), '非自动后缀差异，停止修复'
            shape.set_editor_property('shape_name', name)
        lib.modify()
        lib.set_editor_property('shapes', shapes, notify_mode=unreal.PropertyAccessChangeNotifyMode.NEVER)
        assert [str(s.shape_name) for s in lib.get_editor_property('shapes')] == expected
        assert unreal.EditorAssetLibrary.save_loaded_asset(lib, False)
        repaired.append(dict(library=lib.get_path_name(), before=actual, after=expected))
    return repaired


def rail_nodes(model):
    return [n for n in model.get_nodes()
            if str(n.get_name()).startswith(RAIL_PREFIXES) and str(n.get_name()).endswith('_RAIL')]


def slider_keys(hierarchy, model):
    keys = []
    for node in model.get_nodes():
        name = str(node.get_name())
        if not (name.startswith(RAIL_PREFIXES) and name.endswith('_RAIL')):
            continue
        getter = model.find_node_by_name(name[:-5] + '_GET')
        assert getter, '滑轨缺少对应读取节点: ' + name
        control = getter.find_pin('Control').get_default_value().strip('"')
        key = unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=control)
        assert hierarchy.contains(key), control
        keys.append(key)
    assert len({str(k.name) for k in keys}) == len(keys), '多个滑轨指向同一手柄'
    return keys


def apply_handle_depth(hierarchy, keys):
    """只改 shape 的局部 Y；重复运行不累加，不改变控制 offset、输入或求解。"""
    for key in keys:
        for initial in (True, False):
            shape = hierarchy.get_local_control_shape_transform(key, initial)
            shape.translation = unreal.Vector(shape.translation.x, HANDLE_FORWARD_CM, shape.translation.z)
            hierarchy.set_control_shape_transform(key, shape, initial, True)


def validate_handle_depth(hierarchy, keys):
    rows = []
    for key in keys:
        for initial in (True, False):
            local = hierarchy.get_local_control_shape_transform(key, initial)
            assert abs(local.translation.y - HANDLE_FORWARD_CM) < 1e-5, str(key)
        shape = hierarchy.get_global_control_shape_transform(key, True).translation
        control = hierarchy.get_global_transform(key, True).translation
        rows.append({'control': str(key.name), 'initial_shape_position': list(shape.to_tuple()),
                     'initial_control_position': list(control.to_tuple()),
                     'shape_distance_cm': (shape - control).length()})
    return rows


def rail_spec(model):
    result = []
    for node in rail_nodes(model):
        points = [tuple(float(v) for v in xyz) for xyz in re.findall(
            r'\(X=([^,]+),Y=([^,]+),Z=([^\)]+)\)', node.find_pin('Points').get_default_value())]
        assert len(points) == 6, str(node.get_name())
        colors = re.findall(r'[RGBA]=([^,\)]+)', node.find_pin('Color').get_default_value())
        result.append({'name': str(node.get_name()), 'points': points, 'color': [float(v) for v in colors]})
    return result


def spec_hash(model):
    return hashlib.sha256(json.dumps({'rails': rail_spec(model), 'width': RAIL_WIDTH_CM},
                                   sort_keys=True).encode()).hexdigest()


def reference_shape_y(hierarchy, model):
    """Seven 的 XZ 面板：参考图在轨道后 1 cm，保留辅助控制的原 offset。"""
    key = unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=PHONEME_REFERENCE_CONTROL)
    phonemes = [r for r in rail_spec(model) if r['name'].startswith('PHON_')]
    if not hierarchy.contains(key) or not phonemes:
        return None
    depths = {round(point[1], 6) for row in phonemes for point in row['points']}
    assert len(depths) == 1, '口型轨道不共面，需要单独适配参考图'
    control = hierarchy.get_global_transform(key, True)
    assert abs(control.rotation.x) + abs(control.rotation.y) + abs(control.rotation.z) < 1e-5
    assert (control.scale3d - unreal.Vector(1, 1, 1)).length() < 1e-5
    return depths.pop() - REFERENCE_BEHIND_RAIL_CM - control.translation.y


def apply_reference_depth(hierarchy, model):
    y = reference_shape_y(hierarchy, model)
    if y is None:
        return
    key = unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=PHONEME_REFERENCE_CONTROL)
    for initial in (True, False):
        shape = hierarchy.get_local_control_shape_transform(key, initial)
        shape.translation = unreal.Vector(shape.translation.x, y, shape.translation.z)
        hierarchy.set_control_shape_transform(key, shape, initial, True)


def validate_reference_depth(hierarchy, model):
    expected_y = reference_shape_y(hierarchy, model)
    if expected_y is None:
        return {'present': False}
    key = unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=PHONEME_REFERENCE_CONTROL)
    for initial in (True, False):
        assert abs(hierarchy.get_local_control_shape_transform(key, initial).translation.y - expected_y) < 1e-5
    shape = hierarchy.get_global_control_shape_transform(key, True).translation
    return {'present': True, 'reference_position': list(shape.to_tuple()),
            'behind_rail_cm': REFERENCE_BEHIND_RAIL_CM, 'shape_local_y': expected_y}


def apply_slider_layout(asset):
    """保留动画接口，用不可选的实体 Visual Cue 替换置顶调试轨道。"""
    asset = getattr(asset, '_fm_asset', asset)
    runtime = isinstance(asset, unreal.ControlRigRuntimeAsset)
    editor = asset.get_editor_asset() if runtime else asset
    h = asset.hierarchy if runtime else asset.get_hierarchy()
    model = editor.get_default_model()
    keys = slider_keys(h, model)
    apply_handle_depth(h, keys)
    apply_reference_depth(h, model)
    if not keys:
        return
    owner = asset.get_path_name().split('.')[0]
    folder = rig_dependency_folder(owner)
    tools = unreal.AssetToolsHelpers.get_asset_tools()

    def owned(name):
        item = unreal.load_asset(folder + '/' + name)
        if item:
            assert unreal.EditorAssetLibrary.get_metadata_tag(item, OWNER_TAG) == owner, '拒绝覆盖非本工具资源: ' + name
        return item

    mat = owned('M_SliderRails')
    if not mat:
        mat = tools.create_asset('M_SliderRails', folder, unreal.Material, unreal.MaterialFactoryNew())
        assert mat
        unreal.EditorAssetLibrary.set_metadata_tag(mat, OWNER_TAG, owner)
    if not unreal.MaterialEditingLibrary.get_material_property_input_node(mat, unreal.MaterialProperty.MP_EMISSIVE_COLOR):
        mat.set_editor_property('blend_mode', unreal.BlendMode.BLEND_OPAQUE)
        mat.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_UNLIT)
        mat.set_editor_property('two_sided', True)
        vertex = next((e for e in unreal.MaterialEditingLibrary.get_material_expressions(mat)
                       if isinstance(e, unreal.MaterialExpressionVertexColor)), None)
        if not vertex:
            vertex = unreal.MaterialEditingLibrary.create_material_expression(mat, unreal.MaterialExpressionVertexColor, 0, 0)
        assert unreal.MaterialEditingLibrary.connect_material_property(vertex, '', unreal.MaterialProperty.MP_EMISSIVE_COLOR)
        unreal.MaterialEditingLibrary.recompile_material(mat)
        unreal.EditorAssetLibrary.set_metadata_tag(mat, OWNER_TAG, owner)
        assert unreal.EditorAssetLibrary.save_loaded_asset(mat, False)
    mesh = owned('SM_SliderRails')
    fingerprint = spec_hash(model)
    if not mesh or unreal.EditorAssetLibrary.get_metadata_tag(mesh, SPEC_TAG) != fingerprint:
        vertices, normals, uv, colors, triangles = [], [], [], [], []
        for row in rail_spec(model):
            p = row['points']
            for start, end in ((p[0], p[1]), (p[2], p[3]), (p[4], p[5])):
                a, b = unreal.Vector(*start), unreal.Vector(*end)
                d = b - a
                assert abs(d.y) < 1e-6 and d.length() > 1e-6, '仅支持 XZ 面板滑轨'
                side = unreal.Vector(-d.z, 0, d.x) * (RAIL_WIDTH_CM / (2 * d.length()))
                base = len(vertices)
                vertices.extend((a-side, a+side, b+side, b-side))
                normals.extend([unreal.Vector(0, 1, 0)] * 4)
                uv.extend([unreal.Vector2D(0, 0), unreal.Vector2D(0, 1), unreal.Vector2D(1, 1), unreal.Vector2D(1, 0)])
                colors.extend([unreal.LinearColor(*row['color'])] * 4)
                triangles.extend((unreal.IntVector(base, base+1, base+2), unreal.IntVector(base, base+2, base+3)))
        dm = unreal.DynamicMesh()
        dm.append_buffers_to_mesh(unreal.GeometryScriptSimpleMeshBuffers(
            vertices=vertices, triangles=triangles, normals=normals, uv0=uv, vertex_colors=colors))
        if mesh:
            _, outcome = unreal.GeometryScript_AssetUtils.copy_mesh_to_static_mesh(
                dm, mesh, unreal.GeometryScriptCopyMeshToAssetOptions(), unreal.GeometryScriptMeshWriteLOD())
        else:
            mesh, outcome = unreal.GeometryScript_NewAssetUtils.create_new_static_mesh_asset_from_mesh(
                dm, folder + '/SM_SliderRails', unreal.GeometryScriptCreateNewStaticMeshAssetOptions(
                    enable_collision=False, enable_nanite=False, enable_recompute_normals=False))
        assert mesh and outcome == unreal.GeometryScriptOutcomePins.SUCCESS, str(outcome)
        mesh.set_material(0, mat)
        unreal.EditorAssetLibrary.set_metadata_tag(mesh, OWNER_TAG, owner)
        unreal.EditorAssetLibrary.set_metadata_tag(mesh, SPEC_TAG, fingerprint)
        assert unreal.EditorAssetLibrary.save_loaded_asset(mesh, False)
    lib = owned('SL_SliderRails')
    if not lib:
        lib = tools.create_asset('SL_SliderRails', folder, unreal.ControlRigShapeLibrary, unreal.ControlRigShapeLibraryFactory())
        assert lib
        shape = unreal.ControlRigShapeDefinition(shape_name='SliderRails', transform=unreal.Transform(), shape_proxy=mesh)
        lib.set_editor_property('shapes', [shape])
        lib.set_editor_property('default_shape', shape)
        lib.set_editor_property('default_material', mat)
        lib.set_editor_property('x_ray_material', mat)
        unreal.EditorAssetLibrary.set_metadata_tag(lib, OWNER_TAG, owner)
        assert unreal.EditorAssetLibrary.save_loaded_asset(lib, False)
    # 从已同步的示例派生时换成目标自己的轨道库，避免两个同名库解析到示例资源。
    original_libraries = list(asset.get_editor_property('shape_libraries'))
    libraries = [item for item in original_libraries
                 if unreal.EditorAssetLibrary.get_metadata_tag(item, OWNER_TAG) in ('', owner)]
    if lib not in libraries:
        libraries.append(lib)
    if libraries != original_libraries:
        asset.set_editor_property('shape_libraries', libraries)
    key = unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=RAIL_CONTROL)
    st = unreal.RigControlSettings(control_type=unreal.RigControlType.POSITION,
        animation_type=unreal.RigControlAnimationType.VISUAL_CUE, display_name='滑轨（辅助，不可选）',
        shape_name='SL_SliderRails.SliderRails', shape_visible=True, draw_limits=False,
        shape_color=unreal.LinearColor(1, 1, 1, 1))
    st.limit_enabled = [unreal.RigControlLimitEnabled(minimum=True, maximum=True)] * 3
    st.minimum_value = h.make_control_value_from_vector(unreal.Vector())
    st.maximum_value = h.make_control_value_from_vector(unreal.Vector())
    hc = h.get_controller(True)
    parent = h.get_first_parent(keys[0])
    assert all(h.get_first_parent(k).name == parent.name for k in keys), '滑块空间不同，需分别生成轨道'
    if not h.contains(key):
        hc.add_control(RAIL_CONTROL, parent, st, h.make_control_value_from_vector(unreal.Vector()), False, False)
        # 轨道顶点为 Rig 初始空间坐标；转成初始父空间，随后继承父级运动。
        offset = h.get_global_transform(parent, True).inverse()
        for initial in (True, False):
            h.set_control_offset_transform(key, offset, initial, False)
            h.set_control_shape_transform(key, unreal.Transform(), initial, False)
    else:
        assert h.get_control_settings(key).animation_type == unreal.RigControlAnimationType.VISUAL_CUE
    # Blueprint 的 AddControl 会清理显示名标点；再写一次设置以与 RuntimeAsset 一致。
    assert hc.set_control_settings(key, st, False)
    c = editor.get_controller(model)
    for node in rail_nodes(model):
        assert c.set_pin_default_value(str(node.get_name()) + '.bEnabled', 'False', False, False)


def validate_rail_geometry(asset):
    asset = getattr(asset, '_fm_asset', asset)
    runtime = isinstance(asset, unreal.ControlRigRuntimeAsset)
    editor = asset.get_editor_asset() if runtime else asset
    h = asset.hierarchy if runtime else asset.get_hierarchy()
    model = editor.get_default_model()
    key = unreal.RigElementKey(type=unreal.RigElementType.CONTROL, name=RAIL_CONTROL)
    assert h.contains(key), '缺少实体滑轨'
    st = h.get_control_settings(key)
    assert st.animation_type == unreal.RigControlAnimationType.VISUAL_CUE and str(st.shape_name) == 'SL_SliderRails.SliderRails'
    assert all(n.find_pin('bEnabled').get_default_value() == 'False' for n in rail_nodes(model)), '置顶调试轨道仍启用'
    folder = rig_dependency_folder(asset.get_path_name())
    mesh = unreal.load_asset(folder + '/SM_SliderRails')
    lib = unreal.load_asset(folder + '/SL_SliderRails')
    assert mesh and lib
    assert unreal.EditorAssetLibrary.get_metadata_tag(mesh, SPEC_TAG) == spec_hash(model), '轨道几何已过期'
    for prop in ('default_material', 'x_ray_material'):
        mat = lib.get_editor_property(prop)
        assert mat.get_editor_property('blend_mode') == unreal.BlendMode.BLEND_OPAQUE
        assert not mat.get_editor_property('disable_depth_test')
    return {'rail_count': len(rail_nodes(model)), 'visual_control': RAIL_CONTROL,
            'mesh': mesh.get_path_name(), 'width_cm': RAIL_WIDTH_CM,
            'opaque': True, 'depth_test': True, 'selectable_control': False, 'debug_rails_disabled': True}
