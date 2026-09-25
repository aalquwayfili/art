'use strict';
const LOOP=22;
const cv=document.getElementById('c'),out=cv.getContext('2d');
const qs=new URLSearchParams(location.search),fixedT=qs.has('t')?parseFloat(qs.get('t')):null;
const INKS=[[0,112,186],[255,72,160],[255,226,0]];
const PAPER=[243,238,226];
let W,H,s,cx,L=[],LC=[],TH=[],img,paperN,covLUT;

function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
const clamp=(x,a=0,b=1)=>x<a?a:x>b?b:x,lerp=(a,b,t)=>a+(b-a)*t;
const ss=(a,b,x)=>{x=clamp((x-a)/(b-a));return x*x*(3-2*x);};
function hash(n){n=Math.sin(n*127.1+311.7)*43758.5453;return n-Math.floor(n);}
function vn(x){const i=Math.floor(x),f=x-i,u=f*f*(3-2*f);return lerp(hash(i),hash(i+1),u)*2-1;}
function vn2(x,y){const i=Math.floor(x),j=Math.floor(y),fx=x-i,fy=y-j,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
  const h=(a,b)=>hash(a*57.3+b*113.1);return lerp(lerp(h(i,j),h(i+1,j),u),lerp(h(i,j+1),h(i+1,j+1),u),v)*2-1;}

function resize(){
  const dpr=fixedT!==null?1:Math.min(1.5,window.devicePixelRatio||1);
  W=cv.width=Math.round(innerWidth*dpr);H=cv.height=Math.round(innerHeight*dpr);s=H/600;cx=W/2;
  L=[];LC=[];
  for(let i=0;i<3;i++){const c=document.createElement('canvas');c.width=W;c.height=H;L.push(c);LC.push(c.getContext('2d',{willReadFrequently:true}));}
  img=out.createImageData(W,H);
  const ang=[0.26,1.31,0.0],cell=[5.2,5.6,6.0].map(c=>c*Math.max(1,s*.9));
  const r=rng(3);TH=[];
  for(let i=0;i<3;i++){const T=new Uint8Array(W*H),ca=Math.cos(ang[i]),sa=Math.sin(ang[i]);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const u=(x*ca-y*sa)/cell[i],v=(x*sa+y*ca)/cell[i];const fu=u-Math.floor(u)-.5,fv=v-Math.floor(v)-.5;
      const ht=Math.sqrt(fu*fu+fv*fv)*1.35;
      const g=r();
      let t=.62*ht+.38*g;
      T[y*W+x]=clamp(t*.92+.04)*255;}
    TH.push(T);}
  paperN=new Float32Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){paperN[y*W+x]=1+(r()-.5)*.05+vn2(x/(90*s),y/(60*s))*.02;}
  covLUT=new Float32Array(512);for(let d=-255;d<=256;d++)covLUT[d+255]=clamp(d*.03+.5);
}

function paint(path,d,soft){
  for(let i=0;i<3;i++){const c=LC[i];path(c);
    c.globalCompositeOperation='destination-out';c.fillStyle='#000';c.fill();
    c.globalCompositeOperation='source-over';if(d[i]>0){c.fillStyle=`rgba(0,0,0,${d[i]})`;c.fill();}}
}
function paintF(path,d,f){
  for(let i=0;i<3;i++){const c=LC[i];path(c);
    c.globalCompositeOperation='destination-out';c.fillStyle=`rgba(0,0,0,${f})`;c.fill();
    c.globalCompositeOperation='source-over';if(d[i]>0){c.fillStyle=`rgba(0,0,0,${d[i]*f})`;c.fill();}}
}
function over(path,d){for(let i=0;i<3;i++){if(!(d[i]>0))continue;const c=LC[i];path(c);c.fillStyle=`rgba(0,0,0,${d[i]})`;c.fill();}}
function stroke(path,d,w,erase){for(let i=0;i<3;i++){const c=LC[i];path(c);c.lineWidth=w;c.lineCap='round';c.lineJoin='round';
  if(erase){c.globalCompositeOperation='destination-out';c.strokeStyle=`rgba(0,0,0,${erase})`;c.stroke();c.globalCompositeOperation='source-over';}
  if(d[i]>0){c.strokeStyle=`rgba(0,0,0,${d[i]})`;c.stroke();}}}
