'use strict';
const LOOP=26;
const cv=document.getElementById('c');
const qs=new URLSearchParams(location.search),fixedT=qs.has('t')?parseFloat(qs.get('t')):null;
const gl=cv.getContext('webgl',{antialias:false,preserveDrawingBuffer:true,alpha:false});
function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
const clamp=(x,a=0,b=1)=>x<a?a:x>b?b:x,lerp=(a,b,t)=>a+(b-a)*t;
const ss=(a,b,x)=>{x=clamp((x-a)/(b-a));return x*x*(3-2*x);};

const HB=290;
function prof(y){const u=Math.max(Math.abs(y)/HB-.012,0)/.988;return 8+142*Math.pow(Math.sin(Math.PI*.92*Math.min(u,1))+1e-4,.7);}
const PILE=-100,SLOPE=.65;
const pileY=x=>PILE-Math.abs(x)*SLOPE;
const resid=y=>2.2*ss(4,30,y);
const TSTAR=6, G=11, V0=5;

const LAYERS=[];
{const r=rng(7);for(let k=0;k<3;k++){const a=[];const N=k==0?2600:1700;
  for(let i=0;i<N;i++){a.push({tau:TSTAR-.03-r()*14,sg:r()<.5?-1:1,u:r(),s:r()*100,j:r(),ds:r()});}
  if(k==0)a.push({tau:TSTAR,sg:1,u:.42,s:3.3,j:.5,ds:.1,me:1});
  LAYERS.push(a);}}
function grainPos(g,t,k){
  const s=g.tau-t;
  if(s>0){
    const y=V0*s+1.5*s*s; if(y>HB*.8)return null;
    const v=V0+3*s,D=Math.min(110/v,8.5);
    const x=g.sg*(prof(y)-resid(y)-.55-g.u*D)+Math.sin(t*2.3+g.s)*.08;
    return [x,y+Math.sin(t*3.1+g.s*2)*.08];
  }
  const e=-s;
  const xn=g.sg*(8-.6-g.u*7.2);
  const spread=(g.j-.5)*1.6;
  const xAt=e=>xn*(1+.035*e)+spread*e;
  let el=2.5;for(let i=0;i<3;i++){const h=-pileY(xAt(el));el=(-V0+Math.sqrt(V0*V0+4*G*h))/(2*G);}
  if(e<el){return [xAt(e),-(V0*e+G*e*e)];}
  const xl=xAt(el),dir=Math.sign(xl)||1;
  const dt=e-el;
  let slide=g.me? .8 : (1+g.ds*14)*(1-Math.exp(-dt*3));
  const x=xl+dir*slide*.84;
  let y=pileY(x)+.45-(g.me?0:g.ds*.6);
  if(g.me){y+=Math.abs(Math.sin(dt*7))*3.2*Math.exp(-dt*3.5);}
  return [x,y];
}

function camera(t){
  const me=LAYERS[0][LAYERS[0].length-1];
  const P=grainPos(me,Math.min(t,10.5),0);
  let Hw= t<4.8? lerp(30,26,ss(0,4.8,t)) : t<6.3? 24 : t<8.9? lerp(24,40,ss(6.2,7.6,t)) : lerp(40,30,ss(8.8,9.8,t));
  let c=[P[0]+(t<6.2?-1.5:0),P[1]+(t>6.1&&t<8.8?-6:2)];
  const z=ss(10.2,17.8,t);
  if(z>0){const l0=Math.log(Hw),l1=Math.log(1100);const lz=Math.exp(lerp(l0,l1,z));
    const w=(lz-Hw)/(1100-Hw);
    c=[lerp(c[0],20,w),lerp(c[1],-40,w)];Hw=lz;}
  return {c,Hw,P};
}

const glsl=f=>fetch(f).then(r=>r.text());
const [VSQ,FSBG,VSG,FSG,FSP]=await Promise.all(['quad.vert','background.frag','grain.vert','grain.frag','post.frag'].map(glsl));
function sh(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
function prog(vs,fs,attrs){const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));
  attrs.forEach((a,i)=>gl.bindAttribLocation(p,i,a));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
  const u={};const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(let i=0;i<n;i++){const a=gl.getActiveUniform(p,i);u[a.name]=gl.getUniformLocation(p,a.name);}return{p,u};}
