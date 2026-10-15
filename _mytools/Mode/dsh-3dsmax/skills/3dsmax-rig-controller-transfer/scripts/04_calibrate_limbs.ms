/* ------------------------------------------------------------------
   04_calibrate_limbs.ms   —   逐肢把 IK 链校准到目标 B 的静止骨长
   在 **目标 B 的实例**上运行（A 的 Rig 已合并进来）。
   会修改场景：段长、起点/末端控制器位置、极向点位置。请先做检查点。

   算法（每肢、共 cfgRounds 轮交替迭代）：
     1. 把起点控制器移到 B 的上段骨 → 把末端控制器移到 B 的末端骨
     2. 段长：先设冻结基值为 B 骨长，再按【实测解算长度】迭代修正
        （伸缩参数线会让设定值 ≠ 实际值）
     3. 把极向点绕轴旋转到【目标中关节所在平面】
   只读汇总会打印 startErr / midErr / endErr；逐个先读汇总再继续。

   用法：把本文件全文作为 execute_maxscript 的 code 传入。
------------------------------------------------------------------- */

(
  /* ================= CONFIG：按 01_discover_rig.ms 的输出填写 ================= */
  -- 每肢：肢体名, 起点关节, 中间关节, 末端关节, 起点控制器, 末端控制器, 极向点,
  --       B 的上段骨, B 的中段骨, B 的末端骨
  local cfgLimbs = #(
    #("RIGHT ARM", "Point044", "Point045", "Point046", "Circle015", "Circle016", "Point159", "upperarm_r", "lowerarm_r", "hand_r"),
    #("LEFT ARM",  "Point031", "Point032", "Point033", "Circle018", "Circle019", "Point158", "upperarm_l", "lowerarm_l", "hand_l"),
    #("RIGHT LEG", "Point022", "Point023", "Point024", "Circle009", "Circle010", "Point039", "thigh_r", "calf_r", "foot_r"),
    #("LEFT LEG",  "Point025", "Point026", "Point027", "Circle011", "Circle012", "Point038", "thigh_l", "calf_l", "foot_l")
  )
  local cfgRounds = 5        -- 交替迭代轮数
  local cfgFitPasses = 5     -- 每轮内段长拟合次数
  /* ========================================================================== */

  local out = ""
  local nOk = 0
  local nFail = 0
  local failList = ""

  fn fkFrozenPos nd = ( nd.transform.controller[4].controller[1].controller[1].controller )

  fn rotAbout p o kk ang = (
    local v = p - o
    local vpar = (dot v kk) * kk
    local vperp = v - vpar
    o + vpar + (vperp * (cos ang)) + ((cross kk vperp) * (sin ang))
  )

  fn calibrateLimb tag sN mN eN scN hcN poleN upN midN endN rounds fitPasses = (
    local ps = getNodeByName sN
    local pm = getNodeByName mN
    local pe = getNodeByName eN
    local sc = getNodeByName scN
    local hc = getNodeByName hcN
    local pole = getNodeByName poleN
    local bu = getNodeByName upN
    local bm = getNodeByName midN
    local be = getNodeByName endN
    if (ps == undefined or pm == undefined or pe == undefined or sc == undefined or hc == undefined or pole == undefined or bu == undefined or bm == undefined or be == undefined) do
      throw ("missing node in limb " + tag)

    local SU = bu.transform.pos          -- B 上段骨静止位置
    local SE = bm.transform.pos          -- B 中段骨静止位置
    local SH = be.transform.pos          -- B 末端骨静止位置
    local L1 = length (SE - SU)
    local L2 = length (SH - SE)

    local c1 = fkFrozenPos pm
    local c2 = fkFrozenPos pe
    c1.value = [L1, 0, 0]
    c2.value = [L2, 0, 0]

    for ri = 1 to rounds do (
      -- 起点/末端控制器移到 B 的关节（用控制器【自身】的误差）
      move sc (SU - sc.transform.pos)
      move hc (SH - hc.transform.pos)
      redrawViews()

      -- 段长拟合到实测解算长度
      for i = 1 to fitPasses do (
        redrawViews()
        local a1 = length (pm.transform.pos - ps.transform.pos)
        local a2 = length (pe.transform.pos - pm.transform.pos)
        c1.value = [(c1.value.x + (L1 - a1)), 0, 0]
        c2.value = [(c2.value.x + (L2 - a2)), 0, 0]
      )
      redrawViews()

      -- 极向点入面（只改方向分量，保留原离轴距离）
      local S = ps.transform.pos
      local H = pe.transform.pos
      local k = normalize (H - S)
      local dt = (SE - S) - (dot (SE - S) k) * k
      local P = pole.transform.pos
      local along = dot (P - S) k
      local perpDist = length ((P - S) - along * k)
      local tgtP = S + (along * k) + ((normalize dt) * perpDist)
      move pole (tgtP - P)
      redrawViews()
    )

    local S = ps.transform.pos
    local H = pe.transform.pos
    local M = pm.transform.pos
    local E = pe.transform.pos
    local res = "  " + tag + ":  seg1=" + (L1 as string) + "  seg2=" + (L2 as string) + "\n"
    res = res + "     startErr=" + ((length (S - SU)) as string)
    res = res + "  midErr=" + ((length (M - SE)) as string)
    res = res + "  endErr=" + ((length (E - SH)) as string) + "\n"
    res
  )

  for L in cfgLimbs do (
    try (
      out = out + (calibrateLimb L[1] L[2] L[3] L[4] L[5] L[6] L[7] L[8] L[9] L[10] cfgRounds cfgFitPasses)
      nOk = nOk + 1
    ) catch (
      nFail = nFail + 1
      failList = failList + L[1] + " "
      out = out + "  " + L[1] + ": FAILED -> " + (getCurrentException() as string) + "\n"
    )
  )

  out = out + "SUMMARY: limbs=" + (cfgLimbs.count as string) + " ok=" + (nOk as string) + " failed=" + (nFail as string) + "\n"
  if (failList != "") do out = out + "  failed: " + failList + "\n"
  out = out + "GATE: endErr < 2e-3 且 midErr < 0.02 才算通过；未通过的那条肢不要往下做驱动层。\n"
  out
)
