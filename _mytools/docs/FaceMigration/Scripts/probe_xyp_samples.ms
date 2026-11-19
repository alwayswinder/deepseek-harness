-- XYP 采样：只临时修改 position_list 第 2 层，异常路径也恢复；不保存场景。
(
    local names = #("XYP_R001", "XYP_L001", "SYP_R001", "SYP_L001")
    local ns = for nm in names collect getNodeByName nm
    local saved = for n in ns collect n.position.controller[2].value
    local out = ""
    local failure = undefined
    fn num x = formattedPrint x format:".9f"
    fn vec p = "[" + num p.x + "," + num p.y + "," + num p.z + "]"
    fn quatstr q = "[" + num q.x + "," + num q.y + "," + num q.z + "," + num q.w + "]"
    fn tfstr n = (
        local t = n.transform
        "{\"p\":" + vec t.row4 + ",\"q\":" + quatstr t.rotation + ",\"scale\":" + vec t.scalepart + "}"
    )
    fn restoreInputs = (for i=1 to ns.count do ns[i].position.controller[2].value=saved[i])
    try (
        with animate off at time 0 (
            for n in ns do n.position.controller[2].value=[0,0,0]
            out="{\"scene\":\"" + substituteString (maxFilePath+maxFileName) "\\" "/" + "\",\"frame\":0,\"input_axis\":\"position_list[2].Y\",\"limit\":[-1.72,0],\"sides\":["
            for side=1 to 2 do (
                local pivot=getNodeByName (if side==1 then "Point163" else "Point162")
                local bs=if side==1 then #("Bone030","Bone031","Bone032") else #("Bone039","Bone040","Bone041")
                if side>1 do out+=","
                out+="{\"controller\":\""+names[side]+"\",\"control_rest\":"+tfstr ns[side]+",\"pivot_name\":\""+pivot.name+"\",\"samples\":["
                for step=0 to 32 do (
                    ns[side].position.controller[2].value=[0,-1.72*step/32,0]
                    if step>0 do out+=","
                    out+="{\"s\":"+num(step/32.0)+",\"input\":"+vec ns[side].position.controller[2].value+",\"pivot\":"+tfstr pivot+",\"bones\":{"
                    for bi=1 to bs.count do (
                        if bi>1 do out+=","
                        out+="\""+bs[bi]+"\":"+tfstr(getNodeByName bs[bi])
                    )
                    out+="}}"
                )
                ns[side].position.controller[2].value=[0,0,0]
                out+="]}"
            )
            out+="],\"combo\":["
            for step=1 to 3 do (
                local s=step/3.0
                for side=1 to 2 do (
                    ns[side].position.controller[2].value=[0,-1.72*s,0]
                    ns[side+2].position.controller[2].value=[0,-1.75*s,0]
                )
                if step>1 do out+=","
                out+="{\"s\":"+num s+",\"bones\":{"
                local bs=#("Bone027","Bone028","Bone029","Bone030","Bone031","Bone032","Bone036","Bone037","Bone038","Bone039","Bone040","Bone041")
                for bi=1 to bs.count do (
                    if bi>1 do out+=","
                    out+="\""+bs[bi]+"\":"+tfstr(getNodeByName bs[bi])
                )
                out+="}}"
            )
            out+="]}"
            restoreInputs()
        )
    ) catch (failure=getCurrentException())
    with animate off at time 0 restoreInputs()
    for i=1 to ns.count do (
        if distance ns[i].position.controller[2].value saved[i]>0.00001 do throw ("Restore failed: "+names[i])
    )
    if failure!=undefined do throw failure
    out
)
