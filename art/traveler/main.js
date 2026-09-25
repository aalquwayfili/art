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
  x.fillStyle=vgrad(x,[[0,'#03040b'],[1,'#0c1330']]);x.fillRect(0,0,W,H);
  seed=8;layer(0,'lighter',k=>{for(let i=0;i<600;i++){const r=rnd();dot(k,rnd()*W,rnd()*H,(.4+r*1.3)*S,`rgba(220,230,255,${.2+.7*r*(.6+.4*Math.sin(t*2+i))})`)}});
  layer(0,'source-over',k=>{const g=k.createRadialGradient(W*.5,H*2.35,H*1.4,W*.5,H*2.35,H*1.62);g.addColorStop(0,'#05070f');g.addColorStop(.97,'#0a1428');g.addColorStop(1,'#2a64b8');k.fillStyle=g;k.beginPath();k.arc(W*.5,H*2.35,H*1.6,0,7);k.fill()});
  layer(20,'lighter',k=>{k.strokeStyle='rgba(90,160,255,.55)';k.lineWidth=18*S;k.beginPath();k.arc(W*.5,H*2.35,H*1.6,0,7);k.stroke()});
  const cx=W*.5,cy=H*.4,R=H*.2;
  layer(60,'lighter',k=>dot(k,cx,cy,R*1.6,'rgba(200,220,255,.25)'));
  layer(0,'source-over',k=>{const g=k.createRadialGradient(cx-R*.35,cy-R*.4,R*.05,cx,cy,R);g.addColorStop(0,'#ffffff');g.addColorStop(.6,'#d9dde6');g.addColorStop(1,'#8d95a8');k.fillStyle=g;k.beginPath();k.arc(cx,cy,R,0,7);k.fill();
    k.globalCompositeOperation='source-atop';seed=4;k.strokeStyle='rgba(90,100,120,.35)';k.lineWidth=1.4*S;for(let i=0;i<5;i++){let a=rnd()*6.28,px=cx+Math.cos(a)*R*rnd(),py=cy+Math.sin(a)*R*rnd();k.beginPath();k.moveTo(px,py);for(let j=0;j<6;j++){px+=(rnd()-.5)*40*S;py+=(rnd()-.5)*40*S;k.lineTo(px,py)}k.stroke()}k.globalCompositeOperation='source-over'});
  for(let r=0;r<3;r++) layer(r==2?2:0,'lighter',k=>{const rx=R*(1.5+r*.45),ry=rx*(.22+r*.05),tilt=-.25+r*.12,sp=(r%2?-1:1)*(.15+r*.05);k.save();k.translate(cx,cy);k.rotate(tilt);
    for(let i=0;i<96;i++){const a=i/96*6.28+t*sp;const px=Math.cos(a)*rx,py=Math.sin(a)*ry;const front=Math.sin(a)>0;if(!front&&Math.hypot(px,py*R/ry*0)<0)continue;
      k.fillStyle=`rgba(${front?'180,225,255':'90,120,170'},${front?.95:.4})`;if(i%6==0){k.fillRect(px-7*S,py-2*S,14*S,4*S)}else if(i%3==0){dot(k,px,py,3.2*S,k.fillStyle)}else dot(k,px,py,1.8*S,k.fillStyle)}
    k.strokeStyle='rgba(140,190,255,.35)';k.lineWidth=1.2*S;k.beginPath();k.ellipse(0,0,rx,ry,0,0,7);k.stroke()
    k.restore()});
  finish(.5)}
};
const T0=performance.now();function loop(n){SC.draw(FIX??(n-T0)/1000);if(FIX===null)requestAnimationFrame(loop)}requestAnimationFrame(loop);
