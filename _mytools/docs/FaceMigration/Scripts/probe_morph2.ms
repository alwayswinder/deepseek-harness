-- 探测 Morpher 的可用方法
(
	local out = ""
	local mesh = getNodeByName "Seven_Head"
	local mor = undefined
	for m in mesh.modifiers where (classOf m == Morpher) do mor = m
	if mor == undefined then out += "NO MORPHER\n"
	else
	(
		for expr in #("mor.numChannels", "mor.getNumChannels()", "mor.GetNumChannels()", "numChannels mor", "mor.numChannels()") do
		(
			local r = "ERR"
			try ( r = (expr as string) ) catch ()
			out += expr + " -> " + (r as string) + "\n"
		)
		try ( out += "class=" + ((classOf mor) as string) + "\n" ) catch ()
		try ( out += "props=" + ((getPropNames mor) as string) + "\n" ) catch ()
	)
	out
)
