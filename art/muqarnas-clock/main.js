'use strict';
const LOOP = 24, T0 = 1.2, T1 = 19.2;
const qs = new URLSearchParams(location.search), fixedT = qs.has('t') ? parseFloat(qs.get('t')) : null;
const CTXOPT = fixedT!==null?{willReadFrequently:true}:{};
const cv = document.getElementById('c'), ctx = cv.getContext('2d', CTXOPT);
let W, H, s, cx, cy, Rd, paper, inkLayer, inkGold, cells = [], squinch = [];
const INK = '#2a211b', BLUE = 'rgba(60,98,150,', GOLD = [226, 168, 74];

function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
const clamp=(x,a=0,b=1)=>x<a?a:x>b?b:x, lerp=(a,b,t)=>a+(b-a)*t;
const ss=(a,b,x)=>{x=clamp((x-a)/(b-a));return x*x*(3-2*x);};
const U = Math.PI/32;
const P = (r,a)=>[cx+Math.sin(a)*r*Rd, cy-Math.cos(a)*r*Rd];

const R0=.235, r0=R0*Math.cos(6*Math.PI/16)/Math.cos(5*Math.PI/16);
const R1=.315, R2=.415, R3=.53, RH3=.475, R4=.65, R5=.80;
function buildCells(){
  cells=[];
  for(let m=0;m<16;m++){const c=(4*m+2)*U;
    cells.push({ring:1,a:c,pts:[P(r0,c),P(R0,c-2*U),P(R1,c),P(R0,c+2*U)],axis:[0,2]});}
  for(let m=0;m<16;m++){const c=4*m*U;
    cells.push({ring:2,a:c,pts:[P(R0,c),P(R1,c-2*U),P(R2,c),P(R1,c+2*U)],axis:[0,2]});}
  for(let m=0;m<16;m++){const c=(4*m+2)*U;
    cells.push({ring:3,a:c,pts:[P(R1,c),P(R2,c-2*U),P(R3,c-U),P(RH3,c),P(R3,c+U),P(R2,c+2*U)],axis:[0,3]});}
  for(let j=0;j<64;j+=2){const c=j*U, b=(j%4==0)?R2:RH3;
    cells.push({ring:4,a:c,pts:[P(b,c),P(R3,c-U),P(R4,c),P(R3,c+U)],axis:[0,2]});}
  for(let j=1;j<64;j+=2){const c=j*U;
    cells.push({ring:5,a:c,pts:[P(R3,c),P(R4,c-U),P(R5,c),P(R4,c+U)],axis:[0,2]});}
  for(let j=0;j<64;j+=2){const c=j*U;
    cells.push({ring:6,a:c,pts:[P(R4,c),P(R5,c-U),P(1,c-U),P(1,c+U),P(R5,c+U)],axis:[0,-1],arc:1});}
  const st=[];for(let i=0;i<32;i++)st.push(P(i%2?r0:R0,i*2*U));
  cells.push({ring:0,a:0,pts:st,axis:null});
  const key=c=>(c.ring==0?100:(6-c.ring)*10)+((c.a%(2*Math.PI))+2*Math.PI)%(2*Math.PI)/(2*Math.PI);
  cells.sort((a,b)=>key(a)-key(b));
  const n=cells.length;
  cells.forEach((c,i)=>{c.t=T0+(T1-T0)*i/(n-1);
    let x=0,y=0;c.pts.forEach(p=>{x+=p[0];y+=p[1];});c.cx=x/c.pts.length;c.cy=y/c.pts.length;});
}

function poly(g,pts){g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.closePath();}
function seg(g,a,b){g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);}

