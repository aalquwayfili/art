attribute vec2 aP;attribute vec2 aQ;attribute vec3 aA;
uniform vec2 uC,uRes;uniform float uHw;
varying vec2 vQ;varying vec3 vA;
void main(){vQ=aQ;vA=aA;vec2 s=(aP-uC)/uHw;s.x*=uRes.y/uRes.x;gl_Position=vec4(s*2.,0.,1.);}
