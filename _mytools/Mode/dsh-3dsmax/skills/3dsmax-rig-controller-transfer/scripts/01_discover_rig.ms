/* ------------------------------------------------------------------
   01_discover_rig.ms   —   只读盘点（在任何参与迁移的 Max 实例里各跑一次）
   用途：判定该窗口是「源 rig A」还是「目标 B」，并输出后续脚本所需的节点名。
   用法：mcpcall.py --pid <pid> execute_maxscript @args.json
         （args.json 内容为 {"code": "<本文件全文>"}）
   只读：不修改场景。
------------------------------------------------------------------- */

(
  local out = ""

  -- 1) 类直方图
  local cNames = #()
  local cCounts = #()
  fn bump nm = (
    local idx = findItem cNames nm
    if (idx == 0) then ( append cNames nm; append cCounts 1 )
    else ( cCounts[idx] = cCounts[idx] + 1 )
  )
  for o in objects do ( try ( bump ((classof o) as string) ) catch() )
  out = out + "== CLASS HISTOGRAM ==\n"
  for i = 1 to cNames.count do ( out = out + "  " + cNames[i] + " = " + (cCounts[i] as string) + "\n" )

  local idxIK = findItem cNames "IK_Chain_Object"
  local nIK = if (idxIK == 0) then 0 else cCounts[idxIK]
  out = out + "ROLE HINT: ikChains=" + (nIK as string)
  out = out + "  (>=1 像源 rig A，=0 像目标 B)\n"

  -- 2) IK 链明细：链名 / 起点 / 中间 / 末端 + 世界坐标
  local jointNames = #()
  out = out + "\n== IK CHAINS ==\n"
  if (nIK == 0) then ( out = out + "  (none)\n" )
  else (
    for o in objects where ((classof o) as string == "IK_Chain_Object") do (
      local c = undefined
      try ( c = o.transform.controller ) catch()
      local sN = "?"; local eN = "?"; local mN = "?"
      local sP = "?"; local mP = "?"; local eP = "?"
      if (c != undefined) do (
        local sj = undefined; local ej = undefined
        try ( sj = c.startJoint ) catch()
        try ( ej = c.endJoint ) catch()
        if (sj != undefined) do ( sN = sj.name; sP = (sj.transform.pos as string) )
        if (ej != undefined) do (
          eN = ej.name; eP = (ej.transform.pos as string)
          local mj = ej.parent
          if (mj != undefined) do ( mN = mj.name; mP = (mj.transform.pos as string) )
        )
      )
      if (sN != "?") do ( append jointNames sN )
      if (mN != "?") do ( append jointNames mN )
      if (eN != "?") do ( append jointNames eN )
      out = out + "  chain=" + o.name + "\n"
      out = out + "    start=" + sN + " @ " + sP + "\n"
      out = out + "    mid  =" + mN + " @ " + mP + "\n"
      out = out + "    end  =" + eN + " @ " + eP + "\n"
    )
  )

  -- 3) 极向点候选：被 IKChainControl 引用、且不在链关节上的点辅助对象
  out = out + "\n== POLE CANDIDATES (referenced by IKChainControl) ==\n"
  local nPole = 0
  for o in objects where ((classof o) as string == "Point") do (
    local has = false
    try (
      local deps = refs.dependents o
      for d in deps do ( if (((classof d) as string) == "IKChainControl") do has = true )
    ) catch()
    if (has and (findItem jointNames o.name == 0)) do (
      nPole = nPole + 1
      out = out + "  " + o.name + " @ " + (o.transform.pos as string) + "\n"
    )
  )
  out = out + "  count=" + (nPole as string) + "\n"

  -- 4) 蒙皮网格与骨骼列表
  out = out + "\n== SKINNED MESHES ==\n"
  for o in objects do (
    for m in o.modifiers do (
      if ((classof m) == Skin) do (
        local n = 0
        try ( n = skinOps.GetNumberBones m ) catch()
        local first = ""
        local lim = n
        if (lim > 8) do lim = 8
        for i = 1 to lim do (
          local bn = "?"
          try ( bn = skinOps.GetBoneName m i 0 ) catch()
          first = first + bn + " "
        )
        out = out + "  " + o.name + "  bones=" + (n as string) + "  first: " + first + "\n"
        -- 该网格的骨骼名（供 B 侧确定"目标骨骼集合"；上限 64 个避免刷屏）
        if (n > 0) do (
          local cap = n
          if (cap > 64) do cap = 64
          local all = ""
          for i = 1 to cap do (
            local bn = "?"
            try ( bn = skinOps.GetBoneName m i 0 ) catch()
            all = all + bn + " "
          )
          if (n > cap) do all = all + "...(+" + ((n - cap) as string) + " more)"
          out = out + "      ALL: " + all + "\n"
        )
      )
    )
  )

  -- 5) Dummy 骨架名单（源/目标的骨架载体）
  out = out + "\n== DUMMIES ==\n"
  local dNames = #()
  for o in objects where ((classof o) == Dummy) do ( append dNames o.name )
  out = out + "  count=" + (dNames.count as string) + "\n"
  out = out + "  names: " + (dNames as string) + "\n"

  -- 6) 是否已存在迁移痕迹
  local nDrv = 0
  for o in objects do ( if ((substring o.name 1 3) == "S7_") do ( nDrv = nDrv + 1 ) )
  out = out + "\n== MIGRATION TRACE ==\n"
  out = out + "  S7_* driver points = " + (nDrv as string) + "   (>0 表示已迁移过，勿重复迁移)\n"
  out = out + "  file = " + (maxFilePath + maxFileName) + "\n"
  out = out + "  objects = " + (objects.count as string) + "\n"

  out
)