const PB=prog(VSQ,FSBG,['aP']),PG=prog(VSG,FSG,['aP','aQ','aA']),PP=prog(VSQ,FSP,['aP']);
const bTri=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,bTri);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
const bG=gl.createBuffer();
let W,H,tex,fb,PX=1;
function resize(){
  const dpr=fixedT!==null?1:Math.min(1.5,window.devicePixelRatio||1);
  W=cv.width=Math.round(innerWidth*dpr);H=cv.height=Math.round(innerHeight*dpr);
  PX=Math.max(1,Math.round(H/420));
  if(tex){gl.deleteTexture(tex);gl.deleteFramebuffer(fb);}
  tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,W,H,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  for(const k of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,k,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
}
function quadAttr(){gl.bindBuffer(gl.ARRAY_BUFFER,bTri);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.disableVertexAttribArray(1);gl.disableVertexAttribArray(2);}

function render(t){
  t=((t%LOOP)+LOOP)%LOOP;
  const cam=camera(t);
  const light=1-.85*ss(22.6,22.75,t);
  const fade=ss(0,1.2,t)*(1-ss(24.2,25.6,t));
  gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.viewport(0,0,W,H);
  gl.useProgram(PB.p);quadAttr();
  gl.uniform2f(PB.u.uRes,W,H);gl.uniform2f(PB.u.uC,cam.c[0],cam.c[1]);gl.uniform1f(PB.u.uHw,cam.Hw);gl.uniform1f(PB.u.uLight,light);gl.uniform1f(PB.u.uT,t);
  gl.drawArrays(gl.TRIANGLES,0,3);
  const pw=cam.Hw/H, halfW=cam.Hw*W/H/2+4, halfH=cam.Hw/2+4;
  const v=[];
  for(let k=2;k>=0;k--){
    for(const g of LAYERS[k]){
      if(k>0&&pw>.5)continue;
      const tt=t+(k? (k*.37):0);
      let p=grainPos(g,Math.min(tt,10.5+ (k?1:0)),k);
      if(!p)continue;
      if(k>0){p=[p[0]*(1+.02*k)+k*.4,p[1]+k*.3];}
      if(Math.abs(p[0]-cam.c[0])>halfW||Math.abs(p[1]-cam.c[1])>halfH)continue;
      let R=.52+.12*((g.s*7.3)%1);
      if(g.me)R=Math.max(.56,pw*6.5);
      else if(pw>.8)continue;
      const acc=g.me?1:0,pale=k==0?0:(k==1?.45:.65);
      const q=[[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]];
      for(const [a,b] of q)v.push(p[0]+a*R,p[1]+b*R,a,b,pale,g.s,acc);
    }
  }
  if(v.length){
    gl.useProgram(PG.p);gl.bindBuffer(gl.ARRAY_BUFFER,bG);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(v),gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,28,0);
    gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,28,8);
    gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,3,gl.FLOAT,false,28,16);
    gl.uniform2f(PG.u.uC,cam.c[0],cam.c[1]);gl.uniform2f(PG.u.uRes,W,H);gl.uniform1f(PG.u.uHw,cam.Hw);gl.uniform1f(PG.u.uLight,light);
    gl.drawArrays(gl.TRIANGLES,0,v.length/7);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,W,H);
  gl.useProgram(PP.p);quadAttr();
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);gl.uniform1i(PP.u.uTex,0);gl.uniform2f(PP.u.uRes,W,H);
  gl.uniform1f(PP.u.uFade,fade);gl.uniform1f(PP.u.uPx,PX);
  gl.drawArrays(gl.TRIANGLES,0,3);
}
resize();
if(fixedT!==null){const t0=performance.now();render(fixedT);const px=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);window.__ms=performance.now()-t0;document.title='done';}
else{addEventListener('resize',resize);const s0=performance.now();(function f(){render((performance.now()-s0)/1000);requestAnimationFrame(f);})();}
