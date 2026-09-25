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
  x.fillStyle=vgrad(x,[[0,'#0a0f2e'],[1,'#1b3a78']]);x.fillRect(0,0,W,H);
  bokeh(14,30,90,['rgba(120,200,255,.15)','rgba(170,255,210,.12)'],16,t,.005,8);
  const w=640,h=360,im=new ImageData(w,h);seed=31;const B=[...Array(11)].map(()=>[rnd(),rnd(),.03+rnd()*.05,rnd()*6]);
  const pts=B.map(([a,b,r,p])=>[(.5+.33*Math.sin(t*.3+p+a*3))*w,(.5+.3*Math.cos(t*.25+p*1.3+b*4))*h,r*h*1.6]);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){let f=0;for(const[px,py,r]of pts){const d=(i-px)**2+(j-py)**2;f+=r*r/(d+1)}const o=(j*w+i)*4;
    if(f>1){const rim=Math.max(0,1-(f-1)*2.2),core=Math.min(1,(f-1)*.8);im.data[o]=255;im.data[o+1]=90+120*rim+60*core;im.data[o+2]=60+140*rim;im.data[o+3]=60+190*rim+60*core}else{im.data[o+3]=0}}
  const tmp=document.createElement('canvas');tmp.width=w;tmp.height=h;tmp.getContext('2d').putImageData(im,0,0);
  layer(40,'lighter',k=>{k.globalAlpha=.8;k.drawImage(tmp,0,0,W,H)});layer(3,'source-over',k=>{k.imageSmoothingQuality='high';k.drawImage(tmp,0,0,W,H)});
  layer(4,'lighter',k=>{for(const[px,py,r]of pts)dot(k,px/w*W-r/h*H*.25,py/h*H-r/h*H*.3,r/h*H*.12,'rgba(255,255,255,.55)')});
  bokeh(6,60,140,['rgba(255,150,90,.3)','rgba(160,255,200,.3)'],24,t,.01,19);finish()}
};
const T0=performance.now();function loop(n){SC.draw(FIX??(n-T0)/1000);if(FIX===null)requestAnimationFrame(loop)}requestAnimationFrame(loop);
