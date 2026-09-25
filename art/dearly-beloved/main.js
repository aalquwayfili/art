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
  x.fillStyle=vgrad(x,[[0,'#070b1c'],[1,'#101a3a']]);x.fillRect(0,0,W,H);
  const lines=46;
  layer(0,'source-over',k=>{for(let i=0;i<lines;i++){const y0=H*(.22+i/lines*.7),amp=H*.13;k.beginPath();k.moveTo(W*.18,y0);
      for(let s=0;s<=160;s++){const u=s/160,xx=W*(.18+u*.64);const env=Math.exp(-Math.pow((u-.5)/.17,2));const note=Math.max(0,Math.sin(t*.9-i*.22))*.8+.2;
        const yy=y0-amp*env*note*(.6*fbm(u*9+i*.7,t*.35)+.4*Math.abs(Math.sin(u*20+t+i)));k.lineTo(xx,yy)}
      k.lineTo(W*.82,y0);k.fillStyle='#070b1c';k.fill();k.strokeStyle=`rgba(215,228,255,${.55+.45*Math.max(0,Math.sin(t*.9-i*.22))})`;k.lineWidth=1.8*S;k.stroke()}});
  layer(30,'lighter',k=>{for(let i=0;i<lines;i+=3){const g=Math.max(0,Math.sin(t*.9-i*.22));if(g<.7)continue;k.fillStyle=`rgba(120,160,255,${(g-.7)*.5})`;k.fillRect(W*.3,H*(.12+i/lines*.72),W*.4,H*.04)}});
  finish(.5)}
};
const T0=performance.now();function loop(n){SC.draw(FIX??(n-T0)/1000);if(FIX===null)requestAnimationFrame(loop)}requestAnimationFrame(loop);
