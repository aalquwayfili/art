'use strict';
const LOOP = 24;
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const qs = new URLSearchParams(location.search), fixedT = qs.has('t') ? parseFloat(qs.get('t')) : null;
let W, H, s, cx, paperPat, stipple;

function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
const clamp=(x,a=0,b=1)=>x<a?a:x>b?b:x, lerp=(a,b,t)=>a+(b-a)*t;
const ss=(a,b,x)=>{x=clamp((x-a)/(b-a));return x*x*(3-2*x);};
function hash(n){n=Math.sin(n*127.1+311.7)*43758.5453;return n-Math.floor(n);}
function vnoise(x){const i=Math.floor(x),f=x-i,u=f*f*(3-2*f);return lerp(hash(i),hash(i+1),u)*2-1;}
const INK='#231c17';
let boil=0;
function jit(i,amp){return (hash(i*7.13+boil*13.7)-.5)*2*amp;}

function ink(pts,w=1,col=INK,a=1,seed=0){
  ctx.strokeStyle=col;ctx.globalAlpha=a;ctx.lineWidth=w*s;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();
  for(let i=0;i<pts.length;i++){const p=pts[i];const x=p[0]+jit(seed+i,.7*s),y=p[1]+jit(seed+i+99,.7*s);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
  ctx.stroke();ctx.globalAlpha=1;
}
function line(x0,y0,x1,y1,w=1,a=1,seed=0){ink([[x0,y0],[x1,y1]],w,INK,a,seed);}

function surfY(x){
  const u=(x-cx)/(H*.32);
  return H*.70 + Math.sin(x/(H*.9)+.5)*H*.012 + vnoise(x/(H*.25))*H*.006 + Math.exp(-u*u*2.2)*H*.03;
}
function duneY(i,x){
  const base=[.44,.52,.60][i], amp=[.07,.085,.07][i], f=[1.3,1.0,1.6][i], ph=[0,2.1,4.4][i];
  const u=x/(H)*f+ph;
  const saw=(v)=>{v=v-Math.floor(v);return v<.7?Math.pow(v/.7,1.4):Math.pow((1-v)/.3,.8);};
  return H*base - H*amp*(saw(u*.55)*0.8+ .35*saw(u*1.3+.3)) ;
}
const PLANTS=[
  {dx:-.36,sp:0,h:.07,d:.07},{dx:-.29,sp:1,h:.12,d:.10},{dx:-.22,sp:2,h:.10,d:.06},{dx:-.16,sp:0,h:.14,d:.09},
  {dx:-.09,sp:1,h:.17,d:.12},{dx:-.02,sp:2,h:.08,d:.07},{dx:.05,sp:1,h:.13,d:.08},{dx:.11,sp:0,h:.10,d:.05},
  {dx:.18,sp:1,h:.15,d:.11},{dx:.24,sp:2,h:.12,d:.08},{dx:.30,sp:0,h:.09,d:.07},{dx:.37,sp:1,h:.10,d:.09},
];
PLANTS.forEach((p,i)=>{p.i=i;p.t0=12.2+hash(i*3.3)*1.6;p.tb=14.6+hash(i*5.1)*1.5;p.tw=18.2+hash(i*1.9)*1.4;});

function resize(){
  const dpr=fixedT!==null?1:Math.min(2,window.devicePixelRatio||1);
  W=cv.width=Math.round(innerWidth*dpr);H=cv.height=Math.round(innerHeight*dpr);
  s=H/600;cx=W/2;
  const pc=document.createElement('canvas');pc.width=pc.height=384;const p=pc.getContext('2d');
  const id=p.createImageData(384,384),r=rng(7);
  for(let i=0;i<384*384;i++){const x=i%384,y=(i/384)|0;
    const m=(Math.sin(x*.05)+Math.sin(y*.043+x*.02)+Math.sin((x+y)*.031))*1.5;
    const n=(r()-.5)*10+m;
    id.data[i*4]=239+n;id.data[i*4+1]=230+n;id.data[i*4+2]=210+n*1.1;id.data[i*4+3]=255;}
  p.putImageData(id,0,0);
  p.strokeStyle='rgba(120,100,70,.10)';p.lineWidth=.6;
  for(let i=0;i<260;i++){const x=r()*384,y=r()*384,a=r()*6.28,l=4+r()*14;p.beginPath();p.moveTo(x,y);p.quadraticCurveTo(x+Math.cos(a)*l*.5+r()*3,y+Math.sin(a)*l*.5+r()*3,x+Math.cos(a)*l,y+Math.sin(a)*l);p.stroke();}
  paperPat=ctx.createPattern(pc,'repeat');
  stipple=[];const rs=rng(11);const n=Math.round(W*H*.030);
  for(let i=0;i<n;i++){const x=rs()*W,y=H*.66+rs()*H*.36;const d=(y-surfY(x))/(H*.3);
    if(d<0)continue; if(rs()>0.25+d*.9)continue; stipple.push(x,y,rs());}
}

function drawSky(t,dark){
  ctx.fillStyle=paperPat;ctx.fillRect(0,0,W,H);
  if(dark>0){const g=ctx.createLinearGradient(0,0,0,H*.7);g.addColorStop(0,`rgba(62,74,92,${.26*dark})`);g.addColorStop(1,`rgba(62,74,92,${.05*dark})`);ctx.fillStyle=g;ctx.fillRect(0,0,W,H*.7);}
  const sx=cx+H*.62, sy=H*.17, r=H*.045;
  ctx.fillStyle=`rgba(232,170,70,${.55-.35*dark})`;ctx.beginPath();ctx.arc(sx,sy,r,0,7);ctx.fill();
  const pts=[];for(let i=0;i<=40;i++){const a=i/40*6.283;pts.push([sx+Math.cos(a)*r,sy+Math.sin(a)*r]);}
  ink(pts,1.3,INK,1,5);
  const heat=1-dark;
  for(let i=0;i<16;i++){const a=i/16*6.283+t*.15;const r0=r*1.35+ (i%2)*r*.15,r1=r0+r*(.35+.25*heat)*(0.8+.4*hash(i+Math.floor(t*3)));
    line(sx+Math.cos(a)*r0,sy+Math.sin(a)*r0,sx+Math.cos(a)*r1,sy+Math.sin(a)*r1,1,.85,40+i);}
}

function escY(x){
  const u=x/H;return H*(.355+ .012*vnoise(u*3)+.006*vnoise(u*11)) + (vnoise(u*.9+3)>.35?H*.05:0)*0;
}
function drawEscarpment(t,dark){
  const pts=[];for(let x=-10;x<=W+10;x+=5*s)pts.push([x,escY(x)]);
  ctx.beginPath();ctx.moveTo(-10,H);pts.forEach(p=>ctx.lineTo(p[0],p[1]));ctx.lineTo(W+10,H);ctx.closePath();
  ctx.fillStyle=paperPat;ctx.fill();ctx.fillStyle=`rgba(120,120,140,${.12+.08*dark})`;ctx.fill();
  for(let x=0,k=0;x<W;x+=3.2*s,k++){const y=escY(x);const g=vnoise(x/(H*.05));const L=H*(.018+.02*(g*.5+.5));
    line(x,y+1.5*s,x+jit(k,1*s),y+L,.55,.35+.35*(g*.5+.5),7000+k);}
  ink(pts,.8,INK,.7,6900);
}
function drawDunes(t,dark){
  drawEscarpment(t,dark);
  for(let i=0;i<3;i++){
    const pts=[];for(let x=-10;x<=W+10;x+=6*s)pts.push([x,duneY(i,x)]);
    ctx.beginPath();ctx.moveTo(-10,H);pts.forEach(p=>ctx.lineTo(p[0],p[1]));ctx.lineTo(W+10,H);ctx.closePath();
    ctx.fillStyle=paperPat;ctx.fill();ctx.fillStyle=`rgba(205,150,88,${[.12,.18,.24][i]})`;ctx.fill();
    if(dark>0){ctx.fillStyle=`rgba(62,74,92,${.10*dark})`;ctx.fill();}
    const sp=[3.6,3.2,3.0][i]*s, L=[.05,.07,.09][i]*H;
    for(let x=0,k=0;x<W;x+=sp,k++){
      const y=duneY(i,x),sl=(duneY(i,x+4)-y)/4;
      if(sl>.05){const k2=clamp(sl*1.1);
        const len=L*(.25+k2)*(0.85+.3*hash(x*.1+i));
        line(x,y+1*s,x-len*.45,y+len,.65,.45+.4*k2,x*.3+i*1000);
        if(k2>.45&&k%2==0)line(x-len*.1,y+len*.25,x+len*.25,y+len*.8,.55,.45,x*.7+i*1300);
      } else if(sl<-.02 && k%3==0){
        const yy=y+H*(.012+.03*hash(k*1.3+i));line(x,yy,x+7*s,yy-1.2*s,.5,.35,x*.9+i*1700);
      }
    }
    ink(pts,[.9,1.1,1.3][i],INK,.9,300+i*50);
  }
}

function drawGround(t,wet,dryCrack){
  const pts=[];for(let x=-10;x<=W+10;x+=4*s)pts.push([x,surfY(x)]);
  ctx.beginPath();ctx.moveTo(-10,H+5);pts.forEach(p=>ctx.lineTo(p[0],p[1]));ctx.lineTo(W+10,H+5);ctx.closePath();
  ctx.fillStyle=paperPat;ctx.fill();ctx.fillStyle='rgba(196,140,80,.20)';ctx.fill();
  if(wet>0){
    ctx.save();ctx.clip();
    const wp=[];for(let x=-10;x<=W+10;x+=8*s){const u=(x-cx)/(H*.55);wp.push([x,surfY(x)+H*.26*wet*Math.exp(-u*u*2)*(0.85+.15*vnoise(x/(H*.08)))]);}
    ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));for(let i=wp.length-1;i>=0;i--)ctx.lineTo(wp[i][0],wp[i][1]);ctx.closePath();
    ctx.fillStyle=`rgba(92,70,48,${.20*Math.min(1,wet*1.5)})`;ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle=INK;
  for(let i=0;i<stipple.length;i+=3){const x=stipple[i],y=stipple[i+1],r=stipple[i+2];
    let a=.55;const sy=surfY(x);
    if(wet>0){const u=(x-cx)/(H*.55);const front=sy+H*.26*wet*Math.exp(-u*u*2);if(y<front)a=.85;else if(r>.55)continue;}
    else if(r>.62)continue;
    ctx.globalAlpha=a;const sz=(r<.1?1.8:1.1)*s;ctx.fillRect(x,y,sz,sz);}
  ctx.globalAlpha=1;
  const rp=rng(23);
  for(let k=0;k<22;k++){const x=rp()*W,y=surfY(x)+H*(.05+rp()*.25),rx=(4+rp()*9)*s,ry=rx*(.5+rp()*.3),rot=rp()*3;
    ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.fillStyle=paperPat;ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,7);ctx.fill();ctx.restore();
    const pp=[];for(let j=0;j<=14;j++){const a=j/14*6.283;pp.push([x+Math.cos(a+rot)*rx*Math.cos(0)-0,y+Math.sin(a+rot)*ry]);}
    ink(pp,.9,INK,.9,900+k*20);
    for(let j=0;j<4;j++)line(x-rx*.3+j*rx*.2,y+ry*.1,x-rx*.1+j*rx*.2,y+ry*.7,.6,.6,1500+k*9+j);}
  ink(pts,1.5,INK,1,2000);
  const rc=rng(31);
  for(let k=0;k<34;k++){const x=rc()*W,y=surfY(x),d=H*(.012+rc()*.03)*dryCrack,w=(2+rc()*3)*s*dryCrack;
    if(d<1)continue;ink([[x-w,y],[x+rc()*2*s-1*s,y+d],[x+w,y]],.9,INK,.9,2100+k*5);}
  const rg=rng(41);
  for(let k=0;k<16;k++){const x=rg()*W,y=surfY(x);if(Math.abs(x-cx)<H*.42)continue;
    for(let j=0;j<5;j++){const a=-1.57+(j-2)*.28+vnoise(t*.7+k)*.08;line(x,y,x+Math.cos(a)*8*s,y+Math.sin(a)*10*s,.7,.8,2400+k*7+j);}}
}

