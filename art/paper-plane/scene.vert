attribute vec3 aPos;attribute vec3 aNrm;attribute vec3 aCol;attribute vec3 aUV;
uniform mat4 uVP;uniform vec2 uRes;
varying vec3 vN;varying vec3 vC;varying vec3 vW;varying vec3 vUVw;varying float vKind;varying float vDist;
uniform vec3 uCam;
void main(){
  vec4 c=uVP*vec4(aPos,1.);
  vec2 sn=floor(c.xy/c.w*uRes*.5+.5)/(uRes*.5);
  if(c.w>0.05) c.xy=sn*c.w;
  gl_Position=c;
  vN=aNrm;vC=aCol;vW=aPos;vKind=aUV.z;vDist=length(aPos-uCam);
  vUVw=vec3(aUV.xy*c.w,c.w);
}
