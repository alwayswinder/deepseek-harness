"""打印执行流：Begin 后面第一个节点、以及各前缀链是否在执行流上。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import json

import unreal

ASSET = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_MorphSliders')

rig = _fm_load_asset(ASSET)
model = rig.get_default_model()
links = list(model.get_links())

rows = []
for link in links:
    try:
        sn = str(link.get_source_node().get_name())
        tn = str(link.get_target_node().get_name())
        sp = str(link.get_source_pin().get_name())
        tp = str(link.get_target_pin().get_name())
    except Exception:
        continue
    rows.append([sn, sp, tn, tp])

out = {'count': len(rows)}
out['exec_links'] = [r for r in rows if 'Execute' in r[1] or 'Execute' in r[3]]
out['begin'] = [r for r in rows if r[0] == _fm_node('Begin') or r[2] == _fm_node('Begin')]

# 第一条执行流链：从 Begin 开始追
nxt = {}
for r in rows:
    if 'Execute' in r[1]:
        nxt.setdefault(r[0], []).append(r[2])

chain = []
cur = _fm_node('Begin')
seen = set()
while cur in nxt and cur not in seen:
    seen.add(cur)
    n = nxt[cur][0]
    chain.append(cur + ' -> ' + n)
    cur = n
out['exec_chain_from_begin'] = chain[:80]

# 各前缀在链上的第一个节点
prefixes = ('BROW_SET_meibu_L', 'BPT_ADD_Bone008', 'EYE_SET_Bone036', 'LID_ADD_Bone036', 'BROW_SET_Bone007')
out['prefix_in_chain'] = {p: (p in [c.split(' -> ')[0] for c in chain]) for p in prefixes}

print('JSONSTART')
print(json.dumps(out, ensure_ascii=False, indent=1))
print('JSONEND')
