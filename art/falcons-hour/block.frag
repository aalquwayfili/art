precision highp float;
uniform vec2 uRes;uniform float uT,uS,uS0,uHead,uSpread,uFlap,uTail,uStreak,uAlt,uFalAlt,uPerch;
uniform vec2 uCam,uFal,uFo;
const float NL=104.;
const vec2 SUN=vec2(.8,-.6);
const float COT=2.1;
const float PI=3.14159265;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vn(p);p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(3.1,7.7);a*=.5;}return s;}
float lerp(float a,float b,float t){return a+(b-a)*t;}
float pm0(float S){return S/uRes.y;}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,s,-s,c);}
float sdCap(vec2 p,vec2 a,vec2 b,float r){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h)-r;}
float sdEll(vec2 p,vec2 r){float k=length(p/r);return (k-1.)*min(r.x,r.y);}
float sdBox(vec2 p,vec2 b){vec2 d=abs(p)-b;return length(max(d,0.))+min(max(d.x,d.y),0.);}

struct Lay{float tone;float u;float och;float red;};
Lay mk(float t,float u,float o,float r){Lay l;l.tone=t;l.u=u;l.och=o;l.red=r;return l;}

float ridge(vec2 w,float lam,float a,out float hgt,out float sh){
  vec2 d=vec2(cos(a),sin(a));
  float x=dot(w,d)/lam+.55*vn(w/lam*vec2(.23,.31)+a*7.)+.25*vn(w/lam*.9+3.);
  float f=fract(x);
  hgt= f<.74? f/.74 : (1.-f)/.26;
  float lee=step(.74,f);
  sh = lee*(dot(d,SUN)<0.?.62:.1) + (1.-lee)*(dot(d,SUN)<0.?.2:.4)*(1.-f/.74*.3);
  return f;
}
float fbmA(vec2 p,float pxu){float a=.5,s=0.,f=1.,n=0.;for(int i=0;i<4;i++){float wgt=smoothstep(1.5,4.,1./(f*pxu));s+=a*mix(.5,vn(p),wgt);p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(3.1,7.7);a*=.5;f*=2.;}return s;}
float landV(vec2 w,float pm){
  float pen=1.-length((w-vec2(-2e5,3e5))/vec2(1.55e6,1.85e6));
  float cont=(fbmA(w/2.6e6+vec2(2.,5.),pm/2.6e6)-.52)*3.2;
  float g=length((w-vec2(-1.7e6,-1.45e6))/vec2(1.,.8));
  return max(pen,cont)+.35*(fbmA(w/3.2e5+9.,pm/3.2e5)-.5)-smoothstep(1.3e6,6e5,g)*2.;
}
float desV(vec2 w,float pm){
  vec2 dw=rot(.5)*(w-vec2(0.,40e3));
  return length(dw/vec2(330e3,160e3))+.16*(fbmA(w/140e3,pm/140e3)-.5)+.05*(fbmA(w/30e3,pm/30e3)-.5);
}
Lay ground(vec2 w,float S,vec2 p){
  float pm=S/uRes.y;
  float tone=.05,warp=0.,och=1.,red=0.;
  float des=desV(w,pm);
  float inD=1.-smoothstep(.97,1.03,des);
  float land=landV(w,pm);
  float isLand=step(0.,land);
  float hs=0.;
  for(int i=0;i<3;i++){
    float lam= i==0?38.:(i==1?950.:21000.);
    float vis=smoothstep(.0035,.02,lam/S)*(1.-smoothstep(7.,30.,lam/S));
    if(vis<=0.)continue;
    float hg,sh;
    float a=.9+float(i)*.35;
    ridge(w,lam,a,hg,sh);
    float amp=(i==2?.9:1.)*inD;
    tone+= (sh-.12)*vis*amp;
    hs+= hg*vis*min(lam/S,1.5)*amp;
  }
  if(S<30.){
    float rv=1.-smoothstep(6.,25.,S);
    vec2 rd=vec2(cos(1.2),sin(1.2));
    float rx=dot(w,rd)/.13+ .9*vn(w*2.5)+.3*vn(w*9.);
    float rf=fract(rx);
    tone+=(step(.7,rf)*step(rf,.82)*.45+step(.82,rf)*.08)*rv;
    warp+=rx*.9*rv*(.13/S)*NL;
    vec2 tw=w-vec2(-.35,-.35);
    for(int k=0;k<34;k++){
      float fk=float(k);
      float s=fk*.38;
      vec2 c=vec2(-s*.55-.3*sin(s*.25), -s*.85+ .25*sin(s*.4));
      vec2 dir=normalize(vec2(-.55-.075*cos(s*.25),-.85+.1*cos(s*.4)));
      vec2 nrm=vec2(-dir.y,dir.x);
      vec2 fp=c+nrm*(mod(fk,2.)-.5)*.26;
      vec2 q=tw-fp;q=vec2(dot(q,nrm),dot(q,dir));
      float d=sdEll(q,vec2(.05,.12));
      if(d<0.)tone=mix(tone,q.y>0.?.85:.35,rv);
      else if(d<.018)tone=mix(tone,.0,rv);
    }
  }
  if(S<120.){
    vec2 q=rot(-.55)*(w-vec2(-7.6,-11.8));
    vec2 qs=rot(-.55)*(w-vec2(-7.6,-11.8)-(-SUN)*1.9*COT*.35);
    float dsh=sdBox(qs,vec2(1.0,2.6))-.1;
    if(dsh<0.)tone=.93;
    float d=sdBox(q,vec2(.95,2.55))-.12;
    if(d<0.){
      tone=.04;och=.0;
      warp=q.x*NL/S*8.;
      if(q.y>.35&&q.y<1.2)tone=.82;
      if(q.y>1.2&&q.y<1.3)tone=0.;
      if(q.y<.2&&q.y>-2.3&&abs(q.x)<.78){tone=.5;och=.7;warp=q.y*NL/S*6.;}
      if(length(q-vec2(0.,-1.4))<.4){tone=.95;och=0.;}
      if(length(q-vec2(0.,-1.4))<.16)tone=.0;
      if(q.y>2.35&&abs(q.x)>.5)red=1.;
    }
    if(d>0.&&d<.07)tone=1.;
    vec2 dq=rot(.9)*(q-vec2(.95,.7));
    if(sdBox(dq-vec2(0.,-.55),vec2(.05,.55))<0.)tone=1.;
  }
  if(inD<1.){
    float L=9e4;
    float tr=mix(.5,fbmA(w/L,pm/L),smoothstep(3.,20.,L/pm));
    float gt=.26+.35*(tr-.5);
    float wad=abs(fbmA(w/1.6e5+2.,pm/1.6e5)-.5);
    float wv=smoothstep(4e6,9e5,S);
    gt=mix(gt,0.,step(wad,.008)*wv);
    tone=mix(gt,tone,inD);och=mix(.5,och,inD);
    warp+=(1.-inD)*tr*(L/S)*NL*.5;
  }
  float dr=(des-1.)/(pm/250e3);
  float rimv=smoothstep(2e5,1.5e6,S);
  if(dr>0.&&dr<2.5&&rimv>0.)tone=mix(tone,0.,rimv);
  else if(dr>=2.5&&dr<4.5&&rimv>0.)tone=mix(tone,1.,rimv);
  if(isLand<.5){
    float L=6e5;
    float sw=fbmA(w/L,pm/L);
    tone=.8+.2*(fbmA(w/2e6,pm/2e6)-.5);och=0.;red=0.;
    warp=sw*(L/S)*NL*.6;
    vec2 g=w-vec2(-1.7e6,-1.45e6);
    float gr=length(g/vec2(1.,.8));
    if(gr<7.5e5){
      red=1.;tone=0.;
      if(abs(gr-4.8e5)<.5e5||abs(gr-6.6e5)<.35e5)tone=1.;
    }
  }
  if(S>2e5&&S<1.2e7){
    float cd=length(w-vec2(-1.6e5,5.6e5))/pm;
    float cv=smoothstep(2e5,6e5,S)*(1.-smoothstep(4e6,1.2e7,S));
    if(cd<4.5*cv){red=1.;tone=0.;}
    else if(cd<6.5*cv)tone=0.;
    else if(cd<8.*cv)tone=1.;
  }
  float cpx=pm/1.1e6;
  float cst=-land/cpx;
  if(cst>0.&&cst<2.2)tone=0.;else if(cst>=2.2&&cst<4.)tone=1.;
  return mk(clamp(tone,0.,1.),hs*NL*.35+warp,och,red);
}

