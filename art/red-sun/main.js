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
  x.fillStyle=vgrad(x,[[0,'#132a6b'],[.7,'#2d5fb3'],[1,'#3c78c8']]);x.fillRect(0,0,W,H);
  layer(40,'lighter',k=>dot(k,W*.56,H*.36,H*.17,'rgba(255,70,60,.95)'));layer(8,'lighter',k=>dot(k,W*.56,H*.36,H*.11,'rgba(255,120,90,.8)'));
  seed=13;const stalks=[...Array(14)].map((_,i)=>({bx:rnd(),h:.45+rnd()*.4,lean:(rnd()-.5)*.4,near:i<4}));
  layer(0,'source-over',k=>{for(let i=0;i<900;i++){const bx=rnd()*W,h=(.1+rnd()*.22)*H,lean=(rnd()-.5)*60*S;k.strokeStyle=`hsla(${20+rnd()*20},80%,${35+rnd()*25}%,.8)`;k.lineWidth=(1+rnd()*2)*S;k.beginPath();k.moveTo(bx,H);k.quadraticCurveTo(bx+lean*.3,H-h*.6,bx+lean+Math.sin(t+bx)*4*S,H-h);k.stroke()}});
  for(const near of[false,true]) layer(near?12:1.2,'source-over',k=>{for(const s of stalks){if(s.near!==near)continue;const bx=s.bx*W,top=H*(1-s.h),sw=Math.sin(t*.8+s.bx*7)*14*S,tx=bx+s.lean*H*.4+sw;
    k.strokeStyle='rgba(120,60,30,.9)';k.lineWidth=3*S;k.beginPath();k.moveTo(bx,H);k.quadraticCurveTo(bx,H-(H-top)*.5,tx,top);k.stroke();
    for(let j=0;j<220;j++){const f=j/220,ang=-1.2+rnd()*.9,len=(40+rnd()*80)*S*(1-f*.6);const px=tx+(bx-tx)*f*.25,py=top+f*H*.2;k.strokeStyle=`hsla(${25+rnd()*20},90%,${60+rnd()*25}%,.55)`;k.lineWidth=1.3*S;k.beginPath();k.moveTo(px,py);k.lineTo(px+Math.cos(ang)*len,py+Math.sin(ang)*len*.5);k.stroke()}}});
  bokeh(10,20,60,['rgba(255,190,120,.25)','rgba(255,120,80,.2)'],10,t,.01,17);finish(.45)}
};
const T0=performance.now();function loop(n){SC.draw(FIX??(n-T0)/1000);if(FIX===null)requestAnimationFrame(loop)}requestAnimationFrame(loop);
