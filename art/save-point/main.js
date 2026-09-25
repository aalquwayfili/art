'use strict';
const LOOP=28;
const cv=document.getElementById('c');
const qs=new URLSearchParams(location.search),fixedT=qs.has('t')?parseFloat(qs.get('t')):null;
const gl=cv.getContext('webgl',{antialias:false,preserveDrawingBuffer:true,alpha:false});
function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
const clamp=(x,a=0,b=1)=>x<a?a:x>b?b:x,lerp=(a,b,t)=>a+(b-a)*t;
const ss=(a,b,x)=>{x=clamp((x-a)/(b-a));return x*x*(3-2*x);};
const hash=n=>{n=Math.sin(n*127.1+311.7)*43758.5453;return n-Math.floor(n);};

const M={
  I:()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
  mul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;},
  T:(x,y,z)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1],
  S:(x,y,z)=>[x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1],
  RY(a){const c=Math.cos(a),s=Math.sin(a);return[c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1];},
  RX(a){const c=Math.cos(a),s=Math.sin(a);return[1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1];},
  RZ(a){const c=Math.cos(a),s=Math.sin(a);return[c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1];},
  persp(f,a,n,fa){const t=1/Math.tan(f/2);return[t/a,0,0,0,0,t,0,0,0,0,(fa+n)/(n-fa),-1,0,0,2*fa*n/(n-fa),0];},
  look(e,c,u){let z=[e[0]-c[0],e[1]-c[1],e[2]-c[2]];let l=Math.hypot(...z);z=z.map(v=>v/l);
    let x=[u[1]*z[2]-u[2]*z[1],u[2]*z[0]-u[0]*z[2],u[0]*z[1]-u[1]*z[0]];l=Math.hypot(...x);x=x.map(v=>v/l);
    const y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];
    return[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-(x[0]*e[0]+x[1]*e[1]+x[2]*e[2]),-(y[0]*e[0]+y[1]*e[1]+y[2]*e[2]),-(z[0]*e[0]+z[1]*e[1]+z[2]*e[2]),1];}
};
const xf=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const xn=(m,n)=>{const v=[m[0]*n[0]+m[4]*n[1]+m[8]*n[2],m[1]*n[0]+m[5]*n[1]+m[9]*n[2],m[2]*n[0]+m[6]*n[1]+m[10]*n[2]];const l=Math.hypot(...v)||1;return v.map(a=>a/l);};

class Mesh{
  constructor(){this.v=[];}
  tri(a,b,c,n,col,mat,uvs){for(let i=0;i<3;i++){const p=[a,b,c][i],uv=uvs[i];this.v.push(p[0],p[1],p[2],n[0],n[1],n[2],col[0],col[1],col[2],uv[0],uv[1],mat);}}
  quad(m,p0,p1,p2,p3,col,mat,us=1){
    const P=[p0,p1,p2,p3].map(p=>xf(m,p));
    const e1=[P[1][0]-P[0][0],P[1][1]-P[0][1],P[1][2]-P[0][2]],e2=[P[3][0]-P[0][0],P[3][1]-P[0][1],P[3][2]-P[0][2]];
    let n=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]];const l=Math.hypot(...n)||1;n=n.map(v=>v/l);
    const an=n.map(Math.abs);
    const uv=p=> an[1]>an[0]&&an[1]>an[2]?[p[0]*us,p[2]*us]: an[0]>an[2]?[p[2]*us,p[1]*us]:[p[0]*us,p[1]*us];
    this.tri(P[0],P[1],P[2],n,col,mat,[uv(P[0]),uv(P[1]),uv(P[2])]);
    this.tri(P[0],P[2],P[3],n,col,mat,[uv(P[0]),uv(P[2]),uv(P[3])]);
  }
  box(m,sx,sy,sz,col,mat=0,us=1){const x=sx/2,y=sy/2,z=sz/2;
    const q=(a,b,c,d)=>this.quad(m,a,b,c,d,col,mat,us);
    q([-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]);q([x,-y,-z],[-x,-y,-z],[-x,y,-z],[x,y,-z]);
    q([x,-y,z],[x,-y,-z],[x,y,-z],[x,y,z]);q([-x,-y,-z],[-x,-y,z],[-x,y,z],[-x,y,-z]);
    q([-x,y,z],[x,y,z],[x,y,-z],[-x,y,-z]);q([-x,-y,-z],[x,-y,-z],[x,-y,z],[-x,-y,z]);}
  cyl(m,r0,r1,h,n,col,mat=0,caps=true,us=1){
    for(let i=0;i<n;i++){const a0=i/n*Math.PI*2,a1=(i+1)/n*Math.PI*2;
      const p=(r,a,y)=>[Math.cos(a)*r,y,Math.sin(a)*r];
      const P=[p(r0,a0,0),p(r0,a1,0),p(r1,a1,h),p(r1,a0,h)].map(q=>xf(m,q));
      const nn=a=>xn(m,[Math.cos(a),(r0-r1)/h,Math.sin(a)]);
      const u0=i/n*4*us,u1=(i+1)/n*4*us;
      const N0=nn(a0),N1=nn(a1);
      this.v.push(...P[0],...N0,...col,u0,0,mat, ...P[2],...N1,...col,u1,h*us,mat, ...P[1],...N1,...col,u1,0,mat);
      this.v.push(...P[0],...N0,...col,u0,0,mat, ...P[3],...N0,...col,u0,h*us,mat, ...P[2],...N1,...col,u1,h*us,mat);
      if(caps){const c0=xf(m,[0,0,0]),c1=xf(m,[0,h,0]);const dn=xn(m,[0,-1,0]),up=xn(m,[0,1,0]);
        this.tri(c0,P[1],P[0],dn,col,mat,[[0,0],[0,0],[0,0]]);if(r1>0)this.tri(c1,P[3],P[2],up,col,mat,[[0,0],[0,0],[0,0]]);}
    }}
}

