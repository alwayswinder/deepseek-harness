"""列出 ControlRig Controls 目录内容，找形状资产。"""
import json

import unreal


def main():
    out = {}
    for root in ['/Engine/Plugins/Animation/ControlRig/Content/Controls']:
        try:
            assets = unreal.EditorAssetLibrary.list_assets(root, True, False)
            out[root] = [str(a) for a in assets][:80]
        except Exception as exc:
            out[root] = 'ERR %r' % exc
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
