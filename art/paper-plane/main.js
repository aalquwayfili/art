'use strict';
const LOOP=30;
const cv=document.getElementById('c');
const qs=new URLSearchParams(location.search),fixedT=qs.has('t')?parseFloat(qs.get('t')):null;
const gl=cv.getContext('webgl',{antialias:false,preserveDrawingBuffer:true,alpha:false});
function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
const clamp=(x,a=0,b=1)=>x<a?a:x>b?b:x,lerp=(a,b,t)=>a+(b-a)*t;

const glsl=f=>fetch(f).then(r=>r.text());
const [VS,COMMON,SCENE,SKYVS,SKY,POSTFS]=await Promise.all(['scene.vert','common.glsl','scene.frag','sky.vert','sky.frag','post.frag'].map(glsl));
const FS=COMMON+SCENE,SKYFS=COMMON+SKY;
function sh(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
function prog(vs,fs){const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
  const u={};const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(let i=0;i<n;i++){const a=gl.getActiveUniform(p,i);u[a.name.replace('[0]','')]=gl.getUniformLocation(p,a.name);}return {p,u};}
const P3=prog(VS,FS),PS=prog(SKYVS,SKYFS),PP=prog(SKYVS,POSTFS);

const V=[];
function quad(a,b,c,d,n,col,uva,uvb,uvc,uvd,kind){
  const push=(p,uv)=>V.push(p[0],p[1],p[2],n[0],n[1],n[2],col[0],col[1],col[2],uv[0],uv[1],kind);
  push(a,uva);push(b,uvb);push(c,uvc);push(a,uva);push(c,uvc);push(d,uvd);
}
function box(x,z,w,d,h,col,kind=1,y0=0){
  const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2,y1=y0+h;
  quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1],col,[0,y0],[w,y0],[w,y1],[0,y1],kind);
  quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[0,0,-1],col,[0,y0],[w,y0],[w,y1],[0,y1],kind);
  quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[1,0,0],col,[0,y0],[d,y0],[d,y1],[0,y1],kind);
  quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[-1,0,0],col,[0,y0],[d,y0],[d,y1],[0,y1],kind);
  quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],[0,1,0],col.map(c=>c*.92),[0,0],[0,0],[0,0],[0,0],0);
}
function hex(h){return [parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255];}
const PAL=['#f4f1e8','#f6b3c4','#8fd6cf','#f7dcaa','#b3bff4','#ee9580','#ffffff','#a6e0f0'].map(hex);
const coast=z=>38+7*Math.sin(z/17)+4*Math.sin(z/7.3);
const LIGHTS=[];const HOME=[-63.2,28.4,.6];
(function build(){
  const r=rng(42);
  for(let i=-14;i<=14;i++)for(let j=-14;j<=14;j++){
    const cx=i*9,cz=j*9;if(cx+4.5>coast(cz)-3)continue;
    quad([cx-4.5,0,cz+4.5],[cx+4.5,0,cz+4.5],[cx+4.5,0,cz-4.5],[cx-4.5,0,cz-4.5],[0,1,0],hex('#d9cdb4'),[0,0],[0,0],[0,0],[0,0],2);
    const rr=Math.hypot(cx+10,cz)/42;
    const n=r()<.35?1:2;
    for(let k=0;k<n;k++){
      const w=n==1?5+r()*1.5:2.6+r()*.8, d=4.5+r()*1.5;
      const bx=cx+(n==1?0:(k?1.6:-1.6)), bz=cz;
      const dist=Math.hypot(bx,bz);
      let h=3+r()*6+Math.exp(-Math.pow(dist/30,2))*r()*48;
      if(dist<32&&r()<.12)h+=22;
      if(Math.abs(dist-62)<15)h=Math.min(h,4+r()*14);
      if(Math.hypot(bx-HOME[0],bz-HOME[2])<7)continue;
      const col=PAL[(r()*PAL.length)|0];
      box(bx,bz,w,d,h,col);
      if(h>22&&r()<.6){box(bx,bz,w*.6,d*.6,3,col.map(c=>c*.95),1,h);LIGHTS.push([bx,h+3.3,bz]);}
      if(r()<.25) box(bx+w*.25,bz+d*.2,1.1,1.1,1,hex('#c9d4e8'),0,h);
    }
  }
  for(let j=-16;j<16;j++){const z0=j*9,z1=z0+9;const c0=coast(z0),c1=coast(z1);
    quad([c0-8,0.02,z0],[c0-8,0.02,z1],[c1+3,-.05,z1],[c0+3,-.05,z0],[0,1,0],hex('#f2dcae'),[0,0],[0,0],[0,0],[0,0],0);}
  quad([-400,-.25,400],[400,-.25,400],[400,-.25,-400],[-400,-.25,-400],[0,1,0],[0,0,0],[0,0],[0,0],[0,0],[0,0],3);
  for(let j=-14;j<14;j+=1.5){const z=j*6+r()*2,x=coast(z)-6+r()*2,h=3.5+r()*2;
    box(x,z,.35,.35,h,hex('#8a6a4a'),0);
    const g=hex('#3f8f6a');const y=h;
    for(let a=0;a<4;a++){const an=a*1.57+r();const dx=Math.cos(an)*2.2,dz=Math.sin(an)*2.2;
      quad([x,y+.2,z],[x+dx,y-.8,z+dz],[x+dx*.9+dz*.25,y-.6,z+dz*.9-dx*.25],[x+dz*.2,y+.1,z-dx*.2],[0,1,0],g,[0,0],[0,0],[0,0],[0,0],0);}
  }
  box(coast(-20)+14,-20,28,2,.5,hex('#b9a58a'),0,-.2);
  for(let k=0;k<5;k++)LIGHTS.push([coast(-20)+3+k*5.5,1.6,-20]);
  box(HOME[0],HOME[2],7,7,HOME[1],hex('#f6b3c4'));
  box(HOME[0],HOME[2],7.4,7.4,.6,hex('#fff4e0'),0,HOME[1]);
  box(HOME[0]+1,HOME[2]-.5,.7,.5,1.1,hex('#2d3a8c'),0,HOME[1]+.6);
  box(HOME[0]+1,HOME[2]-.5,.55,.55,.55,hex('#f1c8a8'),0,HOME[1]+1.7);
  box(HOME[0]+1.35,HOME[2]-.5,.22,.22,.9,hex('#2d3a8c'),0,HOME[1]+1.5);
  box(HOME[0]-2,HOME[2]+2,1.4,1.4,1.2,hex('#c9d4e8'),0,HOME[1]+.6);
  box(-8,4,.6,.6,62,hex('#e8e8f0'),0);LIGHTS.push([-8,62.3,4]);
  LIGHTS.forEach(l=>box(l[0],l[2],.5,.5,.5,hex('#ff5a3a'),4,l[1]-.25));
})();
const STATIC_N=V.length/12;
const PLANE_START=V.length;
function addPlane(){
  for(let i=0;i<8*3*12;i++)V.push(0);
}
addPlane();
const VB=new Float32Array(V);
const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,VB,gl.DYNAMIC_DRAW);
const qbuf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,qbuf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);

