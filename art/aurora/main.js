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
  x.fillStyle=vgrad(x,[[0,'#02030d'],[.55,'#07183a'],[1,'#0d3a4f']]);x.fillRect(0,0,W,H);
  seed=2;layer(0,'lighter',k=>{for(let i=0;i<500;i++){const r=rnd();dot(k,rnd()*W,rnd()*H*.7,(.5+r*1.4)*S,`rgba(255,255,255,${.2+.6*r*(.6+.4*Math.sin(t*3+i))})`)}});
  for(const[hue,yo,a,bl]of[[150,.0,.5,22],[175,.05,.4,30],[300,-.06,.25,34]]) layer(bl,'lighter',k=>{for(let i=0;i<=W;i+=3*S){const u=i/W,top=H*(.12+yo+.12*Math.sin(u*5+t*.3+hue)+.05*Math.sin(u*13-t*.5)),len=H*(.25+.1*Math.sin(u*7+t*.2));
    const g=k.createLinearGradient(0,top,0,top+len);g.addColorStop(0,`hsla(${hue},100%,60%,0)`);g.addColorStop(.25,`hsla(${hue},100%,65%,${a})`);g.addColorStop(1,`hsla(${hue+20},100%,50%,0)`);k.fillStyle=g;k.fillRect(i,top,3*S+1,len)}});
  const dune=(b,amp,f,ph,c1,c2)=>layer(0,'source-over',k=>{const g=k.createLinearGradient(0,b-amp,0,H);g.addColorStop(0,c1);g.addColorStop(1,c2);k.fillStyle=g;k.beginPath();k.moveTo(0,H);for(let i=0;i<=W;i+=6){const u=i/W;k.lineTo(i,b-amp*(Math.sin(u*f+ph)*.6+Math.sin(u*f*2.2+ph)*.4))}k.lineTo(W,H);k.fill();
    k.strokeStyle='rgba(120,255,210,.25)';k.lineWidth=2*S;k.beginPath();for(let i=0;i<=W;i+=6){const u=i/W;k.lineTo(i,b-amp*(Math.sin(u*f+ph)*.6+Math.sin(u*f*2.2+ph)*.4))}k.stroke()});
  dune(H*.78,H*.06,3,1,'#0b1d2c','#050a12');dune(H*.9,H*.06,2,3,'#081018','#020407');finish(.5)}
};
const T0=performance.now();function loop(n){SC.draw(FIX??(n-T0)/1000);if(FIX===null)requestAnimationFrame(loop)}requestAnimationFrame(loop);
