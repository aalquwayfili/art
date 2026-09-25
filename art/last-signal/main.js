'use strict';
const LOOP = 24;
const qs = new URLSearchParams(location.search), fixedT = qs.has('t') ? parseFloat(qs.get('t')) : null;
const CTXOPT = fixedT!==null?{willReadFrequently:true}:{};
const cv = document.getElementById('c'), ctx = cv.getContext('2d', CTXOPT);
let W, H, s, cx, cy, Rin, base;
const TAU=Math.PI*2;
function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
const clamp=(x,a=0,b=1)=>x<a?a:x>b?b:x, lerp=(a,b,t)=>a+(b-a)*t;
const ss=(a,b,x)=>{x=clamp((x-a)/(b-a));return x*x*(3-2*x);};
function hash(n){n=Math.sin(n*127.1+311.7)*43758.5453;return n-Math.floor(n);}
const X=u=>cx+u*H, Y=v=>cy+v*H;
function hex(c){if(c[0]=='r'){return c.slice(c.indexOf('(')+1,-1).split(',').map(Number);}return [parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];}
function shade(c,k){const a=hex(c);return `rgb(${clamp(a[0]*k,0,255)|0},${clamp(a[1]*k,0,255)|0},${clamp(a[2]*k,0,255)|0})`;}
function tint(c,k){const a=hex(c);return `rgb(${lerp(a[0],255,k)|0},${lerp(a[1],255,k)|0},${lerp(a[2],255,k)|0})`;}

function stitch(g,x0,y0,x1,y1,col,w,twist=true,alpha=1){
  const dx=x1-x0,dy=y1-y0,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L;
  g.globalAlpha=alpha;g.lineCap='round';
  g.strokeStyle='rgba(20,12,6,.38)';g.lineWidth=w*1.1;g.beginPath();g.moveTo(x0+.5*s,y0+.9*s);g.lineTo(x1+.5*s,y1+.9*s);g.stroke();
  g.strokeStyle=shade(col,.82);g.lineWidth=w;g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();
  g.strokeStyle=tint(col,.28);g.lineWidth=w*.38;g.beginPath();g.moveTo(x0-nx*w*.18,y0-ny*w*.18);g.lineTo(x1-nx*w*.18,y1-ny*w*.18);g.stroke();
  if(twist&&L>w*2.5){g.strokeStyle=shade(col,.62);g.lineWidth=Math.max(.5,w*.14);g.beginPath();
    const n=Math.floor(L/(w*.9));for(let i=1;i<n;i++){const u=i/n,px=x0+dx*u,py=y0+dy*u;
      g.moveTo(px+nx*w*.42-dx/L*w*.25,py+ny*w*.42-dy/L*w*.25);g.lineTo(px-nx*w*.42+dx/L*w*.25,py-ny*w*.42+dy/L*w*.25);}g.stroke();}
  g.globalAlpha=1;
}
function looseThread(g,pts,col,w,alpha=1){
  g.globalAlpha=alpha;g.lineCap='round';g.lineJoin='round';
  const path=()=>{g.beginPath();g.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length-1;i++){const mx=(pts[i][0]+pts[i+1][0])/2,my=(pts[i][1]+pts[i+1][1])/2;g.quadraticCurveTo(pts[i][0],pts[i][1],mx,my);}const l=pts[pts.length-1];g.lineTo(l[0],l[1]);};
  g.save();g.translate(1.2*s,2.2*s);g.strokeStyle='rgba(20,12,6,.25)';g.lineWidth=w*1.1;path();g.stroke();g.restore();
  g.strokeStyle=shade(col,.85);g.lineWidth=w;path();g.stroke();
  g.strokeStyle=tint(col,.3);g.lineWidth=w*.35;g.save();g.translate(-.3*s,-.3*s);path();g.stroke();g.restore();
  g.globalAlpha=1;
}
function knot(g,x,y,col,r,glow=0){
  g.fillStyle='rgba(20,12,6,.4)';g.beginPath();g.arc(x+.5*s,y+.8*s,r*1.05,0,TAU);g.fill();
  g.fillStyle=shade(col,.85);g.beginPath();g.arc(x,y,r,0,TAU);g.fill();
  g.strokeStyle=tint(col,.35+glow*.4);g.lineWidth=r*.35;g.beginPath();g.arc(x,y,r*.55,-2.4,.3);g.stroke();
  g.strokeStyle=shade(col,.6);g.lineWidth=r*.2;g.beginPath();g.arc(x,y,r*.55,.6,2.2);g.stroke();
}

