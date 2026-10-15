/* ------------------------------------------------------------------
   03_prefix_source_skeleton.ms   —   迁移第 2 步：给 A 的骨加前缀，并把 B 的名字还原
   在 **目标 B 的实例**上运行，**在 merge_from_file 之后**。

   此时场景里应有：
     - A 的骨架：干净原名（pelvis / spine_01 / ...）
     - B 的骨架：带 cfgTmpPrefix 前缀（S_pelvis / ...）

   本脚本做两件事，顺序不能反：
     ① 把"与 B 骨同名"的 A 节点改名为 cfgSrcPrefix + 名字
     ② 再把 B 的骨名去掉临时前缀，还原成原名
   （若先还原 B，会和 A 撞名，Max 会自动改名，映射就乱了）

   会修改场景：重命名。请先做检查点。
------------------------------------------------------------------- */

(
  /* ================= CONFIG ================= */
  local cfgTmpPrefix = "S_"     -- 必须与 02 脚本一致
  local cfgSrcPrefix = "SV_"    -- A 骨架前缀
  /* ========================================== */

  local out = ""

  -- B 的骨（当前带临时前缀）的"裸名"
  local bareNames = for o in objects where ((classof o) == Dummy and (substring o.name 1 cfgTmpPrefix.count) == cfgTmpPrefix) collect (substring o.name (cfgTmpPrefix.count + 1) (o.name.count - cfgTmpPrefix.count))

  -- ① A 的同名骨加前缀
  local nSrc = 0
  local missed = ""
  for nm in bareNames do (
    local t = getNodeByName nm
    if (t != undefined) then ( t.name = cfgSrcPrefix + nm; nSrc = nSrc + 1 )
    else ( missed = missed + nm + " " )
  )

  -- ② B 的名字还原
  local nB = 0
  for o in objects where ((classof o) == Dummy and (substring o.name 1 cfgTmpPrefix.count) == cfgTmpPrefix) do (
    o.name = (substring o.name (cfgTmpPrefix.count + 1) (o.name.count - cfgTmpPrefix.count))
    nB = nB + 1
  )

  -- 校验：不应再存在带临时前缀的 Dummy
  local leftTmp = 0
  for o in objects where ((classof o) == Dummy and (substring o.name 1 cfgTmpPrefix.count) == cfgTmpPrefix) do ( leftTmp = leftTmp + 1 )

  out = out + "SUMMARY: targetBones=" + (bareNames.count as string) + "  sourcePrefixed=" + (nSrc as string) + "  targetRestored=" + (nB as string) + "  leftoverTmp=" + (leftTmp as string) + "\n"
  if (missed != "") do out = out + "  NOTE: 在 A 里找不到同名节点（这些骨没有对应源骨，将不会被驱动）: " + missed + "\n"
  out = out + "GATE: leftoverTmp=0 且 sourcePrefixed=targetBones（除非确有 A 缺失的骨）。\n"
  out = out + "NEXT: scripts/04_calibrate_limbs.ms\n"
  out
)
