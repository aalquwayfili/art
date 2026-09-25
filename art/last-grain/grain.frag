precision highp float;varying vec2 vQ;varying vec3 vA;uniform float uLight;
void main(){
  float a=atan(vQ.y,vQ.x),seed=vA.y;
  float edge=1.+.1*sin(3.*a+seed)+.07*sin(5.*a+seed*2.3)+.05*sin(7.*a+seed*.7);
  float r=length(vQ)*1.12/edge;
  if(r>1.)discard;
  vec3 n=vec3(vQ*1.12/edge,sqrt(max(0.,1.-r*r)));
  float lit=.08+.95*max(dot(n,normalize(vec3(-.55,.6,.6))),0.)+.25*pow(max(dot(reflect(vec3(0.,0.,-1.),n),normalize(vec3(-.55,.6,.6))),0.),12.);
  lit*=.35+.65*uLight;
  lit=mix(lit,.8,vA.x);
  gl_FragColor=vec4(lit,vA.z,0.,1.);
}
