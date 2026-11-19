-- Six lip inputs: temporary sampling only, with restoration on success/failure.
(
    local names=#("Animcraft_Left_up_Lip_Ctrl","Animcraft_up_Lip_Ctrl","Animcraft_Right_up_Lip_Ctrl","Animcraft_Right_low_Lip_Ctrl","Animcraft_dn_Lip_Ctrl","Animcraft_Left_low_Lip_Ctrl")
    local bs=#("Bone016","Bone017","Bone018","Bone019","Bone020","Bone021","Bone022","Bone023","shangzuichun","xiazuichun","renzhong_L","renzhong_R")
    local ns=for nm in names collect getNodeByName nm
    local saved=for n in ns collect n.position.controller[2].value
    local morphs=#()
    local out=""
    local failure=undefined
    fn num x=formattedPrint (x as float) format:".9f"
    fn vec p="["+num p.x+","+num p.y+","+num p.z+"]"
    fn tfstr n=(
        local t=n.transform
        local q=t.rotation
        local determinant=dot t.row1 (cross t.row2 t.row3)
        local signedScale=t.scalepart*(if determinant<0 then -1.0 else 1.0)
        "{\"p\":"+vec t.row4+",\"q\":["+num q.x+","+num q.y+","+num q.z+","+num q.w+"],\"scale\":"+vec signedScale+",\"determinant\":"+num determinant+"}"
    )
    fn restoreInputs=(for i=1 to ns.count do ns[i].position.controller[2].value=saved[i])
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
    try (
        with animate off at time 0 (
            for n in ns do n.position.controller[2].value=[0,0,0]
            for n in geometry do for m in n.modifiers where classof m==Morpher do for ch=1 to 100 where WM3_MC_HasData m ch do append morphs #(m,ch,WM3_MC_GetValue m ch,n.name)
            out="{\"scene\":\""+substituteString (maxFilePath+maxFileName) "\\" "/"+"\",\"frame\":0,\"morph_channels_checked\":"+(morphs.count as string)+",\"baseline\":"+bonesString()+",\"controls\":["
            for ci=1 to ns.count do (
                if ci>1 do out+=","
                local sign=if ci<=3 then 1 else -1
                out+="{\"source\":\""+names[ci]+"\",\"sign\":"+(sign as string)+",\"rest\":"+tfstr ns[ci]+",\"samples\":["
                for step=0 to 8 do (
                    ns[ci].position.controller[2].value=[0,sign*step/8.0,0]
                    if step>0 do out+=","
                    out+="{\"s\":"+num(step/8.0)+",\"input\":"+vec ns[ci].position.controller[2].value+",\"bones\":"+bonesString()+",\"morph_changes\":"+morphDiff()+"}"
                )
                ns[ci].position.controller[2].value=[0,0,0]
                out+="]}"
            )
            out+="],\"combinations\":["
            local combos=#(#(1,1,1,1,1,1),#(1,1,1,0,0,0),#(0,0,0,1,1,1),#(0.2,0.8,0.4,0.9,0.3,0.6),#(0.83,0.17,0.61,0.26,0.72,0.48),#(0,0,0,0,0,0))
            for ci=1 to combos.count do (
                local ss=combos[ci]
                for i=1 to ns.count do ns[i].position.controller[2].value=[0,(if i<=3 then 1 else -1)*ss[i],0]
                if ci>1 do out+=","
                out+="{\"s\":["
                for i=1 to ss.count do (if i>1 do out+=","; out+=num ss[i])
                out+="],\"bones\":"+bonesString()+",\"morph_changes\":"+morphDiff()+"}"
            )
            out+="]}"
            restoreInputs()
        )
    ) catch (failure=getCurrentException())
    with animate off at time 0 restoreInputs()
    for i=1 to ns.count do if distance ns[i].position.controller[2].value saved[i]>0.00001 do throw ("Restore failed: "+names[i])
    if failure!=undefined do throw failure
    out
)
