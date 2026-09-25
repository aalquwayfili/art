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
  x.fillStyle=vgrad(x,[[0,'#0f2f73'],[.6,'#2f78c4'],[1,'#8cc6ec']]);x.fillRect(0,0,W,H);
  seed=4;layer(30,'source-over',k=>{for(let i=0;i<45;i++){const a=.35+rnd()*.7,r=(50+rnd()*120)*S;k.save();k.translate(a*W,H*(.86+rnd()*.14));k.scale(2.4,.7);dot(k,0,0,r,'rgba(255,246,238,.75)');k.restore()}});
  layer(2,'source-over',k=>{const g=k.createLinearGradient(0,H*.5,0,H);g.addColorStop(0,'#e0703f');g.addColorStop(.5,'#a8402a');g.addColorStop(1,'#3e1412');k.fillStyle=g;k.beginPath();k.moveTo(-10,H);k.lineTo(-10,H*.58);
    k.bezierCurveTo(W*.08,H*.5,W*.2,H*.52,W*.26,H*.6);k.bezierCurveTo(W*.3,H*.66,W*.33,H*.7,W*.42,H*.74);k.bezierCurveTo(W*.5,H*.8,W*.5,H*.95,W*.55,H);k.fill();
    k.globalCompositeOperation='source-atop';for(let i=0;i<40;i++){k.strokeStyle=`rgba(80,20,15,${.15+rnd()*.2})`;k.lineWidth=(2+rnd()*6)*S;k.beginPath();const y=H*(.55+rnd()*.45);k.moveTo(0,y);k.bezierCurveTo(W*.15,y+rnd()*40*S,W*.3,y-rnd()*40*S,W*.5,y+30*S);k.stroke()}k.globalCompositeOperation='source-over'});
  seed=21;const bs=[[.62,.3,.2,2],[.38,.18,.07,0],[.84,.66,.1,1],[.2,.6,.05,0],[.93,.14,.05,4],[.5,.72,.04,1]];
  for(const[bx,by,br,bl]of bs){const cx=bx*W+Math.sin(t*.4+bx*9)*10*S,cy=by*H+Math.cos(t*.3+by*7)*12*S,r=br*H;
    layer(bl,'source-over',k=>{const g=k.createRadialGradient(cx-r*.3,cy-r*.3,r*.1,cx,cy,r);g.addColorStop(0,'rgba(255,170,110,.25)');g.addColorStop(.75,'rgba(255,120,70,.35)');g.addColorStop(.95,'rgba(255,240,230,.7)');g.addColorStop(1,'rgba(255,255,255,0)');
      k.fillStyle=g;k.beginPath();k.arc(cx,cy,r,0,7);k.fill();dot(k,cx+r*.35,cy+r*.25,r*.28,'rgba(255,190,80,.55)');dot(k,cx-r*.42,cy-r*.45,r*.09,'rgba(255,255,255,.9)')});
    layer(bl+r/S*.12,'lighter',k=>dot(k,cx+r*.3,cy+r*.2,r*.35,'rgba(255,150,60,.5)'))}
  finish(.4)}
};
const T0=performance.now();function loop(n){SC.draw(FIX??(n-T0)/1000);if(FIX===null)requestAnimationFrame(loop)}requestAnimationFrame(loop);
