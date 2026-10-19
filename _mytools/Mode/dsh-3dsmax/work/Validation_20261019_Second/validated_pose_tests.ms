(
local s=stringStream ""
for nm in #("bip001 R Foot","bip001 L Foot","bip001 R Hand","bip001 L Hand","bip001") do(
 loadMaxFile "E:/AI/DSH/_mytools/Mode/dsh-3dsmax/work/Validation_20261019_Second/Stan_validated_base.max" quiet:true;completeRedraw()
 local snap=vrSnapshot();local b=getNodeByName nm;local original=b.transform.pos;local delta=if nm=="bip001" then 10 else 25
 local errs=for pr in vrPairs collect #(pr[1],distance (getNodeByName pr[1]).transform.pos (getNodeByName ("BIPDRV_"+pr[1])).transform.pos,vrAngle (getNodeByName pr[1]).transform.rotation (getNodeByName ("BIPDRV_"+pr[1])).transform.rotation)
 try(
  biped.setTransform b #pos (original+[0,0,delta]) false;completeRedraw()
  format "% +%Z\n%" nm delta (vrMeasureRig verbose:true) to:s
  local de=0.;local dr=0.;local gp=0.;local gr=0.;local np="";local nr=""
  for pr in vrPairs do(local d=getNodeByName ("BIPDRV_"+pr[1]);local bn=getNodeByName pr[2];de=amax de (distance d.transform.pos bn.transform.pos);dr=amax dr (vrAngle d.transform.rotation bn.transform.rotation))
  for a in errs do(
   local u=getNodeByName a[1];local d=getNodeByName ("BIPDRV_"+a[1]);local dp=(distance u.transform.pos d.transform.pos)-a[2];local dq=(vrAngle u.transform.rotation d.transform.rotation)-a[3]
   if dp>gp do(gp=dp;np=a[1]);if dq>gr do(gr=dq;nr=a[1])
  )
  format "driver=% / % perBoneGrowth=% (%) / % (%)\n" de dr gp np gr nr to:s
  if nm=="bip001" do for un in #("pelvis","head","hand_l","hand_r","foot_l","foot_r") do(
   local prior=(for a in snap where a[1]==un collect a[2].pos)[1];format "ROOT % delta=%\n" un ((getNodeByName un).transform.pos-prior) to:s
  )
  biped.setTransform b #pos original false;completeRedraw();format "%\n" (vrCompare snap) to:s
 )catch(biped.setTransform b #pos original false;completeRedraw();throw())
)
loadMaxFile "E:/AI/DSH/_mytools/Mode/dsh-3dsmax/work/Validation_20261019_Second/Stan_validated_base.max" quiet:true
s as string
)
