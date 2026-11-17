(
    local TARGETS = #("zCircle051", "zCircle052", "zCircle053")
    local out = ""
    fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")
    fn getPos o =
    (
        local p = [0,0,0]
        try ( p = (o.transform).row4 ) catch ( try ( p = o.pos ) catch () )
        p
    )
    fn snapAll = ( for o in objects collect (getPos o) )
    fn diffReport base cur =
    (
        local s = ""
        local hits = 0
        for i = 1 to objects.count do
        (
            local d = cur[i] - base[i]
            if (length d) > 0.002 do
            (
                hits += 1
                if hits <= 15 do s += "   " + objects[i].name + " d=" + ((d as string)) + "\n"
            )
        )
        "   hits=" + (hits as string) + "\n" + s
    )

    out += "scene=" + maxFileName + "\n"
    for nm in TARGETS do
    (
        local n = getNodeByName nm
        if n == undefined then out += "MISSING " + nm + "\n"
        else
        (
            -- A1/A2: 结构
            local par = "-"
            try ( par = n.parent.name ) catch ()
            out += "## " + nm + " (" + ((classOf n) as string) + ") parent=" + par + " wpos=" + (pstr (getPos n)) + "\n"
            try (
                local pc = n.parent.position.controller
                for i = 1 to pc.count do
                (
                    local sc = "-"
                    try ( sc = (classOf pc[i].controller) as string ) catch ( sc = (classOf pc[i]) as string )
                    out += "   pos[" + (i as string) + "] " + sc + "\n"
                    if (findString sc "Expression") != undefined do
                        try ( out += "      expr=" + (pc[i].controller.getExpression()) + "\n" ) catch ()
                )
            ) catch ()

            -- A3: 世界移动矩阵
            local base = snapAll()
            local saved = n.transform
            for ax in #([10,0,0], [0,10,0], [0,0,10]) do
            (
                move n ax
                out += "  +" + (pstr ax) + "\n" + (diffReport base (snapAll()))
                n.transform = saved
            )
        )
    )
    out
)