const glsl=f=>fetch(f).then(r=>r.text());
const [VS,FS,VS2,FS2]=await Promise.all(['scene.vert','scene.frag','post.vert','post.frag'].map(glsl));
function sh(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
function prog(vs,fs,attrs){const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));
  attrs.forEach((a,i)=>gl.bindAttribLocation(p,i,a));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
  const u={};const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(let i=0;i<n;i++){const a=gl.getActiveUniform(p,i);u[a.name]=gl.getUniformLocation(p,a.name);}return{p,u};}
const P=prog(VS,FS,['aP','aN','aC','aU']),P2=prog(VS2,FS2,['aP']);

const WATER_Y=-.2;
const STONE=[.55,.5,.44],DARK=[.2,.19,.18];
function buildStatic(){
  const g=new Mesh(),I=M.I();
  for(let x=-12;x<12;x+=.6)for(let z=-2.6;z<1.2;z+=.6){const z1=Math.min(z+.6,1.2);
    g.quad(I,[x,0,z1],[x+.6,0,z1],[x+.6,0,z],[x,0,z],STONE,3,1);}
  for(let x=-12;x<12;x+=.8){g.quad(I,[x,-1.2,1.2],[x+.8,-1.2,1.2],[x+.8,0,1.2],[x,0,1.2],[.5,.46,.4],1,1);}
  for(let x=-12;x<12;x+=.8)for(let y=0;y<5;y+=.8){g.quad(I,[x,y,-2.6],[x+.8,y,-2.6],[x+.8,y+.8,-2.6],[x,y+.8,-2.6],[.6,.5,.42],1,1);}
  const piers=[-7.8,-2.6,2.6,7.8];
  for(const px of piers){
    g.box(M.T(px,1.7,-2.1),.9,3.4,1.0,[.62,.54,.46],1,1);
    g.box(M.T(px,3.45,-2.1),1.1,.18,1.2,[.5,.44,.38],0);
  }
  for(let k=0;k<piers.length-1;k++){const cx=(piers[k]+piers[k+1])/2,R=(piers[k+1]-piers[k])/2-.45;
    for(let i=0;i<=10;i++){const a=Math.PI*i/10;const x=cx+Math.cos(a)*R,y=3.5+Math.sin(a)*R*.8;
      g.box(M.mul(M.T(x,y,-2.05),M.RZ(a-Math.PI/2)),.46,.34,1.05,[.58,.5,.42],1,1);}}
  for(let i=0;i<14;i++){const a0=Math.PI*i/14,a1=Math.PI*(i+1)/14;const R=4.6;
    for(let x=-12;x<12;x+=1.2){
      const p=(a,xx)=>[xx,3.6+Math.sin(a)*2.1,.9-Math.cos(a)*R];
      g.quad(I,p(a1,x),p(a1,x+1.2),p(a0,x+1.2),p(a0,x),[.42,.38,.34],1,.8);}}
  for(const [cx,cz] of [[-4.4,2.6],[4.2,2.6],[-8.6,2.9],[8.4,2.9],[-12,3.4],[12,3.4]]){
    g.cyl(M.T(cx,-1.5,cz),.34,.3,5.6,8,[.6,.55,.48],1,false,1);
    g.box(M.T(cx,4.2,cz),.9,.3,.9,[.5,.45,.4],0);}
  const B=M.T(0,0,-1.75);
  const iron=[.13,.14,.14],wood=[.62,.42,.26];
  for(const sx of [-.72,.72]){
    g.box(M.mul(B,M.T(sx,.22,.12)),.06,.44,.06,iron);g.box(M.mul(B,M.T(sx,.22,-.18)),.06,.44,.06,iron);
    g.box(M.mul(B,M.T(sx,.44,-.02)),.06,.05,.46,iron);
    g.box(M.mul(B,M.mul(M.T(sx,.72,-.24),M.RX(-.16))),.06,.62,.05,iron);
    g.box(M.mul(B,M.T(sx,.62,.1)),.05,.04,.28,iron);}
  for(let k=0;k<3;k++)g.box(M.mul(B,M.T(0,.48,.13-k*.13)),1.7,.045,.11,wood,2,1);
  for(let k=0;k<2;k++)g.box(M.mul(B,M.mul(M.T(0,.72+k*.2,-.26-k*.03),M.RX(-.16))),1.7,.12,.035,wood,2,1);
  g.box(M.T(-3.6,.005,.4),.6,.01,.4,[.08,.08,.08]);
  g.cyl(M.T(1.35,0,-2.15),.16,.19,.34,7,[.35,.3,.24],0);
  const r=rng(9);for(let i=0;i<14;i++){const x=(r()-.5)*14,z=-2.4+r()*3.4;if(Math.abs(x)<1.3&&z<-1)continue;
    g.box(M.mul(M.T(x,.03,z),M.RY(r()*3)),.08+r()*.12,.06,.07+r()*.1,[.45,.42,.38]);}
  return new Float32Array(g.v);
}
function buildWater(){const g=new Mesh(),I=M.I();
  for(let x=-16;x<16;x+=1)for(let z=1.2;z<16;z+=1)g.quad(I,[x,WATER_Y,z+1],[x+1,WATER_Y,z+1],[x+1,WATER_Y,z],[x,WATER_Y,z],[1,1,1],6,1);
  return new Float32Array(g.v);}

