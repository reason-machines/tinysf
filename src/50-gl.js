// ───────────────────────── shaders ─────────────────────────
const GLSL_COMMON = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D; precision highp sampler2DShadow;
uniform vec3 uSunDir, uSunCol, uZenith, uHorizon, uFogCol, uCam, uAmbSky, uAmbGround;
uniform vec4 uFog; // density, falloff, sea level, sun glow
uniform float uTime, uCloud, uNight;
uniform sampler2DShadow uShadow; uniform mat4 uShadowVP;
float hash13(vec3 p){ p=fract(p*0.1031); p+=dot(p,p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash12(i),hash12(i+vec2(1,0)),f.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.1,3.7); a*=.5; } return s; }
float fogAmount(vec3 cam, vec3 d, float dist){
  float k=uFog.y, dy=d.y*dist, a=uFog.x*exp(-k*max(cam.y-uFog.z,-20.));
  float e=k*dy, f=abs(e)<1e-3 ? 1.0 : (1.0-exp(clamp(-e,-40.,40.)))/e;
  return 1.0-exp(-max(a*f*dist,0.));
}
vec3 fogColor(vec3 d){ float s=max(dot(d,uSunDir),0.); return uFogCol + uSunCol*uFog.w*(0.045*pow(s,4.)+0.11*pow(s,24.)); }
vec3 skyColor(vec3 d, float disc, int q){
  float h=clamp(d.y,0.,1.);
  vec3 c=mix(uHorizon,uZenith,pow(h,0.42));
  float s=max(dot(d,uSunDir),0.);
  c+=uSunCol*uFog.w*(0.05*pow(s,6.)+0.22*pow(s,60.));
  if(q>0 && d.y>0.012 && uCloud>0.){
    vec2 p=d.xz/(d.y+0.08)*0.9+vec2(uTime*0.012,uTime*0.004)+vec2(3.1,7.7);
    float n=fbm(p*1.4);
    float cov=smoothstep(1.0-uCloud*0.62, 1.12-uCloud*0.5, n+0.18*vnoise(p*6.));
    float lit=q>1 ? 0.55+0.45*smoothstep(0.35,0.8,fbm(p*1.4+uSunDir.xz*0.25)) : 0.8;
    vec3 cc=(uAmbSky*1.6+uSunCol*0.26)*lit + uSunCol*0.5*pow(s,10.);
    c=mix(c,cc,cov*smoothstep(0.012,0.16,d.y)*0.9);
  }
  c+=uSunCol*disc*(smoothstep(0.99955,0.9998,s)*30.+pow(s,900.)*4.);
  float fa=fogAmount(uCam,d,7000.);
  return mix(c,fogColor(d),fa);
}
float shadowAt(vec3 P, vec3 n){
  vec4 sc=uShadowVP*vec4(P+n*0.09,1.); vec3 q=sc.xyz*.5+.5;
  if(q.x<0.||q.y<0.||q.x>1.||q.y>1.||q.z>1.) return 1.;
  float t=1./4096., s=0.;
  s+=texture(uShadow,vec3(q.xy+vec2(-.6,-.3)*t,q.z)); s+=texture(uShadow,vec3(q.xy+vec2(.3,-.6)*t,q.z));
  s+=texture(uShadow,vec3(q.xy+vec2(.6,.3)*t,q.z)); s+=texture(uShadow,vec3(q.xy+vec2(-.3,.6)*t,q.z));
  return s*.25;
}
`;
const VS_SCENE = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aInfo; layout(location=2) in float aIdx; layout(location=3) in vec3 aNrm;
uniform mat4 uVP;
out vec3 vPos; flat out vec3 vN; flat out float vMat; out float vAO; flat out float vIdx; flat out float vFlag;
const vec3 NS[6]=vec3[6](vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1));
// aInfo: face, material, ambient occlusion, flag (1 = shown in build order, 2 = a moving thing with its own normal)
void main(){ vPos=aPos; vFlag=aInfo.w; vN=aInfo.w>1.5?aNrm:NS[int(aInfo.x)]; vMat=aInfo.y; vAO=aInfo.z/3.; vIdx=aIdx; gl_Position=uVP*vec4(aPos,1.); }`;
const FS_DEPTH = `#version 300 es
precision highp float; flat in float vMat; flat in float vIdx; flat in float vFlag; in vec3 vPos; flat in vec3 vN; in float vAO; uniform float uProg;
void main(){ if(vFlag>0.5 && vFlag<1.5 && vIdx>=uProg) discard; }`;
const FS_SCENE = GLSL_COMMON + `
in vec3 vPos; flat in vec3 vN; flat in float vMat; in float vAO; flat in float vIdx; flat in float vFlag;
uniform sampler2D uMats; uniform float uClipY, uProg;
out vec4 o;
void main(){
  if(vPos.y<uClipY) discard;
  if(vFlag>0.5 && vFlag<1.5 && vIdx>=uProg) discard;
  vec3 n=vN; int mat=int(vMat+.5);
  vec4 A=texelFetch(uMats,ivec2(mat,0),0), B=texelFetch(uMats,ivec2(mat,1),0); int style=int(A.a+.5);
  vec3 bp=floor(vPos-n*0.5); vec3 fp=vPos-bp;
  vec2 fuv=abs(n.y)>.5?fp.xz:(abs(n.x)>.5?fp.zy:fp.xy);
  vec3 V=vPos-uCam; float dist=length(V); V/=dist;
  float px=max(max(fwidth(vPos.x),fwidth(vPos.y)),fwidth(vPos.z)); // blocks per pixel
  float dBlock=clamp(1.2-px*1.6,0.,1.), dTex=clamp(1.15-px*7.,0.,1.);
  if(vFlag>1.5){ dBlock=0.; dTex=0.; }
  float r1=hash13(bp), r2=hash13(bp*3.17+vec3(floor(fuv*4.),5.));
  float top=step(.5,n.y), side=1.-abs(n.y);
  vec3 alb=A.rgb; float glass=0., lit=0.;
  if(style==5){ // grass over dirt
    float pat=vnoise(bp.xz*0.06)*.6+vnoise(bp.xz*0.23)*.4;
    vec3 g=A.rgb*mix(vec3(.8,.9,.72),vec3(1.06,1.04,.95),pat);
    alb=mix(B.rgb, g, max(top, step(.78,fuv.y)*side));
  } else if(style==6){ alb*=mix(.72,1.2,r1); }
  else if(style>=1&&style<=4){
    if(top>.5) alb=B.rgb;
    else if(side>.5){
      float u=abs(n.x)>.5?bp.z:bp.x, v=bp.y, w=0., avg=0.;
      if(style==1){ w=step(.5,mod(u,2.))*step(.5,mod(v,3.)); avg=.33; }
      else if(style==2){ w=step(.5,mod(v,4.)); avg=.75; }
      else if(style==3){ w=step(1.5,mod(v,3.)); avg=.33; }
      else if(style==4){ w=step(.5,mod(v,6.)); avg=.84; }
      if(style>=1&&style<=4){
        float e=min(min(fuv.x,1.-fuv.x),min(fuv.y,1.-fuv.y));
        w*=smoothstep(0.03,0.03+px*1.5+0.02,e); // frame between panes
        glass=mix(avg*.9,w,dBlock);
        lit=step(1.-uNight*.5,hash13(bp+vec3(9.,2.,4.)))*step(.5,w+1.-dBlock);
      }
    }
  }
  // block seams and a little 4x4 texture, both faded out with distance
  float e=min(min(fuv.x,1.-fuv.x),min(fuv.y,1.-fuv.y));
  float seam=1.-(1.-smoothstep(0.,0.05+px,e))*0.16*dBlock;
  alb*=mix(1.,mix(.9,1.1,r1),dBlock)*mix(1.,mix(.93,1.07,r2),dTex)*seam;

  float ndl=max(dot(n,uSunDir),0.);
  float sh=ndl>0.?shadowAt(vPos,n):0.;
  float ao=mix(.42,1.,vAO*vAO);
  vec3 amb=mix(uAmbGround,uAmbSky,n.y*.5+.5)*ao;
  vec3 direct=uSunCol*ndl*sh;
  vec3 bounce=uSunCol*0.07*side*ao*max(uSunDir.y,0.15);
  if(style==6) direct+=uSunCol*0.12*max(dot(-n,uSunDir),0.)*sh; // light through leaves
  vec3 col=alb*(direct+amb+bounce);
  if(glass>0.){
    vec3 R=reflect(V,n); float F=.12+.88*pow(1.-max(dot(-V,n),0.),4.);
    vec3 base=vec3(.02,.035,.05)*(uAmbSky+direct*.3);
    if(style==4){ base=alb*(amb+direct)*.5; F=max(F,.34); lit*=.25; } // pale glass that shows its own colour
    vec3 g=mix(base, skyColor(normalize(vec3(R.x,abs(R.y)+.05,R.z)),0.,0), F*.85);
    g+=uSunCol*pow(max(dot(R,uSunDir),0.),90.)*1.5*sh;
    g+=vec3(1.,.72,.38)*2.2*lit*uNight;
    col=mix(col,g*mix(.55,1.,ao),glass);
  }
  if(style==7) col=B.rgb*B.a;
  if(style==8) col+=B.rgb*B.a*uNight*.9;
  float fa=fogAmount(uCam,V,dist);
  col=mix(col,fogColor(V),fa);
  o=vec4(col,1.);
}`;
const VS_FULL = `#version 300 es
out vec2 vUv; void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); vUv=p; gl_Position=vec4(p*2.-1.,1.,1.); }`;
const FS_SKY = GLSL_COMMON + `
in vec2 vUv; uniform vec3 uRight, uUp, uFwd; uniform vec2 uTan; out vec4 o;
void main(){ vec2 nd=vUv*2.-1.; vec3 d=normalize(uFwd+uRight*nd.x*uTan.x+uUp*nd.y*uTan.y); o=vec4(skyColor(d,1.,2),1.); }`;
const VS_WATER = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uVP; void main(){ gl_Position=uVP*vec4(aPos,1.); }`;
const FS_WATER = GLSL_COMMON + `
uniform sampler2D uRefl; uniform vec2 uRes, uTan; uniform vec3 uWater, uRight, uUp, uFwd; uniform float uWaterY; out vec4 o;
float wh(vec2 q){ float t=uTime; return vnoise(q*0.33+vec2(t*.35,t*.21))*.62+vnoise(q*0.95-vec2(t*.5,-t*.33))*.28+vnoise(q*2.3+vec2(-t*.7,t*.6))*.1; }
void main(){
  // Where this pixel's ray meets the sea, worked out here. Interpolating a position across
  // the one huge quad loses precision, and the ripples then jump as the camera moves.
  vec2 nd=gl_FragCoord.xy/uRes*2.-1.;
  vec3 V=normalize(uFwd+uRight*nd.x*uTan.x+uUp*nd.y*uTan.y);
  float dist=min(abs((uWaterY-uCam.y)/(abs(V.y)<1e-5?1e-5:V.y)),14000.);
  vec3 vPos=uCam+V*dist;
  vec2 q=vPos.xz; float e=0.35; float h0=wh(q);
  float amp=0.55/(1.+dist*0.012);
  vec3 N=normalize(vec3(-(wh(q+vec2(e,0.))-h0)/e*amp,1.,-(wh(q+vec2(0.,e))-h0)/e*amp));
  vec3 R=reflect(V,N); R.y=abs(R.y)+0.02; R=normalize(R);
  float F=.03+.97*pow(1.-max(dot(-V,N),0.),5.);
  vec3 skyR=skyColor(R,0.,1);
  vec4 rf=texture(uRefl,gl_FragCoord.xy/uRes+N.xz*vec2(.05,.12));
  vec3 rc=mix(skyR,rf.rgb,rf.a);
  float sh=shadowAt(vPos,vec3(0.,1.,0.));
  vec3 deep=uWater*(uAmbSky*1.3+uSunCol*.16*sh*max(uSunDir.y,.1));
  vec3 col=mix(deep,rc,F);
  col+=uSunCol*pow(max(dot(R,uSunDir),0.),420.)*5.*sh*(1.-rf.a);
  float fa=fogAmount(uCam,V,dist);
  col=mix(col,fogColor(V),fa);
  o=vec4(col,1.);
}`;
const FS_DOWN = `#version 300 es
precision highp float; precision highp sampler2D; in vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel; out vec4 o;
void main(){ vec3 c=texture(uTex,vUv).rgb*4.; c+=texture(uTex,vUv+uTexel*vec2(-1,-1)).rgb+texture(uTex,vUv+uTexel*vec2(1,-1)).rgb+texture(uTex,vUv+uTexel*vec2(-1,1)).rgb+texture(uTex,vUv+uTexel*vec2(1,1)).rgb; o=vec4(c/8.,1.); }`;
const FS_UP = `#version 300 es
precision highp float; precision highp sampler2D; in vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel; out vec4 o;
void main(){ vec3 c=texture(uTex,vUv+uTexel*vec2(-2,0)).rgb+texture(uTex,vUv+uTexel*vec2(2,0)).rgb+texture(uTex,vUv+uTexel*vec2(0,-2)).rgb+texture(uTex,vUv+uTexel*vec2(0,2)).rgb;
  c+=2.*(texture(uTex,vUv+uTexel*vec2(-1,-1)).rgb+texture(uTex,vUv+uTexel*vec2(1,-1)).rgb+texture(uTex,vUv+uTexel*vec2(-1,1)).rgb+texture(uTex,vUv+uTexel*vec2(1,1)).rgb); o=vec4(c/12.,1.); }`;
const FS_POST = `#version 300 es
precision highp float; precision highp sampler2D; in vec2 vUv; uniform sampler2D uScene, uBloom; uniform float uExposure, uBloomMix, uBloomN, uFade, uSeed, uSplit; out vec4 o;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  // uSplit: both halves show the middle half of the picture, the left one as a flat grey model.
  vec2 uv=uSplit>.5 ? vec2(vUv.x+(vUv.x<.5?.25:-.25),vUv.y) : vUv;
  vec3 c=texture(uScene,uv).rgb, b=texture(uBloom,uv).rgb/uBloomN;
  c=mix(c,b,uBloomMix)+max(b-1.,0.)*.35;
  c*=uExposure;
  vec2 d=vUv-.5; c*=1.-dot(d,d)*.42;
  c=aces(c);
  float l=dot(c,vec3(.2126,.7152,.0722)); c=mix(vec3(l),c,1.1);
  if(uSplit>.5 && vUv.x<.5){ c=mix(vec3(l),c,.32)*vec3(.80,.82,.86)+.03; }
  c=pow(c,vec3(1./2.2));
  c+=(hash12(gl_FragCoord.xy+uSeed)-.5)/255.;
  o=vec4(c*uFade,1.);
}`;

// ───────────────────────── GL ─────────────────────────
const canvas = document.getElementById("gl");
let RW = Math.round(1920 * SCALE), RH = Math.round(1080 * SCALE);
canvas.width = RW; canvas.height = RH;
const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
// No WebGL2 is reported by boot(), on the page, not thrown here where nothing would show it.
if (gl) { gl.getExtension("EXT_color_buffer_float"); gl.getExtension("OES_texture_float_linear"); }
function program(vs, fs) {
  const p = gl.createProgram();
  for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + "\n" + src.split("\n").map((l, i) => i + 1 + ": " + l).join("\n").slice(0, 6000)); gl.attachShader(p, s); }
  gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const name = info.name.replace(/\[0\]$/, ""); u[name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}
function target(w, h, { depth = false, samples = 0, filter = gl.LINEAR } = {}) {
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); const t = { fb, w, h, rbs: [] };
  const rb = (fmt, attach) => { const r = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, r); if (samples) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, fmt, w, h); else gl.renderbufferStorage(gl.RENDERBUFFER, fmt, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attach, gl.RENDERBUFFER, r); t.rbs.push(r); };
  if (samples) { rb(gl.RGBA16F, gl.COLOR_ATTACHMENT0); rb(gl.DEPTH_COMPONENT24, gl.DEPTH_ATTACHMENT); }
  else {
    t.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    if (depth) rb(gl.DEPTH_COMPONENT24, gl.DEPTH_ATTACHMENT);
  }
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("framebuffer incomplete " + w + "x" + h + " s" + samples);
  return t;
}
const freeTarget = (t) => { if (!t) return; gl.deleteFramebuffer(t.fb); if (t.tex) gl.deleteTexture(t.tex); for (const r of t.rbs) gl.deleteRenderbuffer(r); };
// The picture's size: the film draws at 1080p times ?scale, the walkable world at the window's size.
function sizeTargets(w, h) {
  RW = Math.max(16, Math.round(w)); RH = Math.max(16, Math.round(h)); canvas.width = RW; canvas.height = RH;
  for (const t of [G.main, G.resolve, G.refl, ...(G.bloom || [])]) freeTarget(t);
  G.main = MSAA ? target(RW, RH, { samples: MSAA }) : null;
  G.resolve = target(RW, RH, { depth: !MSAA });
  G.refl = target(RW >> 1, RH >> 1, { depth: true });
  G.bloom = []; for (let i = 1, bw = RW >> 1, bh = RH >> 1; i <= 6 && bw > 8 && bh > 8; i++, bw >>= 1, bh >>= 1) G.bloom.push(target(bw, bh));
}
function vao(mesh) {
  const v = gl.createVertexArray(); gl.bindVertexArray(v);
  const b0 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b0); gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  if (mesh.info) { const b1 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b1); gl.bufferData(gl.ARRAY_BUFFER, mesh.info, gl.STATIC_DRAW); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, false, 0, 0); }
  if (mesh.idx) { const b2 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b2); gl.bufferData(gl.ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0); } else gl.vertexAttrib1f(2, 0);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.index, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { v, n: mesh.index.length };
}

const G = {};
function initGL() {
  G.scene = program(VS_SCENE, FS_SCENE); G.depth = program(VS_SCENE, FS_DEPTH); G.sky = program(VS_FULL, FS_SKY); G.water = program(VS_WATER, FS_WATER);
  G.down = program(VS_FULL, FS_DOWN); G.up = program(VS_FULL, FS_UP); G.post = program(VS_FULL, FS_POST);
  sizeTargets(RW, RH);
  // shadow map
  const S = 4096; G.shadowSize = S; G.shadowTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, G.shadowTex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, S, S);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  G.shadowFb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, G.shadowFb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, G.shadowTex, 0); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  G.empty = gl.createVertexArray();
  const wy = SEA + 0.82, E = 9000;
  G.waterY = wy;
  // The sea is a grid, fine over the island and coarser with distance. As one huge quad its
  // depth was interpolated too coarsely: the waterline crept up and down the shore between frames.
  { const axis = (n) => { const a = []; for (let v = -64; v <= n + 64; v += 16) a.push(v); for (let s = 64; s < E; s *= 2) { a.unshift(a[0] - s); a.push(a[a.length - 1] + s); } return a; };
    const xs = axis(W), zs = axis(D), pos = [], index = [];
    for (const z of zs) for (const x of xs) pos.push(x, wy, z);
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) { const a = j * xs.length + i, b = a + 1, c = a + xs.length, d = c + 1; index.push(a, c, d, a, d, b); }
    G.waterVao = vao({ pos: new Float32Array(pos), index: new Uint32Array(index) }); }
  // materials: one texel of colour and style, one of second colour and strength
  const mt = new Float32Array(128 * 2 * 4);
  for (const m of MAT) if (m) { mt.set([...m.col, m.style], m.id * 4); mt.set([...m.b, m.p], (128 + m.id) * 4); }
  G.mats = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, G.mats); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 128, 2, 0, gl.RGBA, gl.FLOAT, mt);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // the moving things: buffers rewritten every frame
  { const v = gl.createVertexArray(); gl.bindVertexArray(v);
    const mk = (loc, size, type, data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, type, false, 0, 0); return b; };
    const bp = mk(0, 3, gl.FLOAT, actors.pos), bi = mk(1, 4, gl.UNSIGNED_BYTE, actors.info), bn = mk(3, 3, gl.FLOAT, actors.nrm);
    const idx = new Uint32Array(ACTOR_MAX * 36); for (let q = 0, i = 0; q < ACTOR_MAX * 6; q++) { const b = q * 4; idx[i++] = b; idx[i++] = b + 1; idx[i++] = b + 2; idx[i++] = b; idx[i++] = b + 2; idx[i++] = b + 3; }
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW); gl.bindVertexArray(null);
    G.actorVao = { v, bp, bi, bn }; }
}

// ───────────────────────── light ─────────────────────────
const SKIES = {
  gold: { el: 9, sun: [1.0, 0.70, 0.40], sunI: 5.4, zen: [0.28, 0.40, 0.66], hor: [1.0, 0.70, 0.46], fogc: [0.98, 0.70, 0.48], fog: [0.0052, 0.045, 0.9], amb: [0.42, 0.46, 0.62], ambI: 0.75, gnd: [0.42, 0.30, 0.22], cloud: 0.75, night: 0.5, exp: 0.92, water: [0.03, 0.09, 0.12] },
  day: { el: 44, sun: [1.0, 0.95, 0.86], sunI: 4.3, zen: [0.13, 0.30, 0.70], hor: [0.56, 0.72, 0.92], fogc: [0.60, 0.74, 0.92], fog: [0.0019, 0.03, 0.25], amb: [0.42, 0.56, 0.86], ambI: 0.95, gnd: [0.30, 0.28, 0.24], cloud: 0.6, night: 0, exp: 0.9, water: [0.02, 0.11, 0.16] },
  mist: { el: 34, sun: [0.92, 0.96, 1.0], sunI: 2.0, zen: [0.50, 0.60, 0.76], hor: [0.72, 0.79, 0.88], fogc: [0.70, 0.77, 0.87], fog: [0.036, 0.055, 0.35], amb: [0.6, 0.68, 0.82], ambI: 1.05, gnd: [0.3, 0.32, 0.36], cloud: 0.25, night: 0, exp: 0.95, water: [0.05, 0.10, 0.14] },
  karl: { el: 26, sun: [1.0, 0.93, 0.84], sunI: 3.4, zen: [0.30, 0.45, 0.74], hor: [0.80, 0.85, 0.92], fogc: [0.86, 0.88, 0.92], fog: [0.075, 0.085, 0.5], amb: [0.6, 0.68, 0.84], ambI: 1.0, gnd: [0.32, 0.33, 0.36], cloud: 0.3, night: 0, exp: 0.95, water: [0.05, 0.10, 0.14] },
  dusk: { el: 4.5, sun: [1.0, 0.48, 0.20], sunI: 5.2, zen: [0.22, 0.27, 0.52], hor: [1.0, 0.52, 0.27], fogc: [0.95, 0.52, 0.30], fog: [0.0075, 0.05, 1.0], amb: [0.40, 0.38, 0.58], ambI: 0.62, gnd: [0.40, 0.24, 0.16], cloud: 0.7, night: 1, exp: 0.95, water: [0.04, 0.07, 0.10] },
  noon: { el: 58, sun: [1.0, 0.97, 0.9], sunI: 4.4, zen: [0.13, 0.30, 0.70], hor: [0.56, 0.72, 0.92], fogc: [0.60, 0.74, 0.92], fog: [0.0009, 0.03, 0.2], amb: [0.42, 0.56, 0.86], ambI: 0.95, gnd: [0.30, 0.28, 0.24], cloud: 0, night: 0, exp: 0.9, water: [0.012, 0.075, 0.13] },
};
function light(name, az) {
  // name is a sky, or { base, ...changes } for one shot's own light.
  const s = typeof name === "string" ? SKIES[name] : { ...SKIES[name.base], ...name }, e = (s.el * Math.PI) / 180, a = (az * Math.PI) / 180;
  return { ...s, name: s.base || name, az, dir: [Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)] };
}

// ───────────────────────── drawing ─────────────────────────
let shadowKey = "";
function setCommon(P, L, cam, t) {
  const u = P.u, f = (n, ...v) => u[n] && gl["uniform" + v.length + "f"](u[n], ...v);
  f("uSunDir", ...L.dir); f("uSunCol", ...L.sun.map((c) => c * L.sunI)); f("uZenith", ...L.zen); f("uHorizon", ...L.hor); f("uFogCol", ...L.fogc);
  f("uCam", ...cam); f("uAmbSky", ...L.amb.map((c) => c * L.ambI)); f("uAmbGround", ...L.gnd.map((c) => c * L.ambI * 0.55));
  f("uFog", L.fog[0], L.fog[1], SEA, L.fog[2]); f("uTime", t); f("uCloud", L.cloud); f("uNight", L.night);
  if (u.uShadowVP) gl.uniformMatrix4fv(u.uShadowVP, false, G.shadowVP);
  if (u.uShadow) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G.shadowTex); gl.uniform1i(u.uShadow, 1); }
}
function drawGeometry(P, prog, withActors) {
  gl.uniform1f(P.u.uProg, 1e9); gl.bindVertexArray(G.worldVao.v); gl.drawElements(gl.TRIANGLES, G.worldVao.n, gl.UNSIGNED_INT, 0);
  if (G.siteVao) { gl.uniform1f(P.u.uProg, prog); gl.bindVertexArray(G.siteVao.v); gl.drawElements(gl.TRIANGLES, G.siteVao.n, gl.UNSIGNED_INT, 0); }
  if (withActors && actors.n) { gl.uniform1f(P.u.uProg, 1e9); gl.bindVertexArray(G.actorVao.v); gl.drawElements(gl.TRIANGLES, actors.n * 36, gl.UNSIGNED_INT, 0); }
}
function uploadActors() {
  const n = actors.n; if (!n) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, G.actorVao.bp); gl.bufferSubData(gl.ARRAY_BUFFER, 0, actors.pos, 0, n * 72);
  gl.bindBuffer(gl.ARRAY_BUFFER, G.actorVao.bi); gl.bufferSubData(gl.ARRAY_BUFFER, 0, actors.info, 0, n * 96);
  gl.bindBuffer(gl.ARRAY_BUFFER, G.actorVao.bn); gl.bufferSubData(gl.ARRAY_BUFFER, 0, actors.nrm, 0, n * 72);
}
// live: a value that changes when the moving things should cast new shadows; null leaves them out.
function drawShadow(L, prog, live) {
  const key = L.dir.join() + "|" + prog + "|" + live; if (key === shadowKey) return; shadowKey = key;
  const c = [W / 2, 20, D / 2], R = Math.hypot(W, D) / 2 + 30, eye = V3.add(c, V3.mul(L.dir, 900));
  const up = Math.abs(L.dir[1]) > 0.95 ? [0, 0, -1] : [0, 1, 0];
  G.shadowVP = mul4(ortho(-R, R, -R, R, 500, 1300), lookAt(eye, c, up));
  gl.bindFramebuffer(gl.FRAMEBUFFER, G.shadowFb); gl.viewport(0, 0, G.shadowSize, G.shadowSize);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3);
  gl.useProgram(G.depth.p); gl.uniformMatrix4fv(G.depth.u.uVP, false, G.shadowVP); drawGeometry(G.depth, prog, live != null);
  gl.disable(gl.POLYGON_OFFSET_FILL);
}
function drawScene(P, VP, L, cam, t, clipY, prog) {
  gl.useProgram(P.p); setCommon(P, L, cam, t);
  gl.uniformMatrix4fv(P.u.uVP, false, VP); gl.uniform1f(P.u.uClipY, clipY);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, G.mats); gl.uniform1i(P.u.uMats, 3);
  drawGeometry(P, prog, true);
}
function fullscreen(P) { gl.bindVertexArray(G.empty); gl.drawArrays(gl.TRIANGLES, 0, 3); }

// cam: { pos, at, fov, up }
function drawFrame(cam, L, t, opts = {}) {
  const prog = opts.prog ?? 1e9, fade = opts.fade ?? 1;
  const up = cam.up || [0, 1, 0], fov = ((cam.fov || 50) * Math.PI) / 180, asp = RW / RH;
  const proj = persp(fov, asp, cam.near || 0.6, 9000), view = lookAt(cam.pos, cam.at, up), VP = mul4(proj, view);
  G.VP = VP; // kept for name tags
  drawActors(t); uploadActors();
  drawShadow(L, prog, opts.live ? t : null);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.CULL_FACE);

  // mirrored scene for the water
  const wy = G.waterY, mpos = [cam.pos[0], 2 * wy - cam.pos[1], cam.pos[2]];
  const mirror = new Float32Array([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 2 * wy, 0, 1]);
  gl.bindFramebuffer(gl.FRAMEBUFFER, G.refl.fb); gl.viewport(0, 0, G.refl.w, G.refl.h); gl.clearColor(0, 0, 0, 0); gl.depthMask(true); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (cam.pos[1] > wy && !opts.noRefl) { gl.cullFace(gl.FRONT); drawScene(G.scene, mul4(VP, mirror), L, mpos, t, wy - 0.02, prog); }

  const fb = G.main || G.resolve;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb.fb); gl.viewport(0, 0, RW, RH); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.depthMask(true); gl.enable(gl.DEPTH_TEST); gl.cullFace(gl.BACK);
  drawScene(G.scene, VP, L, cam.pos, t, -1e6, prog);
  // water
  gl.useProgram(G.water.p); setCommon(G.water, L, cam.pos, t);
  gl.uniformMatrix4fv(G.water.u.uVP, false, VP); gl.uniform2f(G.water.u.uRes, RW, RH); gl.uniform3f(G.water.u.uWater, ...L.water);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.refl.tex); gl.uniform1i(G.water.u.uRefl, 0);
  const bs = basis(cam.pos, cam.at, up), th = Math.tan(fov / 2);
  gl.uniform3f(G.water.u.uRight, ...bs.r); gl.uniform3f(G.water.u.uUp, ...bs.u); gl.uniform3f(G.water.u.uFwd, ...bs.f); gl.uniform2f(G.water.u.uTan, th * asp, th); gl.uniform1f(G.water.u.uWaterY, wy);
  gl.disable(gl.CULL_FACE); gl.bindVertexArray(G.waterVao.v); gl.drawElements(gl.TRIANGLES, G.waterVao.n, gl.UNSIGNED_INT, 0);
  // sky, last, where nothing else was drawn
  gl.depthMask(false); gl.disable(gl.CULL_FACE);
  gl.useProgram(G.sky.p); setCommon(G.sky, L, cam.pos, t);
  gl.uniform3f(G.sky.u.uRight, ...bs.r); gl.uniform3f(G.sky.u.uUp, ...bs.u); gl.uniform3f(G.sky.u.uFwd, ...bs.f); gl.uniform2f(G.sky.u.uTan, th * asp, th);
  fullscreen(G.sky);
  gl.depthMask(true);

  if (G.main) { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, G.main.fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, G.resolve.fb); gl.blitFramebuffer(0, 0, RW, RH, 0, 0, RW, RH, gl.COLOR_BUFFER_BIT, gl.NEAREST); }
  // bloom
  gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE);
  let src = G.resolve; gl.useProgram(G.down.p); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(G.down.u.uTex, 0);
  for (const b of G.bloom) { gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb); gl.viewport(0, 0, b.w, b.h); gl.bindTexture(gl.TEXTURE_2D, src.tex); gl.uniform2f(G.down.u.uTexel, 0.5 / src.w, 0.5 / src.h); fullscreen(); src = b; }
  gl.useProgram(G.up.p); gl.uniform1i(G.up.u.uTex, 0); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  for (let i = G.bloom.length - 2; i >= 0; i--) { const b = G.bloom[i], s = G.bloom[i + 1]; gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb); gl.viewport(0, 0, b.w, b.h); gl.bindTexture(gl.TEXTURE_2D, s.tex); gl.uniform2f(G.up.u.uTexel, 0.5 / s.w, 0.5 / s.h); fullscreen(); }
  gl.disable(gl.BLEND);
  // tone map to the canvas
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, RW, RH); gl.useProgram(G.post.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.resolve.tex); gl.uniform1i(G.post.u.uScene, 0);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G.bloom[0].tex); gl.uniform1i(G.post.u.uBloom, 2);
  gl.uniform1f(G.post.u.uExposure, L.exp); gl.uniform1f(G.post.u.uBloomMix, 0.11); gl.uniform1f(G.post.u.uBloomN, G.bloom.length); gl.uniform1f(G.post.u.uFade, fade); gl.uniform1f(G.post.u.uSplit, opts.split ? 1 : 0); gl.uniform1f(G.post.u.uSeed, Math.floor(t * FPS) * 1.37);
  fullscreen();
  gl.depthMask(true);
}

