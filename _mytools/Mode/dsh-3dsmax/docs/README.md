# 3ds Max character adaptation (Biped rebuild → controller migration)

English | [中文](README.zh.md)

Use these guides to prepare a body skeleton, fit a Biped, and transfer body controls with the reference rig's behavior. The character keeps its own export skeleton. Record each run's inputs, geometry, and bone frames before choosing a supported branch; Stan and Chiya are cases whose dimensions, object counts, and test movements cannot be reused as defaults.

## Where to start

Complete the [character adaptation record](character-adaptation-guide.md), then follow the [execution checklist](quick-runbook.md). The current profile has 55 Seven-compatible body nodes and a reference Biped with 71 objects. These are profile counts; measure the Skin union, control nodes, hip span, segment lengths, and stretch parameters for the character and source rig.

| Input | Entry point and limits |
|---|---|
| Static humanoid without bones | Build 55 measured body nodes with the skeleton guide; the Chiya profile is a case reference |
| Matching topology and compatible bone frames | Fit and validate controller migration stage by stage with the checklist |
| Matching topology with incompatible full bone frames | Validate whole-limb fitting and a fixed rotation-offset reference layer; final controller output adaptation is incomplete, so do not proceed with ordinary tree copying |
| Different bone count, hierarchy, or source controller structure | Adapt the mapping and profile first; existing scripts cannot be applied directly |
| No Skin | Test skeletons and control behavior within branch limits; mark skinning and deformation as not applicable |

## Document map

| Document | Responsibility | When to read |
|---|---|---|
| [Character adaptation guide](character-adaptation-guide.md) | Input classes, record template, character parameters, frame branches, and verification scope | Before each new character |
| [Execution checklist](quick-runbook.md) | Stage order, acceptance, stopping, and recovery | During work and stage completion |
| [Static body skeleton guide](static-body-skeleton-guide.zh.md) | Generate 55 nodes from a measured model; includes body55 tools and the Chiya case | When the input has no skeleton |
| [Biped rebuild guide](biped-rebuild-guide.md) | Structure, figure, hip and frame fitting, and measurement layer | Stages 0–3 |
| [Controller migration guide](controller-migration-guide.md) | Control semantics, references, chain geometry, pose and behavior acceptance | Compatible branch, stages 4–10 |
| [Stan case record](stan-biped-controller-migration-task.md) | Historical Seven → Stan measurements and decisions | For history, never as fixed new-character parameters |
| [Historical references](references/) | Seven → Stan route 2 diagnosis and Seven → Quinn prototype | For traceability, not execution authority |

## Execution order and verified scope

Save each stage as `<character>_<stage>_<date>.max`. Store body names and parents, original rest matrices, mappings, and test records externally. Session globals are not persistent, and filenames do not establish acceptance.

| Stage | Output or check |
|---|---|
| 0 Input | Original input and working copy, units, binding state, body manifest, external rest record |
| 1–2 Biped | Source profile and fresh figure, target hip span, per-side lengths and frame classification; the conversion branch stops after mapping validation |
| 3 Measurement | BIPDRV for the compatible branch, separate Root/twist handling, unchanged original body rest state |
| 4–5 Controls | Merge with explicit collision isolation, copy both trees, and redirect constraints and all bindings |
| 6–7 Geometry | Place rings before fitting rest chains, align offsets, recheck lengths, then solve spine percent |
| 8–9 Behavior | Bend both hands and feet, translate/turn the root, test rings and overreach, and directly restore all affected nodes |
| 10 Save | Set display from the source manifest; reopen, resolve by name, and compare every measured node |
| Export | bake → FBX → UE is unverified and has no fully validated procedure |

Strict overall acceptance remains incomplete: both Stan runs have restore and behavior failures; Chiya body construction and the frame-conversion reference layer are verified separately, while full controller migration is unverified. The [adaptation evidence table](character-adaptation-guide.md#6-已有证据与边界) owns results, failure values, and local report locations. Rest alignment or recovery by reload cannot replace full acceptance.

## Windows and display state (set before each run)

Use separate Max instances for A and B, identified by full file path and PID. Read A for evidence; modify a saved working copy of B. Display state is stored in the scene and returns to its saved state on reopen.

| Purpose | Action |
|---|---|
| Inspect source structure | Use this run's source layer manifest to show controls and all ancestors while hiding unrelated sibling branches |
| Modify target | Use the target layer manifest to show meshes, controls, and target Biped; hide source remnants and measurement points |
| Compare viewports | Set both windows to Front / Standard / Edged Faces, then inspect joints and frames in three views |

`PrinceofStan` and `不导出/控制器` are historical layer names, not required names for new characters. A layer's own checkbox does not establish effective visibility: parents hide children, and showing a parent can expose facial or other sibling branches. Check actual node visibility and move nodes individually; see rebuild step 6 for display details.

## Measurement and recovery discipline

Call `completeRedraw()` after writes. Before acceptance, leave Figure Mode, force evaluation, and read twice in the same call. Fit against this run's external rest record, never current bone values already changed by constraints. Compare rest and pose errors per bone so static offsets cannot hide motion failures.

After each trial, restore directly and compare every affected Biped node, measurement point, and body bone. Record failed nodes and residuals, then reload a milestone to isolate the next group; reload is not direct restoration. After reopen, discard old node/controller wrappers and resolve by name. Check forward dependencies and explicit bindings as described in migration step 6.

Seven controls do not drive the Biped back; validate other sources against their measured behavior. Visible controls, rest coincidence, or a restored endpoint alone cannot establish migration success.
