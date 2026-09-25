varying vec3 vN;varying vec3 vC;varying vec3 vW;varying vec3 vUVw;varying float vKind;varying float vDist;
uniform vec3 uCam;
void main(){
  vec3 n=normalize(vN);
  vec3 L=uNight>.5?uMoonDir:uSunDir;
  float ndl=dot(n,normalize(L+vec3(0.,.15,0.)));
  float band=ndl>.55?1.:ndl>.1?.62:.30;
  vec3 col=vC*(uAmb*.85+uLight*band*.78);
  vec2 uv=vUVw.xy/vUVw.z;
  if(vKind>.5&&vKind<1.5){
    vec2 g=fract(uv/vec2(1.3,1.6));vec2 id=floor(uv/vec2(1.3,1.6));
    float win=step(.22,g.x)*step(g.x,.78)*step(.25,g.y)*step(g.y,.8)*step(1.5,uv.y);
    float lit=step(h21(id+vC.xy*37.1+vN.xz*5.3),.42)*uNight;
    vec3 wc=mix(uZen*.7+uHor*.25,vec3(1.,.78,.42)*1.25,lit);
    col=mix(col,wc,win*(.75+.25*uNight));
  }
  if(vKind>1.5&&vKind<2.5){
    vec2 q=fract((vW.xz+4.5)/9.);
    float street=step(q.x,.24)+step(q.y,.24);
    col=mix(col,vec3(.38,.38,.46)*(uAmb+uLight*.9),clamp(street,0.,1.));
    float dash=step(.5,fract(vW.x*.5))*step(abs(q.y-.12),.01)+step(.5,fract(vW.z*.5))*step(abs(q.x-.12),.01);
    col=mix(col,vec3(1.,.9,.6)*(uAmb+uLight),clamp(dash,0.,1.)*(1.-uNight*.5));
    vec2 sl=fract((vW.xz+4.5)/4.5);
    col+=vec3(1.,.6,.3)*uNight*street*smoothstep(.12,.0,length(sl-.5))*1.4;
  }
  if(vKind>2.5&&vKind<3.5){
    vec3 v=normalize(vW-uCam);vec3 r=reflect(v,vec3(0,1,0));
    vec3 sc=sky(normalize(vec3(r.x,max(r.y,.02),r.z)));
    col=mix(sc,uZen,.45)*.78+vec3(0.,.03,.06);
    float w=vn(vW.xz*vec2(.25,1.2)+vec2(uTime*.4,0.))*vn(vW.xz*vec2(.6,2.5)-vec2(0.,uTime*.3));
    float glint=pow(max(dot(r,L),0.),260.);
    col+=(uNight>.5?vec3(.8,.85,1.):uSunC)*step(.35,w)*step(.2,glint)*1.2;
    col=mix(col,col*.8,step(.5,fract(w*6.)));
  }
  if(vKind>3.5&&vKind<4.5){ col=vC*(1.+uNight*1.5); }
  if(vKind>4.5){
    col=vC*(uAmb*1.1+uLight*band)+vec3(.05);
  }
  float fog=1.-exp(-max(vDist-30.,0.)*.005);
  col=mix(col,uHor*.95,fog*.7);
  gl_FragColor=vec4(col,1.);
}