const CLOAK=[.36,.4,.34],HAT=[.78,.64,.36],SKIN=[.75,.58,.45],BOOT=[.16,.12,.1],PACK=[.42,.3,.2],ROLL=[.5,.2,.15],SCARF=[.72,.24,.18];
const T_IN=1.8,T_ARRIVE=8.2,T_SIT=9.4,T_HATOFF=11.6,T_HATON=18.2,T_STAND=19.6,T_GO=20.6,T_OUT=26.6;
function travellerState(t){
  let x,z=-.72,yaw=Math.PI/2,walk=0,sit=0,hat=0,nod=0;
  const X0=-9.5,XS=-.2,X1=9.5;
  if(t<T_ARRIVE){const f=clamp((t-T_IN)/(T_ARRIVE-T_IN));x=lerp(X0,XS,1-Math.pow(1-f,1.4));walk=(t>T_IN&&t<T_ARRIVE)?1:0;}
  else if(t<T_GO){x=XS;}
  else {const f=clamp((t-T_GO)/(T_OUT-T_GO));x=lerp(XS,X1,Math.pow(f,1.25));walk=t<T_OUT?1:0;}
  const face=ss(T_ARRIVE-.2,T_ARRIVE+.5,t)*(1-ss(T_GO-.5,T_GO+.1,t));
  yaw=lerp(Math.PI/2,0,face);
  if(t>T_GO-.4)yaw=lerp(0,-Math.PI/2*-1,ss(T_GO-.5,T_GO+.1,t));
  sit=ss(T_ARRIVE+.4,T_SIT,t)*(1-ss(T_STAND,T_GO-.2,t));
  z=lerp(-.72,-1.62,ss(T_ARRIVE+.1,T_SIT-.3,t)*(1-ss(T_STAND+.1,T_GO,t)));
  hat=ss(T_HATOFF,T_HATOFF+.9,t)*(1-ss(T_HATON,T_HATON+.9,t));
  nod=ss(T_HATOFF+1.5,T_HATOFF+3,t)*(1-ss(T_HATON-1.2,T_HATON,t));
  return {x,z,yaw,walk,sit,hat,nod};
}
function buildTraveller(g,t){
  const s=travellerState(t);
  const ph=t*2*Math.PI*1.05;
  const bob=s.walk*Math.abs(Math.sin(ph))*.04;
  const breathe=Math.sin(t*1.6)*.01*(1-s.walk);
  const root=M.mul(M.T(s.x,0,s.z),M.RY(s.yaw));
  for(const side of [-1,1]){
    const sw=Math.sin(ph+(side>0?Math.PI:0))*s.walk;
    const fx=side*.08;
    const standP=M.T(fx,.05+Math.max(0,-sw)*.05,sw*.17);
    const sitP=M.mul(M.T(fx,.1,.28),M.RX(Math.sin(t*.9+side)*.12*s.nod));
    const fm=s.sit>.5?sitP:standP;
    g.box(M.mul(root,M.mul(fm,M.T(0,0,.03))),.1,.1,.18,BOOT,0);
    if(s.sit>.5)g.box(M.mul(root,M.T(fx,.28,.2)),.09,.34,.09,[.3,.28,.24],5,3);
  }
  const bodyY=lerp(.14,.46,s.sit)+bob+breathe;
  const lean=s.walk*.08+s.nod*.12;
  const body=M.mul(root,M.mul(M.T(0,bodyY,0),M.RX(lean)));
  const cl=lerp(.74,.5,s.sit);
  g.cyl(M.mul(body,M.T(0,s.sit>.5?.02:0,0)),.3,.12,cl,8,CLOAK,5,true,3);
  if(s.sit>.5)g.box(M.mul(body,M.T(0,.06,.14)),.46,.12,.3,CLOAK,5,3);
  g.cyl(M.mul(body,M.T(0,cl-.04,0)),.14,.12,.08,7,SCARF,5,true,3);
  const scarfSw=Math.sin(t*3)*.1*s.walk;
  g.box(M.mul(body,M.mul(M.T(-.08,cl-.18,-.12),M.RX(.2+scarfSw))),.07,.26,.03,SCARF,5,3);
  g.box(M.mul(body,M.T(0,cl*.62,-.2)),.32,.36,.16,PACK,5,3);
  g.cyl(M.mul(body,M.mul(M.T(-.15,cl*.62+.2,-.24),M.RZ(-Math.PI/2))),.075,.075,.3,7,ROLL,5,true,3);
  const kSw=Math.sin(ph)*.25*s.walk;
  g.cyl(M.mul(body,M.mul(M.T(.19,cl*.35,-.22),M.RZ(kSw))),.06,.05,.1,6,[.55,.56,.55],0);
  const head=M.mul(body,M.mul(M.T(0,cl+.1,0),M.RX(s.nod*.35+Math.sin(t*.7)*.04*s.nod)));
  g.box(M.mul(head,M.T(0,.02,0)),.19,.2,.18,SKIN,0);
  g.box(M.mul(head,M.T(0,.1,-.02)),.21,.08,.2,[.18,.13,.1],0);
  g.box(M.mul(head,M.T(-.05,.03,.092)),.03,.02,.01,[.05,.04,.04],0);
  g.box(M.mul(head,M.T(.05,.03,.092)),.03,.02,.01,[.05,.04,.04],0);
  const onHead=M.mul(head,M.T(0,.12,0));
  const onBench=M.mul(root,M.mul(M.T(.62,.51,0),M.RZ(0)));
  let hm;
  if(s.hat<=0)hm=onHead;else if(s.hat>=1)hm=onBench;else{
    const a=xf(onHead,[0,0,0]),b=xf(onBench,[0,0,0]);const f=s.hat;
    const p=[lerp(a[0],b[0],f),lerp(a[1],b[1],f)+Math.sin(f*Math.PI)*.25,lerp(a[2],b[2],f)];
    hm=M.mul(M.T(p[0],p[1],p[2]),M.mul(M.RY(s.yaw),M.RZ(Math.sin(f*Math.PI)*.5)));}
  g.cyl(hm,.38,.22,.05,10,HAT,2,true,4);
  g.cyl(M.mul(hm,M.T(0,.05,0)),.22,.0,.16,8,HAT,2,false,4);
  g.cyl(M.mul(hm,M.T(0,.05,0)),.2,.17,.035,8,ROLL,0,false);
  const stickHand=M.mul(body,M.mul(M.T(.3,.1+Math.sin(ph)*.02*s.walk,.12+Math.sin(ph)*.12*s.walk),M.RX(-.05)));
  const stickRest=M.mul(M.T(-.95,0,-1.5),M.mul(M.RZ(-.28),M.RX(.05)));
  const stand=s.sit>.3?stickRest:stickHand;
  g.box(M.mul(stand,M.T(0,.62,0)),.035,1.35,.035,[.45,.33,.2],0);
  g.box(M.mul(stand,M.T(0,1.3,0)),.07,.06,.07,[.3,.22,.12],0);
}

