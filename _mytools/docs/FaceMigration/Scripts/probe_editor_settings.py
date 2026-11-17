"""探测 ControlRigEditor 设置对象里的预览相关字段。"""
import json

import unreal


def main():
    out = {}
    for cls_path in ('/Script/ControlRigEditor.ControlRigEditorSettings',
                     '/Script/ControlRigEditor.ControlRigEditorProjectSettings'):
        try:
            cls = unreal.load_class(None, cls_path)
            out[cls_path] = str(cls)
            if cls:
                obj = unreal.get_default_object(cls)
                props = [p for p in dir(obj) if 'preview' in p.lower() or 'reference' in p.lower() or 'pose' in p.lower()]
                out[cls_path + '::props'] = props
                for p in props:
                    try:
                        v = obj.get_editor_property(p)
                        out[cls_path + '::' + p] = str(v)
                    except Exception as exc:
                        out[cls_path + '::' + p] = 'ERR %r' % exc
        except Exception as exc:
            out[cls_path] = 'ERR %r' % exc
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