const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],mul=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>mul(a,1/Math.hypot(...a));
function persp(fov,asp,n,f){const t=1/Math.tan(fov/2);return [t/asp,0,0,0,0,t,0,0,0,0,(f+n)/(n-f),-1,0,0,2*f*n/(n-f),0];}
function look(e,c,u){const z=norm(sub(e,c)),x=norm(cross(u,z)),y=cross(z,x);return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,e),-dot(y,e),-dot(z,e),1];}
function mm(a,b){const o=new Array(16).fill(0);for(let i=0;i<4;i++)for(let j=0;j<4;j++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+j]*b[i*4+k];o[i*4+j]=s;}return o;}
function inv(m){const a=m,o=new Array(16);
  const b00=a[0]*a[5]-a[1]*a[4],b01=a[0]*a[6]-a[2]*a[4],b02=a[0]*a[7]-a[3]*a[4],b03=a[1]*a[6]-a[2]*a[5],b04=a[1]*a[7]-a[3]*a[5],b05=a[2]*a[7]-a[3]*a[6],
  b06=a[8]*a[13]-a[9]*a[12],b07=a[8]*a[14]-a[10]*a[12],b08=a[8]*a[15]-a[11]*a[12],b09=a[9]*a[14]-a[10]*a[13],b10=a[9]*a[15]-a[11]*a[13],b11=a[10]*a[15]-a[11]*a[14];
  const d=1/(b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06);
  o[0]=(a[5]*b11-a[6]*b10+a[7]*b09)*d;o[1]=(a[2]*b10-a[1]*b11-a[3]*b09)*d;o[2]=(a[13]*b05-a[14]*b04+a[15]*b03)*d;o[3]=(a[10]*b04-a[9]*b05-a[11]*b03)*d;
  o[4]=(a[6]*b08-a[4]*b11-a[7]*b07)*d;o[5]=(a[0]*b11-a[2]*b08+a[3]*b07)*d;o[6]=(a[14]*b02-a[12]*b05-a[15]*b01)*d;o[7]=(a[8]*b05-a[10]*b02+a[11]*b01)*d;
  o[8]=(a[4]*b10-a[5]*b08+a[7]*b06)*d;o[9]=(a[1]*b08-a[0]*b10-a[3]*b06)*d;o[10]=(a[12]*b04-a[13]*b02+a[15]*b00)*d;o[11]=(a[9]*b02-a[8]*b04-a[11]*b00)*d;
  o[12]=(a[5]*b07-a[4]*b09-a[6]*b06)*d;o[13]=(a[0]*b09-a[1]*b07+a[2]*b06)*d;o[14]=(a[13]*b01-a[12]*b03-a[14]*b00)*d;o[15]=(a[8]*b03-a[9]*b01+a[10]*b00)*d;return o;}

