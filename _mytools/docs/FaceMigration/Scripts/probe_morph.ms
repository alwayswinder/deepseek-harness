-- Seven_Head 的 Morpher 通道：名称与 SYP 拖动时的变化
(
	local out = ""
	local mesh = getNodeByName "Seven_Head"
	local mor = undefined
	for m in mesh.modifiers where (classOf m == Morpher) do mor = m
	if mor == undefined then out += "NO MORPHER\n"
	else
	(
		local n = mor.numChannels()
		out += "channels=" + (n as string) + "\n"
		local base = #()
		for i = 1 to n do
		(
			local nm = "-"
			try ( nm = (mor.getChannelName i) ) catch ()
			local w = 0.0
			try ( w = (mor.GetChannelWeight i) ) catch ()
			base[i] = w
			out += "  [" + (i as string) + "] " + nm + " = " + (w as string) + "\n"
		)

		local nR = getNodeByName "SYP_R001"
		local savedR = nR.transform
		nR.position.controller[2].value = [0,-1.75,0]
		out += "== after SYP_R001 endpoint ==\n"
		for i = 1 to n do
		(
			local w = 0.0
			try ( w = (mor.GetChannelWeight i) ) catch ()
			if (abs (w - base[i])) > 0.001 do
			(
				local nm = "-"
				try ( nm = (mor.getChannelName i) ) catch ()
				out += "  " + nm + " : " + (base[i] as string) + " -> " + (w as string) + "\n"
			)
		)
		nR.transform = savedR
		nR.position.controller[2].value = [0,0,0]
	)
	out
)
