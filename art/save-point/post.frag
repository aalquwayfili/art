precision highp float;varying vec2 vU;uniform sampler2D uTex;uniform vec2 uRes;
void main(){vec3 c=texture2D(uTex,vU).rgb;
  vec2 q=vU-.5;c*=1.-dot(q,q)*.9;
  float sl=mod(floor(gl_FragCoord.y),3.)<1.?.93:1.;
  gl_FragColor=vec4(c*sl,1.);}