const SKY=['#11173a','#1a2356','#27337a','#3b3a86','#613f86','#95487f','#c85b73','#e5835f'];
const WAVE=['#e2507e','#ee6a64','#f4894f','#f5ad48','#efcf5a','#8fcf87','#45b7aa','#4c9bd8','#7a7be0'];
const BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];

const NCOL=58, SONG=[];
(function(){const r=rng(1987);for(let i=0;i<NCOL;i++){
  const beat=(i%8==0)?1:(i%4==0)?.75:(i%2==0)?.5:.35;
  const phrase=.55+.45*Math.sin(i/NCOL*Math.PI*2.2-.6)**2;
  SONG.push(clamp((beat*.55+r()*.45)*phrase*1.05,.12,1));}})();
const WX0=-.29, WX1=.29, WY=-.105, WAMP=.085;
const T_SIG0=.8, T_SIG1=2.8, T_SONG0=3.1, T_SONG1=15.1, T_UN0=16.6, T_UN1=19.2;

function resize(){
  const dpr=fixedT!==null?1:Math.min(2,window.devicePixelRatio||1);
  W=cv.width=Math.round(innerWidth*dpr);H=cv.height=Math.round(innerHeight*dpr);
  s=H/600;cx=W/2;cy=H*.5;Rin=H*.368;
  base=document.createElement('canvas');base.width=W;base.height=H;
  drawBase(base.getContext('2d',CTXOPT));
}

function weave(g,x0,y0,w,h,col,pitch,seed){
  const r=rng(seed);const c=hex(col);
  g.fillStyle=col;g.fillRect(x0,y0,w,h);
  for(let y=y0;y<y0+h;y+=pitch){const k=.9+r()*.14;
    g.fillStyle=`rgba(${c[0]*k|0},${c[1]*k|0},${c[2]*k|0},.9)`;g.fillRect(x0,y,w,pitch*.62);}
  for(let x=x0;x<x0+w;x+=pitch){const k=.9+r()*.14;
    for(let y=y0,j=0;y<y0+h;y+=pitch,j++){if(((x-x0)/pitch+j)%2<1)continue;
      g.fillStyle=`rgba(${c[0]*k*1.04|0},${c[1]*k*1.04|0},${c[2]*k*1.04|0},.95)`;g.fillRect(x,y-pitch*.15,pitch*.62,pitch*1.05);}}
  g.fillStyle='rgba(60,40,20,.13)';
  for(let y=y0;y<y0+h;y+=pitch)for(let x=x0;x<x0+w;x+=pitch)g.fillRect(x+pitch*.62,y+pitch*.62,pitch*.38,pitch*.38);
}
function inCircle(x,y,m=0){return Math.hypot(x-cx,y-cy)<Rin-m;}

