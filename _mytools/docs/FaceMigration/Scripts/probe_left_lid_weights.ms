(
  local out = ""
  fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
  local head = getNodeByName "Seven_Head"
  local sm = head.modifiers[#Skin]
  local b = getNodeByName "Bone037"
  local bp = b.transform.row4
  out += "Bone037 wpos=" + (pstr bp) + " verts=" + ((polyop.getNumVerts head) as string) + "\n"
  local shown = 0
  local total = 0
  local pure = 0
  local near = #()
  for v = 1 to (polyop.getNumVerts head) do
  (
    local vp = polyop.getVert head v
    if (distance vp bp) < 2.0 do append near #(v, distance vp bp)
  )
  out += "near(<2cm) count=" + (near.count as string) + "\n"
  for item in near do
  (
    local v = item[1]
    local nb = 0
    try ( nb = skinOps.GetVertexWeightCount sm v ) catch ()
    local names = ""
    local maxw = 0.0
    local maxn = ""
    for i = 1 to nb do
    (
      local bi = 0
      local bw = 0.0
      try ( bi = skinOps.GetVertexWeightBoneID sm v i ) catch ()
      try ( bw = skinOps.GetVertexWeight sm v i ) catch ()
      local bn = "?"
      try ( bn = skinOps.GetBoneName sm bi 0 ) catch ()
      names += bn + "=" + (bw as string) + " "
      if bw > maxw do ( maxw = bw; maxn = bn )
    )
    total += 1
    if maxw > 0.99 and maxn == "Bone037" do pure += 1
    if shown < 6 do
    (
      shown += 1
      out += "  v" + (v as string) + " d=" + ((item[2]) as string) + " : " + names + "\n"
    )
  )
  out += "weights: total=" + (total as string) + " pureBone037=" + (pure as string) + "\n"
  out
)
