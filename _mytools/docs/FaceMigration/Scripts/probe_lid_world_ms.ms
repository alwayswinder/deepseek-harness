(
  local out = ""
  fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
  for nm in #("Bone027","Bone028","Bone029","Bone036","Bone037","Bone038") do
  (
    local o = getNodeByName nm
    if o == undefined then out += nm + " MISSING\n" else
      out += nm + " wpos=" + (pstr o.transform.row4) + "\n"
  )
  out += "time=" + ((sliderTime as string)) + " animLayers=" + ((for i=1 to (try (numLayerManagers()) catch (0)) collect i) as string) + "\n"
  out += "SYP_L p2=" + ((getNodeByName "SYP_L001").position.controller[2].value as string) + "\n"
  out += "SYP_R p2=" + ((getNodeByName "SYP_R001").position.controller[2].value as string) + "\n"
  out
)
