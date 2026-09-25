precision highp float;uniform sampler2D uTex;uniform vec2 uRes;uniform float uFade,uPx;
float bayer(vec2 p){float b=0.;float m=1.;
  for(int i=0;i<3;i++){vec2 q=mod(floor(p/m),2.);float d=q.x<.5?(q.y<.5?0.:3.):(q.y<.5?2.:1.);b+=d*pow(4.,float(2-i));m*=2.;}
  return (b+.5)/64.;}
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){
  vec2 cell=floor(gl_FragCoord.xy/uPx);
  vec2 uv=(cell+.5)*uPx/uRes;
  vec4 s=texture2D(uTex,uv);
  float l=s.r*uFade;
  float th=bayer(cell);
  vec3 PAPER=vec3(.925,.885,.8),INK=vec3(.11,.095,.16),VER=vec3(.86,.26,.13);
  vec3 c=l>th?PAPER:INK;
  if(s.g>.5)c=l*2.2>th?VER:INK*1.2+VER*.15;
  c*=1.-.035*h21(gl_FragCoord.xy*.37);
  gl_FragColor=vec4(c,1.);
}
