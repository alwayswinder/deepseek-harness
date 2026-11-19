-- Run via max_run.ps1; paths are supplied by the target project/job.
if FaceMigrationTempDir == undefined do throw "Use FaceMigration max_run.ps1 or supply FaceMigrationTempDir"
-- Cheek X/Z scans and simultaneous inputs; restore exact original values.
(
    local names=#("Animcraft_Right_Cheek_Ctrl","Animcraft_Left_Cheek_Ctrl")
    local ns=for nm in names collect getNodeByName nm
    local saved=for n in ns collect n.position.controller[2].value
    local lips=for nm in #("Animcraft_Left_up_Lip_Ctrl","Animcraft_up_Lip_Ctrl","Animcraft_Right_up_Lip_Ctrl","Animcraft_Right_low_Lip_Ctrl","Animcraft_dn_Lip_Ctrl","Animcraft_Left_low_Lip_Ctrl") collect getNodeByName nm
    local savedLips=for n in lips collect n.position.controller[2].value
    local boneFile=openFile (FaceMigrationTempDir + "cheek_bone_names.txt")
    local bs=#()
    while not eof boneFile do append bs (readLine boneFile)
    close boneFile
    local missing=for nm in bs where getNodeByName nm==undefined collect nm
    bs=for nm in bs where getNodeByName nm!=undefined collect nm
    local morphs=#()
    local out=""
    local failure=undefined
    fn num x=(
        if classof x==Integer do x=x as float
        if abs x<0.00001 then (formattedPrint (x*1000000000.0) format:".9g")+"e-9"
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
    fn restoreInputs=(
        for i=1 to ns.count do ns[i].position.controller[2].value=saved[i]
        for i=1 to lips.count do lips[i].position.controller[2].value=savedLips[i]
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
    fn sampleString inputs=(
        for i=1 to ns.count do ns[i].position.controller[2].value=inputs[i]
        "{\"input\":["+vec inputs[1]+","+vec inputs[2]+"],\"bones\":"+bonesString()+",\"morph_changes\":"+morphDiff()+"}"
    )
    try (
        with animate off at time 0 (
            for n in ns do n.position.controller[2].value=[0,0,0]
            for n in lips do n.position.controller[2].value=[0,0,0]
            for n in geometry do for m in n.modifiers where classof m==Morpher do for ch=1 to 100 where WM3_MC_HasData m ch do append morphs #(m,ch,WM3_MC_GetValue m ch,n.name)
            out="{\"scene\":\""+substituteString (maxFilePath+maxFileName) "\\" "/"+"\",\"frame\":0,\"morph_channels_checked\":"+(morphs.count as string)+",\"bones_checked\":"+(bs.count as string)+",\"missing\":["
            for i=1 to missing.count do (if i>1 do out+=","; out+="\""+missing[i]+"\"")
            out+="],\"temporarily_neutralized\":["
            for i=1 to lips.count do (
                if i>1 do out+="," 
                out+="{\"source\":\""+lips[i].name+"\",\"saved_input\":"+vec savedLips[i]+"}"
            )
            out+="],\"baseline\":"+bonesString()+",\"controls\":["
            for ci=1 to ns.count do (
                if ci>1 do out+=","
                out+="{\"source\":\""+names[ci]+"\",\"rest\":"+tfstr ns[ci]+",\"frozen_input\":"+vec ns[ci].position.controller[1].value+",\"basis_x\":"+vec ns[ci].transform.row1+",\"basis_z\":"+vec ns[ci].transform.row3+",\"saved_input\":"+vec saved[ci]+"}"
            )
            out+="],\"samples\":["
            local count=0
            for ci=1 to ns.count do for ax in #(1,3) do for step=-4 to 4 do (
                local inputs=#([0,0,0],[0,0,0])
                inputs[ci][ax]=step/4.0
                if count>0 do out+="," 
                out+=sampleString inputs
                count+=1
            )
            local combos=#(#([1,0,1],[1,0,1]),#([-1,0,-1],[-1,0,-1]),#([1,0,-1],[-1,0,1]),#([-1,0,1],[1,0,-1]),#([0.25,0,0.75],[-0.6,0,0.3]),#([-0.7,0,0.4],[0.85,0,-0.2]),#([0,0,0],[0,0,0]),#([0.001,0,-0.001],[-0.001,0,0.001]))
            for inputs in combos do out+=","+sampleString inputs
            -- The eye-bag expression gates the Z contribution on X >= 0,
            -- including the tiny frozen position offset on the source control.
            for x in #(-0.000001,-0.0000001,0,0.0000001,0.000001) do (
                out+=","+sampleString #([x,0,-1],[x,0,1])
                out+=","+sampleString #([x,0,1],[x,0,-1])
            )
            out+="]}"
            restoreInputs()
        )
    ) catch (failure=getCurrentException())
    with animate off at time 0 restoreInputs()
    for i=1 to ns.count do if distance ns[i].position.controller[2].value saved[i]>0.000001 do throw ("Restore failed: "+names[i])
    for i=1 to lips.count do if distance lips[i].position.controller[2].value savedLips[i]>0.000001 do throw ("Restore failed: "+lips[i].name)
    if failure!=undefined do throw failure
    out
)
