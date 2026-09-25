precision highp float;uniform sampler2D uTex;uniform vec2 uLow,uOut;uniform float uSeed,uHal;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float bayer(vec2 p){p=mod(p,4.);int i=int(p.x)+int(p.y)*4;
  float m[16];
  if(i==0)return 0.;if(i==1)return 8.;if(i==2)return 2.;if(i==3)return 10.;if(i==4)return 12.;if(i==5)return 4.;if(i==6)return 14.;if(i==7)return 6.;
  if(i==8)return 3.;if(i==9)return 11.;if(i==10)return 1.;if(i==11)return 9.;if(i==12)return 15.;if(i==13)return 7.;if(i==14)return 13.;return 5.;}
vec3 tap(vec2 px){return texture2D(uTex,(floor(px)+.5)/uLow).rgb;}
void main(){
  vec2 fc=gl_FragCoord.xy; vec2 px=floor(fc/uOut*uLow);
  vec3 c=tap(px);
  vec3 hal=vec3(0.);
  for(int i=0;i<8;i++){float a=float(i)*.785;vec2 o=vec2(cos(a),sin(a));
    vec3 s1=tap(px+o*2.);vec3 s2=tap(px+o*5.);
    hal+=max(s1-.78,0.)*.6+max(s2-.78,0.)*.4;}
  hal/=8.;
  c+=vec3(1.,.42,.28)*dot(hal,vec3(.4,.4,.2))*uHal;
  float lu=dot(c,vec3(.3,.59,.11));c=mix(vec3(lu),c,1.28);
  c=c*.94+vec3(.02,.025,.06);
  c=mix(c,c*c*(3.-2.*c),.35);
  float b=(bayer(px)+.5)/16.-.5;
  c=floor(c*31.+.5+b)/31.;
  float g=h21(fc*.37+uSeed)-.5;
  c+=g*.045;
  vec2 q=fc/uOut-.5;c*=1.-dot(q,q)*.55;
  gl_FragColor=vec4(c,1.);
}
