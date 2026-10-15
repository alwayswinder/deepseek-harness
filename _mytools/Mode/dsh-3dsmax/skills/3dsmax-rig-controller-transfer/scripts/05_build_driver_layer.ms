/* ------------------------------------------------------------------
   05_build_driver_layer.ms   —   建立静止对齐驱动层（路线 1）
   在 **目标 B 的实例**上运行（A 的 Rig 已合并并已加前缀）。
   会修改场景：为 B 的每根骨新建驱动点 + 位置/方向约束。请先做检查点。

   原理：驱动点先放在 B 骨的【静止世界变换】，再挂到 A 的对应骨并【恢复世界变换】，
        此后刚体跟随 A。B 的骨被位置+方向双约束指向该驱动点。
        因为约束在创建时捕获静止偏移，B 的静止姿势不变、骨长在运动中守恒。

   幂等：已存在同名驱动点的骨会被跳过（不重复叠加约束）。
   用法：把本文件全文作为 execute_maxscript 的 code 传入。
------------------------------------------------------------------- */

(
  /* ================= CONFIG ================= */
  local cfgSrcPrefix = "SV_"    -- A 骨架的前缀（合并后加的那个）
  local cfgDrvPrefix = "S7_"    -- 驱动点前缀
  local cfgSkipSourceTwists = true   -- 若 B 没有对应骨、只有 A 多出来的骨，自动跳过（按名字匹配天然跳过）
  /* ========================================== */

  local out = ""
  local made = 0
  local skipped = 0
  local failed = 0
  local failList = ""
  local bNames = #()
  local bPos = #()

  -- 目标骨集合：名字带 srcPrefix 对应物的 Dummy 即为 B 的骨（A 的骨本身带前缀，不会被再次匹配）
  local targets = for o in objects where ((classof o) == Dummy and o.name.count > 0 and (substring o.name 1 cfgSrcPrefix.count) != cfgSrcPrefix and (getNodeByName (cfgSrcPrefix + o.name)) != undefined) collect o

  for b in targets do (
    if (getNodeByName (cfgDrvPrefix + b.name) != undefined) then ( skipped = skipped + 1 )
    else (
      try (
        local src = getNodeByName (cfgSrcPrefix + b.name)
        local mm = b.transform                       -- B 骨的静止世界变换
        append bNames b.name
        append bPos mm.pos
        local p = Point name:(cfgDrvPrefix + b.name) pos:mm.pos size:2.0
        p.transform = mm                             -- 放到 B 的静止世界变换
        p.parent = src                               -- 挂到 A 的对应骨
        p.transform = mm                             -- 恢复世界变换（关键）
        local pc = Position_Constraint()
        local oc = Orientation_Constraint()
        b.pos.controller = pc
        b.rotation.controller = oc
        pc.appendTarget p 100.0
        oc.appendTarget p 100.0
        made = made + 1
      ) catch (
        failed = failed + 1
        failList = failList + b.name + " "
        out = out + "  FAILED " + b.name + " -> " + (getCurrentException() as string) + "\n"
      )
    )
  )

  redrawViews()

  -- 静止姿势是否被破坏：比较加约束前后的 B 骨位置
  local maxShift = 0.0
  local worst = ""
  for i = 1 to bNames.count do (
    local o = getNodeByName bNames[i]
    if (o != undefined) do (
      local s = length (o.transform.pos - bPos[i])
      if (s > maxShift) do ( maxShift = s; worst = bNames[i] )
    )
  )

  local nDrv = 0
  for o in objects do ( if ((substring o.name 1 cfgDrvPrefix.count) == cfgDrvPrefix) do ( nDrv = nDrv + 1 ) )

  out = out + "SUMMARY: targetBones=" + (targets.count as string) + " driversMade=" + (made as string) + " skipped=" + (skipped as string) + " failed=" + (failed as string) + "\n"
  out = out + "  totalDrivers=" + (nDrv as string) + "\n"
  out = out + "  maxRestShift=" + (maxShift as string) + "  worst=" + worst + "\n"
  if (failList != "") do out = out + "  failed: " + failList + "\n"
  out = out + "GATE: maxRestShift < 1e-3 且 failed=0 才算通过。\n"
  out
)
