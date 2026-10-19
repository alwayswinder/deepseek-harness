-- Generated from a measured profile. Loading only inspects the current scene.
global DSHBody55Run
fn DSHBody55Run action:#preflight = (
    local records = #(@@NODES@@)
    local meshes = #(@@MESHES@@)
    local sourcePath = @@SOURCE@@
    local copyPath = @@COPY@@
    local layerName = @@LAYER@@
    local tolerance = 1e-4

    fn exactNode name = (
        local matches = for n in objects where (stricmp n.name name == 0) collect n
        if matches.count != 1 do throw ("Expected one node named " + name)
        matches[1]
    )
    fn matrixDifference a b = (
        local error = 0.0
        for i = 1 to 4 do error = amax error (distance a[i] b[i])
        error
    )
    fn checkMeshes specs tolerance exactNode matrixDifference = (
        for spec in specs do (
            local n = exactNode spec[1]
            if (superclassof n) != GeometryClass do throw ("Expected static geometry: " + n.name)
            if n.modifiers.count != 0 or n.isAnimated do throw ("Expected an unmodified, unanimated mesh: " + n.name)
            local m = snapshotAsMesh n
            if m.numverts != spec[2] or m.numfaces != spec[3] do throw ("Mesh topology differs from the profile: " + n.name)
            if (matrixDifference n.transform spec[4]) > tolerance do throw ("Mesh transform differs from the profile: " + n.name)
        )
        true
    )
    fn verify records tolerance exactNode matrixDifference = (
        local maxError = 0.0
        for record in records do (
            local n = exactNode record[1]
            local parentName = if n.parent == undefined then "-" else n.parent.name
            if parentName != record[2] do throw ("Unexpected parent for " + n.name)
            if (classof n) != Dummy do throw ("Expected Dummy: " + n.name)
            if (classof n.position.controller) != Position_XYZ or (classof n.rotation.controller) != Euler_XYZ do throw ("Expected free position and rotation: " + n.name)
            if n.isAnimated do throw ("Unexpected animation on " + n.name)
            if (distance n.scale [1,1,1]) > tolerance do throw ("Expected unit scale: " + n.name)
            local error = matrixDifference n.transform record[3]
            if error > tolerance do throw ("Rest matrix differs from the profile: " + n.name)
            maxError = amax maxError error
        )
        maxError
    )
    fn poseTest records tolerance exactNode matrixDifference = (
        local nodes = for record in records collect (exactNode record[1])
        local rest = for n in nodes collect n.transform
        local root = exactNode "Root"
        local rootRest = root.transform
        local moveError = 0.0
        local resetError = 0.0
        with animate off (
            try (
                root.position += [0,0,10]
                completeRedraw()
                for i = 1 to nodes.count do moveError = amax moveError (distance nodes[i].transform.pos (rest[i].pos + [0,0,10]))
                root.transform = rootRest
                completeRedraw()
            ) catch (
                root.transform = rootRest
                completeRedraw()
                throw()
            )
        )
        for i = 1 to nodes.count do resetError = amax resetError (matrixDifference nodes[i].transform rest[i])
        if moveError > tolerance or resetError > tolerance do throw "Root motion or direct restoration exceeded 1e-4; do not save this scene"
        "ROOT_MOVE_ERROR=" + (moveError as string) + " DIRECT_RESET_ERROR=" + (resetError as string)
    )

    if findItem #(#preflight, #build, #verify, #pose, #rest) action == 0 do throw "Unknown body55 action"
    if units.SystemType != #centimeters or abs (units.SystemScale - 1.0) > 1e-6 do throw "Expected system units of 1 centimeter"
    checkMeshes meshes tolerance exactNode matrixDifference
    if action == #rest do (
        verify records tolerance exactNode matrixDifference
        local s = stringStream ""
        format "# Body55 rest world matrices, row-major\nCOUNT 55\n" to:s
        for record in records do (
            local n = exactNode record[1]
            local tm = n.transform
            format "%" n.name to:s
            for i = 1 to 4 do for j = 1 to 3 do format "\t%" (formattedPrint tm[i][j] format:".9g") to:s
            format "\n" to:s
        )
        return (s as string)
    )
    if action == #verify do return ("VERIFIED=55 MAX_MATRIX_ERROR=" + ((verify records tolerance exactNode matrixDifference) as string))
    if action == #pose do (
        verify records tolerance exactNode matrixDifference
        return (poseTest records tolerance exactNode matrixDifference)
    )
    local currentPath = substituteString (toLower (maxFilePath + maxFileName)) "\\" "/"
    if currentPath != (toLower sourcePath) do throw "Wrong source scene; select the intended Max instance and open the measured static input"
    if objects.count != meshes.count do throw "Expected only the declared static meshes before building"
    for record in records do (
        if (getNodeByName record[1] exact:true) != undefined do throw ("Bone name already exists: " + record[1])
    )
    if doesFileExist copyPath do throw "Scene copy already exists; generate a script with a new output path"
    if action == #preflight do return "PREFLIGHT_OK=55; no scene or file changes"
    if not (saveMaxFile copyPath quiet:true) do throw "Cannot save the clean working copy; no bones were created"
    try (
        local layer = LayerManager.getLayerFromName layerName
        if layer == undefined do layer = LayerManager.newLayerFromName layerName
        if layer == undefined do throw "Cannot resolve the body55 layer"
        with animate off (undo "Build body55 skeleton" on (
            for record in records do (
                local n = Dummy name:record[1] boxsize:[record[4],record[4],record[4]]
                n.transform = record[3]
                n.wirecolor = color record[5].x record[5].y record[5].z
                n.showLinks = true
                n.renderable = false
                layer.addNode n
            )
            for record in records where record[2] != "-" do (
                local n = exactNode record[1]
                n.parent = exactNode record[2]
            )
            for record in records do (exactNode record[1]).transform = record[3]
        ))
        completeRedraw()
        local error = verify records tolerance exactNode matrixDifference
        local motion = poseTest records tolerance exactNode matrixDifference
        verify records tolerance exactNode matrixDifference
        if not (saveMaxFile copyPath quiet:true) do throw "Final save failed; the output file is unverified"
        "BUILT=55 MAX_MATRIX_ERROR=" + (error as string) + " " + motion + " FILE=" + copyPath
    ) catch (
        format "BODY55_FAILED: %\nConstruction may be partial. Do not save. If final saving was attempted, the output is unverified; reopen the original static input. Output: %\n" (getCurrentException()) copyPath
        throw()
    )
)
if (substituteString (toLower (maxFilePath + maxFileName)) "\\" "/") == (toLower @@COPY@@) then DSHBody55Run action:#verify else DSHBody55Run action:#preflight
