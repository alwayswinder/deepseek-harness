import math, json
P_L=(3.1508,4.0862,159.5584)
P_R=(-3.1503,4.0862,159.5584)
BONES={
 "Bone027":((-2.3354,8.2313,159.1834),(-0.0128,-0.2932,-1.2319),P_R),
 "Bone028":((-4.3224,8.2633,159.3894),(0.0242,-0.5454,-2.0494),P_R),
 "Bone029":((-5.9277,7.2680,159.5007),(-0.0875,-0.4991,-1.3329),P_R),
 "Bone036":((2.3359,8.2313,159.1833),(0.0128,-0.2932,-1.2319),P_L),
 "Bone037":((4.3230,8.2633,159.3893),(-0.0242,-0.5454,-2.0494),P_L),
 "Bone038":((5.9283,7.2680,159.5006),(0.0875,-0.4991,-1.3327),P_L),
}
def sub(a,b): return tuple(a[i]-b[i] for i in range(3))
def add(a,b): return tuple(a[i]+b[i] for i in range(3))
def mul(a,s): return tuple(x*s for x in a)
def cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def dot(a,b): return sum(a[i]*b[i] for i in range(3))
def norm(a): return math.sqrt(dot(a,a))
out={}
for b,(t0,dp,P) in BONES.items():
    t1=add(t0,dp)
    v0=sub(t0,P); v1=sub(t1,P)
    ax=cross(v0,v1); n=norm(ax); ax=mul(ax,1.0/n)
    ang=math.degrees(math.acos(max(-1,min(1,dot(v0,v1)/(norm(v0)*norm(v1))))))
    out[b]={"pivot":P,"t0":t0,"t1":t1,"axis":tuple(round(x,6) for x in ax),"angle":round(ang,4),
            "r0":round(norm(v0),6),"r1":round(norm(v1),6),"k1":round(norm(v1)/norm(v0)-1,6),
            "torque_deg":round(math.degrees(dot(cross(v0,v1),ax)/(norm(v0)*norm(v1))),4)}
print(json.dumps(out,indent=1))
