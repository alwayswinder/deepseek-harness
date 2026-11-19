# 蓝色螺旋魔法阵

## 概要

本教程把已有 `/Game/VFX/MagicCircle/NS_MagicCircle` 重做为贴地符文法阵、连续螺旋光带、悬浮晶片和少量上升光点。底盘保持固定方向，并通过材质产生明显的亮度呼吸；螺旋与晶片独立运动。读者需要了解 Niagara 脚本栈与材质节点，工具入口见 [MCP 参考](mcp-reference.md)。

## 目录

- [1. 检查与备份](#1-检查与备份)
- [2. 生成与导入素材](#2-生成与导入素材)
- [3. 固定底盘朝向](#3-固定底盘朝向)
- [4. 配置发光与呼吸](#4-配置发光与呼吸)
- [5. 组合螺旋与漂浮层](#5-组合螺旋与漂浮层)
- [6. 编译、保存与检查](#6-编译保存与检查)

## 1. 检查与备份

先用 `GetSystemSummary` 取得 Emitter 名，再分别读取 `GetEmitterTopology` 与 `GetEmitterInputValues`。Renderer 的属性名称和当前材质通过 `GetRendererSchema` 与 `GetRendererData` 确认。保留 System 的原路径可以保留现有引用，但仍需核对关卡实例实际绑定的资产。

修改前把原始 `.uasset` 复制到项目 `Saved/MagicCircleRebuild/Original/`。这是工程外观资源的文件备份；恢复前应关闭编辑器，避免内存中的已加载资产覆盖恢复文件。

本例的 `MagicCircle_FX` 已绑定该 System。查询 Actor 时按当前标签筛选，并读取最新 Transform；不要把旧截图中的位置写死为后续取景位置。

## 2. 生成与导入素材

使用 [素材生成脚本](sources/generate-magic-circle.py) 生成符文贴图与三个 glTF 网格。脚本需要 NumPy 和 Pillow，只生成源文件，不创建 Unreal 资产。从本指南目录运行：

```powershell
python sources/generate-magic-circle.py E:/Unreal/Projects/_TEST/MyProject5_9/Saved/MagicCircleRebuild
```

| 源文件 | 内容 |
|---|---|
| `T_MagicCircle_Runes.png` | 2048 × 2048 灰度符文遮罩，含同心环、48 格角形符文、四向尖角和柔光 |
| `SM_MagicCircle_Helix.gltf` | 2.65 圈连续螺旋带和一条较细的伴随带，顶部收窄 |
| `SM_MagicCircle_Crystals.gltf` | 九个竖直菱形晶片组成的网格 |
| `SM_MagicCircle_Rays.gltf` | 九组交叉平面，用作底部短光柱 |

模型在脚本内以厘米描述，导出时转为 glTF 的米和 Y-up。导入后用 `GetBounds` 核对朝向与尺寸；本例螺旋的高度范围约为 39～478 cm。

贴图使用 `TextureToolset.ImportFile` 导入。将 `Texture2D.address_x` 与 `address_y` 都设为 `TA_CLAMP`，避免 UV 超出 0～1 时重复采样出边角图案。

网格使用 `StaticMeshToolset.ImportFile`，本例关闭 `bImportMaterials` 与 `bImportTextures`。读取返回资产的完整路径再配置 Renderer；当前 Interchange 把网格放在类似 `/Game/VFX/MagicCircle/SM_MagicCircle_Helix/StaticMeshes/SM_MagicCircle_Helix.SM_MagicCircle_Helix` 的路径下，不能假定它直接位于导入目录根部。

## 3. 固定底盘朝向

`GroundCircle` 使用一个 Sprite。Initialize Particle 的 `Uniform Sprite Size = 440`，局部位置为 `(0,0,3)`，避免与地面重合。Emitter 使用局部空间；底盘随特效 Actor 的变换移动，平面内方向不依赖相机。

在 Particle Update 的 Set Parameters 模块中写入下列值，并设置对应 Renderer：

| 属性 | 当前值 |
|---|---|
| `Particles.SpriteFacing` | `float3(0,0,1)` |
| `Particles.SpriteAlignment` | `float3(1,0,0)` |
| Renderer `FacingMode` | `CustomFacingVector` |
| Renderer `Alignment` | `CustomAlignment` |

这两组设置分别固定平面法线和面内方向。只设 `SpriteFacing` 会使法阵贴地，但 `Alignment = Automatic` 且没有实际 `SpriteAlignment` 属性时，图案仍可能随相机改变方向。修改后检查 `SpriteAlignmentBinding.bBindingExistsOnSource = true`。

本例底盘材质的 UV Custom 节点直接返回 `UV`。删除材质内的时间旋转，才能让符文图案本身也停止自转；固定 Renderer 朝向不会停掉材质动画。

## 4. 配置发光与呼吸

底盘使用 `M_MC_Runes`：Additive、Unlit、Two Sided，开启 Niagara Sprites 用途。遮罩乘蓝色发光值后接入 Emissive，Opacity 为 1；黑色背景不贡献加色。`GlowIntensity` 默认值为 6。

发光 Custom 节点接入 `Mask`（纹理采样）、`I`（GlowIntensity）和 `T`（Time）。当前呼吸曲线如下，周期为 3 秒，发光倍率在基础值的 6%～135% 之间变化：

```hlsl
float wave = 0.5 + 0.5*sin(T*2.094395102);
float breath = lerp(0.06,1.35,wave*wave);
return Mask.r*float3(.12,.72,1.2)*I*breath;
```

平方后的波形让低亮阶段相对更长，亮部集中在波峰附近。当前峰谷发光倍率之比为 22.5，增强呼吸时优先拉开峰谷差；整体提高 `GlowIntensity` 会同时抬高暗部。时间系数为 `2π / 周期秒数`；暗部和亮部倍率由 `lerp` 的两个端点控制。参数只改变底盘发光，不修改螺旋和晶片。

HDR 发光倍率不是最终像素亮度。曝光、Bloom、色调映射和背景都会影响可见反差；高亮端都接近饱和时，仅小幅改变乘数可能看不出起伏。在目标场景观察完整周期后再调整暗部下限，单张截图不能确认呼吸强弱。

## 5. 组合螺旋与漂浮层

参考图需要连续、清晰的光带轮廓。本例用 Mesh Renderer 绘制预制螺旋网格，再由材质旋转，而非把随机圆柱粒子直接连成 Ribbon。沿随机出生位置连带容易出现交叉和跳段；需要真正的粒子 Ribbon 时，应另行保证有序采样、Ribbon ID 和连接顺序。

| Emitter | Renderer / 材质 | 用途 |
|---|---|---|
| `GroundCircle` | Sprite / `M_MC_Runes` | 固定朝向的呼吸法阵 |
| `Spiral` | Sprite / `M_MC_Spark` | 沿用旧名称，当前只绘制缓慢上升的细小光点 |
| `SilkHelix` | Mesh / `M_MC_Helix` | 连续光带与亮边细丝 |
| `FloatingCrystals` | Mesh / `M_MC_Crystals` | 九个晶片的缓慢公转与上下浮动 |
| `AscendingLight` | Mesh / `M_MC_Rays` | 法阵内部的短柔光柱 |

网格发射器的 `Particles.Scale = (1,1,1)`，`Particles.MeshOrientation = (0,0,0,1)`，材质开启 Niagara Mesh Particles 用途。Renderer 关闭投影，使用实际导入的网格和独立材质覆盖。覆盖开关与材质数组的设置顺序见 [EditCondition](mcp-reference.md#属性依赖与-mesh-renderer)。

`M_MC_Helix` 使用 UV 的横向位置控制亮边和透明边缘。World Position Offset 以 World Position 减去 Particle Position WS 计算径向坐标，围绕粒子原点旋转；当前 `RotationSpeed = -0.58` rad/s。晶片材质使用较慢的 `0.12` rad/s，并叠加按高度错开的正弦升降。移动整个 Actor 后仍需检查旋转中心与包围盒。

底盘与三个网格层均配置一次 Burst：`Spawn Count = 1`、`UseLoopCountLimit = true`、`Loop Count Limit = 1`，Lifetime 为 100000 秒。这是长寿命展示配置，不是无限寿命；长时间运行需另定生命周期策略。不要每次循环重新生成长寿命底盘。

光点 `Spiral` 使用初始 Burst 35、SpawnRate 14/s、Lifetime 4.5 秒、Sprite 尺寸 5 cm、Z 速度 14 cm/s。圆柱出生范围的半径为 112 cm、高度为 420 cm、中点为 235 cm；旧 Ribbon Renderer 已移除，旧 VortexVelocity 模块已禁用。

System 使用固定包围盒 `Min=(-270,-270,-15)`、`Max=(270,270,570)`，预热 1 秒。改变尺寸、位移幅度或 WPO 后重新检查范围，避免相机移动时因裁剪消失。

## 6. 编译、保存与检查

依次编译材质、保存材质与源资产、读取 `GetSystemCompileState`，再保存 System。已有 Niagara Component 可调用 `reinitialize_system()` 重新加载系统配置；不要把“组件 Active”作为画面正确的依据。

2026-11-18 的 [资产核对记录](evidence/magic-circle.json) 确认 System 为 `UpToDate`，无编译错误或警告，栈中 10 条 Info 为模块版本升级提示。记录同时包含 Renderer 设置、呼吸 HLSL、生成输入和已保存状态；它不代表最终外观已获人工确认。

在关卡中完成以下人工检查：

1. 绕法阵移动相机，确认四向尖角相对地面固定。
2. 连续观察至少两个呼吸周期，确认暗部明显且亮部没有把符文糊成整片。
3. 移动特效 Actor，确认光带和晶片围绕新位置旋转。
4. 观察多次 System 循环，确认底盘和网格层不会重复累积。
5. 在目标光照、曝光和 Bloom 下检查透明度及遮挡，进入 PIE 核对运行表现。

编辑器世界离屏 Capture 已用于检查此例的持续特效形体，不包含视口时间历史，也不能替代 PIE、相机运动和完整周期验收。本例尚未验证长期粒子数量、打包、多平台或跨项目迁移。
