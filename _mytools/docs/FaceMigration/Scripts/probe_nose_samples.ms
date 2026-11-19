-- Run via max_run.ps1; paths are supplied by the target project/job.
if FaceMigrationTempDir == undefined do throw "Use FaceMigration max_run.ps1 or supply FaceMigrationTempDir"
-- Nose active Position List layer 2. Preserve raw values beneath Float Limit.
(
    local names=#("Animcraft_Nose_Ctrl","Animcraft_Right_Cheek_Ctrl","Animcraft_Left_Cheek_Ctrl","Animcraft_Left_up_Lip_Ctrl","Animcraft_up_Lip_Ctrl","Animcraft_Right_up_Lip_Ctrl","Animcraft_Right_low_Lip_Ctrl","Animcraft_dn_Lip_Ctrl","Animcraft_Left_low_Lip_Ctrl")
    local ns=for nm in names collect getNodeByName nm
    local saved=for n in ns collect n.position.controller[2].value
    local savedRaw=for n in ns collect (for j=1 to 3 collect n.position.controller[2].controller[j].controller[1].controller.value)
    local boneFile=openFile (FaceMigrationTempDir + "cheek_bone_names.txt")
    local bs=#()
    while not eof boneFile do append bs (readLine boneFile)
    close boneFile
    for nm in bs do if getNodeByName nm==undefined do throw ("Missing bone: "+nm)
    local morphs=#()
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
        local scale=t.scalepart*(if det<0 then -1.0 else 1.0)
        "{\"p\":"+vec t.row4+",\"q\":["+num q.x+","+num q.y+","+num q.z+","+num q.w+"],\"scale\":"+vec scale+"}"
    )
    fn restoreInputs=(for i=1 to ns.count do for j=1 to 3 do ns[i].position.controller[2].controller[j].controller[1].controller.value=savedRaw[i][j])
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
    fn sampleString v=(
        ns[1].position.controller[2].value=v
        "{\"input\":"+vec ns[1].position.controller[2].value+",\"handle\":"+tfstr ns[1]+",\"bones\":"+bonesString()+",\"morph_changes\":"+morphDiff()+"}"
    )
    try (
        with animate off at time 0 (
            for n in ns do n.position.controller[2].value=[0,0,0]
            for n in geometry do for m in n.modifiers where classof m==Morpher do for ch=1 to 100 where WM3_MC_HasData m ch do append morphs #(m,ch,WM3_MC_GetValue m ch,n.name)
            out="{\"scene\":\""+substituteString (maxFilePath+maxFileName) "\\" "/"+"\",\"frame\":0,\"bones_checked\":"+(bs.count as string)+",\"morph_channels_checked\":"+(morphs.count as string)+",\"source\":\""+names[1]+"\",\"control_rest\":"+tfstr ns[1]+",\"baseline\":"+bonesString()+",\"preserved_inputs\":["
            for i=1 to ns.count do (
                if i>1 do out+="," 
                out+="{\"source\":\""+names[i]+"\",\"effective\":"+vec saved[i]+",\"raw\":["
                for j=1 to 3 do (if j>1 do out+=",";out+=num savedRaw[i][j])
                out+="]}"
            )
            out+="],\"samples\":["
            local count=0
            for ax=1 to 3 do for step=0 to 8 do (
                local v=[0,0,0]
                v[ax]=if ax==1 then step/8.0 else -1+step/4.0
                if count>0 do out+="," 
                out+=sampleString v
                count+=1
            )
            for x in #(0,1) do for y in #(-1,1) do for z in #(-1,1) do out+=","+sampleString [x,y,z]
            for v in #([0.35,-0.7,0.2],[0.82,0.25,-0.65],[0.6,0.9,0.4],[0.15,-0.3,-0.8],[0,0,0],[0.001,-0.001,0.001]) do out+=","+sampleString v
            out+="]}"
            restoreInputs()
        )
    ) catch (failure=getCurrentException())
    with animate off at time 0 restoreInputs()
    for i=1 to ns.count do for j=1 to 3 do if abs(ns[i].position.controller[2].controller[j].controller[1].controller.value-savedRaw[i][j])>0.00000001 do throw ("Restore raw input failed: "+names[i])
    if failure!=undefined do throw failure
    out
)
