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

const SC={
draw(t){
  x.fillStyle=vgrad(x,[[0,'#1a1a4a'],[.45,'#7a3c6e'],[.72,'#f08a5d'],[1,'#ffd49a']]);x.fillRect(0,0,W,H);
  layer(50,'lighter',k=>dot(k,W*.63,H*.66,H*.2,'rgba(255,190,120,.9)'));layer(2,'lighter',k=>dot(k,W*.63,H*.66,H*.08,'rgba(255,235,190,.95)'));
  const tower=(k,cx,base,hh,ww)=>{k.beginPath();k.moveTo(cx-ww/2,base);k.quadraticCurveTo(cx-ww*.42,base-hh*.6,cx-ww*.2,base-hh);k.lineTo(cx+ww*.2,base-hh);k.quadraticCurveTo(cx+ww*.42,base-hh*.6,cx+ww/2,base);k.closePath();k.fill();
    k.globalCompositeOperation='destination-out';k.beginPath();k.moveTo(cx-ww*.17,base-hh*1.01);k.quadraticCurveTo(cx,base-hh*.5,cx+ww*.17,base-hh*1.01);k.closePath();k.fill();k.globalCompositeOperation='source-over';
    k.fillRect(cx-ww*.17,base-hh*.78,ww*.34,hh*.025)};
  seed=5;for(const[far,col,bl]of[[1,'rgba(150,80,110,.55)',6],[0,'rgba(40,20,50,.92)',1]]) layer(bl,'source-over',k=>{k.fillStyle=col;const base=H*(far?.86:.93);
    for(let i=0;i<34;i++){const bx=rnd()*W,bw=(20+rnd()*60)*S,bh=(40+rnd()*(far?160:120))*S;k.fillRect(bx,base-bh,bw,bh+H)}
    if(!far){tower(k,W*.3,base,H*.5,W*.07)}else{k.fillRect(W*.8,base-H*.36,W*.02,H);k.beginPath();k.moveTo(W*.8,base-H*.36);k.lineTo(W*.81,base-H*.45);k.lineTo(W*.82,base-H*.36);k.fill()}
    k.fillRect(0,base,W,H)});
  seed=41;layer(1,'lighter',k=>{for(let i=0;i<180;i++){const r=rnd();dot(k,((rnd()+t*.01*(r+.2))%1)*W,rnd()*H*.45,(1+r*2.5)*S,`rgba(255,${190+r*50},${150+r*60},${.2+r*.5})`)}});
  finish(.45)}
};
const T0=performance.now();function loop(n){SC.draw(FIX??(n-T0)/1000);if(FIX===null)requestAnimationFrame(loop)}requestAnimationFrame(loop);
