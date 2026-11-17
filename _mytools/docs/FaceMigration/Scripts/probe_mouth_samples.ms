-- Run via max_run.ps1; paths are supplied by the target project/job.
if FaceMigrationTempDir == undefined do throw "Use FaceMigration max_run.ps1 or supply FaceMigrationTempDir"
-- Mouth position inputs. Preserve underlying raw values; never save the Max scene.
(
    local names=#("Animcraft_Left_Mouth_Ctrl","Animcraft_Right_Mouth_Ctrl","Animcraft_Mouth_Ctrl","Animcraft_Nose_Ctrl","Animcraft_Right_Cheek_Ctrl","Animcraft_Left_Cheek_Ctrl","Animcraft_Left_up_Lip_Ctrl","Animcraft_up_Lip_Ctrl","Animcraft_Right_up_Lip_Ctrl","Animcraft_Right_low_Lip_Ctrl","Animcraft_dn_Lip_Ctrl","Animcraft_Left_low_Lip_Ctrl")
    local ns=for nm in names collect getNodeByName nm
    local saved=at time 0 (for n in ns collect n.position.controller[2].value)
    local savedRaw=at time 0 (for n in ns collect (for j=1 to 3 collect n.position.controller[2].controller[j].controller[1].controller.value))
    local boneFile=openFile (FaceMigrationTempDir + "cheek_bone_names.txt")
    local bs=#()
    while not eof boneFile do append bs (readLine boneFile)
    close boneFile
    for nm in bs do if getNodeByName nm==undefined do throw ("Missing bone: "+nm)
    local morphs=#()
    local jawY=(getNodeByName "jaw_move").position.controller[2].controller[2].controller
    local savedJawY=at time 0 jawY.value
    local failure=undefined
    local out=""
    fn num x=(
        if classof x==Integer do x=x as float
        if abs x<0.00001 then (formattedPrint (x*1000000000.0) format:".9f")+"e-9"
        else formattedPrint x format:".9g"
    )
    fn vec p="["+num p.x+","+num p.y+","+num p.z+"]"
    fn tfstr n=(
        local t=n.transform
        local q=t.rotation
        local det=dot t.row1 (cross t.row2 t.row3)
        local kp=undefined
        try(kp=n.transform.controller.getNode 1; kp=kp.parent)catch()
        local extra=""
        if kp!=undefined and matchPattern kp.name pattern:"KPoint*" do (
            local layer=if kp.name=="KPoint014" then 1 else 2
            local e=kp.rotation.controller[layer].controller.value as eulerAngles
            extra=",\"kpoint\":\""+kp.name+"\",\"euler\":"+vec [e.x,e.y,e.z]
        )
        local scale=t.scalepart*(if det<0 then -1.0 else 1.0)
        "{\"p\":"+vec t.row4+",\"q\":["+num q.x+","+num q.y+","+num q.z+","+num q.w+"]"+extra+",\"scale\":"+vec scale+"}"
    )
    fn restoreInputs=(
        jawY.value=savedJawY
        for i=1 to ns.count do for j=1 to 3 do ns[i].position.controller[2].controller[j].controller[1].controller.value=savedRaw[i][j]
    )
    fn bonesString=(
        local s="{"
        for i=1 to bs.count do (if i>1 do s+=","; s+="\""+bs[i]+"\":"+tfstr(getNodeByName bs[i]))
        s+"}"
    )
    fn morphDiff=(
        local s="["
        local count=0
        for m in morphs do (
            local v=WM3_MC_GetValue m[1] m[2]
            if abs(v-m[3])>0.00001 do (
                if count>0 do s+="," 
                s+="{\"object\":\""+m[4]+"\",\"channel\":"+(m[2] as string)+",\"baseline\":"+num m[3]+",\"value\":"+num v+"}"
                count+=1
            )
        )
        s+"]"
    )
    fn sampleString values=(
        for i=1 to ns.count do ns[i].position.controller[2].value=values[i]
        local ss="{\"inputs\":["
        for i=1 to ns.count do (if i>1 do ss+=",";ss+=vec ns[i].position.controller[2].value)
        ss+"],\"bones\":"+bonesString()+",\"morph_changes\":"+morphDiff()+"}"
    )
    try (
        with animate off at time 0 (
            jawY.value=0
            for n in ns do n.position.controller[2].value=[0,0,0]
            for n in geometry do for m in n.modifiers where classof m==Morpher do for ch=1 to 100 where WM3_MC_HasData m ch do append morphs #(m,ch,WM3_MC_GetValue m ch,n.name)
            out="{\"scene\":\""+substituteString (maxFilePath+maxFileName) "\\" "/"+"\",\"frame\":0,\"preserved_jaw_move_y\":"+num savedJawY+",\"bones_checked\":"+(bs.count as string)+",\"morph_channels_checked\":"+(morphs.count as string)+",\"baseline\":"+bonesString()+",\"controls\":["
            for ci=1 to ns.count do (
                if ci>1 do out+=","
                out+="{\"source\":\""+names[ci]+"\",\"rest\":"+tfstr ns[ci]+",\"saved_effective\":"+vec saved[ci]+",\"saved_raw\":["
                for j=1 to 3 do (if j>1 do out+=",";out+=num savedRaw[ci][j])
                out+="],\"minimum\":["
                for j=1 to 3 do (if j>1 do out+=",";out+=num ns[ci].position.controller[2].controller[j].controller.lower_limit)
                out+="],\"maximum\":["
                for j=1 to 3 do (if j>1 do out+=",";out+=num ns[ci].position.controller[2].controller[j].controller.upper_limit)
                out+="]}"
            )
            out+="],\"samples\":["
            local count=0
            for ci=1 to 3 do for ax=1 to 3 do (
                local lim=ns[ci].position.controller[2].controller[ax].controller
                local steps=#(lim.lower_limit,lim.lower_limit*0.75,lim.lower_limit*0.5,lim.lower_limit*0.125,0,lim.upper_limit*0.125,lim.upper_limit*0.5,lim.upper_limit*0.75,lim.upper_limit)
                for step in steps do (
                    local values=for n in ns collect [0,0,0]
                    values[ci][ax]=step
                    if count>0 do out+=","
                    out+=sampleString values
                    count+=1
                )
            )
            for ci=1 to 3 do for x in #(-1,1) do for y in #(-1,1) do for z in #(-1,1) do (
                local values=for n in ns collect [0,0,0]
                values[ci]=if ci<3 then [(if x<0 then -2 else 3),(if y<0 then -1.5 else 1.8),z] else [x,y,z]
                out+=","+sampleString values
            )
            for step=1 to 20 do (
                local values=for n in ns collect [0,0,0]
                for ci=1 to 3 do values[ci]=[(sin(step*31+ci*17))*(if ci<3 then 1.95 else 1),(cos(step*43+ci*9))*(if ci<3 then 1.45 else 1),sin(step*67+ci*5)]
                out+=","+sampleString values
            )
            out+="],\"mixed_samples\":["
            for step=1 to 12 do (
                local values=for n in ns collect [0,0,0]
                for ci=1 to 3 do values[ci]=[sin(step*31+ci*17),cos(step*43+ci*9),sin(step*67+ci*5)]
                values[4]=[0.3,sin(step*29),cos(step*37)]
                values[5]=[sin(step*41),0,cos(step*31)]
                values[6]=[cos(step*33),0,sin(step*49)]
                for ci=7 to 12 do values[ci]=[0,(if ci<=9 then 1 else -1)*(0.5+0.5*sin(step*23+ci*17)),0]
                if step>1 do out+=","
                out+=sampleString values
            )
            out+="]}"
            restoreInputs()
        )
    ) catch (failure=getCurrentException())
    with animate off at time 0 restoreInputs()
    if abs((at time 0 jawY.value)-savedJawY)>0.00000001 do throw "Restore jaw_move Y failed"
    at time 0 (for i=1 to ns.count do for j=1 to 3 do if abs(ns[i].position.controller[2].controller[j].controller[1].controller.value-savedRaw[i][j])>0.00000001 do throw ("Restore raw input failed: "+names[i]))
    if failure!=undefined do throw failure
    local file=createFile (FaceMigrationTempDir + "mouth_samples_raw.json")
    format "%" out to:file
    close file
    "Saved mouth_samples_raw.json; inputs restored"
)
