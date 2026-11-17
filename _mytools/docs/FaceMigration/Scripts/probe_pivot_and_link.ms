(
  local out = ""
  fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
  for nm in #("Point004","Point164") do
  (
    local o = getNodeByName nm
    if o == undefined then out += nm + " MISSING\n" else
      out += nm + " wpos=" + (pstr o.transform.row4) + " parent=" + (o.parent.name) + " class=" + ((classOf o) as string) + "\n"
  )
  -- 骨骼的 transform 控制器类型
  for nm in #("Bone027","Bone036") do
  (
    local b = getNodeByName nm
    out += nm + " transformCtrl=" + ((classOf b.transform.controller) as string) + "\n"
    try ( out += "  linkTargets=" + ((b.transform.controller.getNumTargets()) as string) + "\n" ) catch ()
  )
  out
)
