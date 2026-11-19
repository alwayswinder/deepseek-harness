(
  local out = ""
  fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
  for nm in #("Bone027","Bone028","Bone029","Bone036","Bone037","Bone038") do
  (
    local o = getNodeByName nm
    if o != undefined do
      out += nm + " pivot=" + (pstr o.pivot) + " pos=" + (pstr o.pos) + " wpos=" + (pstr o.transform.row4) + " len=" + ((try ((o.length) as string) catch ("?"))) + "\n"
  )
  out
)