function drawPuddle(t,level,rain){
  if(level<=0.01)return;
  const hw=H*.30, base=surfY(cx);
  const wl=base-H*.034*level;
  ctx.save();
  ctx.beginPath();for(let x=cx-hw;x<=cx+hw;x+=3*s){const y=Math.max(wl,surfY(x));x===cx-hw?ctx.moveTo(x,wl):ctx.lineTo(x,y);}ctx.lineTo(cx+hw,wl);ctx.closePath();
  ctx.fillStyle=`rgba(110,150,175,${.55*clamp(level*2)})`;ctx.fill();ctx.clip();
  for(let k=0;k<9;k++){const y=wl+(k+1)*H*.0035;const x0=cx-hw*(.8-k*.06),x1=cx+hw*(.7-k*.05);line(x0+jit(k,6*s),y,x1,y,.6,.5,2600+k);}
  ctx.restore();
  let x0=cx,x1=cx;for(let x=cx;x>cx-hw;x-=2*s){if(surfY(x)<wl)break;x0=x;}for(let x=cx;x<cx+hw;x+=2*s){if(surfY(x)<wl)break;x1=x;}
  ink([[x0,wl],[x1,wl]],1,INK,.9,2700);
  if(rain>0){for(let k=0;k<10;k++){const ph=(t*1.3+hash(k*4.1))%1;const x=lerp(x0,x1,hash(k*9.7+Math.floor(t*1.3+hash(k*4.1))));
    const r=ph*16*s;ctx.globalAlpha=(1-ph)*rain;ctx.strokeStyle=INK;ctx.lineWidth=.8*s;ctx.beginPath();ctx.ellipse(x,wl,r,r*.22,0,0,7);ctx.stroke();}ctx.globalAlpha=1;}
}

