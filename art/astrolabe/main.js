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
  paper(x,'#f3ecdc','#e0d6bf');
  const cx=W*.5,cy=H*.5,ink='rgba(28,32,48,',gold='rgba(176,128,44,';
  layer(0,'source-over',k=>{k.lineCap='round';
    for(let r=0;r<9;r++){const R=H*(.07+r*.048),sp=(r%2?1:-1)*(.02+r*.012),n=12+r*12;k.strokeStyle=ink+(r%3==0?.85:.45)+')';k.lineWidth=(r%3==0?1.8:1)*S;k.beginPath();k.arc(cx,cy,R,0,7);k.stroke();
      for(let i=0;i<n;i++){const a=i/n*6.28+t*sp,long=i%(n/12)==0;k.beginPath();k.moveTo(cx+Math.cos(a)*R,cy+Math.sin(a)*R);k.lineTo(cx+Math.cos(a)*(R+(long?9:4)*S),cy+Math.sin(a)*(R+(long?9:4)*S));k.stroke()}
      if(r%2==0){const a=t*sp*2+r;k.fillStyle=gold+'.9)';dot(k,cx+Math.cos(a)*R,cy+Math.sin(a)*R,4*S,k.fillStyle)}}
    for(const[rr,al] of [[H*.12,.9],[H*.085,.6]]){k.save();k.translate(cx,cy);k.rotate(t*.05);k.strokeStyle=gold+al+')';k.lineWidth=1.6*S;for(let q=0;q<2;q++){k.beginPath();for(let i=0;i<4;i++){const a=i*Math.PI/2+q*Math.PI/4;k.lineTo(Math.cos(a)*rr,Math.sin(a)*rr)}k.closePath();k.stroke()}k.restore()}
    k.strokeStyle=gold+'.8)';k.lineWidth=2*S;k.beginPath();k.ellipse(cx+Math.cos(t*.1)*H*.06,cy+Math.sin(t*.1)*H*.06,H*.3,H*.3,0,0,7);k.stroke();
    k.strokeStyle=ink+'.9)';k.lineWidth=2.2*S;k.beginPath();k.moveTo(cx,cy);k.lineTo(cx+Math.cos(t*.3)*H*.44,cy+Math.sin(t*.3)*H*.44);k.stroke();dot(k,cx,cy,5*S,ink+'1)')});
  finish(.25)}
};
const T0=performance.now();function loop(n){SC.draw(FIX??(n-T0)/1000);if(FIX===null)requestAnimationFrame(loop)}requestAnimationFrame(loop);
