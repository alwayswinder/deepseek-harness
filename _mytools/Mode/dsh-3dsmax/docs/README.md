# 3ds Max character workflow (Biped rebuild → controller migration)

English | [中文](README.zh.md)

This directory covers a character that starts with **a skeleton (Dummy / Bone) and skinned meshes, needs a Biped with the correct structure, and receives body controllers from a reference rig**. Animators pose the character through handles; the target character's own skeleton is exported to the engine.

## Document map

| Document | Purpose | When to read |
|---|---|---|
| [quick-runbook.md](quick-runbook.md) | **Execution checklist**: actions, thresholds, and recovery for each stage | **Read first** and follow its sequence |
| **README.md** (this page) | Index, workflow overview, end-to-end checklist, window visibility, and common misinterpretations | Before starting and after each stage |
| [biped-rebuild-guide.md](biped-rebuild-guide.md) | **Procedure**: create Biped, load a figure, fit bones, create measurement drivers, and set display/layers | Stages 0–3 |
| [controller-migration-guide.md](controller-migration-guide.md) | **Reference**: controller placement, chain lengths, poles, per-bone rotation structure, reference retargeting, and pose acceptance | Stages 4–9 |
| [stan-biped-controller-migration-task.md](stan-biped-controller-migration-task.md) | Seven → Stan case log: measurements, failed attempts, and decisions | Historical context; **the two guides own current instructions** |
| [references/](references/) | Historical records: `seven-stan.md` (route 2 failure analysis), `seven-quinn.md` (Seven → Quinn prototype) | Investigation only; **not execution instructions** |

Inventory and acceptance procedures are included in the checklist below and [quick-runbook.md](quick-runbook.md).
> The former `3dsmax-rig-controller-transfer` skill was **removed** on 2026-10-16: its `S7_*` driver architecture conflicts with the tested route 1 and can reproduce controllers failing to drive the character. Its two **case records** moved to [references/](references/); other resources (`recipe.md`, `scripts/01/04/05/06`) remain in the 3ds Max repository. This directory, especially quick-runbook, owns the current procedure.

## Workflow overview

| Stage | Action | Guide steps | Threshold | Milestone (case naming) |
|---|---|---|---|---|
| 0 Prerequisites | Check 55 bones, Skin lists, bind pose, absence of old constraints, clean snapshot, and **external gRest storage** | Rebuild step 1 | See that step's table | `..._preBiped_*.max` |
| 1 Create Biped | Match source structure (`3×5×3`, 71 objects) and load source figure | Rebuild steps 2–3 | Matching structure and identical #scale samples | `..._biped_*.max` |
| 2 Fit | Length → orientation → position (3 fixed-point rounds) | Rebuild step 4 | Position ≤0.05 (none >1.0), orientation ≤0.1° | `..._fitted_*.max` |
| 3 Measurement reference | 55 BIPDRV_* nodes (Root uses relative=true) | Rebuild step 5 | Follow errors do not grow with poses; **UE bone displacement after creation = 0** | `..._driver_*.max` |
| 4 Merge source controls | Prefix **126** target nodes, merge_from_file, then apply SV_ to source duplicates | Controller steps 1–2 | Target 71 / source 71 Biped nodes, 126 SV_ nodes | `..._merged_*.max` |
| 5 Copy and retarget | Copy both trees for 54 bones (Root independent); retarget targets, pickUpNode, ExposeTm, control root, and bindings | Controller steps 5 + 6 | Retained nodes do not reference source skeleton | `..._ctrl_copied_*.max` |
| 6 Place rings and fit rest chains | Place all rings using rest/BIPDRV coordinates before fitting chain lengths and middle joints | Controller step 3 | Middle joint <0.02, segment lengths match B | `..._chains_*.max` |
| 7 Align rest offsets | Align handles including knee/elbow rings → normalize lengths again → scan spine percent last | Controller step 5.5 | Position ≤0.1, orientation ≤1° | `..._aligned_*.max` |
| 8 Pose acceptance | Rest, each foot +25Z, each hand +25Z, root +10Z; check bent-pose poles and restoration of every affected node | Controller steps 4 + 7 | Errors do not grow with poses; restore ≤1e-4 | `..._accepted_*.max` |
| 9 Behavior acceptance | Ring response 1:1, Biped drives extremities, four-limb overextension, and restoration | Controller step 6 + §3 | Compare source segment growth and endpoint following | Same as above |
| 10 Display and delivery | boxMode, layers, save and reopen | Rebuild step 6 + Controller step 8 | Same per-node position/rotation before and after reopening; thresholds still met | Delivery file |
| 11 Export verification | Pose → bake → FBX → UE | **Not verified; no procedure yet** | — | — |

## End-to-end checklist

