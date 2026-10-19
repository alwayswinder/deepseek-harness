fileIn "E:/AI/DSH/_mytools/Mode/dsh-3dsmax/work/Validation_20261019_Second/gRest_Stan.txt"
global vrPairs=#()
fn vrRestTM nm = (local i=findItem (for a in vrRest collect a[1]) nm; if i==0 then throw ("Missing rest "+nm) else vrRest[i][2])
fn vrAddPair un bn child posOK = append vrPairs #(un, "bip001 "+bn, child, posOK)
vrAddPair "pelvis" "Pelvis" undefined false
vrAddPair "spine_01" "Spine" "spine_02" true
vrAddPair "spine_02" "Spine1" "spine_03" true
vrAddPair "spine_03" "Spine2" "neck_01" true
vrAddPair "neck_01" "Neck" "head" true
vrAddPair "head" "Head" undefined true
for side in #("l","r") do (
 local cap=if side=="l" then "L " else "R "
 for row in #(#("clavicle","Clavicle","upperarm",true),#("upperarm","UpperArm","lowerarm",false),#("lowerarm","Forearm","hand",false),#("hand","Hand",undefined,false),#("thigh","Thigh","calf",false),#("calf","Calf","foot",false),#("foot","Foot",undefined,false),#("ball","Toe0",undefined,true)) do vrAddPair (row[1]+"_"+side) (cap+row[2]) (if row[3]==undefined then undefined else row[3]+"_"+side) row[4]
 local fingers=#("thumb","index","middle","ring","pinky")
 for f=1 to 5 do for link=1 to 3 do (
  local un=fingers[f]+"_0"+link as string+"_"+side
  local bn=cap+"Finger"+(f-1) as string+(if link==1 then "" else (link-1) as string)
  local child=if link==3 then undefined else fingers[f]+"_0"+(link+1) as string+"_"+side
  vrAddPair un bn child true
 )
)
fn vrAngle a b = (local q=a*inverse b; 2*atan2 (length [q.x,q.y,q.z]) (abs q.w))
fn vrMeasureRest = (
 local s=stringStream ""; local mp=0.;local mr=0.
 completeRedraw()
 for pass=1 to 2 do (
  mp=0.;mr=0.
  for pr in vrPairs do (
   local b=getNodeByName pr[2]; local t=vrRestTM pr[1]
   local pe=distance b.transform.pos t.pos;local re=vrAngle b.transform.rotation t.rotation
   mp=amax mp pe; if not matchPattern pr[1] pattern:"clavicle*" do mr=amax mr re
   if pass==2 and (pe>0.05 or re>0.1) do format "% pos=% rot=%\n" pr[1] pe re to:s
  )
 )
 format "MAX % / %\n" mp mr to:s;s as string
)
"helpers loaded"
