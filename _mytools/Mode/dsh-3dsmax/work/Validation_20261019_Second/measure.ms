
fn vrMeasureRig verbose:false = (
 local s=stringStream "";local mp=0.;local mr=0.;local np="";local nr=""
 completeRedraw()
 for pass=1 to 2 do(
 mp=0.;mr=0.
 for pr in vrPairs do(
  local u=getNodeByName pr[1];local d=getNodeByName ("BIPDRV_"+pr[1])
  local pe=distance u.transform.pos d.transform.pos;local re=vrAngle u.transform.rotation d.transform.rotation
  if pe>mp do(mp=pe;np=pr[1]);if re>mr do(mr=re;nr=pr[1])
  if pass==2 and verbose and (pe>0.1 or re>1) do format "% pos=% rot=%\n" pr[1] pe re to:s
 ))
 format "MAX pos=% (%) rot=% (%)\n" mp np mr nr to:s;s as string
)
fn vrNormalizeChains = (
 for row in vrChains do for idx=3 to 4 do(
  local j=getNodeByName row[idx];local a=(getSubAnim j.position.controller 1).controller;local z=(getSubAnim j.position.controller 2).controller
  local ln=if idx==3 then distance (vrRestTM row[5]).pos (vrRestTM row[6]).pos else distance (vrRestTM row[6]).pos (vrRestTM row[7]).pos
  a.value=[ln,0,0]-z.value;completeRedraw()
 )
)