function hatch(g,pts,ang,sp,w,col){
  g.save();poly(g,pts);g.clip();
  let mnx=1e9,mny=1e9,mxx=-1e9,mxy=-1e9;pts.forEach(p=>{mnx=Math.min(mnx,p[0]);mxx=Math.max(mxx,p[0]);mny=Math.min(mny,p[1]);mxy=Math.max(mxy,p[1]);});
  const mx=(mnx+mxx)/2,my=(mny+mxy)/2,rad=Math.hypot(mxx-mnx,mxy-mny)/2+2;
  const dx=Math.cos(ang),dy=Math.sin(ang),nx=-dy,ny=dx;
  g.strokeStyle=col;g.lineWidth=w;g.beginPath();
  for(let o=-rad;o<=rad;o+=sp){g.moveTo(mx+nx*o-dx*rad,my+ny*o-dy*rad);g.lineTo(mx+nx*o+dx*rad,my+ny*o+dy*rad);}
  g.stroke();g.restore();
}

function drawInk(){
  inkLayer=document.createElement('canvas');inkLayer.width=W;inkLayer.height=H;
  const g=inkLayer.getContext('2d',CTXOPT);g.lineCap='round';g.lineJoin='round';
  const lw=Math.max(.6,.85*s);
  g.strokeStyle=BLUE+'.28)';g.lineWidth=.6*s;g.setLineDash([6*s,4*s]);
  [R0,R1,R2,R3,R4,R5,1].forEach(r=>{g.beginPath();g.arc(cx,cy,r*Rd,0,7);g.stroke();});
  g.setLineDash([]);g.strokeStyle=BLUE+'.18)';
  g.beginPath();for(let i=0;i<16;i++){const a=i*4*U;seg(g,P(0,a),P(1.16,a));}g.stroke();
  g.beginPath();seg(g,[cx-Rd*1.35,cy],[cx+Rd*1.35,cy]);seg(g,[cx,cy-Rd*1.35],[cx,cy+Rd*1.35]);g.stroke();

  const a0=Rd*1.0, a1=Rd*1.11;
  const outer=[[cx-a1,cy-a1],[cx+a1,cy-a1],[cx+a1,cy+a1],[cx-a1,cy+a1]];
  const inner=[[cx-a0,cy-a0],[cx+a0,cy-a0],[cx+a0,cy+a0],[cx-a0,cy+a0]];
  g.save();g.beginPath();poly(g,outer);g.moveTo(inner[0][0],inner[0][1]);for(let i=3;i>=0;i--)g.lineTo(inner[i][0],inner[i][1]);g.closePath();g.clip('evenodd');
  g.fillStyle='rgba(42,33,27,.06)';g.fillRect(0,0,W,H);
  g.strokeStyle='rgba(42,33,27,.55)';g.lineWidth=.6*s;g.beginPath();
  for(let o=-a1*2;o<a1*2;o+=4*s){seg(g,[cx+o-a1,cy+a1],[cx+o+a1,cy-a1]);}g.stroke();g.restore();
  const gap=(x0,y0,x1,y1)=>{g.fillStyle=paper;g.fillRect(Math.min(x0,x1),Math.min(y0,y1),Math.abs(x1-x0),Math.abs(y1-y0));};
  const dw=Rd*.16;gap(cx-dw,cy+a0-1,cx+dw,cy+a1+1);
  g.strokeStyle=INK;g.lineWidth=lw*1.3;poly(g,outer);g.stroke();poly(g,inner);g.stroke();
  g.fillStyle=paper;g.fillRect(cx-dw,cy+a0-2*s,dw*2,a1-a0+4*s);
  g.lineWidth=lw;g.beginPath();seg(g,[cx-dw,cy+a0],[cx-dw,cy+a1]);seg(g,[cx+dw,cy+a0],[cx+dw,cy+a1]);g.stroke();
  g.strokeStyle='rgba(42,33,27,.7)';g.lineWidth=.6*s;g.beginPath();g.arc(cx-dw,cy+a1,dw*2,-Math.PI/2,0);g.stroke();
  g.beginPath();seg(g,[cx-dw,cy+a1],[cx-dw,cy+a1-dw*2]);g.stroke();
  [[0,-1],[1,0],[-1,0]].forEach(([ux,uy])=>{const ww=Rd*.12;
    const px=-uy,py=ux;g.fillStyle=paper;
    const c0=[cx+ux*a0,cy+uy*a0],c1=[cx+ux*a1,cy+uy*a1];
    g.beginPath();g.moveTo(c0[0]+px*ww,c0[1]+py*ww);g.lineTo(c1[0]+px*ww,c1[1]+py*ww);g.lineTo(c1[0]-px*ww,c1[1]-py*ww);g.lineTo(c0[0]-px*ww,c0[1]-py*ww);g.closePath();g.fill();
    g.strokeStyle=INK;g.lineWidth=lw;g.stroke();
    g.lineWidth=.5*s;g.beginPath();const m=[(c0[0]+c1[0])/2,(c0[1]+c1[1])/2];
    seg(g,[m[0]+px*ww-ux*1.2*s,m[1]+py*ww-uy*1.2*s],[m[0]-px*ww-ux*1.2*s,m[1]-py*ww-uy*1.2*s]);
    seg(g,[m[0]+px*ww+ux*1.2*s,m[1]+py*ww+uy*1.2*s],[m[0]-px*ww+ux*1.2*s,m[1]-py*ww+uy*1.2*s]);g.stroke();});

  squinch=[];
  for(let k=0;k<4;k++){const sx=k==0||k==3?-1:1, sy=k<2?-1:1;
    const C=[cx+sx*a0,cy+sy*a0];
    const ac=Math.atan2(-sy,-sx);
    const tiers=[.15,.29,.43];
    let prev=null;
    for(let ti=0;ti<tiers.length;ti++){const r=tiers[ti]*Rd, n=2+ti*2;
      const row=[];for(let i=0;i<=n;i++){const a=ac-Math.PI/4+Math.PI/2*i/n;row.push([C[0]+Math.cos(a)*r,C[1]+Math.sin(a)*r]);}
      if(prev){for(let i=0;i<n;i++){const pa=prev[Math.floor(i*(prev.length-1)/n)],pb=prev[Math.ceil((i+1)*(prev.length-1)/n)];
          squinch.push([pa,row[i],row[i+1],pb]);}}
      else{for(let i=0;i<n;i++)squinch.push([C,row[i],row[i+1]]);}
      prev=row;}
  }
  g.save();g.beginPath();g.rect(0,0,W,H);g.moveTo(cx+Rd,cy);g.arc(cx,cy,Rd,2*Math.PI,0,true);g.clip('evenodd');
  g.strokeStyle=INK;g.lineWidth=lw*.9;
  squinch.forEach(q=>{poly(g,q);g.stroke();});
  squinch.forEach((q,i)=>{const h=q.length==3?[q[0],q[1],[(q[1][0]+q[2][0])/2,(q[1][1]+q[2][1])/2]]:[q[0],q[1],[(q[1][0]+q[2][0])/2,(q[1][1]+q[2][1])/2],[(q[0][0]+q[3][0])/2,(q[0][1]+q[3][1])/2]];
    hatch(g,h,Math.atan2(q[1][1]-q[0][1],q[1][0]-q[0][0]),3*s,.45*s,'rgba(42,33,27,.6)');});
  g.restore();

  g.fillStyle='rgba(255,252,242,.35)';g.beginPath();g.arc(cx,cy,Rd,0,7);g.fill();
  const shade=[0,.5,.55,.62,.7,.78,.86];
  cells.forEach(c=>{
    if(!c.axis)return;
    const n=c.pts.length, i0=c.axis[0];
    let half;
    if(c.arc){half=[c.pts[0],c.pts[1],c.pts[2],P(1,c.a),P(R5*.5+.5*1,c.a)];half=[c.pts[0],c.pts[1],c.pts[2],P(1,c.a)];}
    else{const i1=c.axis[1];half=[];for(let i=i0;i<=i1;i++)half.push(c.pts[i]);}
    const dir=Math.atan2(c.pts[0][1]-cy,c.pts[0][0]-cx)+Math.PI/2+.35;
    hatch(g,half,dir,(2.6+ (6-c.ring)*.15)*s,.42*s,`rgba(42,33,27,${shade[c.ring]})`);
    const L=c.pts[1],Rr=c.pts[n-1],F=c.pts[0];
    const M=[(L[0]+Rr[0])/2,(L[1]+Rr[1])/2];
    g.strokeStyle='rgba(42,33,27,.75)';g.lineWidth=.55*s;g.beginPath();g.moveTo(L[0],L[1]);
    g.quadraticCurveTo(lerp(M[0],F[0],.75),lerp(M[1],F[1],.75),Rr[0],Rr[1]);g.stroke();
  });
  g.strokeStyle=INK;g.lineWidth=lw;
  cells.forEach(c=>{poly(g,c.pts);g.stroke();});
  g.lineWidth=lw*1.5;g.beginPath();g.arc(cx,cy,Rd,0,7);g.stroke();
  g.lineWidth=lw*.8;g.beginPath();g.arc(cx,cy,Rd*1.012,0,7);g.stroke();
  const star=(R,k,n=16)=>{const rr=R*Math.cos(k*Math.PI/n)/Math.cos((k-1)*Math.PI/n);const o=[];for(let i=0;i<2*n;i++)o.push(P(i%2?rr:R,i*Math.PI/n));return o;};
  g.lineWidth=.6*s;poly(g,star(R0*.86,6));g.stroke();
  const kh=star(R0*.62,3,8);g.lineWidth=lw*.9;poly(g,kh);g.stroke();
  g.lineWidth=.5*s;g.strokeStyle='rgba(42,33,27,.7)';
  for(let k=0;k<2;k++){const q=[];for(let i=0;i<4;i++)q.push(P(R0*.62,i*Math.PI/2+k*Math.PI/4));poly(g,q);g.stroke();}
  g.beginPath();g.arc(cx,cy,R0*.2*Rd,0,7);g.stroke();
  const ros=[];for(let i=0;i<16;i++)ros.push(P(R0*.2,i*Math.PI/8));
  for(let i=0;i<8;i++){g.beginPath();seg(g,P(R0*.2,i*Math.PI/4+Math.PI/8),P(R0*.62*Math.cos(3*Math.PI/8)/Math.cos(2*Math.PI/8),i*Math.PI/4+Math.PI/8));g.stroke();}

  g.strokeStyle=INK;
  for(let i=0;i<60;i++){const a=i/60*2*Math.PI, L=i%5==0?.05:.025;
    g.lineWidth=(i%5==0?.9:.5)*s;g.beginPath();seg(g,P(1.025,a),P(1.025+L,a));g.stroke();}

  g.fillStyle=INK;g.strokeStyle=INK;
  const mono=(px)=>`${px*s}px "DejaVu Sans Mono", ui-monospace, Menlo, monospace`;
  const dy=cy+a1+Rd*.1;g.lineWidth=.6*s;g.beginPath();seg(g,[cx-Rd,dy],[cx+Rd,dy]);
  seg(g,[cx-Rd,dy-6*s],[cx-Rd,cy+Rd*.2]);seg(g,[cx+Rd,dy-6*s],[cx+Rd,cy+Rd*.2]);g.stroke();
  [[cx-Rd,dy],[cx+Rd,dy]].forEach(p=>{g.beginPath();seg(g,[p[0]-4*s,p[1]+4*s],[p[0]+4*s,p[1]-4*s]);g.lineWidth=1.1*s;g.stroke();});
  g.font=mono(9);g.textAlign='center';g.fillStyle='#ece3cf';g.fillRect(cx-40*s,dy-7*s,80*s,14*s);g.fillStyle=INK;g.fillText('Ø 9.60',cx,dy+3*s);
  [[-1],[1]].forEach(([d])=>{const x=cx+d*(a1+Rd*.14);g.lineWidth=1.2*s;g.beginPath();seg(g,[x,cy-12*s],[x,cy+12*s]);g.stroke();
    g.beginPath();g.moveTo(x,cy-12*s);g.lineTo(x+d*-0,cy-12*s);g.stroke();
    g.beginPath();g.moveTo(x-5*s,cy-12*s);g.lineTo(x,cy-20*s);g.lineTo(x+5*s,cy-12*s);g.closePath();g.fill();
    g.font=mono(10);g.fillText('A',x,cy+26*s);});
  g.setLineDash([10*s,3*s,2*s,3*s]);g.lineWidth=.5*s;g.beginPath();seg(g,[cx-a1-Rd*.14,cy],[cx-a1,cy]);seg(g,[cx+a1,cy],[cx+a1+Rd*.14,cy]);g.stroke();g.setLineDash([]);

  const lx=cx-H*.72, ly=cy-H*.28;
  g.lineWidth=.7*s;g.beginPath();g.arc(lx,ly,16*s,0,7);g.stroke();
  g.beginPath();g.moveTo(lx,ly-22*s);g.lineTo(lx+5*s,ly+8*s);g.lineTo(lx,ly+3*s);g.closePath();g.fill();
  g.beginPath();g.moveTo(lx,ly-22*s);g.lineTo(lx-5*s,ly+8*s);g.lineTo(lx,ly+3*s);g.closePath();g.stroke();
  g.font=mono(10);g.textAlign='center';g.fillText('N',lx,ly-27*s);
  g.save();g.translate(lx,ly);g.rotate(0.42);g.setLineDash([2*s,2*s]);g.beginPath();seg(g,[0,-30*s],[0,24*s]);g.stroke();g.restore();
  g.font=mono(7);g.fillText('QIBLA 243°',lx,ly+38*s);
  const sbx=cx-H*.8, sby=cy+H*.36;
  for(let i=0;i<5;i++){g.fillStyle=i%2?'#ece3cf':INK;g.fillRect(sbx+i*14*s,sby,14*s,4*s);g.strokeRect(sbx+i*14*s,sby,14*s,4*s);}
  g.fillStyle=INK;g.font=mono(7);g.textAlign='left';g.fillText('0',sbx-2*s,sby+14*s);g.fillText('5 m',sbx+66*s,sby+14*s);
  g.fillText('1:50',sbx,sby-7*s);
  g.font=mono(7.2);
  const notes=['CELLS','crown star {16/6}   1','petals            16','kites             16','shields           16','kites             32','kites             32','window niches     32'];
  notes.forEach((t,i)=>g.fillText(t,sbx,cy-H*.09+i*11*s));
  drawSection(g,cx+H*.67,cy+H*.02,mono);
  const tbx=cx+H*.5,tby=cy+H*.34,tbw=H*.36,tbh=H*.085;
  g.lineWidth=.8*s;g.strokeRect(tbx,tby,tbw,tbh);g.beginPath();seg(g,[tbx,tby+tbh*.55],[tbx+tbw,tby+tbh*.55]);seg(g,[tbx+tbw*.62,tby+tbh*.55],[tbx+tbw*.62,tby+tbh]);g.stroke();
  g.font=`italic ${14*s}px Georgia, "DejaVu Serif", serif`;g.textAlign='left';g.fillText('The Muqarnas Clock',tbx+8*s,tby+tbh*.38);
  g.font=mono(7);g.fillText('REFLECTED CEILING PLAN',tbx+8*s,tby+tbh*.82);
}

