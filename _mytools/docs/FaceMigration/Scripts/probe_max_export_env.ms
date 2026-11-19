(
  local out = ""
  out += "hasFBXSkin=" + ((FBXExportSkins != undefined) as string) + "\n"
  try ( out += "hasExportFile=" + (exportFile != undefined) as string + "\n" ) catch ()
  -- 统计类
  local hist = #()
  for o in objects do
  (
    local cn = (classOf o) as string
    local found = false
    for h in hist where h[1] == cn do ( h[2] += 1; found = true )
    if not found do append hist #(cn, 1)
  )
  for h in hist do out += "  " + h[1] + " x" + (h[2] as string) + "\n"
  out += "BoneCount=" + ((for o in objects where (classOf o == BoneGeometry) collect o).count as string) + "\n"
  out += "Point004 class=" + ((classOf (getNodeByName "Point004")) as string) + "\n"
  out
)
