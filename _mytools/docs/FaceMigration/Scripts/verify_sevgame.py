"""Verify /Game/SevGame assets load with the *stock* engine version checks enabled.

No CVar bypass here: this is exactly what the editor will do for the user.
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
import os

ROOT = os.environ.get("RESAVE_ROOT", _fm_asset('/Game/SevGame'))

content = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_content_dir())
root_dir = os.path.join(content, ROOT[len(_fm_asset('/Game/')):].replace("/", os.sep))

packages = []
for d, _, fs in os.walk(root_dir):
    for f in fs:
        if f.lower().endswith((".uasset", ".umap")):
            rel = os.path.relpath(os.path.join(d, f), content).replace("\\", "/")
            packages.append(_fm_asset('/Game/') + rel.rsplit(".", 1)[0])
packages.sort()

eal = unreal.EditorAssetLibrary
ok, failed = [], []
for pkg in packages:
    try:
        a = eal.load_asset(pkg)
    except Exception as e:  # noqa: BLE001
        a = None
        why = str(e)
    else:
        why = "returned None"
    if a is None:
        failed.append((pkg, why))
        unreal.log_error("SEVCHECK FAIL %s :: %s" % (pkg, why))
    else:
        ok.append(pkg)
        unreal.log("SEVCHECK OK %s (%s)" % (pkg, a.get_class().get_name()))

unreal.log("SEVCHECK: ===== ok=%d failed=%d (of %d) =====" % (len(ok), len(failed), len(packages)))
for pkg, why in failed:
    unreal.log_error("SEVCHECK FAILED LIST :: %s :: %s" % (pkg, why))
unreal.log("SEVCHECK: DONE")