let secRows=[];
function drawSection(g,x0,y0,mono){
  const w=H*.27, base=y0+H*.2;
  g.strokeStyle=INK;g.lineWidth=.8*s;
  g.beginPath();seg(g,[x0-w*.62,base],[x0+w*.62,base]);g.stroke();
  g.save();g.fillStyle='rgba(42,33,27,.08)';
  [[-1],[1]].forEach(([d])=>{g.beginPath();g.rect(x0+d*w*.5-(d>0?0:w*.07),base-H*.2,w*.07,H*.2);g.fill();g.stroke();
    g.save();g.beginPath();g.rect(x0+d*w*.5-(d>0?0:w*.07),base-H*.2,w*.07,H*.2);g.clip();g.lineWidth=.5*s;g.beginPath();for(let o=-40;o<60;o+=4)seg(g,[x0+d*w*.5-w*.1+o*s,base],[x0+d*w*.5+w*.1+o*s,base-H*.2]);g.stroke();g.restore();});
  g.restore();
  const rings=[6,5,4,3,2,1,0];secRows=[];
  let y=base-H*.2, half=w*.5;
  for(let k=0;k<rings.length;k++){
    const h=H*(k==0?.04:.028), nh=half*(k==rings.length-1?.25:(1-.13*(k+1)/1.2)*.92);
    const n=Math.max(1,Math.round(nh*2/(12*s)));
    const row={ring:rings[k],y0:y-h,y1:y,xl:x0-nh,xr:x0+nh,arcs:[]};
    g.lineWidth=.7*s;g.beginPath();seg(g,[x0-half,y],[x0-nh,y-h]);seg(g,[x0+half,y],[x0+nh,y-h]);seg(g,[x0-nh,y-h],[x0+nh,y-h]);g.stroke();
    for(let i=0;i<n;i++){const a=x0-nh+(i+.5)*(2*nh/n),rw=nh/n*.8;
      g.lineWidth=.5*s;g.beginPath();g.moveTo(a-rw,y);g.lineTo(a-rw,y-h*.35);g.quadraticCurveTo(a-rw,y-h*.95,a,y-h*.95);g.quadraticCurveTo(a+rw,y-h*.95,a+rw,y-h*.35);g.lineTo(a+rw,y);g.stroke();
      row.arcs.push([a,rw]);}
    secRows.push(row);
    y-=h;half=nh;
  }
  g.lineWidth=.9*s;g.beginPath();g.arc(x0,y,6*s,Math.PI,0);g.stroke();
  g.font=mono(7);g.textAlign='center';g.fillStyle=INK;g.fillText('SECTION A–A',x0,base+16*s);
  g.fillText('+11.40',x0+w*.2,y-6*s);
}

