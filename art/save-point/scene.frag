precision highp float;
varying vec3 vC;varying vec3 vW;varying vec3 vUV;varying float vMat;
uniform vec3 uCam,uLp,uLc;uniform float uI,uMirror,uWaterY,uT,uAlpha;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float bayer(vec2 p){p=mod(floor(p),4.);
  float b=mod(p.x+p.y*4.,16.);
  vec4 r0=vec4(0.,8.,2.,10.),r1=vec4(12.,4.,14.,6.),r2=vec4(3.,11.,1.,9.),r3=vec4(15.,7.,13.,5.);
  vec4 row=p.y<.5?r0:p.y<1.5?r1:p.y<2.5?r2:r3;
  float v=p.x<.5?row.x:p.x<1.5?row.y:p.x<2.5?row.z:row.w;return v/16.;}
void main(){
  if(uMirror>.5&&vW.y>uWaterY+.01)discard;
  if(uMirror<.5&&vW.y<uWaterY-.01)discard;
  vec2 uv=vUV.xy/vUV.z;
  vec3 col=vC;
  float m=vMat;
  if(m>.5&&m<1.5){
    vec2 b=uv*vec2(3.2,6.4);b.x+=.5*mod(floor(b.y),2.);
    vec2 f=fract(b);float mortar=step(f.x,.07)+step(f.y,.12);
    float tint=.75+.5*h21(floor(b))+.15*vn(uv*9.);
    col*=mix(tint,.35,clamp(mortar,0.,1.));
    col*=mix(vec3(1.),vec3(.7,1.05,.75),smoothstep(.9,.0,vW.y)*.8*vn(uv*3.));
  } else if(m>1.5&&m<2.5){
    float pl=fract(uv.y*6.);col*=.8+.25*vn(vec2(uv.x*1.5,uv.y*60.))-.35*step(pl,.08);
  } else if(m>2.5&&m<3.5){
    vec2 b=uv*vec2(1.6,1.6);b.x+=.5*mod(floor(b.y),2.);vec2 f=fract(b);
    col*=(.75+.45*h21(floor(b)))*(1.-.55*clamp(step(f.x,.05)+step(f.y,.05),0.,1.))*(.8+.3*vn(uv*7.));
  } else if(m>4.5&&m<5.5){
    col*=.85+.3*vn(uv*14.)-.12*step(.5,fract(uv.y*10.));
  } else if(m>5.5&&m<6.5){
    vec2 w=vW.xz;
    float r=0.;
    for(int k=0;k<3;k++){float fk=float(k);float per=2.3+fk*.7;float ph=fract(uT/per+fk*.37);
      vec2 c=vec2(-1.8+fk*2.1,2.2+fk*.9);float d=length(w-c);
      r+=step(abs(d-ph*1.6),.05)*(1.-ph);}
    float rip=vn(vec2(w.x*3.,w.y*9.)+vec2(0.,uT*.6))*vn(vec2(w.x*7.,w.y*2.)-uT*.3);
    float streak=exp(-pow((w.x-uLp.x)*1.6,2.))*step(.25,rip)*uI;
    col=vec3(.01,.025,.03)+uLc*(streak*.55+r*.35*uI);
  }
  vec3 dv=vW-uCam;float dist=length(dv);vec3 dir=dv/dist;
  float tt=clamp(dot(uLp-uCam,dir),0.,dist);
  float h=length(uCam+dir*tt-uLp);
  float fog=1.-exp(-dist*.13);
  vec3 fogc=vec3(.012,.018,.024);
  col=mix(col,fogc,fog);
  col+=uLc*uI*(.16/(1.+h*h*5.)+.045/(1.+h*h*.35));
  vec2 fp=gl_FragCoord.xy;
  col=floor(clamp(col,0.,1.)*31.+bayer(fp))/31.;
  gl_FragColor=vec4(col,uAlpha);
}
