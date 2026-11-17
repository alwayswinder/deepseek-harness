"""探测 ControlRig 编辑器预览模式 API。"""
import json

import unreal


def main():
    out = {}
    for cls_name in ('ControlRigEditorLibrary', 'ControlRigBlueprintEditorLibrary',
                     'ControlRigBlueprint', 'ControlRigEditorSettings'):
        cls = getattr(unreal, cls_name, None)
        out[cls_name] = [m for m in dir(cls) if not m.startswith('_')] if cls else 'MISSING'

    for n in dir(unreal):
        if 'ControlRig' in n and ('Library' in n or 'Editor' in n):
            out.setdefault('classes', []).append(n)
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