function roofY(){return Y(.155);}
function skylineH(u){
  const bands=[[-.4,-.33,.05],[-.33,-.29,.08],[-.29,-.24,.04],[-.24,-.2,.11],[-.2,-.15,.06],[-.15,-.12,.03],[-.12,-.07,.07],
    [.14,.19,.05],[.19,.23,.09],[.23,.3,.045],[.3,.34,.12],[.34,.4,.06]];
  for(const [a,b,h] of bands)if(u>=a&&u<b)return h;return .015;
}
function drawBase(g){
  const r=rng(42);
  weave(g,0,0,W,H,'#d6cab4',Math.max(2,3*s),1);
  const fg=g.createRadialGradient(cx,cy,Rin,cx,cy,H*.95);fg.addColorStop(0,'rgba(255,250,240,.12)');fg.addColorStop(1,'rgba(60,40,20,.28)');
  g.fillStyle=fg;g.fillRect(0,0,W,H);
  g.save();g.beginPath();g.arc(cx,cy,Rin,0,TAU);g.clip();
  const cell=Math.max(4,6.2*s);
  weave(g,cx-Rin,cy-Rin,Rin*2,Rin*2,'#ece4d2',cell/2,2);
  g.fillStyle='rgba(80,60,40,.22)';
  for(let y=cy-Rin;y<cy+Rin;y+=cell)for(let x=cx-Rin;x<cx+Rin;x+=cell)g.fillRect(x-.6*s,y-.6*s,1.3*s,1.3*s);
  const gx0=cx-Math.ceil(Rin/cell)*cell, gy0=cy-Math.ceil(Rin/cell)*cell;
  const top=cy-Rin, hor=roofY()-H*.03;
  const cellsX=[];
  for(let y=gy0;y<hor;y+=cell){for(let x=gx0;x<cx+Rin;x+=cell){
    const mx=x+cell/2,my=y+cell/2;if(!inCircle(mx,my,cell*.6))continue;
    const u=(mx-cx)/H;if(my>roofY()-skylineH(u)*H-H*.02)continue;
    let f=clamp((my-top)/(hor-top));f=Math.pow(f,1.6)*(SKY.length-1);
    f+=.35*Math.sin((mx-cx)/H*5)*f/(SKY.length);
    const i=Math.floor(f),fr=f-i;const bi=((Math.round((y-gy0)/cell)&3)<<2)|(Math.round((x-gx0)/cell)&3);
    const col=SKY[clamp(fr*16>BAYER[bi]+.5?i+1:i,0,SKY.length-1)];
    cellsX.push([x,y,col]);}}
  const w=cell*.4,pad=cell*.2;
  for(const [x,y,col] of cellsX)stitch(g,x+pad,y+cell-pad,x+cell-pad,y+pad,shade(col,.9+r()*.1),w,false);
  for(const [x,y,col] of cellsX)stitch(g,x+pad,y+pad,x+cell-pad,y+cell-pad,shade(col,1+r()*.08),w,false);
  g.fillStyle='rgba(15,10,25,.45)';
  for(const [x,y] of cellsX){g.beginPath();g.arc(x,y,cell*.09,0,TAU);g.fill();}
  const ry=roofY();
  const towerCol='#0c1030';
  for(let x=cx-Rin;x<cx+Rin;x+=2.3*s){const u=(x-cx)/H;const h=skylineH(u)*H+H*.02;
    if(!inCircle(x,ry-h,2*s)){continue;}
    stitch(g,x,ry-h,x,ry+2*s,r()<.5?towerCol:'#141a44',2.6*s,false);}
  const tx=X(-.16);
  for(let x=tx-H*.03;x<=tx+H*.03;x+=2.3*s){const d=Math.abs(x-tx)/(H*.03);const top=ry-H*(.25-.06*d*d);
    const holeTop=ry-H*.235, holeBot=ry-H*(.19+.03*(1-d*d));
    if(d<.72){stitch(g,x,top,x,holeTop,'#161c4a',2.6*s,false);stitch(g,x,holeBot,x,ry,'#161c4a',2.6*s,false);}
    else stitch(g,x,top,x,ry,'#161c4a',2.6*s,false);}
  stitch(g,tx-H*.02,ry-H*.2,tx+H*.02,ry-H*.2,'#232a66',2.2*s,false);
  for(let i=0;i<70;i++){const x=cx+(r()-.5)*Rin*1.9,u=(x-cx)/H;const h=skylineH(u)*H;if(h<H*.03)continue;
    const y=ry-r()*h*.9-H*.005;if(!inCircle(x,y,6*s))continue;stitch(g,x,y,x,y+3*s,r()<.7?'#f2c14e':'#f5e3a0',1.6*s,false);}
  const wallCol='#c97d4e', wallDark='#a85e37';
  for(let y=ry;y<cy+Rin;y+=2.2*s){const hw=Math.sqrt(Math.max(0,Rin*Rin-(y-cy)*(y-cy)))-2*s;if(hw<=0)continue;
    const row=Math.round((y-ry)/(2.2*s)), seg=H*.07, off=(row%3)*seg/3;
    for(let a=cx-Rin-off;a<cx+hw;a+=seg){const a0=Math.max(a,cx-hw),b0=Math.min(a+seg,cx+hw);if(b0-a0<2*s)continue;
      stitch(g,a0,y,b0,y,shade(row%9==0?wallDark:wallCol,.95+hash(row*3.1+a)*.1),2.5*s,false);}}
  for(let x=cx-Rin;x<cx+Rin;x+=H*.036){const x0=x,x1=x+H*.024,xm=(x0+x1)/2,yt=ry-H*.028;
    if(!inCircle(xm,yt,4*s))continue;
    for(let yy=yt;yy<ry;yy+=2*s){const f=(yy-yt)/(ry-yt);stitch(g,xm-f*(x1-x0)/2,yy,xm+f*(x1-x0)/2,yy,wallCol,2.3*s,false);}}
  const by=ry+H*.045, bc=cell;
  for(let x=cx-Rin;x<cx+Rin;x+=bc){const k=Math.round((x-cx)/bc);const tri=[[0,0],[0,1],[1,1]];const m=((k%4)+4)%4;
    for(let row=0;row<2;row++){const on=row==1?true:(m==1||m==2);if(!on)continue;const yy=by+row*bc;if(!inCircle(x+bc/2,yy+bc/2,bc))continue;
      stitch(g,x+bc*.14,yy+bc*.86,x+bc*.86,yy+bc*.14,'#f3ead6',bc*.36,false);stitch(g,x+bc*.14,yy+bc*.14,x+bc*.86,yy+bc*.86,'#f3ead6',bc*.36,false);}}
  const wx=X(-.17),wy=ry+H*.1;
  for(let x=wx;x<wx+H*.05;x+=2.2*s){stitch(g,x,wy,x,wy+H*.07,'#f4c04f',2.4*s,false);}
  stitch(g,wx+H*.025,wy,wx+H*.025,wy+H*.07,'#6b3a22',2*s,false);stitch(g,wx,wy+H*.035,wx+H*.05,wy+H*.035,'#6b3a22',2*s,false);
  const tkx=X(-.26),tky=ry-H*.08;
  for(let y=tky;y<ry-H*.028;y+=2.2*s){stitch(g,tkx-H*.035,y,tkx+H*.035,y,'#d9dde2',2.4*s,false);}
  stitch(g,tkx-H*.035,tky+H*.015,tkx+H*.035,tky+H*.015,'#9aa3ad',1.6*s,false);
  stitch(g,tkx-H*.035,tky+H*.035,tkx+H*.035,tky+H*.035,'#9aa3ad',1.6*s,false);
  drawDish(g);
  g.restore();
  const ringW=H*.026;
  const wood=(r0,r1,k)=>{const gg=g.createRadialGradient(cx-H*.1,cy-H*.15,r0*.8,cx,cy,r1*1.02);
    gg.addColorStop(0,`rgb(${220*k|0},${176*k|0},${122*k|0})`);gg.addColorStop(1,`rgb(${176*k|0},${128*k|0},${80*k|0})`);return gg;};
  g.save();g.shadowColor='rgba(40,25,10,.45)';g.shadowBlur=18*s;g.shadowOffsetY=8*s;
  g.beginPath();g.arc(cx,cy,Rin+ringW,0,TAU);g.arc(cx,cy,Rin,TAU,0,true);g.fillStyle=wood(Rin,Rin+ringW,1);g.fill();g.restore();
  g.save();g.beginPath();g.arc(cx,cy,Rin+ringW,0,TAU);g.arc(cx,cy,Rin,TAU,0,true);g.clip();
  g.strokeStyle='rgba(120,70,30,.25)';g.lineWidth=.8*s;
  for(let i=0;i<9;i++){const rr=Rin+ringW*(i+.5)/9;g.beginPath();g.arc(cx,cy,rr,r()*6,r()*6+2+r()*3);g.stroke();}
  g.restore();
  g.strokeStyle='rgba(90,55,25,.6)';g.lineWidth=1*s;g.beginPath();g.arc(cx,cy,Rin+ringW*.45,0,TAU);g.stroke();
  g.strokeStyle='rgba(255,235,200,.35)';g.beginPath();g.arc(cx,cy,Rin+ringW,Math.PI*1.1,Math.PI*1.7);g.stroke();
  const sx=cx,sy=cy-Rin-ringW;
  g.fillStyle='#b8893e';g.fillRect(sx-H*.022,sy-H*.03,H*.044,H*.032);
  g.fillStyle='#8a6428';g.fillRect(sx-H*.022,sy-H*.012,H*.044,H*.006);
  const bg=g.createLinearGradient(sx-H*.008,0,sx+H*.008,0);bg.addColorStop(0,'#8c6a2e');bg.addColorStop(.5,'#f1d38c');bg.addColorStop(1,'#8c6a2e');
  g.fillStyle=bg;g.fillRect(sx-H*.008,sy-H*.06,H*.016,H*.035);
  g.fillStyle='#e8c77c';g.beginPath();g.ellipse(sx,sy-H*.064,H*.016,H*.008,0,0,TAU);g.fill();
  const sk=[X(.62),Y(.3)];
  for(let i=0;i<14;i++){const off=(i-7)*1.6*s;looseThread(g,[[sk[0]-H*.12,sk[1]+off],[sk[0]-H*.04,sk[1]+off-H*.012],[sk[0]+H*.04,sk[1]+off+H*.01],[sk[0]+H*.12,sk[1]+off]],i%2?'#e2507e':'#d8456f',2*s);}
  g.fillStyle='#efe3c8';g.fillRect(sk[0]-H*.03,sk[1]-H*.022,H*.06,H*.044);g.fillStyle='#b23b3b';g.font=`${9*s}px sans-serif`;g.textAlign='center';g.fillText('3805',sk[0],sk[1]+3*s);
}

