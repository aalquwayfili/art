const c=document.getElementById('c'),x=c.getContext('2d');
let W,H,S;function size(){W=c.width=innerWidth;H=c.height=innerHeight;S=H/900;L.width=W;L.height=H}
const L=document.createElement('canvas'),l=L.getContext('2d');size();onresize=size;
const q=new URLSearchParams(location.search),FIX=q.has('t')?+q.get('t'):null;
let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const grain=document.createElement('canvas');grain.width=grain.height=256;{const g=grain.getContext('2d'),im=g.createImageData(256,256);for(let i=0;i<im.data.length;i+=4){const v=Math.random()*255;im.data[i]=im.data[i+1]=im.data[i+2]=v;im.data[i+3]=26}g.putImageData(im,0,0)}
function layer(blur,mode,fn){l.setTransform(1,0,0,1,0,0);l.clearRect(0,0,W,H);l.globalCompositeOperation='source-over';fn(l);x.save();x.globalCompositeOperation=mode||'source-over';x.filter=blur?`blur(${blur*S}px)`:'none';x.drawImage(L,0,0);x.restore()}
function vgrad(ctx,stops){const g=ctx.createLinearGradient(0,0,0,H);stops.forEach(([p,c])=>g.addColorStop(p,c));return g}
function finish(v=.55){const g=x.createRadialGradient(W/2,H/2,H*.3,W/2,H/2,W*.75);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,12,${v})`);x.fillStyle=g;x.fillRect(0,0,W,H);x.fillStyle=x.createPattern(grain,'repeat');x.fillRect(0,0,W,H)}
function dot(ctx,px,py,r,col){ctx.fillStyle=col;ctx.beginPath();ctx.arc(px,py,r,0,7);ctx.fill()}
function bokeh(n,rmin,rmax,cols,blur,t,sp=.01,sd=3){seed=sd;const B=[...Array(n)].map(()=>[rnd(),rnd(),rnd(),rnd()]);layer(blur,'lighter',k=>B.forEach(([a,b,r,cc])=>dot(k,((a+t*sp*(.3+r))%1.2-.1)*W,b*H,(rmin+r*(rmax-rmin))*S,cols[Math.floor(cc*cols.length)])))}

const hsh=(x,y)=>{let h=Math.sin(x*127.1+y*311.7)*43758.5453;return h-Math.floor(h)};
function vnoise(x,y){const i=Math.floor(x),j=Math.floor(y),f=x-i,g=y-j,u=f*f*(3-2*f),v=g*g*(3-2*g);
  return (hsh(i,j)*(1-u)+hsh(i+1,j)*u)*(1-v)+(hsh(i,j+1)*(1-u)+hsh(i+1,j+1)*u)*v}
function fbm(x,y){let a=.5,s=0;for(let k=0;k<5;k++){s+=a*vnoise(x,y);x=x*2.03+17;y=y*2.03+9;a*=.5}return s}
const paper=(ctx,c1,c2)=>{const g=ctx.createRadialGradient(W*.5,H*.45,H*.1,W*.5,H*.5,W*.75);g.addColorStop(0,c1);g.addColorStop(1,c2);ctx.fillStyle=g;ctx.fillRect(0,0,W,H)}
const small=(w,h)=>{const cv=document.createElement('canvas');cv.width=w;cv.height=h;return cv}

const SC={
draw(t){
  x.fillStyle=vgrad(x,[[0,'#1a0b3a'],[.45,'#5a2b7a'],[.62,'#d07a9a'],[.7,'#f2b38a']]);x.fillRect(0,0,W,H);
  layer(2,'source-over',k=>{const g=k.createRadialGradient(W*.75,H*.2,0,W*.75,H*.2,H*.16);g.addColorStop(0,'#f6d7ff');g.addColorStop(1,'#a57ad0');k.fillStyle=g;k.beginPath();k.arc(W*.75,H*.2,H*.12,0,7);k.fill();
    k.strokeStyle='rgba(255,230,255,.7)';k.lineWidth=3*S;k.beginPath();k.ellipse(W*.75,H*.2,H*.22,H*.05,-.3,0,7);k.stroke()});
  const rows=26,cols=34,hz=H*.64;const P=(ci,ri)=>{const z=(ri+ (t*1.2)%1)/rows;const persp=1/(1.05-z);const xx=W*.5+(ci/cols-.5)*W*1.6*persp*.55;const ht=fbm(ci*.35,(ri+Math.floor(t*1.2))*.35-Math.floor(t*1.2)*0+0)*.0;return[xx,hz+(H-hz)*Math.pow(z,1.6)]};
  layer(0,'source-over',k=>{for(let r=rows-1;r>=0;r--){for(let c=0;c<cols;c++){const off=Math.floor(t*1.2);const hh=(ri,ci)=>fbm(ci*.3,(ri-off)*.3)*H*.08*(.3+ri/rows);
      const q=(ci,ri)=>{const[a,b]=P(ci,ri);return[a,b-hh(ri,ci)]};const A=q(c,r),B=q(c+1,r),C=q(c,r+1),D=q(c+1,r+1);
      for(const tri of [[A,B,C],[B,D,C]]){const sh=(tri[1][1]-tri[0][1])/(12*S);const l=Math.max(0,Math.min(1,.55+sh*.2+ (r/rows)*.3));k.fillStyle=`rgb(${40+120*l},${30+70*l},${70+90*l})`;k.strokeStyle=k.fillStyle;k.lineWidth=.8;k.beginPath();k.moveTo(...tri[0]);k.lineTo(...tri[1]);k.lineTo(...tri[2]);k.closePath();k.fill();k.stroke()}}}});
  layer(30,'lighter',k=>{k.fillStyle='rgba(255,170,150,.25)';k.fillRect(0,hz-H*.05,W,H*.1)});
  const ph=(.45+t*.06)%1,px=W*(.2+ph*.35),py=H*(-.05+ph*.62);
  layer(10,'lighter',k=>{k.strokeStyle='rgba(255,180,90,.6)';k.lineWidth=16*S;k.beginPath();k.moveTo(px-W*.18,py-H*.35);k.lineTo(px,py);k.stroke()});
  layer(2,'lighter',k=>{k.strokeStyle='rgba(255,240,200,.95)';k.lineWidth=4*S;k.beginPath();k.moveTo(px-W*.12,py-H*.24);k.lineTo(px,py);k.stroke();dot(k,px,py,9*S,'rgba(255,255,240,1)')});
  finish(.45)}
};
const T0=performance.now();function loop(n){SC.draw(FIX??(n-T0)/1000);if(FIX===null)requestAnimationFrame(loop)}requestAnimationFrame(loop);
