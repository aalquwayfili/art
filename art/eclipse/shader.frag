precision highp float;
uniform vec2 R; uniform float T;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<6;i++){v+=a*noise(p);p=m*p;a*=.5;}return v;}
float warp(vec2 p,float t){vec2 q=vec2(fbm(p+vec2(0.,t*.05)),fbm(p+vec2(5.2,1.3)));
  vec2 r=vec2(fbm(p+4.*q+vec2(1.7,9.2)+t*.03),fbm(p+4.*q+vec2(8.3,2.8)));return fbm(p+4.*r);}
float girih(vec2 q,float rad,float t){
  float d=length(q),a=atan(q.y,q.x)+t*.04,k=6.2831853/8.;
  a=mod(a,k)-k*.5;vec2 p=vec2(cos(a),abs(sin(a)))*d;float l=1.;
  for(int i=1;i<=9;i++){float ri=rad*float(i)/9.;
    l=min(l,abs(dot(p,vec2(cos(.3927),sin(.3927)))-ri*.92));
    l=min(l,abs(dot(p,vec2(cos(.7854),sin(.7854)))-ri*.7));
    l=min(l,abs(p.x-ri));}
  l=min(l,abs(p.y)+.0006);
  return smoothstep(.0018,.0,l);}
vec3 scene(vec2 p){
  float hy=-.06;vec2 sc=vec2(.38,.17);float sr=.2;vec3 col;
  float n=warp(p*1.4+vec2(0.,T*.01),T);
  if(p.y>hy){
    col=mix(vec3(.01,.014,.04),vec3(.04,.19,.26),pow(n,2.2)*1.8);
    col+=vec3(.5,.16,.05)*pow(n,5.)*1.6;
    vec2 g=p*90.;vec2 id=floor(g);float s=h21(id);vec2 o=vec2(h21(id+3.1),h21(id+7.7))-.5;
    col+=vec3(.9,.95,1.)*smoothstep(.06,.0,length(fract(g)-.5-o*.6))*step(.93,s)*(.4+.6*sin(T*2.+s*50.));
    float d=length(p-sc);
    col=mix(col,vec3(.004,.004,.01),smoothstep(sr+.002,sr-.002,d));
    col+=vec3(1.,.55,.25)*exp(-abs(d-sr)*110.)*1.8;
    col+=vec3(1.,.38,.12)*exp(-max(d-sr,0.)*7.)*.28*step(sr,d)*(0.8+.4*fbm(vec2(atan(p.y-sc.y,p.x-sc.x)*6.,T*.3)));
    col+=vec3(.95,.62,.3)*girih(p-sc,sr*.95,T)*.38*step(d,sr);
    float an=atan(p.y-sc.y,p.x-sc.x);
    for(int i=0;i<3;i++){float rr=sr*(1.35+.38*float(i));float k=24.+float(i)*36.;float dash=step(.45,fract(an/6.2831853*k+T*(.02-.015*float(i))));
      col+=vec3(.75,.85,.9)*smoothstep(.0016,.0,abs(d-rr))*dash*(.35-.08*float(i));}
    col+=vec3(1.,.6,.3)*smoothstep(.0012,.0,abs(d-sr*1.18))*.25;
    float ridge=hy+.035+.045*fbm(vec2(p.x*3.,1.))+.02*fbm(vec2(p.x*12.,4.));
    if(p.y<ridge){col=vec3(.006,.008,.02)+vec3(.02,.05,.07)*fbm(p*20.);col+=vec3(1.,.5,.25)*exp(-(ridge-p.y)*260.)*.5*(0.4+exp(-abs(p.x-sc.x)*3.));}
    col+=vec3(.9,.45,.2)*exp(-abs(p.x-sc.x)*30.)*smoothstep(sc.y-sr,hy,p.y)*.12;
  }else{
    float z=.32/(hy-p.y);vec2 w=vec2(p.x*z,z+T*.35);
    float h=warp(w*.3,T*.15);
    float f=fract(h*26.);float lw=.05+.015*z;
    float line=smoothstep(lw,0.,min(f,1.-f));
    float fog=exp(-z*.14);
    col=vec3(.01,.012,.03)+vec3(.02,.06,.09)*h;
    vec3 bone=vec3(.86,.83,.76);
    float refl=exp(-abs(p.x-sc.x)*4.)*(.5+.8*fbm(vec2(p.x*40.,z*3.-T)));
    col+=line*mix(bone*.55,vec3(1.,.5,.22)*1.4,refl)*fog;
    col+=vec3(1.,.45,.2)*refl*.16*fog;
    vec2 gg=abs(fract(w*vec2(.5,.25))-.5);col+=vec3(.2,.5,.6)*smoothstep(.012,.0,min(gg.x,gg.y))*fog*.18;
  }
  col+=vec3(.9,.42,.2)*exp(-abs(p.y-hy)*45.)*.35;
  vec2 dp=p*vec2(22.,22.)+vec2(T*.6,-T*.25);vec2 di=floor(dp);float ds=h21(di);
  col+=vec3(1.,.7,.45)*smoothstep(.08,0.,length(fract(dp)-.5-(vec2(h21(di+1.3),h21(di+2.7))-.5)*.7))*step(.97,ds)*.7;
  return col;}
void main(){
  vec2 uv=gl_FragCoord.xy/R;vec2 p=(gl_FragCoord.xy-.5*R)/R.y;
  float ca=.0025*length(p);
  vec3 col=vec3(scene(p*(1.+ca)).r,scene(p).g,scene(p*(1.-ca)).b);
  col=1.-exp(-col*1.35);
  col*=smoothstep(1.25,.25,length(uv-.5)*1.6);
  col+=(h21(gl_FragCoord.xy+fract(T)*97.)-.5)*.07;
  col+=sin(gl_FragCoord.y*1.2)*.006;
  gl_FragColor=vec4(pow(max(col,0.),vec3(.95)),1.);}