const DISH={x:.10,y:.045,rx:.095,ry:.046,rot:-.62};
function dishPt(u,v){
  const c=Math.cos(DISH.rot),sn=Math.sin(DISH.rot),x=u*DISH.rx*H,y=v*DISH.ry*H;
  return [X(DISH.x)+x*c-y*sn, Y(DISH.y)+x*sn+y*c];
}
function lnb(){
  const c=Math.cos(DISH.rot-Math.PI/2),sn=Math.sin(DISH.rot-Math.PI/2);
  return [X(DISH.x)+c*H*.085, Y(DISH.y)+sn*H*.085];
}
function drawDish(g){
  const ry=roofY();
  stitch(g,X(DISH.x+.012),Y(DISH.y+.03),X(DISH.x+.02),ry-H*.005,'#5b6470',3.4*s);
  stitch(g,X(DISH.x-.01),ry-H*.004,X(DISH.x+.05),ry-H*.004,'#5b6470',3*s);
  const N=Math.round(DISH.rx*H*2/(2.2*s));
  for(let i=0;i<=N;i++){const u=-1+2*i/N;const v=Math.sqrt(Math.max(0,1-u*u));
    const a=dishPt(u,-v*.96),b=dishPt(u,v*.96);
    const sheen=.5+.5*Math.cos((u+.35)*2.6);
    const col=sheen>.8?'#f4f5f2':sheen>.5?'#dfe3e6':sheen>.25?'#c3c9cf':'#a4acb5';
    stitch(g,a[0],a[1],b[0],b[1],col,2.5*s,false);}
  let prev=dishPt(1,0);
  for(let i=1;i<=36;i++){const a=i/36*TAU;const p=dishPt(Math.cos(a),Math.sin(a));stitch(g,prev[0],prev[1],p[0],p[1],'#6c7580',1.8*s,false);prev=p;}
  const L=lnb(),m=dishPt(0,.95);
  stitch(g,m[0],m[1],L[0],L[1],'#5b6470',2.2*s);
  const m2=dishPt(0,-.95);stitch(g,m2[0],m2[1],L[0],L[1],'#5b6470',1.6*s);
  knot(g,L[0],L[1],'#38404a',4.2*s);
}