function makePaper(){
  const pc=document.createElement('canvas');pc.width=pc.height=384;const p=pc.getContext('2d',CTXOPT);
  const id=p.createImageData(384,384),r=rng(5);
  for(let i=0;i<384*384;i++){const x=i%384,y=(i/384)|0;
    const m=(Math.sin(x*.049)+Math.sin(y*.041+x*.017)+Math.sin((x-y)*.029))*1.4;
    const n=(r()-.5)*9+m;id.data[i*4]=236+n;id.data[i*4+1]=227+n;id.data[i*4+2]=207+n*1.1;id.data[i*4+3]=255;}
  p.putImageData(id,0,0);
  p.strokeStyle='rgba(120,100,70,.09)';p.lineWidth=.6;
  for(let i=0;i<220;i++){const x=r()*384,y=r()*384,a=r()*6.28,l=4+r()*14;p.beginPath();p.moveTo(x,y);p.quadraticCurveTo(x+Math.cos(a)*l*.5+r()*3,y+Math.sin(a)*l*.5+r()*3,x+Math.cos(a)*l,y+Math.sin(a)*l);p.stroke();}
  paper=ctx.createPattern(pc,'repeat');
}

function resize(){
  const dpr=fixedT!==null?1:Math.min(2,window.devicePixelRatio||1);
  W=cv.width=Math.round(innerWidth*dpr);H=cv.height=Math.round(innerHeight*dpr);
  s=H/600;cx=W/2;cy=H*.47;Rd=H*.325;
  makePaper();buildCells();drawInk();
  inkGold=document.createElement('canvas');inkGold.width=W;inkGold.height=H;const gg=inkGold.getContext('2d',CTXOPT);gg.drawImage(inkLayer,0,0);gg.globalCompositeOperation='source-in';gg.fillStyle='#9a5a14';gg.fillRect(0,0,W,H);
}