function haze(xf,soft,f,dust,y0=0,y1=H){
  if(f<=0||xf>W+soft)return;
  for(let i=0;i<3;i++){const c=LC[i];
    const g=c.createLinearGradient(xf,0,xf+soft,0);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${f})`);
    c.globalCompositeOperation='destination-out';c.fillStyle=g;c.fillRect(Math.max(0,xf-2),y0,W,y1-y0);
    const g2=c.createLinearGradient(xf,0,xf+soft,0);g2.addColorStop(0,'rgba(0,0,0,0)');g2.addColorStop(1,`rgba(0,0,0,${f*dust[i]})`);
    c.globalCompositeOperation='source-over';c.fillStyle=g2;c.fillRect(Math.max(0,xf-2),y0,W,y1-y0);}
}
const rect=(x,y,w,h)=>c=>{c.beginPath();c.rect(x,y,w,h);};
const poly=(pts)=>c=>{c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();};
const circ=(x,y,r)=>c=>{c.beginPath();c.arc(x,y,r,0,7);};

const HORIZ=.62;
function skyline(t){
  const base=H*HORIZ, r=rng(71);
  let x=-20*s;const shapes=[];
  while(x<W+20*s){const w=(18+r()*40)*s,h=(20+r()*70)*s*(r()<.12?2.2:1);shapes.push([x,w,h,r()]);x+=w+(r()*6-1)*s;}
  return shapes.map(([x,w,h,k])=>{return {x,w,h,k,base};});
}
let SKY=null,MID=null;
function buildCity(){
  SKY=skyline();
  const r=rng(19);MID=[];let x=-30*s;
  while(x<W+30*s){const w=(50+r()*90)*s,h=(28+r()*46)*s;MID.push({x,w,h,k:r(),tank:r()<.5,dish:r()<.35,palm:r()<.3});x+=w+(r()*14-4)*s;}
}
function crenellations(x,y,w,sz){
  const pts=[[x,y]];const n=Math.max(2,Math.round(w/(sz*1.6)));const st=w/n;
  for(let i=0;i<n;i++){pts.push([x+i*st+st*.2,y]);pts.push([x+i*st+st*.5,y-sz]);pts.push([x+i*st+st*.8,y]);}
  pts.push([x+w,y]);return pts;
}
function drawFar(t){
  const base=H*HORIZ;
  SKY.forEach(b=>{const top=base-b.h*.8-18*s;
    paint(rect(b.x,top,b.w,base-top+2),[.55,.30,.06]);
    if(b.k<.18){
      paint(rect(b.x+b.w*.45,top-40*s,3*s,40*s),[.65,.3,.1]);paint(circ(b.x+b.w*.45+1.5*s,top-40*s,5*s),[.6,.6,.1]);}
    else if(b.k>.9){
      const mx=b.x+b.w*.5;paint(rect(mx-4*s,top-50*s,8*s,50*s),[.6,.3,.06]);paint(poly([[mx-6*s,top-50*s],[mx+6*s,top-50*s],[mx,top-64*s]]),[.6,.3,.06]);}
    for(let yy=top+6*s;yy<base-6*s;yy+=9*s)for(let xx=b.x+4*s;xx<b.x+b.w-5*s;xx+=8*s){if(hash(xx*.3+yy*.7)<.5)paint(rect(xx,yy,3*s,4*s),[.2,.1,.5]);}
  });
  const kx=cx+H*.55,ky=base-150*s;paint(rect(kx,ky,4*s,150*s),[.7,.5,.2]);
  const ja=Math.sin(t*.25)*.05;
  stroke(c=>{c.beginPath();c.moveTo(kx-40*s,ky+2*s);c.lineTo(kx+110*s,ky+2*s+ja*100*s);},[.7,.5,.2],3*s);
  stroke(c=>{c.beginPath();c.moveTo(kx+90*s,ky+2*s+ja*80*s);c.lineTo(kx+90*s,ky+60*s);},[.7,0,0],1*s);
}
function drawMid(t,wind){
  const base=H*.80;
  MID.forEach((b,idx)=>{const top=base-b.h;const col=b.k<.33?[.06,.32,.55]:b.k<.66?[.04,.18,.38]:[.12,.42,.42];
    if(b.palm){const px=b.x+b.w*.7,ph=70*s;const lean=wind*18*s;
      stroke(c=>{c.beginPath();c.moveTo(px,top+5*s);c.quadraticCurveTo(px+3*s,top-ph*.5,px+lean*.3,top-ph);},[.6,.1,.55],4*s);
      for(let f=0;f<7;f++){const a=-2.9+f*.48+Math.sin(t*2+f)*.05+(wind*.6);const fx=px+lean*.3,fy=top-ph;
        stroke(c=>{c.beginPath();c.moveTo(fx,fy);c.quadraticCurveTo(fx+Math.cos(a)*22*s,fy+Math.sin(a)*22*s-6*s,fx+Math.cos(a+wind*.5)*36*s,fy+Math.sin(a)*30*s+10*s);},[.62,.05,.7],3.2*s);}
    }
    paint(poly([[b.x,base+40*s],...crenellations(b.x,top,b.w,7*s),[b.x+b.w,base+40*s]]),col);
    over(rect(b.x,top+4*s,b.w*.12,b.h+40*s),[.35,.05,0]);
    over(rect(b.x,top+9*s,b.w,2.5*s),[.25,.15,0]);
    for(let k=0;k<Math.floor(b.w/(26*s));k++){const wx=b.x+14*s+k*26*s,wy=top+18*s;
      paint(poly([[wx,wy+8*s],[wx+5*s,wy],[wx+10*s,wy+8*s]]),[.8,.2,.1]);
      paint(rect(wx+1*s,wy+16*s,8*s,11*s),[.78,.12,.05]);}
    if(b.tank){const tx=b.x+b.w*.25,ty=top-16*s;paint(rect(tx,ty,22*s,16*s),[.1,.1,.08]);over(rect(tx,ty,6*s,16*s),[.3,0,0]);paint(rect(tx+3*s,ty+16*s,2*s,3*s),[.6,0,0]);paint(rect(tx+17*s,ty+16*s,2*s,3*s),[.6,0,0]);}
    if(b.dish){const dx=b.x+b.w*.6,dy=top-10*s;paint(c=>{c.beginPath();c.ellipse(dx,dy,9*s,5*s,-.6,0,7);},[.12,.02,0]);stroke(c=>{c.beginPath();c.moveTo(dx,dy);c.lineTo(dx+3*s,dy+10*s);},[.7,0,0],1.5*s);}
  });
}
function midSil(xf,soft,f){
  if(f<=0)return;const base=H*.80;
  MID.forEach(b=>{const k=clamp((b.x+b.w/2-xf)/soft)*f;if(k<=0)return;const top=base-b.h;
    over(poly([[b.x,base+40*s],...crenellations(b.x,top,b.w,7*s),[b.x+b.w,base+40*s]]),[.10*k,.42*k,.1*k]);});
}
function roofY(){return H*.86;}
function drawNear(t,wind,storm){
  const y=roofY();
  const x0=-20*s,x1=W+20*s;
  paint(poly([[x0,H+5],...crenellations(x0,y,x1-x0,12*s),[x1,H+5]]),[.03,.40,.62]);
  over(rect(x0,y+10*s,x1-x0,4*s),[.3,.3,0]);
  for(let k=0;k<Math.floor((x1-x0)/(46*s));k++){const wx=cx-23*s+Math.round((x0-cx)/(46*s))*46*s+k*46*s;paint(poly([[wx,y+40*s],[wx+9*s,y+26*s],[wx+18*s,y+40*s]]),[.85,.35,.1]);}
  const lx0=cx-H*.52,lx1=cx-H*.18,ly=y-58*s;
  stroke(c=>{c.beginPath();c.moveTo(lx0,y);c.lineTo(lx0,ly);c.moveTo(lx1,y);c.lineTo(lx1,ly);},[.9,.1,.1],2.5*s);
  stroke(c=>{c.beginPath();c.moveTo(lx0,ly);c.quadraticCurveTo((lx0+lx1)/2,ly+8*s,lx1,ly);},[.8,0,0],1.2*s);
  for(let k=0;k<3;k++){const hx=lerp(lx0,lx1,.18+k*.3),hy=ly+4*s+ (k==1?2*s:0);const flap=Math.sin(t*(3+storm*9)+k)*(.1+storm*.5);
    const L=(k==2?22:34)*s,wd=(k==2?10:18)*s;const dx=-wind*L*.9;
    const pts=[[hx-wd/2,hy],[hx+wd/2,hy],[hx+wd/2+dx+flap*8*s,hy+L],[hx-wd/2+dx+flap*4*s,hy+L*1.02]];
    paint(poly(pts),k==2?[0,.85,.1]:[0,.02,.03]);
    stroke(poly(pts),[.55,0,0],1*s);}
  const tx=cx+H*.34,ty=y-44*s;paint(c=>{c.beginPath();c.rect(tx,ty,46*s,34*s);},[.05,.08,.35]);over(rect(tx,ty,12*s,34*s),[.35,.05,0]);
  paint(c=>{c.beginPath();c.ellipse(tx+23*s,ty,23*s,5*s,0,0,7);},[.05,.12,.55]);
  for(let k=0;k<4;k++)stroke(c=>{c.beginPath();c.moveTo(tx+4*s+k*13*s,ty+34*s);c.lineTo(tx+4*s+k*13*s,y);},[.7,0,0],2*s);
}
function kidAndKite(t,wind,storm){
  const y=roofY();const kx=cx-H*.05, ky=y;
  const lean=storm*.12;
  for(const c of LC){c.save();c.translate(kx,ky);c.scale(1.35,1.35);c.translate(-kx,-ky);}
  const body=poly([[kx-7*s,ky],[kx+7*s,ky],[kx+5*s+lean*30*s,ky-30*s],[kx-5*s+lean*30*s,ky-30*s]]);
  paint(body,[.05,.0,.0]);stroke(body,[.8,0,0],1.4*s);
  const hx=kx+lean*34*s,hy=ky-38*s;
  paint(circ(hx,hy,7*s),[.85,.1,.25]);
  paint(poly([[hx-2*s,hy-5*s],[hx+11*s,hy-4*s],[hx+11*s,hy-2*s],[hx-2*s,hy-2*s]]),[.9,.6,0]);
  const sf=Math.sin(t*12)*storm*4*s;
  paint(poly([[hx-3*s,hy+7*s],[hx-4*s,hy+10*s],[hx-18*s-wind*10*s,hy+10*s+sf],[hx-16*s-wind*10*s,hy+5*s+sf]]),[0,.9,.05]);
  let handX=kx+lean*30*s+12*s,handY=ky-44*s;
  stroke(c=>{c.beginPath();c.moveTo(kx+3*s+lean*30*s,ky-26*s);c.lineTo(handX,handY);},[.85,.05,.05],3.2*s);
  for(const c of LC)c.restore();
  handX=kx+(handX-kx)*1.35;handY=ky+(handY-ky)*1.35;
  const amp=1+storm*2.2;
  const kX=cx+H*.10+Math.sin(t*.9)*14*s*amp+vn(t*1.7)*18*s*storm-wind*20*s;
  const kY=H*.26+Math.sin(t*1.8)*8*s*amp+vn(t*2.3+5)*20*s*storm;
  const rot=Math.sin(t*1.1)*.12+vn(t*3.1)*.5*storm;
  stroke(c=>{c.beginPath();c.moveTo(handX,handY);c.quadraticCurveTo((handX+kX)/2+20*s,(handY+kY)/2+50*s*(1-storm*.5),kX,kY+14*s);},[.9,.3,0],1.2*s);
  const tail=[];for(let k=0;k<=14;k++){const f=k/14;tail.push([kX-f*(40+wind*50)*s+Math.sin(t*6-k*.8)*6*s*f*(1+storm*2),kY+42*s+f*80*s*(1-wind*.4)+Math.cos(t*5-k*.7)*4*s*f]);}
  stroke(c=>{c.beginPath();tail.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));},[.7,.1,0],1.3*s);
  for(let k=3;k<=14;k+=3){const p=tail[k];paint(poly([[p[0]-5*s,p[1]-3*s],[p[0]+5*s,p[1]+3*s],[p[0]+5*s,p[1]-3*s],[p[0]-5*s,p[1]+3*s]]),k%2?[0,1,.2]:[0,.2,1]);}
  const cr=Math.cos(rot),sr=Math.sin(rot);const P=(u,v)=>{u*=1.3;v*=1.3;return[kX+u*cr*s-v*sr*s,kY+u*sr*s+v*cr*s];};
  const top=P(0,-30),rt=P(22,-6),bot=P(0,34),lt=P(-22,-6);
  paint(poly([top,rt,bot]),[0,.25,1]);paint(poly([top,bot,lt]),[0,1,.1]);
  paint(poly([P(-6,-10),P(0,-22),P(6,-10),P(0,2)]),[.1,.1,.1]);
  stroke(c=>{c.beginPath();c.moveTo(top[0],top[1]);c.lineTo(bot[0],bot[1]);c.moveTo(lt[0],lt[1]);c.lineTo(rt[0],rt[1]);},[.95,0,0],1.6*s);
  stroke(poly([top,rt,bot,lt]),[.9,0,0],1.2*s);
}

function wallCircles(xw,hw){
  const base=H*HORIZ+6*s,C=[];const r=rng(5);
  const n=16;
  for(let k=0;k<n;k++){const f=k/(n-1);
    const y=base-hw*f*.95;const x=xw+(f*f)*hw*.45 - Math.sin(f*3.14)*hw*.10 + (r()-.5)*14*s;
    C.push([x,y,(22+34*Math.sin(f*2.6+.4))*s*(.75+.5*r())*(hw/(H*.8))**.4]);}
  for(let k=0;k<12;k++){const f=k/11;const x=xw+hw*.45+f*(W+H-xw);C.push([x,base-hw*.95+(r()-.5)*20*s,(30+30*r())*s]);}
  return C;
}
function drawWall(xw,hw,f,t){
  const base=H*HORIZ+6*s,C=wallCircles(xw,hw);
  const body=c=>{c.beginPath();C.forEach(q=>{c.moveTo(q[0]+q[2],q[1]);c.arc(q[0],q[1],q[2],0,7);});
    c.moveTo(W+60,base);c.lineTo(xw,base);for(let k=0;k<16;k++)c.lineTo(C[k][0]+C[k][2]*.5,C[k][1]);c.lineTo(W+60,C[15][1]-20*s);c.closePath();};
  paintF(body,[.06,.30,.80],f);
  for(let k=0;k<10;k++){const y0=base-hw*(k+1)/10;const d=(k+1)/10;
    over(rect(xw+hw*.35+k*hw*.03,y0,W+H,hw/10+1),[.10*d*d*f,.45*d*f,0]);}
  C.forEach((q,i)=>{if(i>=16)return;const [x,y,r]=q;
    over(circ(x+r*.18,y+r*.22,r*.92),[.10*f,.42*f,.1*f]);
    paint(circ(x-r*.12,y-r*.14,r*.72),[.03*f,.22*f,.8*f]);
    paint(circ(x-r*.3,y-r*.34,r*.28),[0,.08*f,.7*f]);});
  over(c=>{c.beginPath();c.ellipse(xw-10*s,base-4*s,70*s,14*s,0,0,7);},[0,.2*f,.6*f]);
}
function flow(t,amount,frontX){
  if(amount<=0)return;
  const N=Math.round(420*amount);const step=9*s;
  for(let k=0;k<N;k++){
    let x=((hash(k*1.13)*1.6*W - t*W*.35*(0.7+hash(k*2.9)*.6))%(1.6*W)+1.6*W)%(1.6*W)-.3*W;
    let y=hash(k*3.77)*H*.95;
    if(x<frontX)continue;
    const pts=[[x,y]];
    for(let j=0;j<10;j++){
      const a=Math.PI+vn2(x/(140*s)+t*.3,y/(120*s)-t*.2)*1.4+ Math.sin(y/(60*s)+t)*0.25;
      x+=Math.cos(a)*step;y+=Math.sin(a)*step*.8;pts.push([x,y]);}
    const light=k%3===0;
    stroke(c=>{c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));},light?[0,0,0]:[.05,.45,.6],(light?1.6:1.2)*s,light?.55:0);
  }
}

let jx=[0,0,0],jy=[0,0,0];
function compose(){
  const D=[0,1,2].map(i=>LC[i].getImageData(0,0,W,H).data);
  const o=img.data;
  const kr=INKS.map(c=>1-c[0]/255),kg=INKS.map(c=>1-c[1]/255),kb=INKS.map(c=>1-c[2]/255);
  const T0=TH[0],T1=TH[1],T2=TH[2];const D0=D[0],D1=D[1],D2=D[2];
  const ox=jx.map(v=>Math.round(v)),oy=jy.map(v=>Math.round(v));
  for(let y=0;y<H;y++){
    const y0=Math.min(H-1,Math.max(0,y+oy[0]))*W,y1=Math.min(H-1,Math.max(0,y+oy[1]))*W,y2=Math.min(H-1,Math.max(0,y+oy[2]))*W;
    for(let x=0;x<W;x++){const p=y*W+x;
      const x0=x+ox[0],x1=x+ox[1],x2=x+ox[2];
      const a0=(x0>=0&&x0<W)?D0[(y0+x0)*4+3]:0,a1=(x1>=0&&x1<W)?D1[(y1+x1)*4+3]:0,a2=(x2>=0&&x2<W)?D2[(y2+x2)*4+3]:0;
      const c0=a0?covLUT[a0-T0[p]+255]:0,c1=a1?covLUT[a1-T1[p]+255]:0,c2=a2?covLUT[a2-T2[p]+255]:0;
      const pn=paperN[p];
      o[p*4]=PAPER[0]*pn*(1-c0*kr[0])*(1-c1*kr[1])*(1-c2*kr[2]);
      o[p*4+1]=PAPER[1]*pn*(1-c0*kg[0])*(1-c1*kg[1])*(1-c2*kg[2]);
      o[p*4+2]=PAPER[2]*pn*(1-c0*kb[0])*(1-c1*kb[1])*(1-c2*kb[2]);
      o[p*4+3]=255;}}
  out.putImageData(img,0,0);
}

function render(t){
  t=((t%LOOP)+LOOP)%LOOP;
  const boil=Math.floor(t*6);
  jx=[0,3.2*s+ (hash(boil)-.5)*1.5*s,-2.4*s+(hash(boil+9)-.5)*1.5*s];jy=[0,-2*s+(hash(boil+3)-.5)*1.2*s,2.2*s+(hash(boil+5)-.5)*1.2*s];
  LC.forEach(c=>{c.globalCompositeOperation='source-over';c.clearRect(0,0,W,H);});
  const a=ss(1.5,11,t);
  const xw=lerp(W+H*.45,-H*1.2,a);
  const hw=H*lerp(.10,1.0,ss(1.5,8.5,t));
  const clear=ss(14,19.5,t);
  const storm=ss(8,10.5,t)*(1-clear);
  const settle=ss(15,18,t)*(1-ss(19,21.8,t));
  const wind=ss(6,9,t)*(1-ss(14,18,t));
  const g=[.78,.02,0];
  for(let k=0;k<12;k++){const y0=k/12*H*HORIZ;paint(rect(0,y0-1,W,H*HORIZ/12+2),[lerp(.8,.28,k/11),lerp(.02,.16,k/11),lerp(0,.12,k/11)]);}
  const sx=cx-H*.45,sy=H*.18;paint(circ(sx,sy,34*s),[0,.75,.85]);
  over(circ(sx,sy,24*s),[0,0,.3]);
  for(let k=0;k<9;k++){const f=(t-5.2-hash(k)*1.5)/4.5;if(f<0||f>1)continue;const bx=lerp(cx+H*.6,-40*s,f)+hash(k*7)*60*s,by=H*(.30+hash(k*3)*.12)-f*H*.12;const fl=Math.sin(t*18+k*2)*4*s;
    stroke(c=>{c.beginPath();c.moveTo(bx-6*s,by-fl);c.lineTo(bx,by);c.lineTo(bx+6*s,by-fl);},[.2,.9,0],1.8*s);}
  if(clear<1){const f=1-clear;
    drawWall(xw,hw,f,t);}
  paint(rect(0,H*HORIZ,W,H),[.10,.22,.42]);
  drawFar(t);
  haze(xw+H*.25,H*.25,.70*(1-clear),[.10,.36,.80],H*.28,H);
  drawMid(t,wind);
  haze(xw+H*.55,H*.35,.55*(1-clear),[.08,.34,.78],H*.55,H);
  midSil(xw+H*.55,H*.35,1-clear);
  drawNear(t,wind,storm);
  haze(xw+H*.9,H*.45,.35*(1-clear),[.08,.32,.72],H*.70,H);
  if(settle>0)over(rect(0,0,W,H),[0,.06*settle,.30*settle]);
  flow(t,storm,xw+H*.4);
  kidAndKite(t,wind,storm);
  compose();
  out.fillStyle='rgb(243,238,226)';const m=Math.round(14*s);out.fillRect(0,0,W,m);out.fillRect(0,H-m,W,m);out.fillRect(0,0,m,H);out.fillRect(W-m,0,m,H);
}

resize();buildCity();
if(fixedT!==null){const t0=performance.now();render(fixedT);window.__ms=performance.now()-t0;document.title='done';}
else{addEventListener('resize',()=>{resize();buildCity();});const st=performance.now();(function f(){render((performance.now()-st)/1000);requestAnimationFrame(f);})();}
