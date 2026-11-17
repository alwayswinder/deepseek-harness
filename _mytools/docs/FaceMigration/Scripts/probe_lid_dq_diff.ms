-- 对比 Max Skin 的 DQ 开/关在闭眼姿势下上眼皮顶点位置差
(
	local out = ""
	fn pstr p = ("[" + ((p.x) as string) + "," + ((p.y) as string) + "," + ((p.z) as string) + "]")

	local head = getNodeByName "Seven_Head"
	local sm = head.modifiers[#Skin]
	local n = getNodeByName "SYP_L001"
	local p2 = n.position.controller[2]
	local orig = p2.value
	local origDQ = sm.enableDQ
	out += "origDQ=" + (origDQ as string) + " origP2=" + (pstr orig) + "\n"

	p2.value = [0, -1.75, 0]
	local bp = (getNodeByName "Bone028").transform.row4

	sm.enableDQ = true
	local vDQ = (
		local s = snapshot head
		local vs = for v = 1 to s.numverts collect (getVert s v)
		delete s
		vs
	)
	out += "DQ on verts=" + (vDQ.count as string) + "\n"

	sm.enableDQ = false
	local vLBS = (
		local s = snapshot head
		local vs = for v = 1 to s.numverts collect (getVert s v)
		delete s
		vs
	)
	out += "DQ off verts=" + (vLBS.count as string) + "\n"

	local maxd = 0.0
	local sumd = 0.0
	local cnt = 0
	local maxIdx = 0
	for v = 1 to (amin vDQ.count vLBS.count) do
	(
		local d = distance vDQ[v] vLBS[v]
		sumd += d
		if d > maxd do ( maxd = d; maxIdx = v )
		if d > 0.01 do cnt += 1
	)
	out += "maxDiff=" + (maxd as string) + " atV=" + (maxIdx as string)
	out += " avgDiff=" + ((sumd / vDQ.count) as string) + " vertsDiff>0.01=" + (cnt as string) + "\n"

	local nearSum = 0.0
	local nearCnt = 0
	local nearMax = 0.0
	for v = 1 to (amin vDQ.count vLBS.count) do
	(
		local d0 = distance vLBS[v] bp
		if d0 < 2.5 do
		(
			local d = distance vDQ[v] vLBS[v]
			nearSum += d
			nearCnt += 1
			if d > nearMax do nearMax = d
		)
	)
	out += "nearBone028 n=" + (nearCnt as string) + " avgDiff=" + ((nearSum / (amax nearCnt 1)) as string) + " maxDiff=" + (nearMax as string) + "\n"

	sm.enableDQ = origDQ
	p2.value = orig
	out
)