### Stage 0 · Prerequisites (new character with skeleton only)

- [ ] Skeleton contains **55 Dummy nodes**, with unique UE bone names
      ⚠ Count these **before creating Biped**: its 13 *Nub objects are also Dummy, bringing the case count to 68. After creation, identify UE bones by the saved name list.
- [ ] Each mesh's Skin names belong to these 55 bones, and their **union** matches the binding list (2026-10-16 case: Body 54 / Face 3 / Eye 1 / Hair 1; Root is not skinned, so the union is **54**, not 55)
- [ ] Skeleton is in **bind pose** with no rest deformation of the meshes
- [ ] All 55 bones have free Position_XYZ / Euler_XYZ position/rotation controllers (0 constraints). Reverse dependencies can include child bones and skinned meshes; inspect ownership and controllers rather than treating a fixed dependency-class whitelist as sufficient evidence
- [ ] Save a clean snapshot **before creating Biped**; it supplies the original rest values
- [ ] **Persist original world transforms of all 55 bones externally**: session-global gRest is not durable and must be restored from disk after reopening. Max Safe Scene Script Execution blocked createFile in this run, so write externally (case path: work/gRest_Stan.txt)

### Stages 1–3 · Biped

- [ ] bip001* contains **71 objects**; read back matching source structure (spine 3 / neck 1 / leg 3 / fingers 5×3 / toes 1×1 / forearmTwist 2)
- [ ] After loading the source figure, #scale samples exactly match source bones of the same names (otherwise lengths can match while thickness collapses)
- [ ] Position residual ≤0.05 (none >1.0), orientation residual ≤0.1°
      ⚠ **Read protocol**: before acceptance, set figureMode=false, call completeRedraw(), and read twice **within the same call**. Historical readings: in-call premature success 0.0398, a new call without evaluation 6.96, evaluated result 0.0399 / 0.056°. Cross-check bone directions geometrically from Biped and UE joint positions (case ≤0.028°).
- [ ] Four limb lengths match B's lengths (case 19.7845 / 20.6696 / 35.3003 / 45.3889; the old 45.3890 value differs only by rounding)
- [ ] Create 55 BIPDRV_* nodes and handle the Root and lowerarm_twist_01_l/r exceptions
- [ ] Move feet, hands, and root, then **measure again**: errors must not grow; rest alone misses follow defects

### Stages 4–9 · Controller migration

- [ ] Names remain isolated after merging: target bip001*=71, source SV_bip001*=71, SV_ total 126 (**the target prefix must include Biped**, 126 nodes in this case)
- [ ] Chain **rest geometry** matches B's joints: middle joint <0.02 and segment lengths match B (legs 35.3003/45.3889, arms 19.7845/20.6696)
- [ ] Retarget references, place all rings, then solve chains. Start and wrist/ankle rings use rest/BIPDRV coordinates; knee/elbow rings retain their near-chain-joint semantics and allow small alignment after solving. Do not snap them to bones to hide a chain-plane error
- [ ] Copy **both position and rotation trees** from SV_* for 54 UE bones, including both twists. Root remains independently constrained to BIPDRV_Root and must not copy SV_Root (copying rotation alone leaves rings unable to drive the character)
- [ ] Preserve the **source structure** of lowerarm_twist_01_l/r (position → arm midpoint ring; rotation → Euler + LookAt → wrist ring). Replacing it with bare Orientation → BIPDRV_* causes hand/forearm twisting
- [ ] Complete **rest offset alignment**, normalize chain lengths again using BIPDRV rest lengths, then scan spine Path_Constraint.percent last in the current scene; do not reuse case values
- [ ] LookAt.pickUpNode and LookAt targets contain **no SV_* references**
- [ ] BIPRoot (control-layer root) follows the target UE Root in position and orientation
- [ ] Wire/expression parameters contain no **fixed source lengths or distance thresholds** for stretch or midpoint follow. Record them from the source and adapt them to target lengths
- [ ] Overextension behavior matches the source when the end ring moves beyond L1+L2: stopping at full length and splitting excess between segments behave differently. Compare actual segment growth and endpoint-to-ring error
- [ ] **Retained nodes do not reference the source skeleton**: check constraints, pickUpNode, ExposeTm, and wire/script bindings as in controller step 6. Scan forward refs.dependsOn from UE bones, BIPDRV, target Biped, rings, IK, and auxiliary nodes; filter isValidNode before reading names. Source bones in reverse refs.dependents are not evidence of a leak
- [ ] **Pose acceptance**: rest, each foot +25Z, each hand +25Z, and root +10Z; maximum position difference ≤0.1, orientation difference ≤1°
- [ ] Three drive tests: ring +5 → UE bone 5.000; root +5 → extremities 5.000; Biped motion → rings/bones follow. Direct restoration of every affected node ≤1e-4; reloading a milestone is recovery, not a successful direct restore
- [ ] **Save a separate milestone file after every major stage**; Hold/Fetch can undo the merge too