function lampIntensity(t){
  const steady=ss(T_SIT,T_SIT+1.8,t)*(1-ss(T_GO+1.5,T_OUT+.8,t));
  const k=Math.floor(t*14),k2=Math.floor(t*5);
  let fl=.75+.25*hash(k);
  if(hash(k2*3.1)<.3)fl*=.25+.3*hash(k);
  if(hash(Math.floor(t*1.3)*7.7)<.18)fl*=.3;
  const hum=1+.03*Math.sin(t*50);
  return lerp(fl*.85,1.08,steady)*hum;
}
const LAMP=[.2,2.25,-.8];
function buildLamp(g,t){
  const sway=Math.sin(t*.8)*.04;
  const top=[LAMP[0],5.4,LAMP[2]];
  const base=M.mul(M.T(top[0],top[1],top[2]),M.RZ(sway));
  const len=top[1]-LAMP[1]-.1;
  for(let i=0;i<12;i++)g.box(M.mul(base,M.mul(M.T(0,-i*len/12-len/24,0),M.RY(i%2?0:Math.PI/2))),.04,len/12*1.05,.015,[.08,.08,.08],0);
  const hd=M.mul(base,M.T(0,-len,0));
  g.cyl(M.mul(hd,M.T(0,-.02,0)),.2,.05,.1,8,[.12,.12,.11],0);
  g.cyl(M.mul(hd,M.T(0,-.2,0)),.075,.075,.18,6,[1,.72,.38],4,true);
  for(let i=0;i<4;i++){const a=i*Math.PI/2+.4;g.box(M.mul(hd,M.T(Math.cos(a)*.09,-.11,Math.sin(a)*.09)),.015,.22,.015,[.06,.06,.06],0);}
  return xf(hd,[0,-.11,0]);
}