const SAT=[-.15,-.265];
function drawSatellite(g,t){
  const [x,y]=[X(SAT[0]),Y(SAT[1])];const a=-.35;
  const c=Math.cos(a),sn=Math.sin(a);const P=(u,v)=>[x+(u*c-v*sn)*H,y+(u*sn+v*c)*H];
  for(const side of [-1,1]){
    for(let k=0;k<7;k++){const u0=side*(.022+k*.005);const p=P(u0,-.012),q=P(u0,.012);stitch(g,p[0],p[1],q[0],q[1],k%2?'#3561b8':'#4a78cf',2.4*s,false);}
    const a1=P(side*.022,0),b1=P(side*.058,0);stitch(g,a1[0],a1[1],b1[0],b1[1],'#c9d1dd',1*s,false);}
  for(let k=0;k<4;k++){const p=P(-.012+k*.008,-.014),q=P(-.012+k*.008,.014);stitch(g,p[0],p[1],q[0],q[1],'#e9c35a',2.6*s,false);}
  const d0=P(0,.016),d1=P(0,.03);stitch(g,d0[0],d0[1],d1[0],d1[1],'#c9d1dd',1.5*s,false);
  knot(g,d1[0],d1[1],'#dfe4ea',2.2*s);
}
function signalLine(g,t){
  const A=[X(SAT[0]),Y(SAT[1])+H*.03],B=lnb();
  const n=22,draw=clamp((t-T_SIG0)/(T_SIG1-T_SIG0));
  const broken=ss(T_UN0,T_UN1,t), gone=ss(20.5,22.5,t);
  if(draw<=0||gone>=1)return;
  const k=Math.floor(draw*n+.001);
  for(let i=0;i<Math.min(n,k);i++){
    const u0=(i+.15)/n,u1=(i+.7)/n;
    const P=u=>{let x=lerp(A[0],B[0],u),y=lerp(A[1],B[1],u)+Math.sin(u*Math.PI)*H*.03;
      if(broken>0){const j=(hash(i*9.1+Math.floor(t*8))-.5)*H*.03*broken;x+=j*.5;y+=j;}return[x,y];};
    const p=P(u0),q=P(u1);
    const live=t>T_SONG0&&t<T_SONG1+1.5&&((i-Math.floor(t*6))%n+n)%n<2;
    stitch(g,p[0],p[1],q[0],q[1],live?'#fff1b8':'#e8d9a8',2*s,false,(1-gone)*(broken>0&&hash(i+Math.floor(t*6))<broken*.4?.25:1));
  }
}

