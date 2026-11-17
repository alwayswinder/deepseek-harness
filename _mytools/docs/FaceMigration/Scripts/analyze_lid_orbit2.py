import math
SAMPLES = [
    (0.0, (4.32270, -8.26317, 159.389)),
    (0.142857, (4.33495, -8.24623, 159.086)),
    (0.285714, (4.34203, -8.20864, 158.784)),
    (0.428571, (4.34387, -8.15048, 158.484)),
    (0.571429, (4.34044, -8.07197, 158.188)),
    (0.714286, (4.33174, -7.97340, 157.898)),
    (0.857143, (4.31778, -7.85516, 157.615)),
    (1.0, (4.29860, -7.71777, 157.340)),
]
P = (3.15057, -4.08607, 159.558)
def sub(a,b): return tuple(a[i]-b[i] for i in range(3))
def add(a,b): return tuple(a[i]+b[i] for i in range(3))
def mul(a,s): return tuple(x*s for x in a)
def cross(a,b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def dot(a,b): return sum(a[i]*b[i] for i in range(3))
def norm(a): return math.sqrt(dot(a,a))
def rot(v,axis,ang):
    n=mul(axis,1/norm(axis)); c=math.cos(ang); s=math.sin(ang)
    return add(add(mul(v,c),mul(cross(n,v),s)),mul(n,dot(n,v)*(1-c)))
t0=SAMPLES[0][1]; t1=SAMPLES[-1][1]
v0=sub(t0,P); v1=sub(t1,P)
axis=cross(v0,v1); ang=math.acos(max(-1,min(1,dot(v0,v1)/(norm(v0)*norm(v1)))))
r0=norm(v0); r1=norm(v1)
print("axis",tuple(round(x,4) for x in mul(axis,1/norm(axis))),"ang",round(math.degrees(ang),3),"r0",round(r0,4),"r1",round(r1,4))
mx=0
for s,actual in SAMPLES:
    v=rot(v0,axis,ang*s)
    v=mul(v, (1+(r1/r0-1)*s))
    p=add(P,v)
    e=norm(sub(p,actual)); mx=max(mx,e)
    print("s=%.3f err=%.5f"%(s,e))
print("max err with radial scale =",round(mx,5),"cm")
