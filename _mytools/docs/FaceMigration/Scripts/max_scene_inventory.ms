-- Run via max_run.ps1; paths are supplied by the target project/job.
if FaceMigrationTempDir == undefined do throw "Use FaceMigration max_run.ps1 or supply FaceMigrationTempDir"
-- Step 1: inventory of the Seven_Skin scene (objects, custom attributes)
(
	local outPath = (FaceMigrationTempDir + "max_scene_inventory.txt")
	makeDir (getFilenamePath outPath) all:true
	local f = createFile outPath
	fn w s = ( format "%\n" s to:f )

	w "=== SCENE ==="
	if FaceMigrationSourceScene != undefined and FaceMigrationSourceScene != "" do loadMaxFile FaceMigrationSourceScene quiet:true
	w ("file=" + maxFileName)
	w ("objects=" + (objects.count as string))
	w ("version=" + ((maxVersion()) as string))

	w ""
	w "=== OBJECTS WITH CUSTOM ATTRIBUTES ==="
	for o in objects do (
		local n = 0
		try ( n = custAttributes.count o ) catch ( n = -1 )
		if n > 0 do (
			w ("CAOBJ\t" + o.name + "\t" + ((classof o) as string) + "\tsets=" + (n as string))
			try (
				for d in (custAttributes.getDefs o) do (
					w ("   DEF\t" + d.name)
				)
			) catch ( w "   DEFERR" )
			try (
				local pn = getPropNames o
				for p in pn do (
					local v = try ((getProperty o p) as string) catch ("<err>")
					local c = try (getPropertyController o p) catch (undefined)
					local cn = if c == undefined then "---" else ((classof c) as string)
					w ("   P\t" + (p as string) + "\t" + v + "\t" + cn)
				)
			) catch ( w "   PROPERR" )
		)
	)

	w ""
	w "=== OBJECT LIST ==="
	for o in objects do (
		w ("OBJ\t" + o.name + "\t" + ((classof o) as string) + "\t" + ((superClassOf o) as string) + "\tvis=" + (o.isHidden as string))
	)

	w "=== END ==="
	close f
	format "INVENTORY_DONE\n"
	quitMax #noPrompt
)