function colX(i){return X(lerp(WX0,WX1,(i+.5)/NCOL));}
function colColor(i){const f=i/(NCOL-1)*(WAVE.length-1);const k=Math.floor(f);return WAVE[f-k>.5?Math.min(k+1,WAVE.length-1):k];}
function drawSong(g,t){
  const prog=clamp((t-T_SONG0)/(T_SONG1-T_SONG0))*NCOL;
  const done=Math.floor(prog), frac=prog-done;
  const cw=(WX1-WX0)*H/NCOL;
  let needle=null;
  for(let i=0;i<NCOL;i++){
    if(i>done)break;
    const amp=SONG[i]*WAMP*H, x=colX(i), yc=Y(WY);
    const ut=T_UN0+(NCOL-1-i)/NCOL*(T_UN1-T_UN0);
    const un=t-ut;
    const col=colColor(i);
    const strands=[-.3,0,.3];
    if(un<0){
      if(i<done){
        const play=t>T_SONG1&&t<T_UN0?Math.exp(-Math.pow((i-(t-T_SONG1)/(T_UN0-T_SONG1)*NCOL),2)/6):0;
        const c=play>.05?tint(col,.45*play):col;
        const a2=amp*(1+.12*play);
        strands.forEach((o,k)=>stitch(g,x+o*cw,yc-a2*(k==1?1:.92),x+o*cw,yc+a2*(k==1?1:.92),c,cw*.36));
      } else {
        const sf=frac*3;
        strands.forEach((o,k)=>{if(sf<k)return;const f=clamp(sf-k);const y0=yc-amp*(k==1?1:.92),y1=yc+amp*(k==1?1:.92);
          const ye=lerp(y0,y1,f);if(f>0)stitch(g,x+o*cw,y0,x+o*cw,ye,col,cw*.36);
          if(sf<k+1)needle=[x+o*cw,ye,f,col];});
      }
    } else if(un<2.6||true){
      if(un>.1){const ha=clamp((un-.1)*2)*(1-ss(20.5,23,t));g.fillStyle=`rgba(30,20,20,${.45*ha})`;
        for(const o of strands){for(const sg of [-1,1]){g.beginPath();g.arc(x+o*cw,yc+sg*amp*(o?.92:1),1.1*s,0,TAU);g.fill();}}}
      if(un>=2.6)continue;
      const f=un/2.6, fall=f*f*H*.35, drift=(hash(i*3.3)-.5)*H*.08*f;
      const pts=[];const L=amp*2*(1+f*.8);
      for(let k=0;k<=8;k++){const u=k/8;const curl=Math.sin(u*9+i+f*6)*H*.012*f*(1+u);
        pts.push([x+drift+curl+ (u-.5)*H*.02*f, yc-amp+u*L*(1-f*.3)+fall]);}
      looseThread(g,pts,col,cw*.3,1-ss(.55,1,f));
    }
  }
  return needle;
}
function drawNeedle(g,t,nd){
  let x,y,col;
  if(nd){[x,y,,col]=nd;}
  else if(t<T_SONG0){const f=ss(T_SIG1,T_SONG0,t);const L=lnb();x=lerp(L[0]+H*.05,colX(0),f);y=lerp(L[1]-H*.02,Y(WY-WAMP*SONG[0]),f);col=WAVE[0];}
  else if(t<T_UN0+.4){const i=NCOL-1;x=colX(i)+H*.025;y=Y(WY)+H*.035;col=colColor(i);}
  else return;
  const vis=1-ss(T_UN0-.2,T_UN0+.4,t)*1, appear=ss(T_SIG1-.4,T_SIG1+.2,t);
  const a=vis*appear;if(a<=0)return;
  const L=lnb();
  const eye=[x+H*.012,y-H*.07];
  const mid=[(L[0]+eye[0])/2+H*.04,Math.min(L[1],eye[1])-H*.06];
  looseThread(g,[L,[L[0]+H*.02,L[1]-H*.05],mid,[eye[0]+H*.02,eye[1]-H*.04],eye],col,2.2*s,a);
  g.globalAlpha=a;
  const ang=Math.atan2(eye[1]-y,eye[0]-x);
  g.save();g.translate(x,y);g.rotate(ang);
  const len=Math.hypot(eye[0]-x,eye[1]-y)+H*.012;
  g.fillStyle='rgba(20,12,6,.35)';g.beginPath();g.moveTo(1*s,3*s);g.lineTo(len+1*s,3*s-1.8*s);g.lineTo(len+1*s,3*s+1.8*s);g.closePath();g.fill();
  const gr=g.createLinearGradient(0,-2*s,0,2*s);gr.addColorStop(0,'#f7f9fb');gr.addColorStop(.5,'#a9b1ba');gr.addColorStop(1,'#5d6570');
  g.fillStyle=gr;g.beginPath();g.moveTo(0,0);g.lineTo(len,-1.9*s);g.arc(len,0,1.9*s,-Math.PI/2,Math.PI/2);g.lineTo(0,0);g.fill();
  g.fillStyle='#3b3f45';g.beginPath();g.ellipse(len-H*.012,0,H*.006,.6*s,0,0,TAU);g.fill();
  g.restore();g.globalAlpha=1;
}

