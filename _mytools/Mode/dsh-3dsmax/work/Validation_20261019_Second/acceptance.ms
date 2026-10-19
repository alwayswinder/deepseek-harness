
global vrChains=#(
 #("rleg","Point022","Point023","Point024","thigh_r","calf_r","foot_r","Circle009","Circle010","Point039"),
 #("lleg","Point025","Point026","Point027","thigh_l","calf_l","foot_l","Circle011","Circle012","Point038"),
 #("rarm","Point044","Point045","Point046","upperarm_r","lowerarm_r","hand_r","Circle015","Circle016","Point159"),
 #("larm","Point031","Point032","Point033","upperarm_l","lowerarm_l","hand_l","Circle018","Circle019","Point158")
)
fn vrSnapshot = (for nm in vrRetainedNames collect #(nm,(getNodeByName nm).transform))
fn vrCompare snap verbose:false = (
 local mp=0.;local mr=0.;local np="";local nr="";local s=stringStream ""
 completeRedraw()
 for pass=1 to 2 do (
 mp=0.;mr=0.
 for a in snap do(
  local tm=(getNodeByName a[1]).transform;local pe=distance tm.pos a[2].pos;local re=vrAngle tm.rotation a[2].rotation
  if pe>mp do(mp=pe;np=a[1]);if re>mr do(mr=re;nr=a[1])
  if pass==2 and verbose and pe>0.0001 do format "% pos=% rot=%\n" a[1] pe re to:s
 ))
 format "RESET pos=% (%) rot=% (%)\n" mp np mr nr to:s;s as string
)
fn vrAlignPole row = (
 local start=(getNodeByName row[2]).transform.pos;local tip=(getNodeByName row[9]).transform.pos;local axis=normalize(tip-start)
 local t=(getNodeByName ("BIPDRV_"+row[6])).transform.pos;local aim=(t-start)-(dot(t-start)axis)*axis
 local pole=getNodeByName row[10];local old=pole.transform.pos;local along=dot(old-start)axis;local radius=length((old-start)-along*axis)
 in coordsys world(move pole ((start+along*axis+normalize(aim)*radius)-old));completeRedraw()
)
"acceptance helpers loaded"