function wash(pts,a,warm){
  poly(ctx,pts);
  ctx.fillStyle=`rgba(${GOLD[0]},${GOLD[1]+warm*20|0},${GOLD[2]+warm*40|0},${a})`;ctx.fill();
  ctx.save();ctx.clip();ctx.strokeStyle=`rgba(190,120,40,${a*.55})`;ctx.lineWidth=2.4*s;ctx.stroke();ctx.restore();
}

function render(t){
  t=((t%LOOP)+LOOP)%LOOP;
  ctx.fillStyle=paper;ctx.fillRect(0,0,W,H);
  const glow=ss(T1-.1,T1+1.4,t)*(1-ss(21.8,23.6,t));
  const fade=1-ss(21.8,23.6,t);
  let lastLit=-1;
  const dusk=1-glow;
  for(let i=0;i<cells.length;i++){const c=cells[i];
    if(t>=c.t&&fade>.001){lastLit=i;continue;}
    poly(ctx,c.pts);ctx.fillStyle=`rgba(38,56,108,${(.15+.04*(6-c.ring))*dusk})`;ctx.fill();}
  for(let i=0;i<=lastLit;i++){const c=cells[i];
    const age=t-c.t, a=(.36+ .1*(c.ring/6))*fade + .45*Math.exp(-age*3)*fade;
    wash(c.pts,a+glow*.2,Math.exp(-age*2));
    if(fade<1){poly(ctx,c.pts);ctx.fillStyle=`rgba(38,56,108,${(.15+.04*(6-c.ring))*(1-fade)})`;ctx.fill();}}
  if(glow>0){
    const g=ctx.createRadialGradient(cx,cy,0,cx,cy,Rd*1.02);
    g.addColorStop(0,`rgba(255,236,180,${.75*glow})`);g.addColorStop(.35,`rgba(246,200,110,${.45*glow})`);g.addColorStop(1,`rgba(226,160,70,${.15*glow})`);
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,Rd,0,7);ctx.fill();
    ctx.save();ctx.beginPath();ctx.rect(cx-Rd,cy-Rd,2*Rd,2*Rd);ctx.moveTo(cx+Rd,cy);ctx.arc(cx,cy,Rd,2*Math.PI,0,true);ctx.fillStyle=`rgba(226,168,74,${.28*glow})`;ctx.fill('evenodd');ctx.restore();
  }
  secRows.forEach(r=>{
    const rc=cells.filter(c=>c.ring==r.ring);const done=rc.filter(c=>t>=c.t).length/rc.length;
    if(done<=0&&glow<=0)return;
    const a=(.4*done*fade)+glow*.35;
    ctx.fillStyle=`rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${a})`;
    const nArc=Math.round(r.arcs.length*done);
    r.arcs.forEach(([x,rw],i)=>{if(i>=nArc&&glow<=0)return;ctx.fillRect(x-rw,r.y0+(r.y1-r.y0)*.05,rw*2,(r.y1-r.y0)*.95);});
  });
  if(glow>0){ctx.globalAlpha=1-.75*glow;ctx.drawImage(inkLayer,0,0);ctx.globalAlpha=1;
    ctx.save();ctx.beginPath();ctx.arc(cx,cy,Rd*1.01,0,7);ctx.clip();ctx.globalAlpha=.75*glow;ctx.drawImage(inkGold,0,0);ctx.restore();
    ctx.save();ctx.beginPath();ctx.rect(0,0,W,H);ctx.moveTo(cx+Rd*1.01,cy);ctx.arc(cx,cy,Rd*1.01,2*Math.PI,0,true);ctx.clip('evenodd');ctx.globalAlpha=.75*glow;ctx.drawImage(inkLayer,0,0);ctx.restore();ctx.globalAlpha=1;
    ctx.globalCompositeOperation='lighter';
    const b=ctx.createRadialGradient(cx,cy,0,cx,cy,Rd*1.05);
    b.addColorStop(0,`rgba(120,90,40,${.9*glow})`);b.addColorStop(.3,`rgba(90,60,20,${.5*glow})`);b.addColorStop(1,'rgba(40,20,0,0)');
    ctx.fillStyle=b;ctx.beginPath();ctx.arc(cx,cy,Rd*1.05,0,7);ctx.fill();ctx.globalCompositeOperation='source-over';}
  else ctx.drawImage(inkLayer,0,0);

  if(glow>0){
    const grow=ss(T1,T1+2.2,t);
    ctx.lineCap='round';ctx.save();ctx.beginPath();ctx.rect(20*s,20*s,W-40*s,H-40*s);ctx.clip();
    for(let i=0;i<64;i++){const a=i/64*2*Math.PI, L=(i%4==0?.42:i%2==0?.26:.14)*grow;
      const r0=1.16/Math.max(Math.abs(Math.cos(a)),Math.abs(Math.sin(a))), r1=r0+L;
      ctx.strokeStyle=`rgba(200,138,48,${.8*glow})`;ctx.lineWidth=(i%4==0?1.1:.6)*s;
      ctx.beginPath();const A=P(r0,a),B=P(r1,a);ctx.moveTo(A[0],A[1]);ctx.lineTo(B[0],B[1]);ctx.stroke();
      if(i%4==0){const D=P(r1+.03,a);ctx.fillStyle=`rgba(200,138,48,${.8*glow})`;ctx.beginPath();ctx.arc(D[0],D[1],1.6*s,0,7);ctx.fill();}}
    ctx.restore();
    const st=cells[cells.length-1];poly(ctx,st.pts);ctx.fillStyle=`rgba(255,244,210,${.8*glow})`;ctx.fill();
    ctx.strokeStyle=`rgba(160,100,30,${glow})`;ctx.lineWidth=1*s;ctx.stroke();
  }

  if(t>T0-.8&&t<T1+.6){
    let ang;
    const i=Math.max(0,lastLit), c=cells[i], nx=cells[Math.min(cells.length-1,i+1)];
    if(lastLit<0)ang=lerp(-.6,0,ss(T0-.8,T0,t));
    else{const f=nx.t>c.t?ss(0,1,(t-c.t)/(nx.t-c.t)*1.6):0;let a0=c.a,a1=nx.a;if(nx.ring==0)a1=a0;if(a1<a0-Math.PI)a1+=2*Math.PI;ang=lerp(a0,a1,f);}
    const vis=ss(T0-.8,T0-.3,t)*(1-ss(T1,T1+.6,t));
    const tip=P(1.12,ang);
    ctx.strokeStyle=`rgba(178,52,40,${.85*vis})`;ctx.lineWidth=.9*s;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(tip[0],tip[1]);ctx.stroke();
    ctx.beginPath();ctx.arc(cx,cy,3*s,0,7);ctx.stroke();
    if(lastLit>=0&&c.ring>0){ctx.fillStyle=`rgba(178,52,40,${.9*vis*Math.exp(-(t-c.t)*4)})`;ctx.beginPath();ctx.arc(c.cx,c.cy,2*s,0,7);ctx.fill();}
    ctx.fillStyle=`rgba(178,52,40,${vis})`;ctx.beginPath();ctx.arc(tip[0],tip[1],1.8*s,0,7);ctx.fill();
  }
  const tbx=cx+H*.5,tby=cy+H*.34,tbw=H*.36,tbh=H*.085;
  ctx.font=`${7*s}px "DejaVu Sans Mono", ui-monospace, monospace`;ctx.textAlign='left';ctx.fillStyle='rgba(178,52,40,.95)';
  const n=Math.max(0,lastLit+1);ctx.fillText(`LIT ${String(t>=22.5?0:n).padStart(3,'0')} / ${cells.length}`,tbx+tbw*.62+8*s,tby+tbh*.82);
  ctx.strokeStyle='rgba(42,33,27,.6)';ctx.lineWidth=1*s;ctx.strokeRect(12*s,12*s,W-24*s,H-24*s);
  ctx.lineWidth=.5*s;ctx.strokeRect(16*s,16*s,W-32*s,H-32*s);
}

const __t0=performance.now();resize();
if(fixedT!==null){const t0=__t0;render(fixedT);ctx.getImageData(0,0,1,1);window.__ms=performance.now()-t0;document.title='done';}
else{addEventListener('resize',resize);const start=performance.now();(function f(){render((performance.now()-start)/1000);requestAnimationFrame(f);})();}