const KEYS=[
 [0.00,'#1c58d6','#8fd2ff','#ffffff','#8fb3ec','#fff4d6',[1,.97,.9],[.52,.58,.75],0],
 [0.20,'#2461d0','#bfe2ff','#fffaf0','#a0b4e6','#fff0c8',[1,.93,.82],[.50,.55,.72],0],
 [0.32,'#3150b8','#ffcf96','#fff0d2','#d88fa9','#ffc070',[1,.78,.55],[.48,.46,.62],0],
 [0.41,'#34307f','#ff7458','#ffb070','#8a4a92','#ff5a3a',[1,.52,.38],[.40,.32,.52],.1],
 [0.50,'#15195a','#b8468a','#ff86a0','#3c2f70','#ff4a6a',[.55,.36,.62],[.26,.22,.42],.6],
 [0.60,'#060925','#1c2a66','#3a4a8a','#141a42','#8090ff',[.22,.26,.45],[.13,.14,.28],1],
 [0.80,'#070a28','#243270','#3a4a8a','#141a42','#8090ff',[.22,.26,.45],[.13,.14,.28],1],
 [0.90,'#2f4fc4','#ff9fb8','#ffe0ea','#8a72c0','#ffd0b0',[.95,.74,.78],[.34,.30,.50],.15],
 [1.00,'#1c58d6','#8fd2ff','#ffffff','#8fb3ec','#fff4d6',[1,.97,.9],[.52,.58,.75],0]];
function dayAt(p){
  let i=0;while(i<KEYS.length-2&&p>KEYS[i+1][0])i++;
  const a=KEYS[i],b=KEYS[i+1];let f=clamp((p-a[0])/(b[0]-a[0]));f=f*f*(3-2*f);
  const mix=(x,y)=>{x=typeof x=='string'?hex(x):x;y=typeof y=='string'?hex(y):y;return x.map((v,k)=>lerp(v,y[k],f));};
  return {zen:mix(a[1],b[1]),hor:mix(a[2],b[2]),cl:mix(a[3],b[3]),cs:mix(a[4],b[4]),sun:mix(a[5],b[5]),light:mix(a[6],b[6]),amb:mix(a[7],b[7]),night:lerp(a[8],b[8],f)};
}