const DUST=(()=>{const r=rng(5),a=[];for(let i=0;i<420;i++)a.push([r()*6-3,r()*3.4,r()*3.6-2.4,r(),r()]);return a;})();
function buildDust(t,lp,I){const v=[];
  for(const d of DUST){
    const x=d[0]+Math.sin(t*.13+d[3]*20)*.25+t*.04*(d[4]-.3);
    const y=((d[1]-t*.035*(0.4+d[4])+Math.sin(t*.5+d[4]*9)*.05)%3.4+3.4)%3.4;
    const z=d[2]+Math.cos(t*.11+d[4]*13)*.2;
    const X=((x+3)%6+6)%6-3+lp[0];
    const dd=Math.hypot(X-lp[0],y-lp[1],z-lp[2]);
    const b=Math.min(1,I*1.4/(1+dd*dd*1.8))*(.4+.6*d[3]);
    if(b<.04)continue;
    v.push(X,y,z,0,1,0,b*1.3,b*.95,b*.6,0,0,4);
  }
  return new Float32Array(v);}

const bStatic=gl.createBuffer(),bWater=gl.createBuffer(),bDyn=gl.createBuffer(),bQuad=gl.createBuffer();
const statV=buildStatic(),watV=buildWater();
gl.bindBuffer(gl.ARRAY_BUFFER,bStatic);gl.bufferData(gl.ARRAY_BUFFER,statV,gl.STATIC_DRAW);
gl.bindBuffer(gl.ARRAY_BUFFER,bWater);gl.bufferData(gl.ARRAY_BUFFER,watV,gl.STATIC_DRAW);
gl.bindBuffer(gl.ARRAY_BUFFER,bQuad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
function bindMesh(b){gl.bindBuffer(gl.ARRAY_BUFFER,b);const st=48;
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,st,0);
  gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,st,12);
  gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,3,gl.FLOAT,false,st,24);
  gl.enableVertexAttribArray(3);gl.vertexAttribPointer(3,3,gl.FLOAT,false,st,36);}
