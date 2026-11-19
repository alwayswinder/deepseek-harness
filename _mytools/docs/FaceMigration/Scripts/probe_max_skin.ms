-- 查 Seven_Head 修改器栈、blink/morph 相关对象、SYP_L001 控制器结构
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")

	local head = getNodeByName "Seven_Head"
	if head != undefined then
	(
		out += "## Seven_Head modifiers (count=" + (head.modifiers.count as string) + ")\n"
		for i = 1 to head.modifiers.count do
			out += "  [" + (i as string) + "] " + ((classOf head.modifiers[i]) as string) + " name=" + head.modifiers[i].name + "\n"
		try (
			local sm = head.modifiers[#Skin]
			if sm != undefined do out += "  skin bones=" + (skinOps.GetNumberBones sm as string) + "\n"
		) catch ( out += "  skin read err\n" )
	)
	else out += "MISSING Seven_Head\n"

	out += "== objects with blink/morph/eye in name ==\n"
	for o in objects where ((findString (toLower o.name) "blink") != undefined or (findString (toLower o.name) "morph") != undefined or (findString (toLower o.name) "morpher") != undefined) do
		out += "  " + o.name + " (" + ((classOf o) as string) + ")\n"

	out += "== all modifiers class histogram ==\n"
	local hist = #()
	for o in objects do
		for i = 1 to o.modifiers.count do
		(
			local cn = (classOf o.modifiers[i]) as string
			local found = false
			for h in hist where h[1] == cn do ( h[2] += 1; found = true )
			if not found do append hist #(cn, 1)
		)
	for h in hist do out += "  " + h[1] + " x" + (h[2] as string) + "\n"

	-- SYP_L001 控制器结构
	local n = getNodeByName "SYP_L001"
	if n != undefined do
	(
		out += "## SYP_L001 pos controller\n"
		local pc = n.position.controller
		out += "  class=" + ((classOf pc) as string) + "\n"
		try (
			for i = 1 to pc.count do
			(
				local sub = pc[i]
				local cn = "-"
				try ( cn = (classOf sub.controller) as string ) catch ( try ( cn = (classOf sub) as string ) catch () )
				local val = "-"
				try ( val = (sub.value as string) ) catch ()
				out += "  [" + (i as string) + "] " + cn + " value=" + val + "\n"
				local expr = ""
				try ( expr = sub.controller.getExpression() ) catch ()
				if expr != "" do out += "      expr=" + expr + "\n"
			)
		) catch ( out += "  list read err\n" )
		out += "  pos=" + (pstr n.pos) + " wpos=" + (pstr n.transform.row4) + "\n"
		try ( out += "  parent=" + n.parent.name + " parentScale=" + (pstr n.parent.scale) + "\n" ) catch ()
		try ( out += "  parentWScale=" + (pstr n.parent.transform.scale) + "\n" ) catch ()
	)

	-- eyeBlink 参数节点
	out += "== MORPH / SkinMorph refs ==\n"
	for o in objects do
	(
		for i = 1 to o.modifiers.count do
		(
			local cn = (classOf o.modifiers[i]) as string
			if (findString cn "Morph") != undefined do
				out += "  " + o.name + " -> " + cn + " params=" + (o.modifiers[i].name) + "\n"
		)
	)
	out
)
