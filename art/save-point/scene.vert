attribute vec3 aP,aN,aC;attribute vec3 aU;
uniform mat4 uVP;uniform vec2 uRes;uniform vec3 uLp,uLc;uniform float uI,uMirror,uWaterY;
varying vec3 vC;varying vec3 vW;varying vec3 vUV;varying float vMat;
void main(){
  vec3 p=aP;vec3 n=aN;
  vec3 L=uLp-p;float d=length(L);
  float lam=max(dot(n,L/d),0.)*uI*4.6/(1.+d*d*.5);
  float wrap=(dot(n,L/d)*.5+.5)*uI*.6/(1.+d*d*.6);
  float bounce=max(-n.y,0.)*.08+.05+max(n.z,0.)*.04;
  vec3 col=aC*(uLc*(lam+wrap)+vec3(.35,.5,.6)*bounce);
  if(aU.z>3.5&&aU.z<4.5)col=aC*(.25+uI*1.1);
  vC=col;vMat=aU.z;
  if(uMirror>.5)p.y=2.*uWaterY-p.y;
  vW=p;
  vec4 c=uVP*vec4(p,1.);
  vec2 sn=floor(c.xy/c.w*uRes*.5+.5)/(uRes*.5);
  if(c.w>.05)c.xy=sn*c.w;
  gl_Position=c;
  vUV=vec3(aU.xy*c.w,c.w);
  gl_PointSize=1.;
}
