"""补完 CR_Seven_FaceMorphs 的 morph 驱动链路，并做静态校验。

1. Skeleton 的 7 条曲线标记 Morph Target
2. 校验：曲线标记结果 + rig 里 Get/Set 节点数量与连线
"""

# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import unreal

RIG_PATH   = _fm_asset('/Game/_MyTest/Mouth/Rig/CR_Seven_FaceMorphs')
MESH_PATH  = _fm_asset('/Game/_MyTest/Mouth/Mesh/Seven')
CURVES = ["1_happy", "1_happy_l_es", "1_happy_r_es",
          "1_hellow", "1_hou", "1_jian", "1_jing"]


def log(m):  unreal.log("[MorphRig] " + str(m))


def main():
    # ---------- 1. 曲线标记 ----------
    mesh = _fm_load_asset(MESH_PATH)
    skel = mesh.get_editor_property("Skeleton")
    for name in CURVES:
        n = unreal.Name(name)
        try:
            skel.add_curve_meta_data(n, True)
        except Exception as e:
            log("add_curve_meta_data %s : %s" % (name, e))
        try:
            skel.set_curve_meta_data_morph_target(n, True)
        except Exception as e:
            log("set_morph_target %s : %s" % (name, e))
    _fm_save_asset(skel, False)
    log("-- 曲线标记结果 --")
    for name in CURVES:
        log("  %-16s morph_target=%s" % (name, skel.get_curve_meta_data_morph_target(unreal.Name(name))))

    # ---------- 2. rig 图校验 ----------
    rig = _fm_load_asset(RIG_PATH)
    ctrl = rig.get_controller_by_name("RigVMModel")
    graph = ctrl.get_graph()
    nodes = graph.get_nodes()
    gets, sets = [], []
    for node in nodes:
        try:
            ss = node.get_script_struct()
            sname = ss.get_name() if ss else ""
        except Exception:
            sname = ""
        if "GetControlFloat" in sname:
            gets.append(node)
        elif "SetCurveValue" in sname:
            sets.append(node)
    log("-- rig 图 --")
    log("  节点总数=%d  GetControlFloat=%d  SetCurveValue=%d" % (len(nodes), len(gets), len(sets)))

    def pin_default(node, pin):
        try:
            for p in node.get_pins():
                if p.get_name() == pin:
                    return p.get_default_value()
        except Exception as e:
            return "ERR:%s" % e
        return None

    for node in sets:
        log("  curve=%s" % pin_default(node, "Curve"))
    for node in gets:
        log("  control=%s" % pin_default(node, "Control"))

    # ---------- 3. 曲线容器 ----------
    try:
        h = rig.get_hierarchy()
        names = [c.get_name() for c in h.get_curves()] if hasattr(h, "get_curves") else []
        log("rig curves = %s" % names)
    except Exception as e:
        log("曲线容器读取失败: %s" % e)


main()
