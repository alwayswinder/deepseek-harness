-- Run via max_run.ps1; paths are supplied by the target project/job.
if FaceMigrationTempDir == undefined do throw "Use FaceMigration max_run.ps1 or supply FaceMigrationTempDir"
-- Line010 position input; all edited underlying tracks are restored, no scene save.
(
 local names=#("Line010","Animcraft_Left_Mouth_Ctrl","Animcraft_Right_Mouth_Ctrl","Animcraft_Mouth_Ctrl","Animcraft_Nose_Ctrl","Animcraft_Right_Cheek_Ctrl","Animcraft_Left_Cheek_Ctrl","Animcraft_Left_up_Lip_Ctrl","Animcraft_up_Lip_Ctrl","Animcraft_Right_up_Lip_Ctrl","Animcraft_Right_low_Lip_Ctrl","Animcraft_dn_Lip_Ctrl","Animcraft_Left_low_Lip_Ctrl","YanJing_L001","YanJing_R001","YanJing_Zong001","SYP_L001","SYP_R001","XYP_L001","XYP_R001")
 local ns=for nm in names collect getNodeByName nm
 for i=1 to ns.count do if ns[i]==undefined do throw ("Missing control "+names[i])
 local tracks=for n in ns collect (for j=1 to 3 collect (local c=n.position.controller[2].controller[j].controller;if classof c==float_limit then c[1].controller else c))
 local savedRaw=at time 0 (for tt in tracks collect (for c in tt collect c.value))
 local jawY=(getNodeByName "jaw_move").position.controller[2].controller[2].controller
 local savedJawY=at time 0 jawY.value
 local bs=#()
 local boneFile=openFile (FaceMigrationTempDir + "cheek_bone_names.txt")
 while not eof boneFile do append bs (readLine boneFile)
 close boneFile
 if bs.count!=149 do throw "Expected 149 bones"
 local helpers=#("100","0","20","30","50","70","80","Point489","Point490","Point506","Point162","Point163")
 local morphs=#();local failure=undefined;local out=""
 fn num x=(if abs x<0.00001 then (formattedPrint (x*1000000000.0) format:".9f")+"e-9" else formattedPrint x format:".9g")
 fn vec p="["+num p.x+","+num p.y+","+num p.z+"]"
 fn tfstr n=(
  local t=n.transform;local q=t.rotation;local det=dot t.row1 (cross t.row2 t.row3)
  local sc=t.scalepart*(if det<0 then -1.0 else 1.0)
  "{\"p\":"+vec t.row4+",\"q\":["+num q.x+","+num q.y+","+num q.z+","+num q.w+"],\"scale\":"+vec sc+"}"
 )
 fn transformsString names=(local s="{";for i=1 to names.count do (if i>1 do s+=",";s+="\""+names[i]+"\":"+tfstr(getNodeByName names[i]));s+"}")
 fn restoreInputs=(jawY.value=savedJawY;for i=1 to tracks.count do for j=1 to 3 do tracks[i][j].value=savedRaw[i][j])
 fn morphDiff=(
  local s="[";local count=0
  for m in morphs do (local value=WM3_MC_GetValue m[1] m[2];if abs(value-m[3])>0.00001 do (if count>0 do s+=",";s+="{\"object\":\""+m[4]+"\",\"channel\":"+(m[2] as string)+",\"baseline\":"+num m[3]+",\"value\":"+num value+"}";count+=1))
  s+"]"
 )
 fn sampleString values=(
  for i=1 to ns.count do ns[i].position.controller[2].value=values[i]
  local s="{\"inputs\":["
  for i=1 to ns.count do (if i>1 do s+=",";s+=vec ns[i].position.controller[2].value)
  s+"],\"bones\":"+transformsString bs+",\"helpers\":"+transformsString helpers+",\"handles\":"+transformsString names+",\"morph_changes\":"+morphDiff()+"}"
 )
 try (
  with animate off at time 0 (
   jawY.value=0
   for n in ns do n.position.controller[2].value=[0,0,0]
   for n in geometry do for m in n.modifiers where classof m==Morpher do for ch=1 to 100 where WM3_MC_HasData m ch do append morphs #(m,ch,WM3_MC_GetValue m ch,n.name)
   out="{\"scene\":\""+substituteString (maxFilePath+maxFileName) "\\" "/"+"\",\"frame\":0,\"preserved_jaw_move_y\":"+num savedJawY+",\"bones_checked\":149,\"morph_channels_checked\":"+(morphs.count as string)+",\"baseline\":"+transformsString bs+",\"helper_rest\":"+transformsString helpers+",\"controls\":["
   for ci=1 to ns.count do (
    if ci>1 do out+=","
    out+="{\"source\":\""+names[ci]+"\",\"rest\":"+tfstr ns[ci]+",\"parent_rest\":"+tfstr ns[ci].parent+",\"saved_raw\":["
    for j=1 to 3 do (if j>1 do out+=",";out+=num savedRaw[ci][j])
    out+="]}"
   )
   local lo=[0,-6,-1];local hi=[5,0,1]
   out+="],\"minimum\":"+vec lo+",\"maximum\":"+vec hi+",\"samples\":["
   local count=0
   for ax=1 to 3 do for step in #(lo[ax],lo[ax]*0.75,lo[ax]*0.5,lo[ax]*0.125,0,hi[ax]*0.125,hi[ax]*0.5,hi[ax]*0.75,hi[ax]) do (
    local values=for n in ns collect [0,0,0];values[1][ax]=step
    if count>0 do out+=",";out+=sampleString values;count+=1
   )
   for x in #(0,5) do for y in #(-6,0) do for z in #(-1,1) do (
    local values=for n in ns collect [0,0,0];values[1]=[x,y,z];out+=","+sampleString values
   )
   for step=1 to 20 do (
    local values=for n in ns collect [0,0,0];values[1]=[2.5+2.5*sin(step*31),-3-3*cos(step*43),sin(step*67)];out+=","+sampleString values
   )
   out+="],\"mixed_samples\":["
   for step=1 to 20 do (
    local values=for n in ns collect [0,0,0]
    values[1]=[2.5+2.5*sin(step*29),-3-3*cos(step*37),sin(step*41)]
    for ci=2 to 4 do values[ci]=[sin(step*31+ci*17),cos(step*43+ci*9),sin(step*67+ci*5)]
    values[5]=[0.3,sin(step*29),cos(step*37)]
    values[6]=[sin(step*41),0,cos(step*31)];values[7]=[cos(step*33),0,sin(step*49)]
    for ci=8 to 13 do values[ci]=[0,(if ci<=10 then 1 else -1)*(0.5+0.5*sin(step*23+ci*17)),0]
    for ci=14 to 16 do values[ci]=[4*sin(step*31+ci*17),5*cos(step*43+ci*9),5*sin(step*67+ci*5)]
    for ci=17 to 20 do values[ci]=[0,if ci<19 then -1.75*(0.5+0.5*sin(step*23+ci*17)) else -1.72*(0.5+0.5*sin(step*29+ci*11)),0]
    if step>1 do out+=","
    local sample=sampleString values
    values[1]=[0,0,0]
    local without=sampleString values
    out+=(substring sample 1 (sample.count-1))+",\"without_chin\":"+without+"}"
   )
   out+="]}"
  )
 )catch(failure=getCurrentException())
 with animate off at time 0 restoreInputs()
 at time 0 (for i=1 to tracks.count do for j=1 to 3 do if abs(tracks[i][j].value-savedRaw[i][j])>0.00000001 do throw ("Restore failed "+names[i]))
 if abs((at time 0 jawY.value)-savedJawY)>0.00000001 do throw "Restore jaw_move failed"
 if failure!=undefined do throw failure
 local f=createFile (FaceMigrationTempDir + "chin_samples_raw.json");format "%" out to:f;close f
 "Saved chin_samples_raw.json; inputs restored"
)
