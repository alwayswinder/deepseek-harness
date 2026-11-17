"""把现有透明口型图作为只读参考形状，逐行对齐到口型滑块旁。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import datetime,json,shutil,types
from pathlib import Path
import unreal
from slider_handle_layout import apply_reference_depth
ROOT=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
E=_fm_tool('Docs/Evidence/PhonemeReference')
FOLDER=_fm_asset('/Game/_MyTest/Mouth/LidDiagnostic/PhonemeReference')
CONTROL='VIS_PHONEME_REFERENCE'
b=types.ModuleType('phonemes');exec(compile((_fm_read(_fm_tool('Scripts/build_phoneme_sliders.py'))).read_text(encoding='utf-8'),'phonemes','exec'),b.__dict__)

def signature(rig):
    model=rig.get_default_model()
    return dict(nodes=[str(n.get_name()) for n in model.get_nodes()],links=sorted(b.b.base.base.helper.exec_links(model)),bones=len(rig.get_hierarchy().get_bones()),curves=[str(k.name) for k in rig.get_hierarchy().get_curves()])

def samples(rig):
    inst,h=b.b.instance(rig)
    rows=json.loads((_fm_read(_fm_tool('Docs/Evidence/PhonemeSliders/parameters.json'))).read_text(encoding='utf-8'))['rows']
    result=[]
    for values in [{}]+[{r['control']:[8,0,0]} for r in rows]+[{r['control']:[(i+1)*8/12,0,0] for i,r in enumerate(rows)}]:
        b.b.solve(inst,h,values)
        result.append(dict(values=values,bones=b.b.packed(h),curves={str(k.name):h.get_curve_value(k) for k in h.get_curves()}))
    return result

def main():
    p=json.loads((_fm_read(E/'parameters.json')).read_text(encoding='utf-8'))
    rig=_fm_load_asset(b.ASSET);h=rig.get_hierarchy();key=b.b.key(CONTROL,unreal.RigElementType.CONTROL)
    assert not h.contains(key),'Reference already installed'
    backup=_fm_saved('Backup')/('PhonemeReference_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'));_fm_output(backup).mkdir(parents=True)
    disk=_fm_disk('Content/_MyTest/Mouth/LidDiagnostic/CR_Seven_LidWorldRotation.uasset')
    shutil.copy2(disk,backup/'disk_before.uasset')
    preview=b.b.base.preview_values(rig)
    assert _fm_save_asset(rig,False)
    shutil.copy2(disk,backup/'memory_before.uasset')
    before=signature(rig);old_samples=samples(rig)
    report=dict(asset=b.ASSET,backup=str(backup),preview_values=preview,before=before,saved=False,passed=False)
    (_fm_output(E/'build_report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    (_fm_output(E/'before_outputs.json')).write_text(json.dumps(old_samples,ensure_ascii=False,indent=2),encoding='utf-8')
    tools=unreal.AssetToolsHelpers.get_asset_tools();tex=_fm_load_asset(p['texture']);assert tex
    for n in ('M_PhonemeReference','SM_PhonemeReference','SL_PhonemeReference'):
        assert not unreal.EditorAssetLibrary.does_asset_exist(FOLDER+'/'+n),'Asset already exists: '+n
    mat=tools.create_asset('M_PhonemeReference',FOLDER,unreal.Material,unreal.MaterialFactoryNew());assert mat
    mat.set_editor_property('blend_mode',unreal.BlendMode.BLEND_MASKED)
    mat.set_editor_property('shading_model',unreal.MaterialShadingModel.MSM_UNLIT)
    mat.set_editor_property('two_sided',True);mat.set_editor_property('opacity_mask_clip_value',0.1)
    ml=unreal.MaterialEditingLibrary
    sample=ml.create_material_expression(mat,unreal.MaterialExpressionTextureSample,0,0);sample.set_editor_property('texture',tex)
    assert ml.connect_material_property(sample,'RGB',unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    assert ml.connect_material_property(sample,'A',unreal.MaterialProperty.MP_OPACITY_MASK)
    ml.recompile_material(mat)
    # 十二个独立四边面使用原贴图各行 UV，统一像素比例、逐行居中。
    vertices=[];uv=[];tris=[];normals=[];layout=[];scale=p['pixel_scale_cm'];tw,th=p['texture_size']
    for i,row in enumerate(p['rows']):
        x0,y0,x1,y1=row['crop'];bx0,by0,bx1,by1=row['bounds'];cx=(bx0+bx1)/2;cy=(by0+by1)/2
        points=[(x0,y0),(x1,y0),(x1,y1),(x0,y1)];base=len(vertices)
        for x,y in points:
            vertices.append(unreal.Vector((x-cx)*scale,0,-i*p['row_spacing_cm']+(cy-y)*scale))
            uv.append(unreal.Vector2D(x/tw,y/th));normals.append(unreal.Vector(0,1,0))
        tris.extend([unreal.IntVector(base,base+1,base+2),unreal.IntVector(base,base+2,base+3)])
        layout.append(dict(row=i+1,center=[p['origin'][0],p['origin'][1],p['origin'][2]-i*4],crop=row['crop'],visible_width_cm=(bx1-bx0)*scale,visible_height_cm=(by1-by0)*scale))
    buffers=unreal.GeometryScriptSimpleMeshBuffers(vertices=vertices,triangles=tris,normals=normals,uv0=uv)
    dm=unreal.DynamicMesh();dm.append_buffers_to_mesh(buffers)
    options=unreal.GeometryScriptCreateNewStaticMeshAssetOptions(enable_collision=False,enable_nanite=False,enable_recompute_normals=False)
    mesh,outcome=unreal.GeometryScript_NewAssetUtils.create_new_static_mesh_asset_from_mesh(dm,FOLDER+'/SM_PhonemeReference',options)
    assert mesh and outcome==unreal.GeometryScriptOutcomePins.SUCCESS,outcome
    mesh.set_material(0,mat)
    lib=tools.create_asset('SL_PhonemeReference',FOLDER,unreal.ControlRigShapeLibrary,unreal.ControlRigShapeLibraryFactory());assert lib
    shape=unreal.ControlRigShapeDefinition(shape_name='PhonemeReference',transform=unreal.Transform(),shape_proxy=mesh)
    lib.set_editor_property('shapes',[shape]);lib.set_editor_property('default_shape',shape)
    lib.set_editor_property('default_material',mat);lib.set_editor_property('x_ray_material',mat)
    for asset in (mat,mesh,lib):assert _fm_save_asset(asset,False)
    with unreal.ScopedEditorTransaction('Add aligned phoneme reference image'):
        rig.modify();rig.set_editor_property('shape_libraries',list(rig.get_editor_property('shape_libraries'))+[lib])
        st=unreal.RigControlSettings(control_type=unreal.RigControlType.POSITION,animation_type=unreal.RigControlAnimationType.VISUAL_CUE,display_name='口型参考图',shape_name='SL_PhonemeReference.PhonemeReference',shape_visible=True,draw_limits=False,shape_color=unreal.LinearColor(1,1,1,1))
        st.limit_enabled=[unreal.RigControlLimitEnabled(minimum=True,maximum=True)]*3
        st.minimum_value=h.make_control_value_from_vector(unreal.Vector());st.maximum_value=h.make_control_value_from_vector(unreal.Vector())
        added=rig.get_hierarchy_controller().add_control(CONTROL,b.b.key('Root'),st,h.make_control_value_from_vector(unreal.Vector()),False,False);assert h.contains(key)
        for initial in (True,False):
            tf=unreal.Transform();tf.translation=unreal.Vector(*p['origin'])
            h.set_control_offset_transform(key,tf,initial,True);h.set_control_shape_transform(key,unreal.Transform(),initial)
        h.set_control_value(key,h.make_control_value_from_vector(unreal.Vector()),unreal.RigControlValueType.INITIAL)
        apply_reference_depth(h, rig.get_default_model())
        rig.recompile_vm();assert rig.get_editor_property('status')!=unreal.BlueprintStatus.BS_ERROR
    assert signature(rig)==before,'Rig graph changed'
    assert samples(rig)==old_samples,'Existing deformation outputs changed'
    report.update(layout=layout,assets=[a.get_path_name() for a in (mat,mesh,lib)],controls_total=len(h.get_controls()),animation_controls=62,visual_cues=1,output_cases=len(old_samples),passed=True)
    assert _fm_save_asset(rig,False)
    report['saved']=True;(_fm_output(E/'build_report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ('preview_values','before','layout')},ensure_ascii=False))

if __name__=='__main__':main()
