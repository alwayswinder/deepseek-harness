(
local s=stringStream ""
for pair in #(#("Circle016","hand_r"),#("Circle019","hand_l"),#("Circle010","foot_r"),#("Circle012","foot_l"),#("Circle015","upperarm_r"),#("Circle018","upperarm_l")) do(
 loadMaxFile "E:/AI/DSH/_mytools/Mode/dsh-3dsmax/work/Validation_20261019_Second/Stan_validated_base.max" quiet:true;completeRedraw()
 local snap=vrSnapshot();local ring=getNodeByName pair[1];local old=ring.transform;local ue=getNodeByName pair[2];local upos=ue.transform.pos
 local bsn=for a in snap where matchPattern a[1] pattern:"bip001*" collect a
 try(
  in coordsys world(move ring [5,0,0]);completeRedraw()
  local maxBip=0.;for a in bsn do maxBip=amax maxBip (distance (getNodeByName a[1]).transform.pos a[2].pos)
  format "% +5X UEdelta=% BIPdrift=%\n" pair[1] (ue.transform.pos-upos) maxBip to:s
  ring.transform=old;completeRedraw();format "%\n" (vrCompare snap) to:s
 )catch(ring.transform=old;completeRedraw();throw())
)
for row in vrChains do(
 loadMaxFile "E:/AI/DSH/_mytools/Mode/dsh-3dsmax/work/Validation_20261019_Second/Stan_validated_base.max" quiet:true;completeRedraw()
 local snap=vrSnapshot();local ring=getNodeByName row[9];local old=ring.transform;local st=(getNodeByName row[2]).transform.pos
 local j2=getNodeByName row[3];local j3=getNodeByName row[4]
 local l1=distance st j2.transform.pos;local l2=distance j2.transform.pos j3.transform.pos
 try(
  local goal=st+normalize(old.pos-st)*(l1+l2+20)
  in coordsys world(move ring (goal-old.pos));completeRedraw();completeRedraw()
  local a=distance (getNodeByName row[2]).transform.pos j2.transform.pos;local b=distance j2.transform.pos j3.transform.pos
  format "STRETCH % original=% / % extended=% / % delta=% / % endToRing=%\n" row[1] l1 l2 a b (a-l1) (b-l2) (distance j3.transform.pos ring.transform.pos) to:s
  ring.transform=old;completeRedraw();format "%\n" (vrCompare snap) to:s
 )catch(ring.transform=old;completeRedraw();throw())
)
loadMaxFile "E:/AI/DSH/_mytools/Mode/dsh-3dsmax/work/Validation_20261019_Second/Stan_validated_base.max" quiet:true
s as string
)