const DIG={'١':['010','010','010','010','010','010','010'],
  '٩':['011','101','101','011','001','001','001'],
  '٨':['010','010','101','101','101','100','100'],
  '٧':['100','100','101','101','010','010','010']};
DIG['٨']=['000','010','010','101','101','101','101'];
DIG['٧']=['101','101','101','101','010','010','000'];
function drawYear(g,t){
  const str=['١','٩','٨','٧'];const c=Math.max(3,5.2*s);
  const x0=X(.02),y0=roofY()+H*.105;
  let n=0;const total=str.reduce((a,d)=>a+DIG[d].join('').split('').filter(v=>v=='1').length,0);
  const prog=clamp((t-T_SIG0)/(T_SIG1-T_SIG0+.6))*total;
  const unpick=ss(T_UN1-1.2,T_UN1+.6,t);
  for(let d=0;d<4;d++){const G=DIG[str[d]];for(let r=0;r<7;r++)for(let k=0;k<3;k++){if(G[r][k]!='1')continue;
    n++;if(n>prog)continue;if(hash(n*7.7)<unpick)continue;
    const x=x0+(d*4+k)*c,y=y0+r*c,col='#f6eedc';
    stitch(g,x+c*.12,y+c*.88,x+c*.88,y+c*.12,col,c*.38,false);stitch(g,x+c*.12,y+c*.12,x+c*.88,y+c*.88,col,c*.38,false);}}
}