let W,H,LW,LH,fbo,tex,rb;
function resize(){
  const dpr=fixedT!==null?1:Math.min(2,window.devicePixelRatio||1);
  W=cv.width=Math.round(innerWidth*dpr);H=cv.height=Math.round(innerHeight*dpr);
  LH=240;LW=Math.round(LH*W/H);
  if(tex){gl.deleteTexture(tex);gl.deleteFramebuffer(fbo);gl.deleteRenderbuffer(rb);}
  tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,LW,LH,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
  rb=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,rb);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,LW,LH);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,rb);
}
const R=58;
function planeAt(t){
  const p=t/LOOP, th=Math.PI+p*Math.PI*2;
  const y=34+4*Math.sin(th*3)+2*Math.sin(th*5+1);
  const rr=R+8*Math.sin(th*2+.5);
  return [rr*Math.cos(th),y,rr*Math.sin(th)];
}
function render(t){
  t=((t%LOOP)+LOOP)%LOOP;const p=t/LOOP;
  const D=dayAt(p);
  const sa=p*Math.PI*2;
  const u=(((p+.08)%1)+1)%1/.5, azS=.82, el=u<=1?Math.sin(Math.PI*u)*1.15-.03:-.3;
  const az=azS+Math.PI*(1-Math.min(u,1));
  const sunDir=[Math.cos(el)*Math.cos(az),Math.sin(el),Math.cos(el)*Math.sin(az)];
  const moonDir=norm([-.8,.28,.35]);
  const pos=planeAt(t),ahead=planeAt(t+.25);
  const fwd=norm(sub(ahead,pos));
  const outward=norm([pos[0],0,pos[2]]);
  const roll=.45+.12*Math.sin(t*2.3)+.06*Math.sin(t*5.1);
  let up=[0,1,0];let right=norm(cross(fwd,up));up=cross(right,fwd);
  const bu=add(mul(up,Math.cos(roll)),mul(right,-Math.sin(roll))),br=norm(cross(fwd,bu));
  const eye=add(add(add(pos,mul(fwd,-8.5)),mul(outward,-2.6)),[0,3.4,0]);
  const tgt=add(add(pos,mul(fwd,6)),[0,-.4,0]);
  const view=look(eye,tgt,[Math.sin(t*.4)*.03,1,0]);
  const proj=persp(1.05,W/H,.3,700);
  const VP=mm(proj,view);
  const PS_=1.35;const Pt=(x,y,z)=>add(add(add(pos,mul(br,x*PS_)),mul(bu,y*PS_)),mul(fwd,z*PS_));
  const nose=Pt(0,0,1.25),lb=Pt(-.9,.28,-.95),rbk=Pt(.9,.28,-.95),kt=Pt(0,0,-.95),kb=Pt(0,-.38,-.95),kn=Pt(0,-.05,.9);
  const tri=[[nose,lb,kt],[nose,kt,rbk],[nose,kb,kt],[nose,kt,kb]];
  const cols=[[.99,.98,.94],[.96,.95,.9],[.88,.86,.82],[.88,.86,.82]];
  let o=PLANE_START;
  tri.forEach((tr,i)=>{const n=norm(cross(sub(tr[1],tr[0]),sub(tr[2],tr[0])));const nn=i==2?mul(n,-1):n;
    tr.forEach(v=>{VB.set([v[0],v[1],v[2],nn[0],Math.abs(nn[1]),nn[2],...cols[i],0,0,5],o);o+=12;});});
  const vd=norm(sub(pos,eye));
  tri.forEach(tr=>{tr.forEach(v=>{const q=add(add(pos,mul(sub(v,pos),1.16)),mul(vd,.35));
    VB.set([q[0],q[1],q[2],0,1,0,.10,.11,.24,0,0,4],o);o+=12;});});
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferSubData(gl.ARRAY_BUFFER,PLANE_START*4,VB.subarray(PLANE_START));

  gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,LW,LH);
  gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const setCommon=(U)=>{gl.uniform3fv(U.uZen,D.zen);gl.uniform3fv(U.uHor,D.hor);gl.uniform3fv(U.uCloudL,D.cl);gl.uniform3fv(U.uCloudS,D.cs);
    gl.uniform3fv(U.uSunC,D.sun);gl.uniform3fv(U.uLight,D.light);gl.uniform3fv(U.uAmb,D.amb);gl.uniform3fv(U.uSunDir,sunDir);gl.uniform3fv(U.uMoonDir,moonDir);
    gl.uniform1f(U.uNight,D.night);gl.uniform1f(U.uTime,t);gl.uniform3fv(U.uCam,eye);};
  gl.disable(gl.DEPTH_TEST);gl.useProgram(PS.p);setCommon(PS.u);gl.uniformMatrix4fv(PS.u.uInvVP,false,inv(VP));
  gl.bindBuffer(gl.ARRAY_BUFFER,qbuf);const la=gl.getAttribLocation(PS.p,'aP');gl.enableVertexAttribArray(la);gl.vertexAttribPointer(la,2,gl.FLOAT,false,0,0);
  gl.drawArrays(gl.TRIANGLES,0,6);gl.disableVertexAttribArray(la);
  gl.enable(gl.DEPTH_TEST);gl.useProgram(P3.p);setCommon(P3.u);gl.uniformMatrix4fv(P3.u.uVP,false,VP);gl.uniform2f(P3.u.uRes,LW,LH);
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  const at=(n,sz,off)=>{const l=gl.getAttribLocation(P3.p,n);gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,sz,gl.FLOAT,false,48,off);return l;};
  const ls=[at('aPos',3,0),at('aNrm',3,12),at('aCol',3,24),at('aUV',3,36)];
  gl.drawArrays(gl.TRIANGLES,0,VB.length/12);
  ls.forEach(l=>gl.disableVertexAttribArray(l));
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,W,H);gl.disable(gl.DEPTH_TEST);
  gl.useProgram(PP.p);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);gl.uniform1i(PP.u.uTex,0);
  gl.uniform2f(PP.u.uLow,LW,LH);gl.uniform2f(PP.u.uOut,W,H);gl.uniform1f(PP.u.uSeed,Math.floor(t*12)%97);gl.uniform1f(PP.u.uHal,.5+3.6*D.night);
  gl.bindBuffer(gl.ARRAY_BUFFER,qbuf);const lp=gl.getAttribLocation(PP.p,'aP');gl.enableVertexAttribArray(lp);gl.vertexAttribPointer(lp,2,gl.FLOAT,false,0,0);
  gl.drawArrays(gl.TRIANGLES,0,6);gl.disableVertexAttribArray(lp);
}
resize();
if(fixedT!==null){const t0=performance.now();render(fixedT);gl.finish();const px=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);window.__ms=performance.now()-t0;document.title='done';}
else{addEventListener('resize',resize);const st=performance.now();(function f(){render((performance.now()-st)/1000);requestAnimationFrame(f);})();}
