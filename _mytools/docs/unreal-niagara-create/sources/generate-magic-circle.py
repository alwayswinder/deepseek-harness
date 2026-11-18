"""Generate rune and mesh sources; see ../magic-circle.md for Unreal import settings."""

from pathlib import Path
import argparse
import math, json, base64
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output_directory', type=Path)
OUT = parser.parse_args().output_directory.resolve()
OUT.mkdir(parents=True, exist_ok=True)
N=2048
im=Image.new('L',(N,N)); d=ImageDraw.Draw(im)
def xy(x,y):return ((x+.5)*N,(y+.5)*N)
def line(ps,w=2,c=255):d.line([xy(*p) for p in ps],fill=c,width=max(1,int(w*N/1024)),joint='curve')
def circle(r,w,c=255):d.ellipse(((.5-r)*N,(.5-r)*N,(.5+r)*N,(.5+r)*N),outline=c,width=int(w*N/1024))
for r,w,c in [(.435,3,210),(.425,5,255),(.413,1.5,210),(.366,2.4,245),(.354,4,255),(.341,1.5,160),(.245,3.5,250),(.23,2.5,235),(.215,1,170)]:circle(r,w,c)
def polar(r,a):return (r*math.cos(a),r*math.sin(a))
for i in range(48):
 a=i*math.tau/48
 # Separate cartouches and angular arcane glyphs, with six repeatable variants.
 def p(t,r):return polar(r,a+t)
 line([p(-.043,.376),p(-.043,.402),p(.043,.402),p(.043,.376),p(-.043,.376)],1.25,150)
 glyphs=[ [(-.018,.38),(-.018,.397),(.018,.397),(.018,.389),(-.018,.389)], [(-.02,.383),(0,.398),(.02,.383),(0,.388),(-.02,.383)], [(-.02,.395),(.02,.395),(0,.386),(0,.379)], [(-.02,.379),(-.02,.396),(.02,.383),(.02,.397)], [(-.02,.389),(0,.399),(.02,.389),(0,.38),(-.02,.389)], [(-.02,.396),(.02,.396),(-.014,.38),(.02,.38)] ]
 line([p(t,r) for t,r in glyphs[i%6]],2.5,255)
for i in range(4):
 a=i*math.pi/2
 def p(x,y):return (x*math.cos(a)-y*math.sin(a),x*math.sin(a)+y*math.cos(a))
 line([p(.393,0),p(.428,-.026),p(.492,0),p(.428,.026),p(.393,0)],3.5)
 line([p(.42,0),p(.44,-.011),p(.47,0),p(.44,.011),p(.42,0)],1.8)
 line([p(.032,0),p(.412,0)],1.4,170)
 line([p(0,0),p(.025,-.016),p(.16,0),p(.025,.016),p(0,0)],2.4)
for i in range(12):
 a=i*math.tau/12
 line([polar(.252,a),polar(.267,a)],2,210)
circle(.035,2)
core=np.array(im,dtype=np.float32)/255
halo=np.array(im.filter(ImageFilter.GaussianBlur(16)),dtype=np.float32)/255
wide=np.array(im.filter(ImageFilter.GaussianBlur(40)),dtype=np.float32)/255
mask=np.clip(core+.85*halo+.24*wide,0,1)
Image.fromarray((mask*255).astype('uint8')).convert('RGB').save(OUT/'T_MagicCircle_Runes.png')

def gltf(name,positions,uv,indices):
 # glTF uses metres and Y up; Unreal's importer maps this to centimetres/Z up.
 p=np.array([(x/100,z/100,y/100) for x,y,z in positions],dtype='<f4')
 u=np.array(uv,dtype='<f4'); idx=np.array(indices,dtype='<u4')
 data=p.tobytes()+u.tobytes()+idx.tobytes()
 doc={'asset':{'version':'2.0'},'buffers':[{'byteLength':len(data),'uri':'data:application/octet-stream;base64,'+base64.b64encode(data).decode()}],
 'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':p.nbytes,'target':34962},{'buffer':0,'byteOffset':p.nbytes,'byteLength':u.nbytes,'target':34962},{'buffer':0,'byteOffset':p.nbytes+u.nbytes,'byteLength':idx.nbytes,'target':34963}],
 'accessors':[{'bufferView':0,'componentType':5126,'count':len(p),'type':'VEC3','min':p.min(axis=0).tolist(),'max':p.max(axis=0).tolist()},{'bufferView':1,'componentType':5126,'count':len(u),'type':'VEC2'},{'bufferView':2,'componentType':5125,'count':len(idx),'type':'SCALAR'}],
 'meshes':[{'name':name,'primitives':[{'attributes':{'POSITION':0,'TEXCOORD_0':1},'indices':2}]}],
 'nodes':[{'mesh':0,'name':name}],'scenes':[{'nodes':[0]}],'scene':0}
 (OUT/(name+'.gltf')).write_text(json.dumps(doc))

verts=[]; uv=[]; idx=[]
for strand in range(2):
 start=len(verts); segments=360; across=1
 for i in range(segments+1):
  t=i/segments; a=-math.pi/2 + t*math.tau*2.65 + strand*.12
  r=122*(1-t)+42*t+14*math.sin(t*math.pi)
  taper=math.sin(math.pi*t)**.5
  width=(23 if strand==0 else 5)*taper
  z=48+430*t-strand*9
  for j in range(across+1):
   v=j/across
   # A slightly tilted ribbon keeps a broad face from both side and elevated views.
   dr=(v-.5)*width*.42
   verts.append(((r+dr)*math.cos(a),(r+dr)*math.sin(a),z+(v-.5)*width))
   uv.append((t,v))
 for i in range(segments):
  for j in range(across):
   k=start+i*(across+1)+j
   idx.extend([k,k+across+1,k+1,k+1,k+across+1,k+across+2])
gltf('SM_MagicCircle_Helix',verts,uv,idx)

# Crystal cluster: upright, faceted diamonds with UVs for animated glints.
verts=[];uv=[];idx=[]
for n,(x,y,z,h,w) in enumerate([(-102,-42,92,29,5),(102,14,305,36,6),(-55,48,196,25,4),(34,-52,410,37,6),(90,49,157,27,4),(-115,10,320,30,4),(-18,-75,68,32,5),(58,74,250,27,4),(-52,4,450,22,3)]):
 s=len(verts)
 verts.extend([(x,y,z+h/2),(x-w,y,z),(x,y-w,z),(x+w,y,z),(x,y+w,z),(x,y,z-h/2)])
 uv.extend([(.5,0),(0,.5),(.3,.5),(1,.5),(.7,.5),(.5,1)])
 for j in range(4):
  a=s+1+j;b=s+1+(j+1)%4
  idx.extend([s,a,b,s+5,b,a])
gltf('SM_MagicCircle_Crystals',verts,uv,idx)

verts=[];uv=[];idx=[]
for n in range(9):
 a=n*2.399
 r=35+(n%4)*18
 x,y=polar(r,a)
 h=55+(n*29)%73
 w=1.5+(n%3)*.75
 for orientation in [0,math.pi/2]:
  start=len(verts)
  dx,dy=w*math.cos(orientation),w*math.sin(orientation)
  verts.extend([(x-dx,y-dy,4),(x+dx,y+dy,4),(x-dx,y-dy,h),(x+dx,y+dy,h)])
  uv.extend([(0,0),(1,0),(0,1),(1,1)])
  idx.extend([start,start+2,start+1,start+1,start+2,start+3])
gltf('SM_MagicCircle_Rays',verts,uv,idx)
print('Generated rune texture and three mesh sources in',OUT)
