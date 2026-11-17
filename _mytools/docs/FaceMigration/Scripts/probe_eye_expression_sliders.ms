-- Eight eye expressions: sample limited local Y, restore all raw XYZ values.
(
 local names=#("R_mouthUpCircleCtrl01","R_mouthUpCircleCtrl008","R_mouthUpCircleCtrl03","R_mouthUpCircleCtrl00","L_mouthUpCircleCtrl00","L_mouthUpCircleCtrl008","L_mouthUpCircleCtrl02","L_mouthUpCircleCtrl04")
 local ns=for nm in names collect getNodeByName nm
 for n in ns do if n==undefined do throw "Missing eye expression control"
 local tracks=for n in ns collect (for j=1 to 3 collect (local c=n.position.controller[j].controller;if classof c==float_limit then c[1].controller else c))
 local savedRaw=at time 0 (for tt in tracks collect (for c in tt collect c.value))
 local bs=#("Root","pelvis","spine_01","spine_02","spine_03","neck_01","head","head001","bizi","bitou","bijian","Bone026","Bone034","pinguojizong_R","pingguoji_R","yankuang_R","meibu_R","Bone010","Bone011","Bone012","yandai_R","yandai2_R","Eye_R","Bone029","Bone028","Bone027","Bone032","Bone031","Bone030","yanqiu_R","Bone042","Bone043","Eye_R01","zuibu","yachi","xiaya","zui","Bone021","Bone022","Bone023","Bone020","shangzuichun","Bone019","Bone017","Bone016","Bone018","xiazuichun","zuibuzhouwei","renzhong_R","renzhong_L","xiabake_L","xiabake_R","Bone015","Bone014","yankuang_L","meibu_L","Bone007","Bone008","Bone009","yandai_L","yandai2_L","Eye_L","Bone036","Bone037","Bone038","Bone039","Bone040","Bone041","yanqiu_L","Bone044","Bone045","Eye_L01","pinguojizong_L","pingguoji_L","lianjiazong_R","lianjia_R","lianjiazong_L","lianjia_L","etou","etou_R","etou_L","xiahegu","Bone054","Bone055","Bone049","Bone050","Bone052","Bone053","clavicle_l","upperarm_l","lowerarm_l","hand_l","thumb_01_l","thumb_02_l","thumb_03_l","index_01_l","index_02_l","index_03_l","middle_01_l","middle_02_l","middle_03_l","ring_01_l","ring_02_l","ring_03_l","pinky_01_l","pinky_02_l","pinky_03_l","Weapon_L","lowerarm_twist_01_l","upperarm_twist_01_l","upperarm_twist_02_l","clavicle_r","upperarm_r","lowerarm_r","hand_r","thumb_01_r","thumb_02_r","thumb_03_r","index_01_r","index_02_r","index_03_r","middle_01_r","middle_02_r","middle_03_r","ring_01_r","ring_02_r","ring_03_r","pinky_01_r","pinky_02_r","pinky_03_r","Weapon_R","lowerarm_twist_01_r","upperarm_twist_01_r","upperarm_twist_02_r","Back_Weapon_L","Back_Weapon_R","thigh_l","calf_l","foot_l","ball_l","thigh_r","calf_r","foot_r","ball_r","Weapon_Shear","QTE","Bullet_Firing","Root_Camera","FX_Shield")
 if bs.count!=149 do throw "Expected 149 bones"
 local morphs=#();local failure=undefined;local out=""
 fn num x=(if abs x<0.00001 then (formattedPrint (x*1000000000.0) format:".9f")+"e-9" else formattedPrint x format:".9g")
 fn vec p="["+num p.x+","+num p.y+","+num p.z+"]"
 fn tfstr n=(local t=n.transform;local q=t.rotation;"{\"p\":"+vec t.row4+",\"q\":["+num q.x+","+num q.y+","+num q.z+","+num q.w+"],\"scale\":"+vec t.scalepart+"}")
 fn boneString=(local s="{";for i=1 to bs.count do (if i>1 do s+=",";s+="\""+bs[i]+"\":"+tfstr(getNodeByName bs[i]));s+"}")
 fn morphString=(local s="[";for i=1 to morphs.count do (local m=morphs[i];if i>1 do s+=",";s+="{\"object\":\""+m[3]+"\",\"channel\":"+(m[2] as string)+",\"name\":\""+(WM3_MC_GetName m[1] m[2])+"\",\"value\":"+num(WM3_MC_GetValue m[1] m[2])+"}");s+"]")
 fn sampleString values=(
  for i=1 to 8 do tracks[i][2].value=-values[i]
  local s="{\"weights\":["
  for i=1 to 8 do (if i>1 do s+=",";s+=num(-ns[i].position.controller.value.y))
  s+"],\"bones\":"+boneString()+",\"morphs\":"+morphString()+"}"
 )
 try(with animate off at time 0 (
  for n in geometry do for m in n.modifiers where classof m==Morpher do for ch=1 to 100 where WM3_MC_HasData m ch do append morphs #(m,ch,n.name)
  out="{\"scene\":\""+substituteString(maxFilePath+maxFileName) "\\" "/"+"\",\"frame\":0,\"saved_raw\":["
  for i=1 to 8 do (if i>1 do out+=",";out+=vec (point3 savedRaw[i][1] savedRaw[i][2] savedRaw[i][3]))
  out+="],\"baseline\":"+sampleString (for n in ns collect 0.0)+",\"samples\":["
  local count=0
  for i=1 to 8 do for v in #(0.125,0.25,0.5,0.75,1.0) do (
   local values=(for n in ns collect 0.0);values[i]=v
   if count>0 do out+=",";out+=sampleString values;count+=1
  )
  for step=1 to 12 do (local values=for i=1 to 8 collect (0.5+0.5*sin(step*31+i*47));out+=","+sampleString values)
  out+=","+sampleString (for n in ns collect 1.0)
  out+="]}"
 ))catch(failure=getCurrentException())
 with animate off at time 0 (for i=1 to 8 do for j=1 to 3 do tracks[i][j].value=savedRaw[i][j])
 at time 0 (for i=1 to 8 do for j=1 to 3 do if abs(tracks[i][j].value-savedRaw[i][j])>0.00000001 do throw "Restore failed")
 if failure!=undefined do throw failure
 out
)

