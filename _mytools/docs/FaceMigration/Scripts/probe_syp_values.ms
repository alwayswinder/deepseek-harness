(
  local out = ""
  fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
  for nm in #("SYP_L001","SYP_R001") do
  (
    local n = getNodeByName nm
    if n == undefined then out += nm + " MISSING\n" else
      out += nm + " p2=" + (pstr n.position.controller[2].value) + "\n"
  )
  out
)
