# 3ds Max character adaptation (Biped rebuild → controller migration)

English | [中文](README.zh.md)

Use these guides to give a character a fitted Biped and the body controls of a reference rig, while the character keeps its own export skeleton. The procedure is generic; every count, length, control name, and test displacement comes from the current run's profiles. Stan and Chiya are cases: their dimensions, node counts, and test movements are evidence, not defaults.

## Where to start

Complete the [character adaptation record](character-adaptation-guide.md), then follow the [execution checklist](quick-runbook.md). Three profiles drive the run: the body profile (bone names, parents, roles, rest matrices), the Biped profile (the reference rig's structure parameters), and the rig profile (chains, rings, poles, helpers, controller trees, wires).

| Input | Entry point and limits |
|---|---|
| Static humanoid without bones | Build the profile-defined body nodes with the skeleton guide; the Chiya profile is one measured case |
| Checked skeleton without Skin; initial weights needed | Follow the Geodesic Voxel skinning guide, then review and refine deformation |
| Matching topology and compatible bone frames | Fit and validate controller migration stage by stage |
| Matching topology with incompatible full bone frames | Validate whole-limb fitting and a fixed rotation-offset reference layer; final controller output adaptation is incomplete, so do not proceed with ordinary tree copying |
| Different bone count, hierarchy, spine, finger, or twist configuration | Adapt the mapping and profile first (§4 of the adaptation guide); existing scripts cannot be applied directly |
| No Skin | Test skeletons and control behavior within branch limits; mark skinning and deformation as not applicable |

## Document map

| Document | Responsibility | When to read |
|---|---|---|
| [Character adaptation guide](character-adaptation-guide.md) | Input classes, profiles, per-run record, configuration differences, gates and judgment rules | Before each new character |
| [Execution checklist](quick-runbook.md) | Stage order, gates, stopping, and recovery | During work and at stage boundaries |
| [Static body skeleton guide](static-body-skeleton-guide.md) | Build the profile node set from a measured model | When the input has no skeleton |
| [Geodesic Voxel skinning guide](skinning-geodesic-voxel/README.md) | Dummy Skin segments, initial weights, deformation review and Chistatic measurements | When creating or reviewing automatic skinning |
| [Biped rebuild guide](biped-rebuild-guide.md) | Structure, figure, hip width, frame branches, fitting, measurement layer, display | Stages 0–3 |
| [Controller migration guide](controller-migration-guide.md) | Control semantics, references, chain geometry, poles, pose and behavior acceptance | Stages 4–10 |
| [Stan case record](stan-biped-controller-migration-task.md) | Historical Seven → Stan measurements and decisions | For history, never as fixed new-character parameters |
| [Historical references](references/) | Earlier route-2 diagnosis and a Seven → Quinn prototype | For traceability, not execution authority |

## Execution order and verified scope

Save each stage as `<character>_<stage>_<date>.max`. Store body names and parents, rest matrices, mappings, the rig semantics table, and test records externally. Session globals are not persistent, and filenames do not establish acceptance.

| Stage | Output or check |
|---|---|
| 0 Input | Original input and working copy, units, binding state, body manifest, external rest record, filled adaptation record |
| 1–2 Biped | Source structure and fresh figure, target hip span, per-side lengths and frame classification; the conversion branch stops after mapping validation |
| 3 Measurement | BIPDRV for the compatible branch, separate root/twist handling, unchanged original body rest state |
| 4–5 Controls | Merge with explicit collision isolation, copy both controller trees, redirect constraints and every binding |
| 6–7 Geometry | Place rings before fitting rest chains, align handles, recheck lengths, then solve spine percent |
| 8–9 Behavior | Biped-driven pose differential, ring-driven response, root translation and turn, limb overreach, class-scoped direct restore |
| 10 Save | Set display from the source manifest; reopen, resolve by name, compare every measured node with reference snapshots |
| Export | bake → FBX → UE is unverified and has no validated procedure |

Strict overall acceptance remains incomplete. The 2026-10-19 third round passed the static chain (fitting, driver layer, merge, redirection, rest alignment) but failed the dynamic ones: pose differential (legs 0.406, arms 6.23 against source 0.0106/0.0013), root turn (calf flip 179.9° against source 0.007°), arm overreach end-to-ring 1.168 against 0.0020, direct restore 6.5e-3, and reopen drift 2.05e-4 at solver-driven joints. The [adaptation evidence table](character-adaptation-guide.md#6-已有证据与边界) owns results, failure values, and report locations. Static alignment or recovery by reload cannot replace full acceptance.

## Windows and display state (set before each run)

Use separate Max instances for A and B, identified by full file path and PID. Read A for evidence; modify a saved working copy of B. Display state is stored in the scene and returns to its saved state on reopen.

| Purpose | Action |
|---|---|
| Inspect source structure | Show this run's source control layers and all ancestors while hiding unrelated sibling branches |
| Modify target | Show meshes, controls, and the target Biped; hide source remnants and measurement points |
| Compare viewports | Set both windows to Front / Standard / Edged Faces, then inspect joints and frames in three views |

Layer names such as `PrinceofStan` or `不导出/控制器` are historical examples, not required names. A layer's own checkbox does not establish effective visibility: parents hide children, and showing a parent can expose facial or other sibling branches. Check actual node visibility and move nodes individually.

## Measurement and recovery discipline

Call `completeRedraw()` after writes. Before acceptance, leave Figure Mode, force evaluation, and read twice in the same call. Fit against this run's external rest record, never current bone values already changed by constraints. Compare rest and pose errors per bone so static offsets cannot hide motion failures.

Separate the three judgments. Pose differential is Biped-driven (move Biped bones, compare body bones with BIPDRV). Ring response is control-driven (move a ring, check the body bone moves 1:1 and the Biped does not, as measured in the source). Every behavioral gate also records the source rig's value at the same pose, because an absolute threshold can be stricter than the source itself.

After each trial, restore directly and compare every affected node using reference snapshots, not names: duplicate names exist. Record failed nodes and residuals, then reload a milestone to isolate the next group; reload is not direct acceptance. After reopen, discard old node and controller wrappers and resolve by name. Check forward dependencies and explicit bindings as described in the migration guide.

Compare node matrices with reference snapshots and report solver-driven nodes separately: IK chain joints do not reproduce bit-exactly across reopen or restore, so their gate is "not worse than the source baseline".
