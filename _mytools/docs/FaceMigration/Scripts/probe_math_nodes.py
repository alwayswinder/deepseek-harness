"""探测 RigVM 数学节点类名。"""
import json

import unreal


def main():
    out = {}
    for pat in ('MathVector', 'MathFloat', 'MathQuaternion', 'MathSelect', 'MathBool'):
        out[pat] = sorted([n for n in dir(unreal) if n.startswith('RigVMFunction_' + pat)])
    print('JSONSTART')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print('JSONEND')


if __name__ == '__main__':
    main()
