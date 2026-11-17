-- Run via max_run.ps1; paths are supplied by the target project/job.
if FaceMigrationTempDir == undefined do throw "Use FaceMigration max_run.ps1 or supply FaceMigrationTempDir"
-- Position-list input sampling at frame zero, always restore underlying input tracks.
(
    local names=#("YanJing_L001","YanJing_R001","YanJing_Zong001","SYP_L001","SYP_R001","XYP_L001","XYP_R001")
    local ns=for nm in names collect getNodeByName nm
    local tracks=for n in ns collect (for j=1 to 3 collect (local c=n.position.controller[2].controller[j].controller;if classof c==float_limit then c[1].controller else c))
    local savedRaw=at time 0 (for tt in tracks collect (for c in tt collect c.value))
    local helpers=#("Point514","Point513","Point164","Point004","Point163","Point162")
    local bs=#()
    local boneFile=openFile (FaceMigrationTempDir + "cheek_bone_names.txt")
    while not eof boneFile do append bs (readLine boneFile)
    close boneFile
    if bs.count!=149 do throw "Expected 149 bones"
    for nm in bs do if getNodeByName nm==undefined do throw ("Missing bone "+nm)
    local morphs=#()
    local failure=undefined
    local out=""
    fn num x=(if abs x<0.00001 then (formattedPrint (x*1000000000.0) format:".9f")+"e-9" else formattedPrint x format:".9g")
    fn vec p="["+num p.x+","+num p.y+","+num p.z+"]"
    fn tfstr n=(
        local t=n.transform
        local q=t.rotation
        local det=dot t.row1 (cross t.row2 t.row3)
        local sc=t.scalepart*(if det<0 then -1.0 else 1.0)
        "{\"p\":"+vec t.row4+",\"q\":["+num q.x+","+num q.y+","+num q.z+","+num q.w+"],\"scale\":"+vec sc+"}"
    )
    fn restoreInputs=(for i=1 to tracks.count do for j=1 to 3 do tracks[i][j].value=savedRaw[i][j])
    fn transformsString names=(
        local s="{"
        for i=1 to names.count do (if i>1 do s+=",";s+="\""+names[i]+"\":"+tfstr(getNodeByName names[i]))
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
        ss+"],\"bones\":"+transformsString bs+",\"helpers\":"+transformsString helpers+",\"handles\":"+transformsString names+",\"morph_changes\":"+morphDiff()+"}"
    )
    try (
        with animate off at time 0 (
            for n in ns do n.position.controller[2].value=[0,0,0]
            for n in geometry do for m in n.modifiers where classof m==Morpher do for ch=1 to 100 where WM3_MC_HasData m ch do append morphs #(m,ch,WM3_MC_GetValue m ch,n.name)
            out="{\"scene\":\""+substituteString (maxFilePath+maxFileName) "\\" "/"+"\",\"frame\":0,\"bones_checked\":"+(bs.count as string)+",\"morph_channels_checked\":"+(morphs.count as string)+",\"baseline\":"+transformsString bs+",\"helper_rest\":"+transformsString helpers+",\"controls\":["
            for ci=1 to ns.count do (
                if ci>1 do out+=","
                out+="{\"source\":\""+names[ci]+"\",\"rest\":"+tfstr ns[ci]+",\"parent_rest\":"+tfstr ns[ci].parent+",\"saved_raw\":["
                for j=1 to 3 do (if j>1 do out+=",";out+=num savedRaw[ci][j])
                out+="]}"
            )
            out+="],\"samples\":["
            local count=0
            for ci=3 to 3 do for ax=1 to 3 do for step=0 to 8 do (
                local values=for n in ns collect [0,0,0]
                values[ci][ax]=-10+step*2.5
                if count>0 do out+=","
                out+=sampleString values
                count+=1
            )
            for ci=3 to 3 do for x in #(-10,10) do for y in #(-10,10) do for z in #(-10,10) do (
                local values=for n in ns collect [0,0,0]
                values[ci]=[x,y,z]
                out+=","+sampleString values
            )
            for step=1 to 12 do (
                local values=for n in ns collect [0,0,0]
                for ci=1 to 3 do values[ci]=[7*sin(step*31+ci*17),9*cos(step*43+ci*9),9*sin(step*67+ci*5)]
                out+=","+sampleString values
            )
            out+="],\"lid_samples\":["
            for step=1 to 20 do (
                local values=for n in ns collect [0,0,0]
                for ci=1 to 3 do values[ci]=[5*sin(step*31+ci*17),8*cos(step*43+ci*9),8*sin(step*67+ci*5)]
                for ci=4 to 7 do values[ci]=[0,if ci<6 then -1.75*(0.5+0.5*sin(step*23+ci*17)) else -1.72*(0.5+0.5*sin(step*29+ci*11)),0]
                if step>1 do out+=","
                out+=sampleString values
            )
            out+="]}"
        )
    ) catch (failure=getCurrentException())
    with animate off at time 0 restoreInputs()
    at time 0 (for i=1 to tracks.count do for j=1 to 3 do if abs(tracks[i][j].value-savedRaw[i][j])>0.00000001 do throw ("Restore failed: "+names[i]))
    if failure!=undefined do throw failure
    local f=createFile (FaceMigrationTempDir + "gaze_master_samples_raw.json")
    format "%" out to:f
    close f
    "Saved gaze_master_samples_raw.json; source inputs restored"
)
