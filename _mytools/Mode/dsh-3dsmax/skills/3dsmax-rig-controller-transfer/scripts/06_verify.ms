/* ------------------------------------------------------------------
   06_verify.ms   —   数值验收 + 驱动测试（含自动复位）
   在 **目标 B 的实例**上运行。会临时移动控制器，但每个测试都会复位并核对复位误差。

   三项数值：
     A. 逐肢 startErr / midErr / endErr          （链条 vs B 的骨）
     B. 刚性漂移：运动前后 |B骨 − A骨| 是否恒定   （判断"跟对了"而非"动了"）
     C. 驱动 + 复位：移动控制器后 B 跟随多少、能否精确回位

   用法：把本文件全文作为 execute_maxscript 的 code 传入。
------------------------------------------------------------------- */

(
  /* ================= CONFIG ================= */
  local cfgSrcPrefix = "SV_"
  local cfgLimbs = #(
    #("RIGHT ARM", "Point044", "Point045", "Point046", "Circle015", "Circle016", "Point159", "upperarm_r", "lowerarm_r", "hand_r"),
    #("LEFT ARM",  "Point031", "Point032", "Point033", "Circle018", "Circle019", "Point158", "upperarm_l", "lowerarm_l", "hand_l"),
    #("RIGHT LEG", "Point022", "Point023", "Point024", "Circle009", "Circle010", "Point039", "thigh_r", "calf_r", "foot_r"),
    #("LEFT LEG",  "Point025", "Point026", "Point027", "Circle011", "Circle012", "Point038", "thigh_l", "calf_l", "foot_l")
  )
  -- 驱动测试：说明, 控制器, B 的骨, 位移
  local cfgTests = #(
    #("right hand",  "Circle016", "hand_r",      [0,0,5]),
    #("left hand",   "Circle019", "hand_l",      [0,0,5]),
    #("right foot",  "Circle010", "foot_r",      [0,0,5]),
    #("left foot",   "Circle012", "foot_l",      [0,0,5]),
    #("spine",       "Circle007", "spine_03",    [0,0,3]),
    #("pelvis",      "Circle005", "pelvis",      [0,0,3]),
    #("right thumb", "Circle075", "thumb_01_r",  [0,2,0]),
    #("left ball",   "Circle110", "ball_l",      [0,1,0])
  )
  local cfgMidGate = 0.02
  local cfgEndGate = 0.002      -- 约为角色身高的 1e-5；近全伸展的肢（如左臂）最难做小
  local cfgDriftGate = 0.00001
  /* ========================================== */

  local out = ""

  -- 计数
  local nDrv = 0
  local nSkel = 0
  for o in objects do (
    if ((substring o.name 1 cfgSrcPrefix.count) == cfgSrcPrefix) do ( nSkel = nSkel + 1 )
  )
  local nDriven = 0
  for b in objects where ((classof b) == Dummy) do (
    if (getNodeByName ("S7_" + b.name) != undefined) do ( nDriven = nDriven + 1 )
  )
  out = out + "== INVENTORY ==\n"
  out = out + "  sourceSkeleton(" + cfgSrcPrefix + "*)=" + (nSkel as string) + "  targetBonesDriven=" + (nDriven as string) + "  objects=" + (objects.count as string) + "\n"

  -- A. 逐肢误差
  out = out + "\n== A. LIMB ALIGNMENT ==\n"
  local allPass = true
  for L in cfgLimbs do (
    try (
      local ps = getNodeByName L[2]
      local pm = getNodeByName L[3]
      local pe = getNodeByName L[4]
      local bm = getNodeByName L[9]
      local be = getNodeByName L[10]
      redrawViews()
      local sE = length (ps.transform.pos - ((getNodeByName L[8]).transform.pos))
      local mE = length (pm.transform.pos - bm.transform.pos)
      local eE = length (pe.transform.pos - be.transform.pos)
      local ok = (mE < cfgMidGate) and (eE < cfgEndGate)
      if (not ok) do allPass = false
      out = out + "  " + L[1] + ": startErr=" + (sE as string) + "  midErr=" + (mE as string) + "  endErr=" + (eE as string) + (if ok then "  PASS" else "  **FAIL**") + "\n"
    ) catch (
      allPass = false
      out = out + "  " + L[1] + ": ERROR -> " + (getCurrentException() as string) + "\n"
    )
  )

  -- B+C. 驱动与刚性漂移
  out = out + "\n== B/C. DRIVE + RIGID DRIFT ==\n"
  local worstDrift = 0.0
  local worstRestore = 0.0
  for T in cfgTests do (
    try (
      local c = getNodeByName T[2]
      local b = getNodeByName T[3]
      local a = getNodeByName (cfgSrcPrefix + T[3])
      redrawViews()
      local b0 = b.transform.pos
      local restDist = length (b0 - a.transform.pos)
      move c T[4]
      redrawViews()
      local b1 = b.transform.pos
      local movDist = length (b1 - a.transform.pos)
      local moved = length (b1 - b0)
      move c (T[4] * -1)
      redrawViews()
      local b2 = b.transform.pos
      local restoreErr = length (b2 - b0)
      local drift = movDist - restDist
      if (abs drift > worstDrift) do worstDrift = abs drift
      if (restoreErr > worstRestore) do worstRestore = restoreErr
      local ok = (abs drift < cfgDriftGate) and (restoreErr < cfgEndGate)
      out = out + "  " + T[1] + ": moved=" + (moved as string) + "  drift=" + (drift as string) + "  restoreErr=" + (restoreErr as string) + (if ok then "  PASS" else "  **FAIL**") + "\n"
    ) catch (
      out = out + "  " + T[1] + ": ERROR -> " + (getCurrentException() as string) + "\n"
    )
  )

  out = out + "\n== SUMMARY ==\n"
  out = out + "  limbAlignment=" + (if allPass then "PASS" else "**FAIL**") + "\n"
  out = out + "  worstDrift=" + (worstDrift as string) + "   worstRestoreErr=" + (worstRestore as string) + "\n"
  out = out + "  gates: midErr<" + (cfgMidGate as string) + " endErr<" + (cfgEndGate as string) + " drift<" + (cfgDriftGate as string) + "\n"
  out = out + "  NEXT: Save As 新文件 -> 重新打开 -> 再跑一次本脚本\n"
  out
)
