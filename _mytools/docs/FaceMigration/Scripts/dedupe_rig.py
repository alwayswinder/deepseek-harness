"""删掉我刚才重复添加的 7 组节点（保留原有的那一套），再校验。"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import unreal

RIG_PATH = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_FaceMorphs')


def log(m):  unreal.log("[MorphRig] " + str(m))


rig = _fm_load_asset(RIG_PATH)
ctrl = rig.get_controller_by_name("RigVMModel")
graph = ctrl.get_graph()

removed, failed = 0, 0
for node in list(graph.get_nodes()):
    try:
        name = node.get_name()
    except Exception:
        continue
    if name.startswith("GetControl_") or name.startswith("SetCurve_"):
        try:
            ctrl.remove_node(node)
            removed += 1
        except Exception:
            try:
                ctrl.remove_node(unreal.Name(name))
                removed += 1
            except Exception as e:
                failed += 1
                log("删不掉 %s : %s" % (name, e))

log("removed=%d failed=%d" % (removed, failed))

# 重新统计
nodes = ctrl.get_graph().get_nodes()
gets = sum(1 for n in nodes if "GetControlFloat" in (n.get_script_struct().get_name() if n.get_script_struct() else ""))
sets = sum(1 for n in nodes if "SetCurveValue" in (n.get_script_struct().get_name() if n.get_script_struct() else ""))
log("节点总数=%d GetControlFloat=%d SetCurveValue=%d" % (len(nodes), gets, sets))

try:
    rig.recompile_control_rig()
except Exception as e:
    log("recompile: %s" % e)
_fm_save_asset(rig, False)
log("saved")
