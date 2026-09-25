const [VERT,FRAG]=await Promise.all(['shader.vert','shader.frag'].map(f=>fetch(f).then(r=>r.text())));
const c=document.getElementById('c'),gl=c.getContext('webgl',{preserveDrawingBuffer:true});
function size(){c.width=innerWidth;c.height=innerHeight;gl.viewport(0,0,c.width,c.height)}size();onresize=size;
const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw gl.getShaderInfoLog(o);return o};
const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,VERT));
gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,FRAG));gl.linkProgram(pr);gl.useProgram(pr);
gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
const uR=gl.getUniformLocation(pr,'R'),uT=gl.getUniformLocation(pr,'T');
const q=new URLSearchParams(location.search),FIX=q.has('t')?+q.get('t'):null,T0=performance.now();
function loop(n){gl.uniform2f(uR,c.width,c.height);gl.uniform1f(uT,FIX??(n-T0)/1000);gl.drawArrays(gl.TRIANGLES,0,3);if(FIX===null)requestAnimationFrame(loop);else document.title='done'}
requestAnimationFrame(loop);