### Stage 10 · Display and delivery

- [ ] boxMode matches the source (56/71 in this case)
- [ ] Show target meshes and source control rings; hide source skeleton, source meshes, and facial layers, accounting for parent-layer visibility
- [ ] Save, **reopen**, and measure again using freshly resolved names. Compare the same nodes' positions and rotations before and after saving; passing the rest thresholds after reopening is insufficient

## Windows and visibility (set before each run)

Source A and target B use separate Max instances. **Display state is saved in the file** and returns to the saved state when reopened.

| Purpose | Layer settings |
|---|---|
| Source A (read-only evidence) | Show meshes as needed. To inspect controls, show 不导出 and 控制器; first set the own hidden flags of sibling 表情控制器 and bip, otherwise unhiding their parent can reveal about 125 facial controls / 57 Biped bones |
| Target B (construction) | Show PrinceofStan meshes, 控制器, and BIP不导出 Biped; hide FBX, Seven, facial, and driver layers |
| Both viewports | [Front] [Standard] [Edged Faces] (set_viewport view="front" shading="smooth" edges=true) |

> 控制器 is a **child layer** of 不导出. Its hidden parent also hides the controls; check the parent when showing the controls appears ineffective.

## Common misinterpretations

1. **Moving a ring does not move Biped**: this is source behavior (source displacement measured 0.0). Rings provide offsets, adjustments, and visualization; pose through Biped. Making rings drive Biped would add a capability absent from the source.
2. **Restoration looks successful but the pose remains bent**: one endpoint or biped.getTransform reading does not establish full-chain restoration. Force evaluation and compare all affected world transforms. Historical scenes showed both agreement and disagreement between API and world positions; the API is not universally unreliable.
3. **Controls are invisible or unselectable**: check parent visibility, then each layer's own flag. manage_layers list reports own flags; Layer.isHidden reports effective visibility.

## Workflow validation status

The 2026-10-19 validation report (local `work/ProcessValidation_20261019/report.md`) starts from original Seven and Stan, without reading completed copies. Biped fitting and the position/orientation limits for rest and ordinary poses passed; these limits alone do not establish that errors remain constant across poses. Strict overall acceptance failed: worst direct restoration 0.00474761 (required ≤1e-4), save/reopen position drift 0.00511727, and left-arm overextension endpoint-to-ring distance 0.687708 (source about 0.001953). Reloading, passing rest thresholds, or correct segment growth cannot substitute for resolving these failures.

Forward scanning of 324 retained nodes found no SV_* node dependencies. The former residual list for Point001/002, Line001, and Circle013 misread reverse dependencies as source references and is invalid. Source layers remain hidden; check references and behavior before deletion. Coat inversion needs separate Skin and intersection investigation; bake → FBX → UE remains unverified.

Historical evidence is in WFTest (local `work/WFTest_guide-findings.md`), WFTest2 (local `work/WFTest2_delivery-report.md`), and the [case log](stan-biped-controller-migration-task.md). Historical results beyond 0.1 / 1° are failures, not current acceptance criteria. Workflow validation starts from original inputs.

## Working rules

1. **Separate the windows**: read source evidence and structure in A; construct in B. **Do not modify A's file**.
2. **Save a separate milestone after each major stage**. Hold/Fetch can undo merging and cannot replace intermediate files.
3. **Measurement**: call completeRedraw() after each write; before acceptance, leave Figure Mode, force evaluation, and read twice in the same call. Biped and constraints evaluate lazily, so the first reading can be stale.
4. **Change one thing and measure it**: batch scripts must report the failed node/operation and stop dependent work. Do not suppress errors with empty catches; recover a milestone and revalidate.
5. **Movement experiments must restore state**: try moving/measuring and handle errors; failure paths must also attempt restoration and check residuals. If state cannot be confirmed, reload a milestone and resolve nodes again.
6. **Measure pose differences as well as rest errors**: check whether each rest error grows after posing; many failures appear only during movement.
7. **Interpret dependency direction and ownership**: use refs.dependsOn from retained nodes to find source dependencies. refs.dependents on a source node can assist reverse lookup, but the source rig's own dependencies need not be empty. See controller step 6.

## Two recurring lessons

1. **Rest alignment is necessary but insufficient.** Static compensation, equal-weight target blending, and source LookAt upnodes can all be hidden at rest. Only pose measurements expose them.
2. **Do not absorb residuals into static offsets.** A fixed offset added to improve rest alignment rotates with its joint and can reintroduce errors during movement (case: rest 0.0045 → foot +10 error 2.76).
