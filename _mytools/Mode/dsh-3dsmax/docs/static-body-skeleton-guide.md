# Build a 55-node body skeleton from a static mesh

English | [中文](static-body-skeleton-guide.zh.md)

Use this procedure to prepare an unrigged humanoid for skeleton fitting and controller migration experiments. It creates 55 Seven-compatible **Dummy nodes**, with measured joint positions and world axes. It does not add Skin, Biped, IK, facial bones, or animation controls; moving the skeleton does not deform a static mesh.

Creating nodes, assigning names, parenting, and saving matrices are repeatable operations. Joint centers, limb roll, and the rest pose require anatomical review. The supplied [Chiya profile](../tools/body55/profiles/chiya.json) records one measured model; other characters need their own profile rather than scaled copies of its coordinates.

## Files and prerequisites

| File | Responsibility |
|---|---|
| [generate.py](../tools/body55/generate.py) | Validate a measured profile and generate executable MAXScript; Python standard library only |
| [build.ms](../tools/body55/build.ms) | Builder template; generate a script before running it |
| [chiya.json](../tools/body55/profiles/chiya.json) | Chiya joint positions, axes, hierarchy, and static mesh checks |

The builder requires system units of **1 centimeter**, only the declared static meshes, no mesh modifiers or animation, and no existing skeleton nodes. Save this input as a `.max` file first. Record the intended Max instance and source path before executing anything. Use a new output path in an existing directory; the generator and builder reject an existing output file. Native execution has been checked in 3ds Max 2026.3; other versions are unverified.

## 1. Measure a new character

Start from a saved neutral pose. Inspect front, side, and top views; record world-space joint centers for pelvis, spine, neck, shoulders, elbows, wrists, hips, knees, ankles, toes, and each finger joint. Fit body joints to the underlying body rather than clothing or hair bounds. Triangle-plane cross sections can help estimate limb centers; overlapping garments, nails, and separated mesh components require manual interpretation. Component numbers are model-specific.

Check coordinate space before sampling vertices: in the Chiya measurement session, `snapshotAsMesh` returned world coordinates. Multiplying those points by the node transform again displaced the measurements. Confirm samples against visible world landmarks before using them.

Preserve the canonical hierarchy from `skeleton_parents()` in `generate.py`: 7 central nodes, 24 nodes per side (9 limb/twist nodes and 15 finger nodes), totaling 55. `lowerarm_twist_01_l/r` are children of the corresponding lower arm; the hand remains a separate child. The profile validator rejects missing names, duplicates, and different parents.

For each upper arm, lower arm, thigh, and calf, set local **+X toward the next joint**. A reproducible frame uses `X = normalize(child - joint)`, projects a chosen roll reference perpendicular to X to obtain Y, then sets `Z = cross(X, Y)`. Choose another roll reference if the projection is near zero. Keep all frames orthonormal and right-handed; mirror joint positions and rebuild frames instead of introducing negative scale. Finger, torso, hand, and foot frames need explicit review against the Seven convention. In particular, Seven's foot axes do not require +X to point toward the ball joint.

A straight limb does not determine its future IK bend plane. Record the intended elbow/knee direction for the later Biped fitting stage. A Blender hierarchy with +Y along bone length needs axes rebuilt for this +X workflow even if all names and parents already match.

## 2. Record the profile

Copy `chiya.json` to a new character profile, then replace **every measured transform and mesh record**. Positions are world coordinates in centimeters; `axes` contains the three world-space row vectors used by Max's `matrix3`. Parent transforms are not multiplied into these values.

| Field | Required value |
|---|---|
| `format`, `layer` | `body55-v1` and a nonempty output layer name |
| `meshes[]` | Every input mesh: `name`, positive `vertices`/`faces`, world `position`, and `axes` |
| `nodes[]` | Exactly 55 records: canonical `name`, `parent` (`null` for Root), world `position`, and `axes` |

The generator rejects non-finite coordinates, scaled/sheared/reflected frames, and the eight main limb axes deviating from their segment direction by more than 0.1°. Mesh count, topology counts, and transforms guard against selecting the wrong scene; they do not detect vertex edits that preserve those counts. Keep the measured source revision and visually review the result.

## 3. Generate and inspect

From this preset's directory, the Chiya example is:

```powershell
python tools/body55/generate.py --profile tools/body55/profiles/chiya.json --source-scene E:/AI/3dMax/Save/chistatic.max --scene-copy D:/AI/work/body55-tool-validation/chiya-body55.max --script D:/AI/work/body55-tool-validation/build-chiya.ms
```

Create the output directory first and choose fresh paths for subsequent runs. The command only writes a script; it does not control Max. Open the measured static input in the intended Max instance and run the generated script through MAXScript. Loading performs read-only preflight and returns `PREFLIGHT_OK=55; no scene or file changes`. Loading the same script in its completed output scene instead performs read-only verification.

## 4. Build and validate

After preflight passes, explicitly run:

```maxscript
DSHBody55Run action:#build
DSHBody55Run action:#verify
DSHBody55Run action:#pose
DSHBody55Run action:#rest
```

`#build` saves a clean working copy before creating nodes, assigns the measured world matrices, establishes parents, reapplies the matrices, validates, tests Root +10Z and direct restoration, then saves the completed copy. Center/left/right nodes are yellow/cyan/red in the profile's layer. Repeated construction is rejected. `#verify` and `#rest` are read-only; `#pose` temporarily moves Root and restores it, without saving.

Acceptance requires 55 unique Dummy names and the declared parents, free `Position_XYZ` / `Euler_XYZ`, no animation, unit scale, and maximum world-matrix row distance ≤1e-4. Root +10Z must move all 55 nodes by that amount and directly restore all matrices within 1e-4. The default scale controller may be `bezier_scale`; a `ScaleXYZ` class is not required.

Inspect joints and axes in three views, including fingers inside the hands, elbow/knee depth, shoulder/hip centers, and foot direction. Numerical agreement with the profile verifies construction, not anatomical placement. Compare mesh geometry/material data with the input if mesh preservation is part of acceptance; the constructor's topology-count check alone is insufficient.

Persist the string returned by `#rest` to an external UTF-8 text file through the host/file tools. It contains each name followed by 12 row-major world-matrix numbers. Keep this original rest table before adding constraints; session globals do not survive a restart. Respect Safe Scene Script Execution and use external file tools if Max blocks file writes.

Save the returned rest string, reopen the completed copy, run `#rest` again, and compare all values by name with the saved table. The Chiya batch check compared the full returned strings identically after reopening, in addition to verification, Root motion/restoration, and repeat-build rejection.

## Recovery and next stage

If preflight fails, correct the scene/profile/path before building. If construction fails, stop dependent work and do not save the partial scene. Before final saving is attempted, the output contains the clean checkpoint; if final saving fails, treat the output as unverified. Reopen the original static input, inspect or preserve the failed output, and generate a new script with fresh paths. The builder never intentionally saves over the source input.

The resulting scene can test skeleton naming, hierarchy, Biped fitting, and controller following. Complete the [character adaptation record](character-adaptation-guide.md), check hip span, whole-limb frames, and branch limits, then continue with the [Biped rebuild guide](biped-rebuild-guide.md) and [runbook](quick-runbook.md), recording that Skin is absent. Skin lists, deformation, bind-pose quality, baking, and engine export remain separate acceptance work; a successful body55 build does not establish end-to-end migration success.
