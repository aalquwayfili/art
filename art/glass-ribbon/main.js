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
  x.fillStyle=(()=>{const g=x.createRadialGradient(W*.85,H*.95,0,W*.6,H*.6,W);g.addColorStop(0,'#4a86bf');g.addColorStop(.45,'#1d2f66');g.addColorStop(1,'#07091a');return g})();x.fillRect(0,0,W,H);
  bokeh(16,30,90,['rgba(120,200,255,.14)','rgba(255,140,80,.16)','rgba(170,255,210,.12)'],14,t,.004,5);
  const P=u=>[W*(-0.1+1.2*u),H*(0.98-0.9*u+0.14*Math.sin(u*6.2+t*.25))],Wd=u=>H*(0.07+0.06*Math.sin(u*Math.PI));
  layer(70,'lighter',k=>{k.lineCap='round';k.strokeStyle='rgba(255,110,50,.7)';k.lineWidth=H*.3;k.beginPath();for(let u=0;u<=1;u+=.01)k.lineTo(...P(u));k.stroke()});
  layer(5,'lighter',k=>{k.lineCap='round';k.strokeStyle='rgba(190,230,255,.12)';k.lineWidth=H*.22;k.beginPath();for(let u=0;u<=1;u+=.01)k.lineTo(...P(u));k.stroke();
    for(const o of[-.85,.85]){k.beginPath();for(let u=0;u<=1;u+=.005){const[a,b]=P(u);k.lineTo(a,b+o*Wd(u))}k.strokeStyle='rgba(220,245,255,.45)';k.lineWidth=3*S;k.stroke()}});
  seed=9;const sp=[...Array(5000)].map(()=>[rnd(),rnd()*2-1,rnd(),rnd()]);
  for(const [blur,lo,hi] of [[9,.3,1],[3,.15,.3],[0,0,.15]]) layer(blur,'source-over',k=>{for(const[u0,v,r,h]of sp){const u=(u0+t*.01)%1,f=Math.abs(u-.5);if(f<lo||f>=hi)continue;const[a,b]=P(u),w=Wd(u);
    dot(k,a+v*w*.3,b+v*w*.85,(1.3+r*r*6)*S*(blur>5?1.8:1),`hsla(${h>.93?165:12+h*30},100%,${h>.93?72:50+r*20}%,${.6+r*.4})`)}});
  layer(1.5,'lighter',k=>{for(const[u0,v,r]of sp){if(r<.95)continue;const u=(u0+t*.01)%1,[a,b]=P(u),w=Wd(u);dot(k,a+v*w*.3,b+v*w*.85,2.4*S,'rgba(255,245,210,.95)')}});
  bokeh(7,70,150,['rgba(160,255,190,.35)','rgba(255,150,90,.3)','rgba(150,220,255,.25)'],22,t,.01,11);
  finish()}
};
const T0=performance.now();function loop(n){SC.draw(FIX??(n-T0)/1000);if(FIX===null)requestAnimationFrame(loop)}requestAnimationFrame(loop);