function cloudPath(x,y,sc){
  const bumps=[[-1.1,.05,.42],[-.7,-.25,.55],[-.15,-.45,.7],[.45,-.3,.6],[.95,-.02,.45],[.2,.05,.55],[-.45,.08,.5]];
  return bumps.map(b=>[x+b[0]*sc,y+b[1]*sc,b[2]*sc]);
}
function drawCloud(t,x,y,dark,sc){
  const B=cloudPath(x,y,sc);
  ctx.fillStyle=INK;B.forEach((b,i)=>{ctx.beginPath();ctx.arc(b[0]+jit(i,.6*s),b[1]+jit(i+5,.6*s),b[2]+1.3*s,0,7);ctx.fill();});
  ctx.fillRect(x-1.1*sc,y+.05*sc-1.3*s,2.05*sc,.35*sc+2.6*s);
  const body=()=>{ctx.beginPath();B.forEach(b=>{ctx.moveTo(b[0]+b[2],b[1]);ctx.arc(b[0],b[1],b[2],0,7);});ctx.rect(x-1.1*sc,y+.05*sc,2.05*sc,.35*sc);};
  body();ctx.fillStyle=paperPat;ctx.fill();
  ctx.fillStyle=`rgba(70,80,96,${.10+.40*dark})`;ctx.fill();
  ctx.save();body();ctx.clip();
  const top=y-1.2*sc,bot=y+.4*sc;
  for(let k=0,xx=x-1.8*sc;xx<x+1.8*sc;xx+=4*s,k++){
    const f=.35+.4*dark;const y0=lerp(bot,top,f+.12*hash(k));line(xx,bot,xx+ (bot-y0)*.45,y0,.7,.8,3000+k);
    if(dark>.35){const y1=lerp(bot,top,(dark-.3)*.7+.05*hash(k+3));line(xx+ (bot-y1)*.45,bot,xx,y1,.7,.7,3500+k);}
    if(dark>.7){line(xx,bot-2*s,xx+30*s,bot-2*s-(dark-.7)*sc*.9,.6,.6,3900+k);}
  }
  ctx.restore();
}

