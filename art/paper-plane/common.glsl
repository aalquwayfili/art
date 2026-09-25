precision highp float;
uniform vec3 uZen,uHor,uCloudL,uCloudS,uSunC,uLight,uAmb,uSunDir,uMoonDir;uniform float uNight,uTime;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vn(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return s;}
vec3 sky(vec3 d){
  float e=clamp(d.y,0.,1.);
  vec3 c=mix(uHor,uZen,pow(e,.55));
  float sd=dot(d,uSunDir);
  c+=uSunC*(smoothstep(.9990,.9994,sd)*1.2+ floor(pow(max(sd,0.),90.)*4.)/4.*.28);
  float md=dot(d,uMoonDir);
  c+=vec3(1.,.95,.85)*smoothstep(.9993,.9996,md)*uNight*1.4;
  c+=vec3(.5,.6,1.)*floor(pow(max(md,0.),60.)*3.)/3.*.25*uNight;
  vec2 sg=floor(vec2(atan(d.z,d.x)*180.,d.y*300.));
  float st=step(.9965,h21(sg))*smoothstep(.05,.3,d.y);
  c+=vec3(1.,.9,.8)*st*uNight*1.2;
  float az=atan(d.z,d.x);
  vec2 sunH=normalize(vec2(-sin(atan(uSunDir.z,uSunDir.x)-az),uSunDir.y+.3));
  float best=-1.;vec3 cc=vec3(0.);
  for(int k=0;k<9;k++){
    float fk=float(k);
    float cz=h21(vec2(fk,3.1))*6.2832-3.1416, Ht=.07+.22*pow(h21(vec2(fk,1.3)),1.3), Wd=.10+.16*h21(vec2(fk,7.7));
    float da=az-cz; da=da-6.2832*floor((da+3.1416)/6.2832);
    if(abs(da)>Wd*1.6) continue;
    for(int j=0;j<7;j++){
      float fj=float(j);
      float f=fj/6.;
      float ly=Ht*f*.82, lr=(Wd*.55)*(1.-f*.55)*(.8+.4*h21(vec2(fk,fj+9.)));
      float lx=(h21(vec2(fk*3.,fj))-.5)*Wd*(1.2-f*.8);
      vec2 q=vec2(da-lx,d.y-ly)/lr;
      float r=dot(q,q);
      if(r<1.&&d.y>-.01){
        vec2 n=normalize(q+vec2(.08*sin(q.y*7.+fj),.08*sin(q.x*9.+fk)));
        float lit=step(-.1,dot(n,sunH));
        vec3 col=mix(uCloudS,uCloudL,lit);
        col=mix(col,mix(uCloudS,uHor,.5),step(q.y,-.55)*(1.-lit)*.6);
        cc=col;best=1.;
      }
    }
  }
  if(best>0.) c=mix(c,cc,.97);
  if(d.y>0.02){
    vec2 p=d.xz/d.y*.9+vec2(uTime*.05,uTime*.02);
    float f=fbm(p*1.4);
    float f2=fbm(p*1.4+uSunDir.xz*.18);
    float m=step(.58,f)*smoothstep(.02,.15,d.y);
    vec3 cc=mix(uCloudS,uCloudL,step(f2,f+.01));
    c=mix(c,cc,m*.92);
  }
  return c;
}
