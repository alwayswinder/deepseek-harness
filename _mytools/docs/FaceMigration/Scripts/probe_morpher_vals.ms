-- 读 Morpher 各通道当前值（通过属性名），确认闭眼是否用了 morph
(
	local out = ""
	local head = getNodeByName "Seven_Head"
	local mor = head.modifiers[#Morpher]
	out += "class=" + ((classOf mor) as string) + "\n"
	local props = getPropNames mor
	out += "propCount=" + (props.count as string) + "\n"
	local idx = 0
	for p in props do
	(
		idx += 1
		if (idx <= 30) or ((findString (p as string) "eyeBlink") != undefined) do
		(
			local v = "-"
			try ( v = (getProperty mor p) as string ) catch ( v = "ERR" )
			out += "  " + (p as string) + " = " + v + "\n"
		)
	)
	out
)