float cloudD(vec2 w,float pm){
  float cv=smoothstep(.004,.03,950./(pm*uRes.y));
  float c=mix(0.,fbmA(w/950.,pm/950.)-.08*vn(w/250.),cv);
  vec2 sw=w/1.3e6;
  sw+=vec2(fbmA(sw*1.3+2.,pm/1e6),fbmA(sw*1.3+7.,pm/1e6))*1.6;
  float syn=fbmA(sw,pm/1.3e6)+.25*fbmA(w/2e5,pm/2e5);
  float far=smoothstep(5e5,1.6e6,length(w-vec2(0.,1e5)));
  float big=smoothstep(.56,.6,syn)*far;
  return max(c-.1,big*.9+.05);
}

float wingSD(vec2 q,float span,float fold,out vec2 wu){
  vec2 sh=vec2(.045,.075);
  vec2 r=rot(fold)*(q-sh);
  float L=span;
  float u=r.x/L;
  float le= .03*sin(PI*clamp(u,0.,1.))-.09*u*u;
  float ch= .15*pow(max(1.-u,0.),.75)+.012;
  float te= le-ch-.02*sin(PI*u);
  wu=vec2(u,(r.y-te)/max(ch,.01));
  float d=max(max(r.y-le,te-r.y)*.7, max(-r.x, r.x-L));
  return d;
}
float falconSD(vec2 f,float spread,float flap,float tail,out float part,out vec2 wu){
  vec2 q=vec2(abs(f.x),f.y);
  float body=sdEll(f-vec2(0.,.0),vec2(.058,.16));
  float head=length(f-vec2(0.,.165))-.045;
  float beak=sdEll(f-vec2(0.,.21),vec2(.018,.02));
  float tl=.14+.03*tail;
  vec2 tq=f-vec2(0.,-.1);
  float tw=.028+ (-tq.y/tl)*(.028+.05*tail);
  float td=max(abs(tq.x)-tw,max(tq.y-.01,-tq.y-tl));
  float span=lerp(.12,.46,spread)*mix(1.,.62,flap);
  float fold=mix(1.25,.0,spread)+ .12*flap;
  float wd=wingSD(q,span,fold,wu);
  float d=min(min(body,head),min(td,wd));
  part = wd<=min(min(body,head),td)?1.:(head<body&&head<td?2.:(td<body?3.:0.));
  if(beak<d){part=4.;}
  d=min(d,beak);
  return d;
}
void main(){
  vec2 p=(gl_FragCoord.xy-.5*uRes)/uRes.y;
  float px=1./uRes.y;
  float S=uS;
  vec2 ang=normalize(vec2(-.35,1.));
  float baseU=dot(p,vec2(-ang.y,ang.x))*NL;

  vec2 q=p*S;
  float R=6.371e6;
  float r=length(q);
  float tone,u,och=0.,red=0.;
  bool space=r>R;
  vec2 w;
  float limb=0.;
  if(!space){
    float gd= r<1.? r : R*asin(r/R);
    w=uCam+ (r<1.?q:q/r*gd);
    limb=r/R;
    Lay g=ground(w,S*(1.+2.*limb*limb*limb),p);
    tone=g.tone;u=baseU+g.u;och=g.och;red=g.red;
    if(S>1e6){
      float lw=smoothstep(1e6,4e6,S);
      tone=mix(tone,1.,smoothstep(.8,1.,limb)*.75*lw);
    }
    if(S<500.){
      vec2 sp=(w-(uFal+ (-SUN)*uFalAlt*COT));
      float pp,cc;vec2 wu;
      float sd=falconSD(rot(uHead)*sp,uSpread,abs(uFlap),uTail,pp,wu);
      if(sd<0.)tone=mix(tone,.97,1.-smoothstep(60.,300.,S));
    }
    if(S<200.){
      vec2 fw=w;
      vec2 sd=-SUN;
      vec2 sn=vec2(-sd.y,sd.x);
      vec2 lq=vec2(dot(fw,sn),dot(fw,sd));
      float dsh=sdCap(lq,vec2(0.,0.),vec2(0.,1.6*COT),.2)-.03*lq.y;
      dsh=min(dsh,length(lq-vec2(0.,1.75*COT))-.14);
      vec2 armS=vec2(.62,.1)+sd*1.35*COT;
      dsh=min(dsh,sdCap(fw,sd*1.3*COT,armS,.05));
      dsh=min(dsh,length(fw-(vec2(.63,.12)+sd*1.5*COT))-.09*uPerch);
      if(dsh<0.)tone=.96;
      float hem=sdEll(fw-vec2(.0,-.06),vec2(.31,.24))+.01*sin(atan(fw.y+.06,fw.x)*11.);
      float shd=sdEll(fw-vec2(0.,-.01),vec2(.25,.13));
      float arm=sdCap(fw,vec2(.17,.0),vec2(.5,.09),.075-.03*clamp((fw.x-.17)/.33,0.,1.));
      float glove=sdCap(fw,vec2(.5,.085),vec2(.69,.115),.052);
      float headc=length(fw-vec2(0.,.01))-.118;
      float drape=sdEll(fw-vec2(0.,-.08),vec2(.12,.12));
      drape=max(drape,fw.y+.02);
      float hd=min(headc,drape);
      float body=min(hem,arm);
      float halo=min(min(body,glove),hd);
      if(halo<.028&&halo>=0.){tone=0.;och=0.;red=0.;}
      if(body<0.){
        float an=atan(fw.y+.02,fw.x);
        tone=.82;och=.35;red=0.;
        u=an*18.+length(fw)*4.;
        if(shd<0.){tone=.93;u=baseU;}
        float op=abs(fw.x+.02*fw.y)-(.012+.16*max(fw.y-.02,0.));
        if(fw.y>.03&&op<0.&&hem<0.){tone=.03;och=0.;}
        if(fw.y>.03&&abs(op)<.016&&hem<0.){tone=0.;och=1.;}
        if(hem>-.018&&hem<0.&&fw.y>-.1){tone=0.;och=1.;}
        if(arm<0.){tone=.9;u=(fw.x*6.+fw.y*20.)*1.;if(arm>-.014)tone=0.,och=1.;}
      }
      if(glove<0.){tone=.08;och=1.;red=step(.55,fract((fw.x-fw.y*.3)*34.))*step(glove,-.018);}
      if(glove>-.009&&glove<0.)tone=1.;
      if(hd<0.){
        vec2 cq=rot(.785)*fw*30.;
        float chk=step(.6,fract(cq.x))+step(.6,fract(cq.y));
        tone=.02;och=0.;red=clamp(chk,0.,1.);
        if(hd>-.011)tone=1.;
        float ag=length(fw-vec2(0.,.015));
        if(abs(ag-.078)<.013)tone=1.,red=0.;
        if(abs(ag-.105)<.008)tone=1.,red=0.;
      }
    }
  } else {
    tone=1.;u=baseU;
    vec2 sg=floor(p*uRes.y/3.);
    if(h21(sg)>.992)tone=0.;
    float lr=(r-R)/(S*px);
    if(lr<2.5)tone=0.;
    else if(lr<6.)tone=1.;
    else if(lr<7.5&&S>3e6)tone=.0;
  }
  float Zc=1500.;
  float A=uAlt;
  if(A>Zc){
    float Sc=S*(A-Zc)/A;
    vec2 cw=space?uCam+q*(Sc/S):uCam+(w-uCam)*(Sc/S);
    float pmc=max(Sc,1.)/uRes.y;
    if(!space){
      float cd=cloudD(cw,pmc);
      float gx=cloudD(cw+vec2(pmc*1.5,0.),pmc)-cd,gy=cloudD(cw+vec2(0.,pmc*1.5),pmc)-cd;
      float ed=(cd-.5)/(length(vec2(gx,gy))/1.5*2.2+1e-5);
      if(cd>.5){
        float cs=cloudD(cw+SUN*max(min(300.,Sc*.02),pmc*7.),pmc);
        tone= cs>cd+.01?.42:.0;
        u=baseU+cd*min(950./max(Sc,1.),1.)*NL*.9;
        och=0.;red=0.;
        if(ed<1.)tone=1.;
      } else {
        float csd=cloudD(w+SUN*Zc*COT,pm0(S));
        if(csd>.5)tone=mix(tone,1.,.55*(1.-smoothstep(3e5,2e6,S)));
      }
    }
    float thr=1.-smoothstep(0.,420.,A-Zc);
    if(thr>0.){tone=mix(tone,.0,thr);}
  }
  if(uStreak>0.){
    float a=atan(p.y,p.x);
    float k=floor(a/(2.*PI)*260.);
    float n=h21(vec2(k,floor(uT*10.)));
    float rr=length(p);
    float fa=fract(a/(2.*PI)*260.);
    float on=step(.8,n)*step(abs(fa-.5),.18)*smoothstep(.3+.25*(1.-uStreak),.75,rr+.25*h21(vec2(k,3.)));
    if(on>0.){tone=0.;}
  }
  {
    vec2 f=rot(uHead)*((p-uFo)*uS0);
    float part;vec2 wu;
    float d=falconSD(f,uSpread,abs(uFlap),uTail,part,wu);
    float hp=uS0*px;
    if(d<3.2*hp&&d>=0.){tone=0.;och=0.;red=0.;}
    if(d<0.){
      och=.8;red=0.;
      if(part==1.){
        float prim=smoothstep(.45,.55,wu.x);
        float fu=mix(wu.y*7.+wu.x*3., (wu.x*13.-wu.y*1.2), prim);
        tone= .62+ .3*prim - .25*step(wu.y,.25)*(1.-prim);
        u=fu*6.;
        vec2 c=vec2(wu.x*26.,wu.y*5.);c.x+=.5*mod(floor(c.y),2.);
        float sc=length(fract(c)-.5-vec2(0.,.25));
        if(prim<.5&&wu.y>.25&&sc>.3&&sc<.42)tone=0.;
        if(wu.y>.72&&prim<.5)tone=.35;
      } else if(part==3.){
        vec2 tq=f-vec2(0.,-.1);
        tone=.55;u=-tq.y*NL*5.;
        if(fract(-tq.y*36.)<.3)tone=.95;
      } else if(part==2.){
        tone=1.;och=.8;
      } else if(part==4.){
        tone=.1;och=1.;
      } else {
        vec2 c=f*vec2(34.,26.);c.x+=.5*mod(floor(c.y),2.);
        vec2 fr=fract(c)-.5;
        float sc=length(fr-vec2(0.,.3));
        tone=.9;och=.9;u=(f.y+abs(f.x)*.9)*NL*1.6;
        if(sc>.3&&sc<.42)tone=.0;
      }
      if(d>-1.7*hp)tone=1.;
      if(length(vec2(abs(f.x),f.y)-vec2(.03,.175))<.009)tone=0.,och=1.;
    }
    for(int j=0;j<2;j++){
      float sgn=j==0?-1.:1.;
      vec2 a=vec2(.018*sgn,-.07);
      float sway=sin(uT*9.+float(j))*.02*(1.-uPerch);
      vec2 b=a+vec2(sgn*.03+sway,-.13-.04*(1.-uPerch));
      float jd=sdCap(f,a,b,.008);
      if(jd<0.&&d>-.01){red=1.;tone=0.;och=0.;}
    }
  }
  float tri=abs(fract(u)-.5)*2.;
  float jag=(vn(gl_FragCoord.xy*vec2(.08,.5))-.5)*.16+(h21(gl_FragCoord.xy)-.5)*.05;
  float aa=NL*px*.9;
  float ink=1.-smoothstep(tone-aa,tone+aa,tri+jag);
  if(tone>=.985)ink=1.;
  if(tone<=.015)ink=0.;
  gl_FragColor=vec4(ink,clamp(och,0.,1.),clamp(red,0.,1.),1.);
}