function drawRain(t,x,y,sc,rain,groundY){
  if(rain<=0)return;const n=Math.round(140*rain);
  for(let k=0;k<n;k++){const rx=x+(hash(k*1.7)-.5)*2.0*sc, sp=H*(1.1+hash(k*2.3)*.4);
    const fall=groundY-y; const ph=(t*sp/fall+hash(k*3.1))%1; const yy=y+.3*sc+ph*fall;
    const L=14*s; line(rx+ (yy-y)*.12,yy,rx+(yy-y+L)*.12,yy+L,.8,.75,4000+k);
    if(ph>.93){const gx=rx+(groundY-y)*.12,gy=surfY(gx);line(gx-3*s,gy-4*s,gx,gy,.7,.8,4300+k);line(gx+3*s,gy-4*s,gx,gy,.7,.8,4400+k);}
  }
}

const PETAL=[[232,168,48],[214,62,48],[132,96,170]];
function drawPlant(p,t){
  const x=cx+p.dx*H, sy=surfY(x), seedY=sy+p.d*H;
  const g=ss(p.t0,p.t0+2.6,t), b=ss(p.tb,p.tb+1.8,t), w=ss(p.tw,p.tw+2.6,t);
  const blow=ss(21.4,23.4,t);
  const rootA=1-ss(21.5,23.5,t);
  const cracking=ss(p.t0-.6,p.t0+.4,t);
  if(t<p.t0+1.2){
    const a=1-ss(p.t0+.5,p.t0+1.2,t);
    ctx.globalAlpha=a;ctx.fillStyle='#c79a5a';ctx.beginPath();ctx.ellipse(x,seedY,4.2*s,2.8*s,.3,0,7);ctx.fill();ctx.globalAlpha=1;
    const pts=[];for(let j=0;j<=12;j++){const q=j/12*6.283;pts.push([x+Math.cos(q)*4.2*s*Math.cos(.3)-Math.sin(q)*2.8*s*Math.sin(.3),seedY+Math.cos(q)*4.2*s*Math.sin(.3)+Math.sin(q)*2.8*s*Math.cos(.3)]);}
    ink(pts,.9,INK,a,5000+p.i*20);
    if(cracking>0)line(x-3*s,seedY-1*s,x+3*s*cracking,seedY+1*s,.7,a,5050+p.i);
  }
  if(g>0&&rootA>0){const rr=rng(100+p.i);
    for(let r=0;r<4;r++){const pts=[[x,seedY]];let px=x,py=seedY,ang=1.57+(rr()-.5)*1.2;const len=H*(.03+.07*rr())*g;
      for(let j=1;j<=8;j++){ang+=(rr()-.5)*.5;px+=Math.cos(ang)*len/8;py+=Math.sin(ang)*len/8;pts.push([px,py]);}
      ink(pts,.7,INK,.8*rootA,5100+p.i*40+r*9);}
  }
  if(g<=0)return;
  if(rootA>0)ink([[x,seedY],[x+1*s,lerp(seedY,sy,.5)],[x,sy]],.8,INK,.9*rootA,5200+p.i);
  if(blow>=1)return;
  const hh=p.h*H*g*(1-.15*w);
  const sway=vnoise(t*.9+p.i)*6*s+ (1-w)*0;
  const droop=w*1.6;
  ctx.save();
  if(blow>0){ctx.translate(x+blow*blow*W*.75,sy-Math.sin(blow*3.14)*H*.10);ctx.rotate(blow*blow*5*(p.i%2?1:-.6));ctx.translate(-x,-sy);}
  const stem=[];let ang=-1.57,px=x,py=sy;const seg=10;
  for(let j=0;j<=seg;j++){stem.push([px,py]);const k=j/seg;ang=-1.57+k*k*droop*(p.i%2?1:-1)+sway/(40*s)*k;px+=Math.cos(ang)*hh/seg;py+=Math.sin(ang)*hh/seg;}
  const col=w>.5?'#5b4a36':INK;
  ink(stem,1.1,col,1,5300+p.i*11);
  if(g>.3){for(let l=0;l<2;l++){const sp=stem[3+l*2],dir=l?1:-1,ll=(10+p.h*40)*s*ss(.3,1,g)*(1-.4*w);
    const tip=[sp[0]+dir*ll,sp[1]-ll*.35+w*ll*.9];const mid=[sp[0]+dir*ll*.5,sp[1]-ll*.45+w*ll*.4];
    ctx.fillStyle=`rgba(${lerp(120,150,w)|0},${lerp(150,120,w)|0},${lerp(80,70,w)|0},.55)`;
    ctx.beginPath();ctx.moveTo(sp[0],sp[1]);ctx.quadraticCurveTo(mid[0],mid[1]-4*s,tip[0],tip[1]);ctx.quadraticCurveTo(mid[0],mid[1]+5*s,sp[0],sp[1]);ctx.fill();
    ink([sp,mid,tip],.8,col,1,5400+p.i*9+l);}}
  const hd=stem[seg];const hx=hd[0],hy=hd[1];
  const C=PETAL[p.sp];const fade=w;const cr=lerp(C[0],150,fade),cg=lerp(C[1],110,fade),cb=lerp(C[2],70,fade);
  const open=b*(1-.6*w);
  if(p.sp===2){
    for(let k=0;k<7;k++){const f=k/7;const bx=hx,by=hy+f*hh*.4;
      const r=(3+5*open)*s*(1-f*.4);if(b<=0)continue;
      ctx.fillStyle=`rgba(${cr|0},${cg|0},${cb|0},${.75*(1-.4*w)})`;ctx.beginPath();ctx.arc(bx+(k%2?3:-3)*s*open,by,r,0,7);ctx.fill();
      ctx.strokeStyle=INK;ctx.lineWidth=.7*s;ctx.stroke();}
  } else {
    const np=p.sp===0?13:5,R=(p.sp===0?12:18)*s*(0.3+open*.7);
    const tilt=p.sp===1?.5:0;
    if(b>0){
      for(let k=0;k<np;k++){
        const fallen=clamp((w-.55-hash(k+p.i*9)*.3)*4); if(fallen>=1)continue;
        let a=k/np*6.283+p.i;const dropA=w*1.2;
        let px2=hx,py2=hy+fallen*fallen*(sy-hy);px2+=fallen*20*s*(hash(k)-.5);
        ctx.save();ctx.translate(px2,py2);ctx.scale(1,p.sp===1?.62:.8);
        const pa=a+dropA*Math.sin(a);
        ctx.rotate(pa);
        ctx.fillStyle=`rgba(${cr|0},${cg|0},${cb|0},${.82})`;
        ctx.beginPath();ctx.ellipse(R*.55,0,R*.6,R*(p.sp===1?.5:.22),0,0,7);ctx.fill();
        ctx.lineWidth=.7*s;ctx.strokeStyle=INK;ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle=p.sp===1?INK:'#8a5a1c';ctx.beginPath();ctx.arc(hx,hy,(p.sp===1?4.5:4)*s*(.4+.6*open)+w*2*s,0,7);ctx.fill();
    } else {
      ctx.fillStyle='rgba(120,150,80,.6)';ctx.beginPath();ctx.ellipse(hx,hy,2.5*s*g,4*s*g,ang+1.57,0,7);ctx.fill();ctx.strokeStyle=INK;ctx.lineWidth=.8*s;ctx.stroke();
    }
  }
  ctx.restore();
  const fs=ss(p.tw+1.6,p.tw+2.4,t), sink=ss(21.8,23.6,t);
  if(fs>0){const fx=lerp(hx,x,fs),fy=lerp(hy,sy,fs*fs);const yy=lerp(fy,seedY,sink);
    ctx.fillStyle='#c79a5a';ctx.beginPath();ctx.ellipse(fx,yy,4.2*s,2.8*s,.3,0,7);ctx.fill();ctx.strokeStyle=INK;ctx.lineWidth=.9*s;ctx.stroke();}
}

function drawBeetle(t){
  const t0=12.6,t1=15.2,t2=16.8,t3=20.5;
  if(t<t0||t>t3)return;
  const hw=H*.30;const edge=cx+hw*.62;
  let x,dir,walking;
  if(t<t1){x=lerp(W+30*s,edge,ss(t0,t1,t)*0+ (t-t0)/(t1-t0));dir=-1;walking=1;}
  else if(t<t2){x=edge;dir=-1;walking=0;}
  else {x=lerp(edge,cx+H*.9,(t-t2)/(t3-t2));dir=1;walking=1;}
  const y=surfY(x);const drink=t>t1&&t<t2?Math.sin((t-t1)*9)*.5+.5:0;
  ctx.save();ctx.translate(x,y-7*s);ctx.scale(dir*1.5,1.5);ctx.rotate(-drink*.18*-1);
  for(let k=0;k<3;k++){const ph=t*14+k*2.1;const lx=(-5+k*5)*s;const sw=walking?Math.sin(ph)*3*s:0;
    ctx.strokeStyle=INK;ctx.lineWidth=1*s;ctx.beginPath();ctx.moveTo(lx,0);ctx.lineTo(lx+sw-2*s,5*s);ctx.stroke();}
  ctx.fillStyle=INK;ctx.beginPath();ctx.ellipse(1*s,-1*s,8*s,4.5*s,0,Math.PI,0);ctx.lineTo(9*s,0);ctx.fill();
  ctx.beginPath();ctx.arc(-8*s,-.5*s+drink*2*s,2.6*s,0,7);ctx.fill();
  ctx.strokeStyle='rgba(239,230,210,.7)';ctx.lineWidth=.7*s;ctx.beginPath();ctx.moveTo(-4*s,-3.5*s);ctx.quadraticCurveTo(1*s,-5.5*s,6*s,-3*s);ctx.stroke();
  ctx.strokeStyle=INK;ctx.lineWidth=.7*s;ctx.beginPath();ctx.moveTo(-10*s,-1*s+drink*2*s);ctx.lineTo(-13*s,-4*s+drink*3*s);ctx.stroke();
  ctx.restore();
}

function drawBirds(t){
  if(t<13.2||t>18.5)return;
  for(let k=0;k<3;k++){const f=(t-13.2-k*.35)/5;if(f<0||f>1)continue;
    const x=lerp(-40*s,W+40*s,f)+k*18*s, y=H*(.26+.05*k)+Math.sin(f*9+k)*H*.02;
    const fl=Math.sin(t*16+k*2)*4*s;
    ink([[x-8*s,y-fl],[x-3*s,y-1*s],[x,y+1.5*s],[x+3*s,y-1*s],[x+8*s,y-fl]],1.1,INK,1,6000+k*10);}
}

function drawWind(t){
  const a=ss(19.5,21.5,t)*(1-ss(23.3,24,t))+ (1-ss(0,2,t))*.4;
  if(a<=0)return;
  for(let k=0;k<26;k++){const sp=H*.9;const x=((t*sp*.4+hash(k)*W*1.4)%(W*1.4))-W*.2;const y=surfY(x)-H*(.004+hash(k*3)*.018);
    line(x,y,x+(20+hash(k*5)*40)*s,y-1*s,.7,a*.7,6100+k);}
}

function render(t){
  t=((t%LOOP)+LOOP)%LOOP;boil=Math.floor(t*10);
  const cxp=cx-H*.02;
  const cloudIn=ss(1.5,7.5,t), cloudOut=ss(12.6,17.5,t);
  const cX=lerp(-H*.9, cxp, cloudIn) + (cloudOut>0?cloudOut*cloudOut*(W*.5+H):0);
  const dark=ss(3,8,t)*(1-ss(11.8,14.5,t));
  const rain=ss(7.8,8.8,t)*(1-ss(11.4,12.8,t));
  const wet=ss(8.5,12.2,t)*(1-ss(16.5,22,t));
  const puddle=ss(9,12,t)*(1-ss(14.5,19.5,t));
  const crack=1-ss(8.6,10.5,t)*(1-ss(18.5,22.5,t));
  drawSky(t,dark);
  drawDunes(t,dark);
  drawBirds(t);
  const cY=H*.22, sc=H*.13;
  drawRain(t,cX,cY,sc,rain,surfY(cX));
  drawGround(t,wet,crack);
  drawPuddle(t,puddle,rain);
  PLANTS.forEach(p=>drawPlant(p,t));
  drawBeetle(t);
  drawWind(t);
  if(cX>-H*1.5&&cX<W+H*1.5)drawCloud(t,cX,cY,dark,sc);
  ctx.strokeStyle='rgba(35,28,23,.5)';ctx.lineWidth=1*s;ctx.strokeRect(10*s,10*s,W-20*s,H-20*s);
}

resize();
if(fixedT!==null){const t0=performance.now();render(fixedT);window.__ms=performance.now()-t0;document.title='done';}
else{addEventListener('resize',resize);const start=performance.now();(function f(){render((performance.now()-start)/1000);requestAnimationFrame(f);})();}
