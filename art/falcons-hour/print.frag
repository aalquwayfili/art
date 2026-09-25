precision highp float;
uniform sampler2D uTex;uniform vec2 uRes;uniform float uS;uniform float uBoil;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
void main(){
  vec2 fc=gl_FragCoord.xy;
  float s=uRes.y/600.;
  vec2 oO=vec2(2.4,-1.6)*s, oR=vec2(-1.8,1.2)*s;
  float k=texture2D(uTex,fc/uRes).r;
  float o=texture2D(uTex,(fc+oO)/uRes).g;
  float r=texture2D(uTex,(fc+oR)/uRes).b;
  float grain=vn(vec2(fc.x*.012,fc.y*.35)/s+vec2(vn(fc*.004/s)*6.,0.));
  float starve=step(.988,h21(floor(fc/(1.5*s))))*.7;
  float kInk=k*(1.-starve*.5)*(.9+.1*grain);
  float oInk=o*(.8+.2*vn(fc*.05/s))*(1.-step(.992,h21(fc*.7)));
  float rInk=r*(.9+.1*vn(fc*.07/s+3.));
  vec3 paper=vec3(.94,.905,.83)*(1.-.035*vn(fc*.5/s)-.02*vn(fc*vec2(.02,.2)/s)+.02*h21(fc));
  vec3 OCH=vec3(.86,.62,.26),RED=vec3(.80,.2,.12),BLK=vec3(.09,.075,.07);
  vec3 c=paper;
  c*=mix(vec3(1.),OCH,oInk*.95);
  c*=mix(vec3(1.),RED,rInk*.95);
  c=mix(c,BLK*(0.85+0.3*paper),kInk*.96);
  float m=16.*s;
  if(fc.x<m||fc.y<m||fc.x>uRes.x-m||fc.y>uRes.y-m)c=paper;
  gl_FragColor=vec4(c,1.);
}