let W,H,LW,LH,tex,fb,rb;
function resize(){
  const dpr=fixedT!==null?1:Math.min(1.5,window.devicePixelRatio||1);
  W=cv.width=Math.round(innerWidth*dpr);H=cv.height=Math.round(innerHeight*dpr);
  LH=240;LW=Math.round(LH*W/H);
  if(tex){gl.deleteTexture(tex);gl.deleteFramebuffer(fb);gl.deleteRenderbuffer(rb);}
  tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,LW,LH,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  for(const k of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,k,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  rb=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,rb);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,LW,LH);
  fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,rb);
}

function render(t){
  t=((t%LOOP)+LOOP)%LOOP;
  const I=lampIntensity(t);
  const g=new Mesh();
  const lp=buildLamp(g,t);
  buildTraveller(g,t);
  const dynV=new Float32Array(g.v);
  const dust=buildDust(t,lp,I);
  const cam=[-.8+Math.sin(t*2*Math.PI/LOOP)*.3,1.2+Math.sin(t*.4)*.03,5.6];
  const tgt=[.1,.72,-1.4];
  const VP=M.mul(M.persp(.6,LW/LH,.1,60),M.look(cam,tgt,[0,1,0]));
  const warm=lerp(1,1,0);const Lc=[1.0,.66*warm,.36];
  gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.viewport(0,0,LW,LH);
  gl.clearColor(.012,.018,.024,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
  gl.useProgram(P.p);const u=P.u;
  gl.uniformMatrix4fv(u.uVP,false,new Float32Array(VP));gl.uniform2f(u.uRes,LW,LH);
  gl.uniform3f(u.uLp,lp[0],lp[1],lp[2]);gl.uniform3f(u.uLc,Lc[0],Lc[1],Lc[2]);gl.uniform1f(u.uI,I);
  gl.uniform3f(u.uCam,cam[0],cam[1],cam[2]);gl.uniform1f(u.uWaterY,WATER_Y);gl.uniform1f(u.uT,t);gl.uniform1f(u.uAlpha,1);
  const draw=(b,n,mode=gl.TRIANGLES)=>{bindMesh(b);gl.drawArrays(mode,0,n);};
  gl.bindBuffer(gl.ARRAY_BUFFER,bDyn);
  gl.uniform1f(u.uMirror,1);
  draw(bStatic,statV.length/12);
  gl.bindBuffer(gl.ARRAY_BUFFER,bDyn);gl.bufferData(gl.ARRAY_BUFFER,dynV,gl.DYNAMIC_DRAW);draw(bDyn,dynV.length/12);
  gl.uniform1f(u.uMirror,0);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.uniform1f(u.uAlpha,.4);
  gl.depthMask(false);draw(bWater,watV.length/12);gl.depthMask(true);
  gl.disable(gl.BLEND);gl.uniform1f(u.uAlpha,1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  draw(bStatic,statV.length/12);
  gl.bindBuffer(gl.ARRAY_BUFFER,bDyn);gl.bufferData(gl.ARRAY_BUFFER,dynV,gl.DYNAMIC_DRAW);draw(bDyn,dynV.length/12);
  if(dust.length){gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER,bDyn);gl.bufferData(gl.ARRAY_BUFFER,dust,gl.DYNAMIC_DRAW);draw(bDyn,dust.length/12,gl.POINTS);
    gl.depthMask(true);gl.disable(gl.BLEND);}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,W,H);gl.disable(gl.DEPTH_TEST);
  gl.useProgram(P2.p);gl.bindBuffer(gl.ARRAY_BUFFER,bQuad);
  for(let i=1;i<4;i++)gl.disableVertexAttribArray(i);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);gl.uniform1i(P2.u.uTex,0);gl.uniform2f(P2.u.uRes,W,H);
  gl.drawArrays(gl.TRIANGLES,0,6);
}
resize();
if(fixedT!==null){const t0=performance.now();render(fixedT);const px=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);window.__ms=performance.now()-t0;document.title='done';}
else{addEventListener('resize',resize);const s0=performance.now();(function f(){render((performance.now()-s0)/1000);requestAnimationFrame(f);})();}
