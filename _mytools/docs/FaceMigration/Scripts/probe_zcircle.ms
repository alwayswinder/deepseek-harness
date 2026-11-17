-- 只读探测：zCircle051/052/053 及可能的对称对象
(
	local out = ""
	fn pstr p = ("[" + (p.x as string) + "," + (p.y as string) + "," + (p.z as string) + "]")

	-- 1) 场景里所有名字含 zCircle 的对象
	local hits = for o in objects where (matchPattern o.name pattern:"zCircle*") collect o
	out += "== zCircle* count=" + (hits.count as string) + "\n"
	for o in hits do
	(
		local p = [0,0,0]
		try ( p = (o.transform).row4 ) catch ( try ( p = o.pos ) catch () )
		local par = "-"
		try ( par = o.parent.name ) catch ()
		out += "  " + o.name + " | " + ((classOf o) as string) + " | parent=" + par + " | wpos=" + (pstr p) + "\n"
	)

	-- 2) 名字里含 Circle05 的（可能不带 z 前缀）
	local more = for o in objects where (matchPattern o.name pattern:"*Circle05*") collect o
	out += "== *Circle05* count=" + (more.count as string) + "\n"
	for o in more do
		out += "  " + o.name + " | " + ((classOf o) as string) + "\n"

	out
)
