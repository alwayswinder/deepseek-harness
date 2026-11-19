"""查看 FbxImportUI / 网格导入数据实例上的骨骼影响选项。"""
import json

import unreal


def main():
    out = {}
    ui = unreal.FbxImportUI()
    out['ui_props'] = [p for p in dir(ui) if 'skeletal' in p.lower() or 'bone' in p.lower() or 'influence' in p.lower()]
    try:
        data = ui.get_editor_property('skeletal_mesh_import_data')
        out['skel_data_props'] = [p for p in dir(data) if not p.startswith('_')]
    except Exception as exc:
        out['skel_data'] = 'ERR %r' % exc
    for cls_name in ('FbxImportUI', 'FbxSkeletalMeshImportData', 'FbxMeshImportData'):
        cls = getattr(unreal, cls_name, None)
        if cls:
            try:
                cdo = unreal.get_default_object(cls)
                out[cls_name + '_props'] = [p for p in dir(cdo) if 'bone' in p.lower() or 'influence' in p.lower() or 'weight' in p.lower()]
            except Exception as exc:
                out[cls_name + '_props'] = 'ERR %r' % exc
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
