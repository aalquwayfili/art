precision highp float;
uniform vec2 uRes,uC;uniform float uHw,uLight,uT;
const float HB=290.;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
vec2 h22(vec2 p){return vec2(h21(p),h21(p+17.3));}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float prof(float y){float u=max(abs(y)/HB-.012,0.)/.988;return 8.+142.*pow(sin(3.14159*.92*min(u,1.))+1e-4,.7);}
float sdBox(vec2 p,vec2 b){vec2 d=abs(p)-b;return length(max(d,0.))+min(max(d.x,d.y),0.);}
float sand(vec2 p,float pw){
  float vis=smoothstep(1.2,3.,1./pw);
  float g=.66;
  if(vis>0.){
    vec2 i=floor(p),f=fract(p);float best=9.;vec2 bo=vec2(0.);
    for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 o=vec2(x,y);vec2 c=o+.2+.6*h22(i+o);float d=length(c-f);if(d<best){best=d;bo=c-f;}}
    float r=clamp(best/.62,0.,1.);
    vec3 n=vec3(-bo/.62,sqrt(max(0.,1.-r*r)));
    float lit=.18+.9*max(dot(n,normalize(vec3(-.55,.6,.6))),0.);
    lit*=smoothstep(1.,.75,r)*.6+.4;
    g=mix(g,lit,vis);
  }
  return g;
}
float hourglassSD(vec2 p){
  float gl=abs(p.y)<HB? abs(p.x)-prof(p.y)-3. : 1e3;
  float pl=sdBox(p-vec2(0.,sign(p.y)*(HB+12.)),vec2(178.,12.));
  float po=sdBox(vec2(abs(p.x)-163.,p.y),vec2(7.,HB));
  return min(min(gl,pl),po);
}
void main(){
  vec2 fc=gl_FragCoord.xy;
  float pw=uHw/uRes.y;
  vec2 p=uC+(fc-.5*uRes)*pw;
  float L=uLight;
  vec2 lampP=vec2(-520.,330.);
  float pool=exp(-length((p-vec2(-150.,-150.))/vec2(1300.,850.))*1.2);
  float lum=mix(.12,1.05,pow(pool,.8)*L)+.03*(vn(p/40.)-.5);
  float shd=hourglassSD((p-vec2(95.,-6.))*vec2(.97,1.)+vec2(0.,-10.));
  if(shd<0.)lum*=mix(1.,.8,L);
  {
    vec2 b=vec2(-820.,-318.);
    if(sdBox(p-b-vec2(0.,8.),vec2(90.,10.))<0.)lum=.16+.3*L*step(p.y,b.y+14.)*step(b.y+10.,p.y);
    vec2 a0=b+vec2(-10.,15.),a1=vec2(-700.,250.),a2=lampP;
    float da=min(length(p-a0-clamp(dot(p-a0,a1-a0)/dot(a1-a0,a1-a0),0.,1.)*(a1-a0)),length(p-a1-clamp(dot(p-a1,a2-a1)/dot(a2-a1,a2-a1),0.,1.)*(a2-a1)));
    if(da<6.)lum=.12;
    vec2 q=p-lampP;q=mat2(.8,.6,-.6,.8)*q;
    if(q.y<40.&&q.y>-60.&&abs(q.x)<30.+(40.-q.y)*.9){lum=.1+.12*step(q.x,-10.);if(q.y<-54.)lum=.9*L+.05;}
  }
  float dt=-312.;
  if(p.y<dt){
    if(p.y>dt-26.) lum=mix(.3,.8,pool*L)+.05*(vn(vec2(p.x/80.,p.y/3.))-.5);
    else if(p.y>dt-110.) lum=mix(.12,.42,pool*L)*(0.85+.3*vn(vec2(p.x/160.,p.y/2.5)+vn(p/90.)*3.));
    else lum=.05;
    if(abs(p.y-(dt-26.))<pw*1.5)lum=.95*L;
  }
  {
    for(int i=0;i<3;i++){float fi=float(i);vec2 c=vec2(520.+fi*12.-fi*fi*6.,dt+22.+fi*44.);vec2 sz=vec2(210.-fi*25.,21.);
      float d=sdBox(p-c,sz);
      if(d<0.){lum=(.2+.15*fi)*L+.05;if(abs(p.y-c.y)<3.)lum=.75*L;if(p.x>c.x+sz.x-14.)lum=.85*L;}}
    vec2 pc=vec2(470.,dt+146.);if(sdBox(p-pc,vec2(150.,4.))<0.)lum=.1;if(sdBox(p-pc-vec2(150.,0.),vec2(10.,3.))<0.)lum=.8*L;
    vec2 m=p-vec2(-330.,dt+60.);
    float dm=sdBox(m,vec2(48.,60.))-6.;float dh=abs(length(m-vec2(-58.,5.))-24.)-6.;
    if(min(dm,dh)<0.)lum=mix(.18,.7,smoothstep(40.,-40.,m.x))*L+.04;
    float st=abs(p.x+330.+sin((p.y-uT*20.)/30.)*14.)-2.;if(st<0.&&p.y>dt+130.&&p.y<dt+260.&&L>.5)lum=mix(lum,.95,.5*smoothstep(dt+260.,dt+150.,p.y));
  }
  float ax=abs(p.x);
  float plate=sdBox(vec2(p.x,abs(p.y)-(HB+12.)),vec2(178.,12.));
  if(plate<0.){lum=(.22+.25*smoothstep(12.,-12.,abs(p.y)-(HB+12.))*L);if(abs(abs(p.y)-HB-12.)<1.2*pw+.8)lum=.8*L;if(abs(abs(p.y)-HB-4.)<pw+.5)lum=.05;}
  float post=sdBox(vec2(ax-163.,p.y),vec2(7.,HB));
  if(post<0.){float s=(p.x-sign(p.x)*163.)/7.;lum=.12+.6*L*max(0.,-s*.8+.2)+.05*sin(p.y/9.);}
  if(abs(p.y)<HB){
    float r=prof(p.y);
    if(ax<r+max(3.2,pw*5.)){
      lum=lum*.95+.03;
      bool inBot=p.y<0.&&p.y<-100.-ax*.65;
      bool inRes=p.y>0.&&ax>r-2.2*smoothstep(4.,30.,p.y)&&p.y<200.;
      if(inBot){lum=sand(p,pw)*.72*(.25+.75*L)*mix(1.,.7,smoothstep(.6,1.,ax/r))*(p.x<0.?1.1:.9);
        if(p.y>-100.-ax*.65-1.2)lum=mix(lum,.9*L,.4*step(p.x,0.));}
      if(inRes)lum=sand(p,pw)*(.3+.7*L);
      float e=ax-r;float ew=max(3.2,pw*5.);
      if(e>0.&&e<ew)lum=mix(.05,.95*L,step(ew*.55,e));
      float hx=(p.x+.55*r)/(r*.04+1.);
      if(abs(hx)<1.&&abs(p.y)>30.&&abs(p.y)<HB-30.)lum=mix(lum,1.,.85*L);
    }
  }
  gl_FragColor=vec4(lum,0.,0.,1.);
}
