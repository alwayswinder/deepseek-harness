# Unreal Niagara creation guide

English | [中文](README.zh.md)

## Summary

Use the Unreal Editor and MCP to create chain lightning, a continuously bouncing frost orb, a sky lightning strike, and a blue spiral magic circle in the UE 5.9 test project. Observe each effect in the level, then follow its tutorial to build Niagara systems, materials, and any required controller Blueprints.

## Contents

- [Prepare the environment](#prepare-the-environment)
- [Play effects in the level](#play-effects-in-the-level)
- [Create a new effect](#create-a-new-effect)
- [Verification results](#verification-results)
- [Further reading](#further-reading)

<a id="准备环境"></a>

## Prepare the environment

Readers need familiarity with the Content Browser, Actors, Components, and Blueprint functions. A Niagara System manages the complete effect, an Emitter manages a group of particles, a Module computes particle attributes, and a Renderer draws the result.

| Item | Local example |
|---|---|
| Engine | UE 5.9 build installed on this machine |
| Project | `E:\Unreal\Projects\_TEST\MyProject5_9` |
| Level | `/Game/_MyTest/M_Test` |
| MCP | `http://127.0.0.1:8001/mcp` |
| Tool plugins | `EditorToolset`, `ConsoleToolset`, `SceneCaptureToolset`, `NiagaraToolsets` |

When connecting to another editor, confirm the MCP port in its logs and rediscover tools and APIs. Asset paths, template contents, and Python capabilities depend on that build; see the [MCP reference](mcp-reference.md).

<a id="在关卡中播放"></a>

## Play effects in the level

The current scene uses Cube, Cube2, and Cube3 as three distinct targets. Each of the two controller Actors determines its own launch position; target attachment points use the target world position plus `TargetOffset`.

### Continuously bouncing frost orb

1. Open the example level and select `FrostChain_MCP`.
2. Confirm that `Target1 / Target2 / Target3` reference the three Cubes respectively.
3. Click Play or Simulate. The current instance enables `AutoTriggerOnBeginPlay` and launches one frost orb.
4. Observe the orb reach Cube, then repeatedly choose its next destination at random from the other two targets.
5. In the runtime world, call `StopFrostChain` to stop or `TriggerFrostChain` to restart from the launch position.

For skill or interaction events, disable `AutoTriggerOnBeginPlay`, retain a reference to the controller Actor, and call its trigger function. Parameters, materials, and creation steps are in the [frost orb tutorial](frost-chain.md).

![Frost orb bouncing between three Cubes](images/frost-chain-preview.gif)

This preview combines offscreen frames rendered from the runtime world; the GIF itself loops.

### Triggered chain lightning

1. Select `ChainLightning_MCP` and confirm `SourceActor = Cube`, `MiddleActor = Cube2`, and `EndActor = Cube3`.
2. The current level instance disables lightning's `AutoTriggerOnBeginPlay` to make the frost orb easier to observe. For a separate lightning demonstration, enable it and disable automatic triggering on the frost orb.
3. Click Play or Simulate and observe “effect position → Cube → Cube2 → Cube3 → finish”.
4. During runtime, call `TriggerChain` to replay or `StopChain` to stop immediately.

The lightning does not replay at a fixed interval. Its construction script hides it while the editor is idle; observe Call In Editor buttons on a running simulation instance. Creation steps and timing calculations are in the [chain lightning tutorial](chain-lightning.md).

### Sky lightning strike (Zeus ultimate)

1. Select `ZeusStrike_MCP` at `(150, -460, 50)`, on top of Cube2, and confirm its Niagara components reference `NS_ZeusStrike_MCP` and `NS_ZeusImpact_MCP`.
2. Click Play or Simulate: the main bolt strikes Cube2 vertically from 3000 cm above, while an impact ring, sparks, and a white flash with four stages of attenuation appear on the Cube's top surface. Everything ends after about 1.2 seconds.
3. The effect plays once at `BeginPlay`; re-enter PIE or place another instance to see it again.

Niagara user parameters allow adjustment without editing the Blueprint: `User.Length` (3000, bolt length), `User.Width` (26), `User.Jitter` (150, zigzag amplitude), and `User.Intensity` (6, brightness). Branch lengths scale with `User.Length`, so changing the length does not require editing each branch. Assets, timeline, reuse, and troubleshooting are in the [sky lightning tutorial](zeus-strike.md).

![Sky lightning strike](images/zeus-strike-preview.png)

### Blue spiral magic circle

Open `/Game/VFX/MagicCircle/NS_MagicCircle` in the Content Browser, or inspect the level's `MagicCircle_FX` instance that references it. The effect combines a ground rune circle, a continuous spiral light band, floating crystals, and rising sparks; the ground circle keeps a fixed orientation and its emission pulses slowly. Source generation, material curves, and camera orientation settings are in the [magic circle tutorial](magic-circle.md).

<a id="创建新特效"></a>

## Create a new effect

Build in the following order, confirming a visible result before each next step.

1. Create materials, connect emission, opacity, and particle color, and enable the appropriate Niagara rendering usage.
2. Create one Emitter and confirm spawning, coordinate space, lifetime, and Renderer.
3. Assemble the System and check layer sizes, counts, transparency sorting, and lifecycles.
4. For target interactions, create a controller Blueprint to manage targets, triggering, movement, hits, and stopping; a continuous display effect can use the System directly.
5. Place it in the level, assign targets, and check compilation, saving, runtime behavior, and cancellation.

Niagara controls appearance; controller Blueprints manage Actor targets and playback state. Dragging in a single System does not provide complete tracking and bouncing logic.

<a id="验收结果"></a>

## Verification results

Chain lightning and frost orb records date from 2026-11-16; magic circle asset checks date from 2026-11-18. The [verification index](verification.json) links the scope and raw data in this directory's `evidence/` files.

| Subject | Observed result |
|---|---|
| Chain lightning | Initially hidden; launch position error 0 cm; three jumps appear in order; no loop after playback; retrigger restarts; explicit cancellation and invalid-target cancellation work |
| Frost orb | Continues bouncing after 14 consecutive hits, switches targets each time, reaches moving targets with 0 cm error, and supports stopping and retriggering |
| Frost orb particles | At hit 14: core 1, halo 1, rotating shards 34, trail 51; oldest trail about 0.458 seconds |
| Frost orb assets | Both Niagara Systems are UpToDate with no compile errors or warnings; Blueprint has no errors; assets and level saved |
| Magic circle | System and ground material saved, compilation has no errors or warnings; fixed orientation and breathing curve read back and checked; see the tutorial for dynamic visual acceptance |
| Sky lightning | Vertical 3000 cm bolt hits Cube2; impact ring, 56 sparks, and white flash attenuate at 0.07 / 0.19 / 0.35 seconds; both components empty after 1.2 seconds; all three impact Emitters use `Once`; the ring lies flat after switching to `CustomFacingVector` (complete circle visible from above); both Systems compile UpToDate without errors or warnings; Blueprint and level saved |

These records do not constitute indefinite stress tests. The current examples use three fixed targets and do not cover packaging, multiplayer, damage, team filtering, collision, or different platforms; the frost orb also has no maximum bounce distance.

<a id="继续查阅"></a>

## Further reading

- [Triggered chain lightning](chain-lightning.md): Ribbon appearance, short arc flight, three jumps, and parameters.
- [Sky lightning strike](zeus-strike.md): sky bolt, ground impact ring, point light flash timeline, and reuse.
- [Continuously bouncing frost orb](frost-chain.md): core, shards, trail, hits, and target selection.
- [Blue spiral magic circle](magic-circle.md): source generation, fixed ground orientation, continuous light bands, and pronounced brightness pulsing.
- [MCP reference](mcp-reference.md): tool discovery, parameter encoding, Blueprint generation, forced compilation, particle sampling, and capture.
- [Troubleshooting](troubleshooting.md): coordinates, trigger state, lifecycles, compilation, and Python APIs.

## Maintenance

This directory contains personal tool documentation. Scripts in the project's `Saved/CodexLightning/` directory assist creation and verification; some depend on existing assets or simulation state and do not form an installer that can be run in filename order. Rediscover APIs and verify the examples after engine or plugin upgrades.
