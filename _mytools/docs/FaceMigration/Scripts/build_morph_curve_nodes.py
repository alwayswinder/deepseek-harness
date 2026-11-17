"""
给 CR_Seven_FaceMorphs 的 7 个 Float 控件各接一条
    Get Control Float  ->  Set Curve Value(曲线名 = morph 名)
并把 Skeleton 上这 7 条曲线标记为 Morph Target 类型。

用法（编辑器 Output Log，左上角模式切到 Python）：
    py "Tools/FaceMigration/Scripts/build_morph_curve_nodes.py"

报错的话，把 Output Log 里所有 [MorphRig] 开头的行贴给我。
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
GRAPH_NAME = "RigVMModel"
GET_STRUCT = "/Script/ControlRig.RigUnit_GetControlFloat"
SET_STRUCT = "/Script/ControlRig.RigUnit_SetCurveValue"
CURVES     = ["1_happy", "1_happy_l_es", "1_happy_r_es",
              "1_hellow", "1_hou", "1_jian", "1_jing"]


def log(m):  unreal.log("[MorphRig] " + str(m))
def warn(m): unreal.log_warning("[MorphRig] " + str(m))


def node_path(node):
    """节点路径在不同版本里可能是 GetNodePath 或 GetNodeName。"""
    for name in ("get_node_path", "get_node_name", "get_name"):
        if hasattr(node, name):
            try:
                return str(getattr(node, name)())
            except Exception:
                pass
    raise RuntimeError("拿不到节点路径: %r" % node)


def get_controller(rig):
    for name in ("get_controller_by_name", "get_controller", "get_or_create_controller"):
        if not hasattr(rig, name):
            continue
        fn = getattr(rig, name)
        for args in ((GRAPH_NAME,), ()):
            try:
                c = fn(*args)
            except Exception:
                continue
            if c:
                log("controller <- %s%r" % (name, args))
                return c
    hint = [n for n in dir(rig) if any(k in n.lower() for k in ("controller", "model", "graph"))]
    warn("拿不到 controller；rig 上相关方法：%s" % hint)
    return None


def main():
    rig = _fm_load_asset(RIG_PATH)
    if not rig:
        raise RuntimeError("载入失败 " + RIG_PATH)
    log("rig = %s / %s" % (rig.get_name(), rig.get_class().get_name()))

    controller = get_controller(rig)
    if not controller:
        return

    ok, bad = [], []
    for i, name in enumerate(CURVES):
        y = 200.0 + i * 170.0
        try:
            g = controller.add_unit_node_from_struct_path(
                GET_STRUCT, "Execute", unreal.Vector2D(400.0, y), "GetControl_" + name)
            s = controller.add_unit_node_from_struct_path(
                SET_STRUCT, "Execute", unreal.Vector2D(760.0, y), "SetCurve_" + name)
            if not g or not s:
                raise RuntimeError("节点创建返回空")

            controller.set_pin_default_value(node_path(g) + ".Control", "CTRL_" + name, True)
            controller.set_pin_default_value(node_path(s) + ".Curve", name, True)
            controller.add_link(node_path(g) + ".FloatValue", node_path(s) + ".Value")
            ok.append(name)
            log("OK  CTRL_%s -> curve %s" % (name, name))
        except Exception as e:
            bad.append(name)
            warn("FAIL %s : %s" % (name, e))

    log("节点：成功 %d / 失败 %d" % (len(ok), len(bad)))

    # 保存 + 重编译
    try:
        if hasattr(rig, "recompile_control_rig"):
            rig.recompile_control_rig()
            log("recompile 完成")
        _fm_save_asset(rig, False)
        log("已保存 rig")
    except Exception as e:
        warn("保存/编译失败：%s" % e)

    # ---- 曲线标记 Morph Target ----
    try:
        mesh = _fm_load_asset(MESH_PATH)
        skel = mesh.get_editor_property("Skeleton")
        metas = [d for d in skel.get_asset_user_data()
                 if "AnimCurveMetaData" in d.get_class().get_name()]
        if metas:
            meta = metas[0]
        else:
            meta = unreal.new_object(unreal.AnimCurveMetaData, skel)
            skel.add_asset_user_data(meta)
            log("新建 AnimCurveMetaData")
        for name in CURVES:
            n = unreal.Name(name)
            meta.add_curve_meta_data(n, True)
            meta.set_curve_meta_data_morph_target(n, True)
            log("curve %s -> MorphTarget" % name)
        _fm_save_asset(skel, False)
        log("skeleton 已保存")
    except Exception as e:
        warn("Skeleton 标记失败（改成手动勾）：%s" % e)

    log("结束。")


main()
