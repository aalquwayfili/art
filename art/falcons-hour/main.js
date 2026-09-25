'use strict';
const LOOP=24;
const cv=document.getElementById('c');
const qs=new URLSearchParams(location.search),fixedT=qs.has('t')?parseFloat(qs.get('t')):null;
const gl=cv.getContext('webgl',{antialias:false,preserveDrawingBuffer:true,alpha:false});
const clamp=(x,a=0,b=1)=>x<a?a:x>b?b:x,lerp=(a,b,t)=>a+(b-a)*t;
const ss=(a,b,x)=>{x=clamp((x-a)/(b-a));return x*x*(3-2*x);};

const glsl=f=>fetch(f).then(r=>r.text());
const [VS,FS1,FS2]=await Promise.all(['quad.vert','block.frag','print.frag'].map(glsl));

function sh(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
function prog(fs){const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,VS));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));
  gl.bindAttribLocation(p,0,'aP');gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
  const u={};const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(let i=0;i<n;i++){const a=gl.getActiveUniform(p,i);u[a.name]=gl.getUniformLocation(p,a.name);}
  return {p,u};}
const P1=prog(FS1),P2=prog(FS2);
const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
let W,H,tex,fb;
function resize(){
  const dpr=fixedT!==null?1:Math.min(1.5,window.devicePixelRatio||1);
  W=cv.width=Math.round(innerWidth*dpr);H=cv.height=Math.round(innerHeight*dpr);
  if(tex)gl.deleteTexture(tex);if(fb)gl.deleteFramebuffer(fb);
  tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,W,H,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  for(const k of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,k,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
}

const S0=2.6, SAPEX=2.1e7, GLOVE=[.63,.12];
const T_LAUNCH=2.6, T_CLIMB0=3.4, T_APEX=12.6, T_STOOP=15.4, T_HOME=20.4, T_PERCH=21.8;
function state(t){
  const l0=Math.log(S0),l1=Math.log(SAPEX);
  let lS;
  if(t<T_CLIMB0) lS=l0+ .25*ss(T_LAUNCH,T_CLIMB0+1,t);
  else if(t<T_APEX){const x=(t-T_CLIMB0)/(T_APEX-T_CLIMB0);const e=x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2;lS=lerp(l0+.25*ss(T_LAUNCH,T_CLIMB0+1,t),l1-.12,e);}
  else if(t<T_STOOP) lS=l1-.12+.12*ss(T_APEX,T_STOOP,t);
  else if(t<T_HOME){const x=(t-T_STOOP)/(T_HOME-T_STOOP);const e=x<.62? .62*Math.pow(x/.62,2.2) : .62+.38*(1-Math.pow(1-(x-.62)/.38,2.2));lS=lerp(l1,l0,e);}
  else lS=l0;
  const S=Math.exp(lS);
  const spread= t<T_LAUNCH? 0 : t<T_STOOP? ss(T_LAUNCH,T_LAUNCH+.5,t) - .12*ss(T_APEX,T_STOOP,t)
      : t<T_HOME-1.1 ? lerp(.88,0,ss(T_STOOP,T_STOOP+1,t)) : t<T_PERCH? ss(T_HOME-1.1,T_HOME-.6,t) : 1-ss(T_PERCH,T_PERCH+.9,t);
  let fa=0;
  if(t>T_LAUNCH&&t<T_CLIMB0+2.6)fa=1-ss(T_CLIMB0+1,T_CLIMB0+2.6,t);
  if(t>T_HOME-1.1&&t<T_PERCH+.2)fa=Math.max(fa,ss(T_HOME-1.1,T_HOME-.8,t)*(1-ss(T_PERCH-.4,T_PERCH+.2,t)));
  if(t>T_APEX&&t<T_STOOP)fa=Math.max(fa,.18*Math.sin((t-T_APEX)/(T_STOOP-T_APEX)*Math.PI));
  const flap=Math.sin(t*2*Math.PI*4.2)*fa;
  let head=2*Math.PI*(2*ss(T_LAUNCH,T_APEX+1,t)+1*ss(T_STOOP-.5,T_HOME+.6,t));
  if(t<T_LAUNCH) head+= .18*Math.sin(t*2.1)*ss(0,.8,t);
  if(t>T_PERCH) head+= -.12*Math.sin((t-T_PERCH)*2.4)*ss(T_PERCH,T_PERCH+.6,t);
  const rouse= (t>.8&&t<1.6? Math.sin((t-.8)/.8*Math.PI)*.25:0) + (t>22.4&&t<23.2?Math.sin((t-22.4)/.8*Math.PI)*.3:0);
  const env=ss(T_LAUNCH,T_CLIMB0+1.5,t)*(1-ss(T_STOOP+2.5,T_HOME,t));
  const R=.22*S*env*(1-ss(2e3,6e4,S));
  const cam=[GLOVE[0]+R*Math.cos(head),GLOVE[1]+R*Math.sin(head)];
  const tail= t<T_PERCH+.4 ? Math.max(ss(T_HOME-1,T_HOME-.5,t)*(1-ss(T_PERCH,T_PERCH+.4,t)), .4*ss(T_LAUNCH,T_LAUNCH+.3,t)*(1-ss(T_CLIMB0,T_CLIMB0+1,t))) : 0;
  const lsp=(t>T_STOOP&&t<T_HOME)? Math.abs((Math.log(Math.exp(1))*0))+ ss(T_STOOP+.8,T_STOOP+2,t)*(1-ss(T_HOME-1.3,T_HOME-.6,t)) : 0;
  const alt=S/1.1;
  const falAlt=Math.max(1.5,alt-S0/1.1+1.5);
  const perch=1-ss(T_LAUNCH,T_LAUNCH+.3,t)+ss(T_PERCH-.3,T_PERCH,t);
  const aw=ss(2e5,6e6,S);
  const fo=[.0*aw,-.2*aw];
  return {fo,S,spread:clamp(spread+rouse*.6),flap:flap+rouse*.5,head,cam,tail,streak:lsp,alt,falAlt,perch:clamp(perch)};
}

function render(t){
  t=((t%LOOP)+LOOP)%LOOP;
  const st=state(t);
  gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.viewport(0,0,W,H);
  gl.useProgram(P1.p);const u=P1.u;
  gl.uniform2f(u.uRes,W,H);gl.uniform1f(u.uT,t);gl.uniform1f(u.uS,st.S);gl.uniform1f(u.uS0,S0);
  gl.uniform1f(u.uHead,st.head);gl.uniform1f(u.uSpread,st.spread);gl.uniform1f(u.uFlap,st.flap);gl.uniform1f(u.uTail,st.tail);
  gl.uniform1f(u.uStreak,st.streak);gl.uniform1f(u.uAlt,st.alt);gl.uniform1f(u.uFalAlt,st.falAlt);gl.uniform1f(u.uPerch,st.perch);
  gl.uniform2f(u.uCam,st.cam[0],st.cam[1]);gl.uniform2f(u.uFo,st.fo[0],st.fo[1]);gl.uniform2f(u.uFal,st.cam[0],st.cam[1]);
  gl.drawArrays(gl.TRIANGLES,0,3);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,W,H);
  gl.useProgram(P2.p);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.uniform1i(P2.u.uTex,0);gl.uniform2f(P2.u.uRes,W,H);gl.uniform1f(P2.u.uS,st.S);gl.uniform1f(P2.u.uBoil,Math.floor(t*8));
  gl.drawArrays(gl.TRIANGLES,0,3);
}
resize();
if(fixedT!==null){const t0=performance.now();render(fixedT);const px=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);window.__ms=performance.now()-t0;document.title='done';}
else{addEventListener('resize',resize);const s0=performance.now();(function f(){render((performance.now()-s0)/1000);requestAnimationFrame(f);})();}
