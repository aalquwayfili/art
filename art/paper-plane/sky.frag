varying vec2 vP;uniform mat4 uInvVP;uniform vec3 uCam;
void main(){vec4 a=uInvVP*vec4(vP,1.,1.);vec3 d=normalize(a.xyz/a.w-uCam);gl_FragColor=vec4(sky(d),1.);}