function drawStatic(g,t){
  const k=ss(T_UN0+.8,T_UN1+.5,t)*(1-ss(20.6,22.8,t));
  if(k<=0)return;
  const frame=Math.floor(t*12);const r=rng(frame*977+13);
  const n=Math.floor(1500*k);
  const cols=['#f2efe6','#c9c6be','#8d8a86','#4d4b4c','#e8e3d6','#26262a'];
  for(let i=0;i<n;i++){
    const x=X(WX0-.03+r()*(WX1-WX0+.06)), band=WAMP*1.15;
    const y=Y(WY+(r()-.5)*2*band);
    if(!inCircle(x,y,6*s)){r();r();continue;}
    const a=r()*Math.PI, L=(3+r()*5)*s;
    stitch(g,x,y,x+Math.cos(a)*L,y+Math.sin(a)*L,cols[(r()*cols.length)|0],2.3*s,false);
  }
  const L2=lnb();const m=Math.floor(60*k);
  for(let i=0;i<m;i++){const a=r()*TAU,d=r()*H*.05;const x=L2[0]+Math.cos(a)*d,y=L2[1]+Math.sin(a)*d-H*.02;
    stitch(g,x,y,x+(r()-.5)*5*s,y+(r()-.5)*5*s,cols[(r()*cols.length)|0],1.6*s,false);}
}

function drawStars(g,t){
  const r=rng(7);
  for(let i=0;i<34;i++){const x=cx+(r()-.5)*Rin*1.8,y=cy-Rin+r()*(roofY()-cy+Rin)*.62;
    if(!inCircle(x,y,10*s)){r();continue;}
    if(Math.abs(y-Y(WY))<WAMP*H*1.1&&x>X(WX0)-6*s&&x<X(WX1)+6*s){r();continue;}
    const tw=.5+.5*Math.sin(t*TAU/LOOP*(2+(i%3))+r()*6);
    knot(g,x,y,i%5==0?'#f7d77a':'#f4efe0',(1.5+(i%4==0?1:0))*s,tw);}
}

function render(t){
  t=((t%LOOP)+LOOP)%LOOP;
  ctx.drawImage(base,0,0);
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,Rin,0,TAU);ctx.clip();
  drawStars(ctx,t);
  drawSatellite(ctx,t);
  signalLine(ctx,t);
  drawYear(ctx,t);
  const nd=drawSong(ctx,t);
  drawStatic(ctx,t);
  ctx.restore();
  drawNeedle(ctx,t,nd);
  const lg=ctx.createRadialGradient(cx-H*.35,cy-H*.45,H*.1,cx,cy,H*1.1);
  lg.addColorStop(0,'rgba(255,240,210,.10)');lg.addColorStop(1,'rgba(30,20,10,.22)');
  ctx.fillStyle=lg;ctx.fillRect(0,0,W,H);
}

const __t0=performance.now();resize();
if(fixedT!==null){render(fixedT);ctx.getImageData(0,0,1,1);window.__ms=performance.now()-__t0;document.title='done';}
else{addEventListener('resize',resize);const start=performance.now();(function f(){render((performance.now()-start)/1000);requestAnimationFrame(f);})();}
