"""Resave a content folder with the current engine so that assets saved by a
newer / licensee engine build stop being "newer engine version" packages.

Written for the 2026-10-30 SevGame migration: those assets came from
D:\\Work\\SSMainline (engine 5.8.4-167004 licensee branch
"++ScissorSeven+Game+Mainline") and were rejected by stock 5.8.3.

Edit ROOT below to point at another folder, and make sure every editor
instance that has the project open is CLOSED first (Windows sharing locks make
SavePackage fail with "Error Code 32" / save returned False).

Run with:
  UnrealEditor-Cmd.exe <project> -run=pythonscript -script="<this file>" -unattended -nosplash -stdout
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

# Default root; override with the RESAVE_ROOT env var before launching, e.g.
#   $env:RESAVE_ROOT="/Game/Developers/fulinhou/Skele"
ROOT = os.environ.get("RESAVE_ROOT", _fm_asset('/Game/SevGame'))
unreal.log("SEVGAME: ROOT=%s" % ROOT)

# Bypass the package/engine version compatibility gate so the 5.8.4-branch
# packages can be read at all.  Only needed for this one-off resave.
unreal.SystemLibrary.execute_console_command(None, "s.EnforcePackageCompatibleVersionCheck 0")
unreal.log("SEVGAME: s.EnforcePackageCompatibleVersionCheck -> 0")

content = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_content_dir())
root_dir = os.path.join(content, ROOT[len(_fm_asset('/Game/')):].replace("/", os.sep))

packages = []
for d, _, fs in os.walk(root_dir):
    for f in fs:
        if f.lower().endswith((".uasset", ".umap")):
            full = os.path.join(d, f)
            rel = os.path.relpath(full, content).replace("\\", "/")
            packages.append(_fm_asset('/Game/') + rel.rsplit(".", 1)[0])
packages.sort()
unreal.log("SEVGAME: found %d packages" % len(packages))

eal = unreal.EditorAssetLibrary
ok, failed = [], []

# Two passes: skeletons/anim data first, everything else afterwards, so that
# dependent assets get resaved against already-normalized parents.
def rank(p):
    order = ["_Skeleton", "_PhysicsAsset"]
    for i, k in enumerate(order):
        if k in p:
            return i
    return len(order)

for pkg in sorted(packages, key=rank):
    asset = None
    try:
        asset = eal.load_asset(pkg)
    except Exception as e:  # noqa: BLE001
        failed.append((pkg, "load exception: %s" % e))
        unreal.log_error("SEVGAME FAIL load %s :: %s" % (pkg, e))
        continue
    if asset is None:
        failed.append((pkg, "load returned None (see LoadErrors log)"))
        unreal.log_error("SEVGAME FAIL load %s :: None" % pkg)
        continue
    try:
        new_form = eal.save_loaded_asset(asset, only_if_is_dirty=False)
    except Exception as e:  # noqa: BLE001
        try:
            new_form = eal.save_asset(pkg, only_if_is_dirty=False)
        except Exception as e2:  # noqa: BLE001
            new_form = False
            unreal.log_error("SEVGAME FAIL save %s :: %s / %s" % (pkg, e, e2))
    if new_form:
        ok.append(pkg)
        unreal.log("SEVGAME OK %s" % pkg)
    else:
        failed.append((pkg, "save returned False"))
        unreal.log_error("SEVGAME FAIL save %s :: returned False" % pkg)

unreal.log("SEVGAME: ===== SUMMARY ok=%d failed=%d =====" % (len(ok), len(failed)))
for pkg, why in failed:
    unreal.log_error("SEVGAME FAILED LIST :: %s :: %s" % (pkg, why))
unreal.log("SEVGAME: DONE")
