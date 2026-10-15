/* ------------------------------------------------------------------
   02_prefix_target_skeleton.ms   —   迁移第 1 步：把目标 B 的骨架临时加前缀
   在 **目标 B 的实例**上运行，**在 merge_from_file 之前**。
   目的：腾出骨骼名，让 A 的同名骨在合并时保持干净原名（否则 Max 会改名成 pelvis001）。

   之后：用 MCP 合并 A  →  merge_from_file(file_path=A.max, select_merged=false, duplicate_action="rename")
   然后：运行 03_prefix_source_skeleton.ms

   会修改场景：重命名目标骨架节点。请先做检查点。
------------------------------------------------------------------- */

(
  /* ================= CONFIG ================= */
  local cfgTmpPrefix = "S_"     -- 临时前缀（03 脚本会用它把名字还原）
  local cfgSrcPrefix = "SV_"    -- A 骨架的前缀；用于检测"是否已经迁移过"
  /* ========================================== */

  local out = ""

  -- 安全检查：已经迁移过就不要重跑
  local nSrc = 0
  for o in objects do ( if ((substring o.name 1 cfgSrcPrefix.count) == cfgSrcPrefix) do ( nSrc = nSrc + 1 ) )
  if (nSrc > 0) then (
    out = out + "ABORT: 场景里已有 " + (nSrc as string) + " 个 " + cfgSrcPrefix + "* 节点，看起来已经迁移过。\n"
    out = out + "       重复执行会破坏映射；请先确认，或改用里程碑文件重来。\n"
  )
  else (
    local n = 0
    for o in objects where ((classof o) == Dummy) do (
      if ((substring o.name 1 cfgTmpPrefix.count) != cfgTmpPrefix) do (
        o.name = cfgTmpPrefix + o.name
        n = n + 1
      )
    )
    out = out + "SUMMARY: targetPrefixed=" + (n as string) + "  tmpPrefix=" + cfgTmpPrefix + "\n"
    out = out + "NEXT: merge_from_file(file_path=<A.max>, select_merged=false, duplicate_action=\"rename\")，然后跑 03。\n"
  )
  out
)
