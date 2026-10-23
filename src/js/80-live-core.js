// ================= live ball tracking: core =================
// The camera never needs to know where it sits: calibration maps camera pixels straight to sheet feet
// using dots the projector shows, so any camera angle (and any projector angle, after a corner fit) works.
const LIVE = {
  on:false, src:null, video:null, stream:null, track:null, caps:{}, settings:{}, label:'',
  proc:null, pctx:null, pw:0, ph:0, pwTarget:480, frame:null, newFrame:false, frameCount:0, lastProcT:0,
  fpsTimes:[], camFps:0, procMs:0,
  cal:null, Hcs:null, Hsc:null,                       // camera (0..1) <-> sheet (ft)
  pixSX:null, pixSY:null, valid:null, roi:null, mask:null, lab:null, stack:null,
  color:{h:72, dh:20, s:0.42, v:0.42, sampled:false},
  rest:{t:0.6, r:0.6}, clearT:1.5, startZone:'tee', latency:0.1,
  state:'off', det:null, detT:-9, hist:[], cand:[], samples:[], prev:null, miss:0, lastSeen:-9, resultAt:0,
  pin:null, fitting:false, calib:null, flash:null, dbg:false, dbgCorner:'tr', mark:true, panel:false,
  waiters:[], log:[], stats:{frames:0, hits:0, hitWin:[], weak:0, restStarts:0, moveStarts:0}, sweep:null, devId:'', res:1280, lockNote:'',
  readyAt:0, bg:[], bgLogged:false,
  // "compare to the empty sheet": each round starts by photographing the sheet with nothing on it (ref), then looks for
  // pixels that soak up blue light the way a yellow ball does, relative to that photo. Skin, hair and shadows don't.
  method:'ref', sig:{bm:0.22, q:0.95, m:0.9, cut:0.42, sampled:false},
  ref:null, refPw:0, refPh:0, refAcc:null, refN:0, refWant:0, refAt:-9, armAt:0, armTrack:[], armNote:false,
  // movement guard: how much of the sheet changed since the last camera frame
  prevL:null, curL:null, motionRaw:[], motionHist:[], motion:0, floor:0, busy:false, busyAt:-9, busyThr:0.02, lastBusyLog:-9,
  // frame-rate overlay
  fpsHud:false, camTimes:[], rafTimes:[], seenWin:[], frameMs:0, hud:null, hudAt:0
};
const LIVE_KEYS = ['color','rest','clearT','startZone','latency','pin','devId','res','pwTarget','dbgCorner','method','sig','busyThr','fpsHud'];
function liveLoad(){
  try {
    const s = JSON.parse(localStorage.getItem('putt-lab-live') || '{}');
    for (const k of LIVE_KEYS) if (s[k] != null) LIVE[k] = s[k];
    if (s.cal && s.cal.Hcs) setCal(s.cal, true);
  } catch (e) {}
}
function liveSave(){
  try {
    const o = {}; for (const k of LIVE_KEYS) o[k] = LIVE[k];
    o.cal = LIVE.cal; localStorage.setItem('putt-lab-live', JSON.stringify(o));
  } catch (e) {}
}
function llog(msg){
  const t = performance.now();
  LIVE.log.push({t, clock:state.clock, msg}); if (LIVE.log.length > 300) LIVE.log.shift();
  if (typeof renderLiveLog === 'function') renderLiveLog();
}

// ---- projective math ----
function solve(A, b){
  const n = b.length;
  for (let c=0; c<n; c++){
    let p = c; for (let r=c+1; r<n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r=0; r<n; r++){ if (r === c) continue; const f = A[r][c]/A[c][c]; if (!f) continue; for (let k=c; k<n; k++) A[r][k] -= f*A[c][k]; b[r] -= f*b[c]; }
  }
  return b.map((v,i) => v/A[i][i]);
}
function homFit(src, dst){ // least-squares homography src -> dst (row-major 3x3, h8 = 1)
  const M = Array.from({length:8}, () => new Array(8).fill(0)), r = new Array(8).fill(0);
  for (let i=0; i<src.length; i++){
    const [x,y] = src[i], [u,v] = dst[i];
    for (const [a, bb] of [[[x,y,1,0,0,0,-u*x,-u*y], u], [[0,0,0,x,y,1,-v*x,-v*y], v]]){
      for (let j=0;j<8;j++){ r[j] += a[j]*bb; for (let k=0;k<8;k++) M[j][k] += a[j]*a[k]; }
    }
  }
  const h = solve(M, r); return h ? [...h, 1] : null;
}
function homApply(h, x, y){ const w = h[6]*x+h[7]*y+h[8]; return [(h[0]*x+h[1]*y+h[2])/w, (h[3]*x+h[4]*y+h[5])/w]; }
function homInv(h){
  const [a,b,c,d,e,f,g,k,i] = h;
  const A = e*i-f*k, B = -(d*i-f*g), C = d*k-e*g, det = a*A + b*B + c*C;
  if (Math.abs(det) < 1e-15) return null;
  return [A, -(b*i-c*k), b*f-c*e, B, a*i-c*g, -(a*f-c*d), C, -(a*k-b*g), a*e-b*d].map(v => v/det);
}
const colMajor = h => [h[0],h[3],h[6], h[1],h[4],h[7], h[2],h[5],h[8]];

// ---- WebGL warper: draws a source canvas through a homography (used for the projector corner fit and the simulated camera) ----
function makeWarper(canvas){
  const gl = canvas.getContext('webgl', {preserveDrawingBuffer:true, alpha:false, antialias:false});
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }'));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `precision highp float; uniform sampler2D tex; uniform mat3 M; uniform vec2 size; uniform vec3 bg; uniform float nz; uniform float seed;
    float hs(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){ vec2 f = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y) / size; vec3 q = M * vec3(f, 1.0);
      vec2 uv = q.xy / q.z; vec4 c = (q.z <= 0.0 || uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? vec4(bg, 1.0) : texture2D(tex, uv);
      if (nz > 0.0){ vec2 p = gl_FragCoord.xy + seed; c.rgb += nz * (vec3(hs(p), hs(p + 17.0), hs(p + 41.0)) - 0.5); }
      gl_FragColor = vec4(c.rgb, 1.0); }`));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const uM = gl.getUniformLocation(prog, 'M'), uS = gl.getUniformLocation(prog, 'size'), uB = gl.getUniformLocation(prog, 'bg'), uN = gl.getUniformLocation(prog, 'nz'), uSd = gl.getUniformLocation(prog, 'seed');
  return {
    draw(src, H, bg, nz){ // H maps output fraction -> source fraction; nz adds sensor-like noise (simulated camera)
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.uniformMatrix3fv(uM, false, new Float32Array(colMajor(H)));
      gl.uniform2f(uS, canvas.width, canvas.height); gl.uniform3f(uB, bg[0], bg[1], bg[2]); gl.uniform1f(uN, nz || 0); gl.uniform1f(uSd, Math.random()*1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  };
}

// ---- projector corner fit ----
const warpCanvas = document.createElement('canvas'); warpCanvas.id = 'warpGL';
let warper = null;
function sheetRectFrac(){ // where the sheet sits on the unwarped screen canvas, as fractions
  const sw = cvs.width/dpr/view.css, sh = cvs.height/dpr/view.css;
  return {x0:(0-view.ox)/sw, y0:(0-view.oy)/sh, x1:(W-view.ox)/sw, y1:(D-view.oy)/sh};
}
function sheetCornersFrac(){ const r = sheetRectFrac(); return [[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]]; }
const pinActive = () => proj && !!LIVE.pin;
function pinMatrix(){ // output screen fraction -> source canvas fraction
  return homFit(LIVE.pin, sheetCornersFrac());
}
function blitWarp(){
  if (!pinActive()){ if (warpCanvas.style.display !== 'none'){ warpCanvas.style.display = 'none'; cvs.style.opacity = ''; } return; }
  if (!warper){ warper = makeWarper(warpCanvas); if (!warper){ llog('WebGL unavailable, so the corner fit is off'); LIVE.pin = null; return; } }
  if (warpCanvas.width !== cvs.width || warpCanvas.height !== cvs.height){ warpCanvas.width = cvs.width; warpCanvas.height = cvs.height; }
  warpCanvas.style.display = 'block'; cvs.style.opacity = '0';
  const H = pinMatrix(); if (H) warper.draw(cvs, H, [0,0,0]);
}

// ---- simulated camera: watches the projection from an angle, for desk tests ----
const simCam = {canvas:null, warper:null, quad:[[0.2,0.1],[0.82,0.14],[0.95,0.9],[0.04,0.86]], last:0};
function simRender(){
  if (!simCam.canvas){ simCam.canvas = document.createElement('canvas'); simCam.canvas.width = 960; simCam.canvas.height = 540; simCam.warper = makeWarper(simCam.canvas); }
  if (!simCam.warper) return false;
  const src = pinActive() ? warpCanvas : cvs;
  const H = homFit(simCam.quad, [[0,0],[1,0],[1,1],[0,1]]);
  simCam.warper.draw(src, H, [0.16, 0.15, 0.14], simCam.noise || 0);
  return true;
}

// ---- frame sources ----
function srcEl(){ return LIVE.src === 'sim' ? simCam.canvas : LIVE.video; }
function srcSize(){
  if (LIVE.src === 'sim') return simCam.canvas ? [simCam.canvas.width, simCam.canvas.height] : [0,0];
  const v = LIVE.video; return v && v.readyState >= 2 ? [v.videoWidth, v.videoHeight] : [0,0];
}
function watchVideoFrames(){
  const v = LIVE.video; if (!v) return;
  if (v.requestVideoFrameCallback){ const cb = () => { LIVE.newFrame = true; noteCamFrame(); if (LIVE.video === v) v.requestVideoFrameCallback(cb); }; v.requestVideoFrameCallback(cb); }
  else { let lastT = -1; const poll = () => { if (LIVE.video !== v) return; if (v.currentTime !== lastT){ lastT = v.currentTime; LIVE.newFrame = true; noteCamFrame(); } requestAnimationFrame(poll); }; poll(); }
}
// rates for the frame-rate overlay: frames the camera delivers, frames analyzed, frames drawn
function pushRate(arr, now){ arr.push(now); while (arr.length && now - arr[0] > 2000) arr.shift(); }
function rateOf(arr){ return arr.length > 1 ? (arr.length-1)*1000/(arr[arr.length-1] - arr[0]) : 0; }
function noteCamFrame(){ pushRate(LIVE.camTimes, performance.now()); }
function grabFrame(){
  const [vw, vh] = srcSize(); if (!vw) return false;
  const pw = LIVE.pwTarget, ph = Math.max(1, Math.round(pw*vh/vw));
  if (!LIVE.proc){ LIVE.proc = document.createElement('canvas'); LIVE.pctx = LIVE.proc.getContext('2d', {willReadFrequently:true}); }
  if (pw !== LIVE.pw || ph !== LIVE.ph){
    LIVE.proc.width = pw; LIVE.proc.height = ph; LIVE.pw = pw; LIVE.ph = ph;
    LIVE.mask = new Uint8Array(pw*ph); LIVE.lab = new Int32Array(pw*ph); LIVE.stack = new Int32Array(pw*ph);
    LIVE.ref = null; LIVE.refWant = 0; LIVE.prevL = null;   // the empty-sheet photo was taken at the old size
    buildPixMap();
    if (LIVE.on && LIVE.state === 'ready') armReady();      // so take a new one
  }
  LIVE.pctx.drawImage(srcEl(), 0, 0, pw, ph);
  LIVE.frame = LIVE.pctx.getImageData(0, 0, pw, ph).data;
  LIVE.frameCount++;
  const now = performance.now(); LIVE.fpsTimes.push(now); while (LIVE.fpsTimes.length && now - LIVE.fpsTimes[0] > 2000) LIVE.fpsTimes.shift();
  LIVE.camFps = LIVE.fpsTimes.length > 1 ? (LIVE.fpsTimes.length-1)*1000/(now - LIVE.fpsTimes[0]) : 0;
  return true;
}
const exclusionRects = () => [LIVE.dbg ? dbgRect() : null, LIVE.fpsHud ? hudRect() : null].filter(Boolean);
function dbgRect(){ const w = W*0.4, h = D*0.52; return LIVE.dbgCorner === 'tl' ? {x:W*0.015, y:D*0.02, w, h} : {x:W-w-W*0.015, y:D*0.02, w, h}; }
function hudRect(){ const w = W*0.32, h = 0.24*K; return LIVE.dbgCorner === 'tl' ? {x:W-w-W*0.015, y:D*0.02, w, h} : {x:W*0.015, y:D*0.02, w, h}; }
function buildPixMap(){
  const pw = LIVE.pw, ph = LIVE.ph; if (!pw) return;
  LIVE.pixSX = new Float32Array(pw*ph); LIVE.pixSY = new Float32Array(pw*ph); LIVE.valid = new Uint8Array(pw*ph);
  if (!LIVE.Hcs){ LIVE.roi = null; return; }
  const ex = exclusionRects(), m = 0.02;
  let x0 = pw, y0 = ph, x1 = -1, y1 = -1;
  for (let y=0; y<ph; y++) for (let x=0; x<pw; x++){
    const i = y*pw+x, [sx, sy] = homApply(LIVE.Hcs, (x+0.5)/pw, (y+0.5)/ph);
    LIVE.pixSX[i] = sx; LIVE.pixSY[i] = sy;
    let ok = sx > m && sx < W-m && sy > m && sy < D-m;
    if (ok) for (const e of ex) if (sx > e.x && sx < e.x+e.w && sy > e.y && sy < e.y+e.h){ ok = false; break; }
    if (ok){ LIVE.valid[i] = 1; if (x<x0) x0=x; if (x>x1) x1=x; if (y<y0) y0=y; if (y>y1) y1=y; }
  }
  LIVE.roi = x1 >= 0 ? {x0, y0, x1, y1} : null;
  LIVE.nrad = LIVE.Hsc ? clamp(Math.round(2.6*Math.sqrt(expectedArea(W/2, D/2)/Math.PI)), 4, 24) : 8;   // ~2.6 ball radii
}
function setCal(cal, quiet){
  LIVE.cal = cal; LIVE.Hcs = cal ? cal.Hcs : null; LIVE.Hsc = cal ? homInv(cal.Hcs) : null;
  buildPixMap(); if (!quiet) liveSave();
}
function camPx(sx, sy){ const [u, v] = homApply(LIVE.Hsc, sx, sy); return [u*LIVE.pw, v*LIVE.ph]; }
function expectedArea(sx, sy){ // ball area in processing pixels at a sheet position
  if (!LIVE.Hsc || !LIVE.pw) return 0;
  const d = BALL_R*2, a = camPx(sx, sy), b = camPx(sx+d, sy), c = camPx(sx, sy+d);
  return Math.abs((b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])) * Math.PI/4;
}
function hsv(r, g, b){
  const mx = Math.max(r,g,b), mn = Math.min(r,g,b), dl = mx-mn;
  let h = 0; if (dl){ if (mx === r) h = 60*(((g-b)/dl) % 6); else if (mx === g) h = 60*((b-r)/dl + 2); else h = 60*((r-g)/dl + 4); }
  if (h < 0) h += 360; return [h, mx ? dl/mx : 0, mx/255];
}

// ---- ball detection: color mask -> connected blobs -> best ball-sized blob, all in sheet feet ----
function maskPass(C, R){
  const d = LIVE.frame, pw = LIVE.pw, m = LIVE.mask, lab = LIVE.lab, valid = LIVE.valid, vmin = C.v*255; let count = 0;
  for (let y=R.y0; y<=R.y1; y++){
    for (let x=R.x0, i=y*pw+R.x0; x<=R.x1; x++, i++){
      m[i] = 0; lab[i] = 0; if (!valid[i]) continue;
      const k = i*4, r = d[k], g = d[k+1], b = d[k+2], mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      if (mx < vmin) continue;
      const mn = r < g ? (r < b ? r : b) : (g < b ? g : b), dl = mx-mn; if (dl < C.s*mx) continue;
      let h; if (mx === r) h = 60*((g-b)/dl); else if (mx === g) h = 60*((b-r)/dl + 2); else h = 60*((r-g)/dl + 4);
      if (h < 0) h += 360;
      if (Math.abs(((h - C.h + 540) % 360) - 180) > C.dh) continue;
      m[i] = 1; count++;
    }
  }
  return count;
}
// Compare each pixel with the empty-sheet photo taken at the start of the round. Dividing by that photo cancels out
// whatever the projector is showing there, so what's left is the surface's own color: a yellow ball keeps most of the
// red and green light and soaks up the blue. Skin and hair keep far more blue, shadows dim all three alike,
// and a change in the projected picture almost never looks like that.
// Each pixel's ratio is then divided by the average ratio around it (a few ball widths), so a shadow across the ball,
// a cell repainted under it, or the room lights changing cancel out too.
function ratioField(){
  const d = LIVE.frame, ref = LIVE.ref, pw = LIVE.pw, n = pw*LIVE.ph, R = LIVE.roi, valid = LIVE.valid;
  if (!LIVE.nR || LIVE.nR.length !== n){ LIVE.nR = new Float32Array(n); LIVE.nG = new Float32Array(n); LIVE.nB = new Float32Array(n); LIVE.nOk = new Uint8Array(n); }
  const nR = LIVE.nR, nG = LIVE.nG, nB = LIVE.nB, ok = LIVE.nOk;
  const x0 = R.x0, y0 = R.y0, rw = R.x1 - R.x0 + 1, rh = R.y1 - R.y0 + 1, iw = rw + 1, sz = iw*(rh + 1);
  if (!LIVE.iR || LIVE.iR.length < sz){ LIVE.iR = new Float64Array(sz); LIVE.iG = new Float64Array(sz); LIVE.iB = new Float64Array(sz); LIVE.iC = new Float64Array(sz); }
  const iR = LIVE.iR, iG = LIVE.iG, iB = LIVE.iB, iC = LIVE.iC;
  for (let j=0; j<iw; j++){ iR[j] = iG[j] = iB[j] = iC[j] = 0; }
  for (let yy=0; yy<rh; yy++){
    let aR = 0, aG = 0, aB = 0, aC = 0; const row = (yy+1)*iw; iR[row] = iG[row] = iB[row] = iC[row] = 0;
    for (let xx=0, i=(y0+yy)*pw + x0; xx<rw; xx++, i++){
      let r = 0, g = 0, b = 0, c = 0;
      if (valid[i]){ const k = i*4, Rr = ref[k]+4, Gr = ref[k+1]+4; if (Rr + Gr >= 56){ r = (d[k]+4)/Rr; g = (d[k+1]+4)/Gr; b = (d[k+2]+4)/(ref[k+2]+4); c = 1; } }
      ok[i] = c; nR[i] = r; nG[i] = g; nB[i] = b; aR += r; aG += g; aB += b; aC += c;
      const j = row + xx + 1; iR[j] = iR[j-iw] + aR; iG[j] = iG[j-iw] + aG; iB[j] = iB[j-iw] + aB; iC[j] = iC[j-iw] + aC;
    }
  }
  const rad = LIVE.nrad || 8;
  for (let yy=0; yy<rh; yy++){
    const ya = Math.max(0, yy-rad)*iw, yb = (Math.min(rh-1, yy+rad)+1)*iw;
    for (let xx=0, i=(y0+yy)*pw + x0; xx<rw; xx++, i++){
      if (!ok[i]) continue;
      const xa = Math.max(0, xx-rad), xb = Math.min(rw-1, xx+rad)+1, A = ya+xa, B = ya+xb, C = yb+xa, E = yb+xb;
      const cnt = iC[E]-iC[B]-iC[C]+iC[A]; if (cnt < 12) continue;
      nR[i] *= cnt/(iR[E]-iR[B]-iR[C]+iR[A]); nG[i] *= cnt/(iG[E]-iG[B]-iG[C]+iG[A]); nB[i] *= cnt/(iB[E]-iB[B]-iB[C]+iB[A]);
    }
  }
}
function maskPassRef(R, loose){ // loose: 'near' (around a rolling ball) or 'band' (along the tee edge before a shot)
  const pw = LIVE.pw, m = LIVE.mask, lab = LIVE.lab, ok = LIVE.nOk, nR = LIVE.nR, nG = LIVE.nG, nB = LIVE.nB, g = LIVE.sig;
  const near = loose === 'near', band = loose === 'band';
  const mLo = near ? 0.2 : band ? 0.45 : clamp(g.m*0.4, 0.22, 0.5), mHi = Math.max(2.2, g.m*2.2);
  const cut = near ? Math.min(0.68, g.cut + 0.28) : band ? Math.min(0.55, g.cut + 0.15) : g.cut, qLo = g.q*(near ? 0.74 : 0.82), qHi = g.q*(near ? 1.35 : 1.22);
  let count = 0;
  for (let y=R.y0; y<=R.y1; y++){
    for (let x=R.x0, i=y*pw+R.x0; x<=R.x1; x++, i++){
      m[i] = 0; lab[i] = 0; if (!ok[i]) continue;   // outside the sheet, or projected black there: nothing to compare against
      const rr = nR[i], gr = nG[i], mm = (rr+gr)*0.5;
      if (mm < mLo || mm > mHi) continue;
      if (nB[i] > cut*mm) continue;                  // keeps too much blue: not a yellow ball
      const q = gr/rr; if (q < qLo || q > qHi) continue;
      m[i] = 1; count++;
    }
  }
  return count;
}
const useRef = () => LIVE.method === 'ref' && !!LIVE.ref && LIVE.refPw === LIVE.pw && LIVE.refPh === LIVE.ph && !LIVE.sampling && !LIVE.calib;
function blobsIn(R){
  const pw = LIVE.pw, m = LIVE.mask, lab = LIVE.lab, st = LIVE.stack, raw = []; let label = 0;
  for (let y=R.y0; y<=R.y1; y++) for (let x=R.x0; x<=R.x1; x++){
    const i0 = y*pw+x; if (!m[i0] || lab[i0]) continue;
    label++; let sp = 0, area = 0, sx = 0, sy = 0, px = 0, py = 0, bx0 = x, bx1 = x, by0 = y, by1 = y; st[sp++] = i0; lab[i0] = label;
    while (sp){
      const i = st[--sp], ix = i % pw, iy = (i - ix)/pw; area++; sx += LIVE.pixSX[i]; sy += LIVE.pixSY[i]; px += ix; py += iy;
      if (ix < bx0) bx0 = ix; if (ix > bx1) bx1 = ix; if (iy < by0) by0 = iy; if (iy > by1) by1 = iy;
      if (ix > R.x0 && m[i-1] && !lab[i-1]){ lab[i-1] = label; st[sp++] = i-1; }
      if (ix < R.x1 && m[i+1] && !lab[i+1]){ lab[i+1] = label; st[sp++] = i+1; }
      if (iy > R.y0 && m[i-pw] && !lab[i-pw]){ lab[i-pw] = label; st[sp++] = i-pw; }
      if (iy < R.y1 && m[i+pw] && !lab[i+pw]){ lab[i+pw] = label; st[sp++] = i+pw; }
    }
    raw.push({area, x:sx/area, y:sy/area, px:px/area, py:py/area, bx0, bx1, by0, by1});
  }
  // a highlight, motion streak or the putter shaft can split one ball into fragments: merge pieces within a ball's width
  const merged = [];
  for (const f of raw.sort((p,q) => q.area-p.area)){
    const m2 = merged.find(g => Math.hypot(g.x-f.x, g.y-f.y) < BALL_R*2.6);
    if (m2){
      const A = m2.area+f.area; m2.x = (m2.x*m2.area+f.x*f.area)/A; m2.y = (m2.y*m2.area+f.y*f.area)/A; m2.px = (m2.px*m2.area+f.px*f.area)/A; m2.py = (m2.py*m2.area+f.py*f.area)/A; m2.area = A; m2.parts++;
      m2.bx0 = Math.min(m2.bx0, f.bx0); m2.bx1 = Math.max(m2.bx1, f.bx1); m2.by0 = Math.min(m2.by0, f.by0); m2.by1 = Math.max(m2.by1, f.by1);
    }
    else merged.push(Object.assign({parts:1}, f));
  }
  for (const b of merged){
    b.exp = expectedArea(b.x, b.y); b.ratio = b.exp ? b.area/b.exp : 0;
    const bw = b.bx1-b.bx0+1, bh = b.by1-b.by0+1; b.fill = b.area/(bw*bh); b.aspect = Math.max(bw, bh)/Math.min(bw, bh);
  }
  return merged;
}
function chooseBlob(blobs, o){
  const pred = LIVE.hist.length ? LIVE.hist[LIVE.hist.length-1] : null; let top = -Infinity, best = null;
  for (const b of blobs){
    if (b.area < 2 || b.ratio < o.lo || b.ratio > o.hi){ b.rejected = true; continue; }
    // a ball at rest is round and solid; a finger, an arm or the edge of a changed graphic isn't
    // (speckle across a hand or face that only partly matches is sparse, so its fill is low)
    if (o.shape && b.area >= 4 && (b.aspect > 3.2 || b.fill < (o.minFill || 0.4))){ b.rejected = true; b.shapeBad = true; continue; }
    if (o.ignore && o.ignore.some(p => Math.hypot(p.x-b.x, p.y-b.y) < 0.3)){ b.ignored = true; continue; }
    if (o.near && Math.hypot(b.x-o.near.x, b.y-o.near.y) > o.maxDist){ b.far = true; continue; }
    let sc = -Math.abs(Math.log(b.ratio));
    if (pred && state.clock - pred.t < 0.5) sc -= Math.hypot(b.x-pred.x, b.y-pred.y)*0.8;
    if (sc > top){ top = sc; best = b; }
  }
  return best;
}
function roiAround(sx, sy, r){ return roiRect(sx-r, sy-r, sx+r, sy+r); }
function roiRect(ax, ay, bx, by){
  const R0 = LIVE.roi; if (!R0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [cx, cy] of [[ax,ay],[bx,ay],[bx,by],[ax,by]]){
    const [u, v] = camPx(clamp(cx, 0, W), clamp(cy, 0, D)); x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v);
  }
  const R = {x0:Math.max(R0.x0, Math.floor(x0)), y0:Math.max(R0.y0, Math.floor(y0)), x1:Math.min(R0.x1, Math.ceil(x1)), y1:Math.min(R0.y1, Math.ceil(y1))};
  return R.x1 > R.x0 && R.y1 > R.y0 ? R : null;
}
function liveSpeed(){ // ft/s over the last quarter second of sightings
  const S2 = LIVE.samples, k = S2.length-1; if (k < 1) return 6;   // just started: assume a firm putt
  let j = k; while (j > 0 && S2[k].t - S2[j].t < 0.25) j--;
  return Math.hypot(S2[k].x-S2[j].x, S2[k].y-S2[j].y)/Math.max(0.05, S2[k].t-S2[j].t);
}
function detectBall(){
  if (!LIVE.frame || !LIVE.roi || !LIVE.Hcs) return null;
  const t0 = performance.now(), C = LIVE.color, ref = useRef(), st = LIVE.on ? LIVE.state : '';
  const ignore = st === 'ready' && !ref ? LIVE.bg : null;   // the empty-sheet photo already covers what was there
  const rolling = st === 'rolling' && LIVE.samples.length > 0, last = rolling ? LIVE.samples[LIVE.samples.length-1] : null;
  // While rolling, the ball can only have moved so far since it was last seen (it slows down, never speeds up),
  // so a hand across the sheet, or a graphic changing, can't take over the track.
  const v = rolling ? liveSpeed() : 0, maxDist = last ? clamp((v*1.3 + 0.8)*(state.clock - LIVE.latency - last.t) + 0.3, 0.4, 3) : 0;
  const limit = Math.round(6000*LIVE.pw*LIVE.ph/(480*270));
  if (ref) ratioField();
  const count = ref ? maskPassRef(LIVE.roi, false) : maskPass(C, LIVE.roi);
  const res = {t:state.clock, count, blobs:[], best:null, note:'', weak:false, ref};
  if (count > limit) res.note = ref ? 'too much of the sheet changed (someone on it, or the camera moved)' : 'too many pixels match the ball color';
  else {
    res.blobs = blobsIn(LIVE.roi); res.best = chooseBlob(res.blobs, {lo:rolling ? 0.15 : 0.25, hi:4, ignore, shape:!rolling, near:last, maxDist});
    if (!res.best && res.blobs.length) res.note = res.blobs.some(b => b.ignored) ? 'only spots that were already on the sheet' : res.blobs.some(b => b.far) ? 'only spots too far from the rolling ball' : res.blobs.some(b => b.shapeBad) ? 'only odd-shaped spots' : 'matches found, but none are ball-sized';
  }
  // A rolling ball smears during each camera frame, which washes out its color. Take a looser second look near where it was,
  // and, before a shot, along the tee edge where a smeared ball rolls in.
  let R2 = null, o2 = null;
  if (!res.best && rolling && v > 1.2){ R2 = roiAround(last.x, last.y, Math.min(maxDist, 1.6)); o2 = {lo:0.12, hi:6, near:last, maxDist}; }   // only a fast ball smears
  else if (!res.best && ref && st === 'ready' && !LIVE.busy){ R2 = roiRect(0, D-1.2, W, D); o2 = {lo:0.25, hi:5, shape:true, minFill:0.45}; }
  if (R2){
    const n2 = ref ? maskPassRef(R2, rolling ? 'near' : 'band') : maskPass({h:C.h, dh:Math.min(60, C.dh*1.6), s:C.s*0.6, v:C.v*0.7}, R2);
    if (n2 && n2 < limit/2){ const bl = blobsIn(R2), b2 = chooseBlob(bl, o2); if (b2){ res.best = b2; res.blobs = bl; res.weak = true; LIVE.stats.weak++; } }
  }
  LIVE.procMs = performance.now()-t0;
  return res;
}

// ---- movement guard: share of the sheet that changed over the last quarter second ----
// Comparing with a frame from ~0.25 s ago (not the previous frame) makes this the same at 10 or 60 fps.
function measureMotion(){
  const d = LIVE.frame, valid = LIVE.valid, R = LIVE.roi, pw = LIVE.pw, n = pw*LIVE.ph, rt = performance.now()/1000;
  if (!R || !valid){ LIVE.motion = 0; return; }
  if (!LIVE.prevL || LIVE.prevL.length !== n){ LIVE.prevL = new Float32Array(n); LIVE.curL = new Float32Array(n); LIVE.lagT = -9; LIVE.motionRaw = []; }
  const P = LIVE.prevL, Cu = LIVE.curL; let sc = 0, sp = 0, cnt = 0;
  for (let y=R.y0; y<=R.y1; y+=2) for (let x=R.x0+((y>>1)&1); x<=R.x1; x+=2){
    const i = y*pw+x; if (!valid[i]) continue; const k = i*4;
    const L = 0.299*d[k] + 0.587*d[k+1] + 0.114*d[k+2]; Cu[i] = L; sc += L; sp += P[i]; cnt++;
  }
  const have = LIVE.lagT > 0 && cnt && sp > 0;
  let frac = 0;
  if (have){
    const g = sc/sp; let moved = 0;   // an overall brightness change (auto exposure, projector flicker) isn't movement
    for (let y=R.y0; y<=R.y1; y+=2) for (let x=R.x0+((y>>1)&1); x<=R.x1; x+=2){
      const i = y*pw+x; if (!valid[i]) continue; const c = Cu[i]; if (Math.abs(c - g*P[i]) > Math.max(18, 0.15*c)) moved++;
    }
    frac = moved/cnt;
  }
  if (!have || rt - LIVE.lagT >= 0.25){ LIVE.prevL = Cu; LIVE.curL = P; LIVE.lagT = rt; }   // this frame becomes the one to compare with
  if (!have) return;
  // The projection changing (a new round, a score, a message) shows for at most a quarter second here; a person keeps
  // changing it. So use the smallest value over the last 0.3 s.
  const mr = LIVE.motionRaw; mr.push({t:rt, m:frac}); while (mr.length > 2 && rt - mr[0].t > 0.3) mr.shift();
  let mo = 1; for (const e of mr) if (e.m < mo) mo = e.m; LIVE.motion = mo;
  // Noise floor: what the sheet looks like when nothing is happening (sensor noise, flicker, a game animation).
  const mh = LIVE.motionHist, now = state.clock; mh.push({t:now, m:mo}); while (mh.length && now - mh[0].t > 6) mh.shift();
  if (LIVE.frameCount % 8 === 0 || mh.length < 4){ const srt = mh.map(e => e.m).sort((a,b) => a-b); LIVE.floor = srt[Math.floor(srt.length*0.2)] || 0; }
  LIVE.busy = mo - LIVE.floor > LIVE.busyThr;
  if (LIVE.busy) LIVE.busyAt = now;
}
function accumulateRef(){
  const d = LIVE.frame, n = d.length;
  if (!LIVE.refAcc || LIVE.refAcc.length !== n){ LIVE.refAcc = new Float32Array(n); LIVE.refN = 0; }
  const A = LIVE.refAcc; for (let i=0; i<n; i++) A[i] += d[i];
  if (++LIVE.refN >= LIVE.refWant){
    for (let i=0; i<n; i++) A[i] /= LIVE.refN;
    LIVE.ref = A; LIVE.refAcc = null; LIVE.refPw = LIVE.pw; LIVE.refPh = LIVE.ph; LIVE.refAt = state.clock; LIVE.refWant = 0; LIVE.refN = 0;
  }
}

// ---- per-frame work ----
function lumaArray(){
  const d = LIVE.frame, n = LIVE.pw*LIVE.ph, L = new Float32Array(n);
  for (let i=0, k=0; i<n; i++, k+=4) L[i] = 0.299*d[k] + 0.587*d[k+1] + 0.114*d[k+2];
  return L;
}
function nextFrames(n){ return new Promise(res => LIVE.waiters.push({n, acc:null, got:0, res})); }
function feedWaiters(){
  if (!LIVE.waiters.length) return;
  const L = lumaArray();
  for (const w of LIVE.waiters){ if (!w.acc) w.acc = new Float32Array(L.length); for (let i=0;i<L.length;i++) w.acc[i] += L[i]; w.got++; }
  LIVE.waiters = LIVE.waiters.filter(w => { if (w.got >= w.n){ for (let i=0;i<w.acc.length;i++) w.acc[i] /= w.got; w.res(w.acc); return false; } return true; });
}
function processFrame(){
  const tf = performance.now();
  if (!grabFrame()) return;
  feedWaiters();
  if (LIVE.flash) checkFlash();
  if (LIVE.Hcs) measureMotion();
  if (LIVE.refWant){ if (LIVE.busy && !LIVE.refForce){ LIVE.refAcc = null; LIVE.refN = 0; LIVE.refWant = 0; } else accumulateRef(); }
  const res = LIVE.Hcs ? detectBall() : null;
  LIVE.det = res;
  const b = res && res.best;
  LIVE.stats.frames++; if (b) LIVE.stats.hits++;
  LIVE.seenWin.push({t:tf, hit:!!b}); while (LIVE.seenWin.length && tf - LIVE.seenWin[0].t > 2000) LIVE.seenWin.shift();
  if (b){ LIVE.detT = state.clock; LIVE.lastSeen = state.clock; LIVE.hist.push({x:b.x, y:b.y, t:state.clock}); if (LIVE.hist.length > 40) LIVE.hist.shift(); }
  if (LIVE.sweep) LIVE.sweep.frames.push(b ? {x:b.x, y:b.y} : null);
  if (LIVE.on && LIVE.state === 'ready' && state.clock - LIVE.readyAt <= 0.6 && res){
    for (const bl of res.blobs) if (!bl.rejected && !LIVE.bg.some(p => Math.hypot(p.x-bl.x, p.y-bl.y) < 0.3)) LIVE.bg.push({x:bl.x, y:bl.y});
  }
  if (LIVE.on) liveStep(b);
  if (LIVE.panel) drawPreview();
  if (LIVE.dbg) updateDbgMask();
  const ms = performance.now() - tf; LIVE.frameMs = LIVE.frameMs ? LIVE.frameMs*0.9 + ms*0.1 : ms;
}

// ---- shot flow: ready -> rolling -> stopped -> collect -> ready ----
function liveStep(b){
  const t = state.clock - LIVE.latency, weak = !!(LIVE.det && LIVE.det.weak), ref = !!(LIVE.det && LIVE.det.ref);
  const jump = (p, q) => Math.hypot(q.x-p.x, q.y-p.y) > clamp(10*(q.t-p.t)+0.35, 0.5, 3);   // farther than a ball can roll
  if (LIVE.state === 'arming'){
    // Someone may putt before the round has its new empty-sheet photo. Last round's photo still shows a ball rolling in;
    // a spot that just sits there is part of the new round's picture, and the new photo absorbs it.
    if (!ref || !b || LIVE.busy){ if (LIVE.busy) LIVE.armTrack = []; return; }
    const tr = LIVE.armTrack, q = {x:b.x, y:b.y, t, weak};
    if (tr.length && jump(tr[tr.length-1], q)) tr.length = 0;
    tr.push(q); while (tr.length && t - tr[0].t > 1.5) tr.shift();
    if (tr.length >= 3 && mode === 'aim'){
      const f = tr[0], l = tr[tr.length-1];
      if (Math.hypot(l.x-f.x, l.y-f.y) > 2/12 && (LIVE.startZone === 'anywhere' || (f.y > D - Math.max(1.5, D*0.5) && l.y - f.y < -1/12))){
        llog('Ball rolled in while the round was still setting up'); goReady(true); LIVE.stats.moveStarts++; beginLiveShot(tr.slice(), false);
      }
    }
    return;
  }
  if (LIVE.state === 'ready'){
    if (mode !== 'aim'){ LIVE.cand = []; return; }
    if (!ref){   // color only: first learn what's already on the sheet
      if (state.clock - LIVE.readyAt < 0.6) return;
      if (!LIVE.bgLogged){ LIVE.bgLogged = true; if (LIVE.bg.length) llog(`Ignoring ${plural(LIVE.bg.length, 'ball-colored spot')} already on the sheet`); }
    }
    // Movement guard: while someone is on the sheet (a hand, a head, a whole person), nothing starts a shot.
    if (LIVE.busy){
      LIVE.cand = [];
      if (state.clock - LIVE.lastBusyLog > 6){ LIVE.lastBusyLog = state.clock; llog(`Movement on the sheet (${(LIVE.motion*100).toFixed(1)}% changing), so no shot can start until it’s still`); }
      return;
    }
    const c = LIVE.cand;
    if (!b){ if (c.length && t - c[c.length-1].t > 0.4) LIVE.cand = []; return; }   // short gaps are normal while a ball smears
    const q = {x:b.x, y:b.y, t, weak};
    if (c.length && jump(c[c.length-1], q)) c.length = 0;   // two different things seen: start over from the newer one
    c.push(q); while (c.length && t - c[0].t > 1.5) c.shift();
    if (c.length < 2) return;
    const f = c[0], l = c[c.length-1], moved = Math.hypot(l.x-f.x, l.y-f.y) > (c.some(p => p.weak) ? 1.5 : 0.6)/12;
    // 1) A moving ball starts a shot. From the tee edge it must be first seen in the half of the sheet nearest the tee
    //    and be heading away from it, so a player carrying the ball around (or back to the tee) never starts one.
    //    Loose (smeared) sightings only count once a clear one confirms them; they then fill in the start of the path.
    const fromTee = f.y > D - Math.max(1.5, D*0.5) && l.y - f.y < -0.4/12;
    if (moved && c.some(p => !p.weak) && (LIVE.startZone === 'anywhere' || fromTee)){ LIVE.stats.moveStarts++; beginLiveShot(c, false); return; }
    // 2) A ball that turns up already at rest also counts: the roll was missed, but where it stopped is what most games score.
    //    Only a clear match counts here, never the loose one used for smeared balls.
    if (l.t - f.t >= LIVE.rest.t + 0.2 && c.every(p => !p.weak)){
      const mx = avg(c.map(p => p.x)), my = avg(c.map(p => p.y));
      if (c.every(p => Math.hypot(p.x-mx, p.y-my) <= LIVE.rest.r/12)){
        LIVE.stats.restStarts++; beginLiveShot(c, true);
        llog('The roll wasn’t seen, only the ball at rest. If this keeps happening, shorten the exposure time' + (ref ? '.' : ' or widen the color match.'));
        LIVE.restAt = {x:mx, y:my}; endLiveShot();
      }
    }
    return;
  }
  if (LIVE.state === 'rolling'){
    if (b){ LIVE.miss = 0; addLiveSample({x:b.x, y:b.y, t}); if (liveAtRest()) endLiveShot(); }
    else {
      LIVE.miss += 1/Math.max(10, LIVE.camFps || 30);
      if (LIVE.miss > 0.7){
        const l = LIVE.samples[LIVE.samples.length-1];
        const near = l && (l.x < 0.4 || l.x > W-0.4 || l.y < 0.4 || l.y > D-0.4);
        if (near || LIVE.miss > 2){
          const S2 = LIVE.samples, k = S2.length-1; let j = k; while (j > 0 && S2[k].t - S2[j].t < 0.25) j--;
          const sp = k > j ? Math.hypot(S2[k].x-S2[j].x, S2[k].y-S2[j].y)/Math.max(0.05, S2[k].t-S2[j].t) : 0;
          const seen = LIVE.det ? `${LIVE.det.count} px matched, ${LIVE.det.blobs.length} blobs${LIVE.det.note ? ', ' + LIVE.det.note : ''}` : 'no frame';
          if (!near && sp < 0.7){ llog(`Lost sight of a slow ball mid-sheet (${seen}); scoring its last position`); LIVE.restAt = {x:l.x, y:l.y}; finishLive(LIVE.restAt, null); }
          else { llog(near ? `Ball left the sheet near ${l.x.toFixed(2)}, ${l.y.toFixed(2)} ft` : `Lost the ball for 2 s while moving ${sp.toFixed(1)} ft/s (${seen})`); finishLive(null, l && l.y > D*0.8 ? 'back' : 'off'); }
        }
      }
    }
  }
}
// Each round starts by waiting for a still sheet, then (comparing to the empty sheet) takes its photo of it.
function armReady(){
  LIVE.state = 'arming'; LIVE.armAt = state.clock; LIVE.cand = []; LIVE.hist = []; LIVE.armTrack = []; LIVE.armNote = false;
  LIVE.refWant = 0; LIVE.refAcc = null; LIVE.refN = 0; LIVE.refForce = false;
}
function goReady(keepRef){
  if (keepRef){ LIVE.refWant = 0; LIVE.refAcc = null; LIVE.refN = 0; }
  LIVE.state = 'ready'; LIVE.cand = []; LIVE.hist = []; LIVE.readyAt = state.clock; LIVE.bg = []; LIVE.bgLogged = false;
  llog(keepRef ? 'Ready, using the last empty-sheet photo' : 'Ready for the next putt');
}
function armTick(){
  const since = state.clock - LIVE.armAt, calm = state.clock - LIVE.busyAt >= 0.6, settle = Math.max(0.5, LIVE.latency + 0.35);
  if (since < settle) return;   // let the new round's picture reach the camera first
  if (LIVE.method !== 'ref'){ if (calm || since > 6) goReady(); return; }
  if (LIVE.refAt > LIVE.armAt && !LIVE.refWant){ goReady(); return; }
  if (!LIVE.refWant && (calm || since > 6)){
    if (!calm && !LIVE.armNote){ LIVE.armNote = true; llog(`The sheet never looked still (${(LIVE.motion*100).toFixed(1)}% changing, usual ${(LIVE.floor*100).toFixed(1)}%). Took the empty-sheet photo anyway. If this repeats, raise Movement guard.`); }
    LIVE.refForce = !calm; LIVE.refWant = 3; LIVE.refAcc = null; LIVE.refN = 0;
  }
}
function beginLiveShot(c, atRest){
  shot = newShot(); shot.info = {live:true}; LIVE.samples = []; LIVE.prev = null; LIVE.miss = 0;
  mode = 'roll'; LIVE.state = 'rolling'; kb.active = false;
  if (game.onShotStart) game.onShotStart();
  llog(atRest ? `Ball found at rest at ${c[0].x.toFixed(2)}, ${c[0].y.toFixed(2)} ft` : `Ball rolling in at ${c[0].x.toFixed(2)}, ${c[0].y.toFixed(2)} ft`);
  for (const s of c) addLiveSample(s);
  setHint(); updateShotInfo();
}
function addLiveSample(s){
  LIVE.samples.push(s); if (LIVE.samples.length > 600) LIVE.samples.shift();
  const prev = LIVE.prev && s.t - LIVE.prev.t < 0.35 ? LIVE.prev : null;
  if (game.onSample) game.onSample(s, prev);
  shot.delivered.push(s); LIVE.prev = s;
}
function liveAtRest(){
  const S2 = LIVE.samples, n = S2.length; if (n < 3) return false;
  const tEnd = S2[n-1].t; if (tEnd - S2[0].t < LIVE.rest.t) return false;
  let i = n-1; while (i > 0 && tEnd - S2[i-1].t <= LIVE.rest.t) i--;
  const win = S2.slice(i), mx = win.reduce((a,s)=>a+s.x,0)/win.length, my = win.reduce((a,s)=>a+s.y,0)/win.length;
  const r = LIVE.rest.r/12;
  return win.length >= 3 && win.every(s => Math.hypot(s.x-mx, s.y-my) <= r) ? (LIVE.restAt = {x:mx, y:my}, true) : false;
}
function endLiveShot(){ const p = LIVE.restAt; llog(`Stopped at ${p.x.toFixed(2)}, ${p.y.toFixed(2)} ft after ${plural(LIVE.samples.length, 'camera sighting')}`); finishLive(p, null); }
function finishLive(p, why){
  shot.rest = p; shot.why = why; readAt = state.clock; mode = 'read'; LIVE.state = 'stopped'; setHint();
}
function liveTick(){
  if (!LIVE.src) return;
  if (LIVE.src === 'sim'){ const now = performance.now(); if (proj && now - simCam.last > 33){ simCam.last = now; if (simRender()){ LIVE.newFrame = true; noteCamFrame(); } } }
  if (LIVE.newFrame){ LIVE.newFrame = false; processFrame(); }
  if (!LIVE.on) return;
  if (LIVE.state === 'stopped' && (mode === 'result' || mode === 'over')){ LIVE.state = 'collect'; LIVE.resultAt = state.clock; }
  if (LIVE.state === 'arming'){ if (mode === 'aim') armTick(); else { LIVE.state = 'collect'; LIVE.resultAt = state.clock - 2.5; } }
  if (LIVE.state === 'collect'){
    /*SIM*/if (LIVE.src === 'sim' && !LIVE.simManual && state.clock - LIVE.resultAt > 1.5 && ball.visible && !ball.moving){ ball.visible = false; }/*/SIM*/
    const gone = state.clock - LIVE.lastSeen;
    // the ball must be gone and the sheet still (the player has walked off), or the ball gone for a good while
    const still = state.clock - LIVE.busyAt > 0.8 || gone > LIVE.clearT + 6;
    if (state.clock - LIVE.resultAt > 2.5 && gone > LIVE.clearT && still){
      if (mode === 'result'){ advance(); if (mode === 'over'){ LIVE.resultAt = state.clock; llog('Hole complete'); } }
      else if (mode === 'over' && state.clock - LIVE.resultAt > 6){ startGame(); llog('New game'); }
      if (mode === 'aim'){ armReady(); llog('Sheet clear; setting up the next round'); }
    }
  }
}
function startLivePlay(){
  if (!LIVE.src){ llog('Start the camera first'); return false; }
  if (!LIVE.Hcs){ llog('Calibrate first'); return false; }
  if (!proj) enterProj();
  LIVE.on = true; LIVE.resultAt = state.clock; if (mode === 'aim') armReady(); else LIVE.state = 'collect';
  S.input = 'putt'; refreshProjBar();
  llog('Tracking on'); return true;
}
function stopLivePlay(why){ if (!LIVE.on) return; LIVE.on = false; LIVE.state = 'off'; if (mode === 'roll' || mode === 'read'){ mode = 'aim'; shot = null; } llog(why || 'Tracking paused'); setHint(); }

// ---- virtual ball for the simulated camera (the real ball replaces it on the rig) ----
function launchVirtual(angle, frac){
  const sk = SKILLS[S.skill], d = Math.max(0.05, frac*maxRoll()*(1+gauss()*sk.d)), ang = angle + gauss()*sk.a*Math.PI/180;
  const v = Math.sqrt(2*rollDecel()*d);
  resetBall(); ball.vx = Math.cos(ang)*v; ball.vy = Math.sin(ang)*v; ball.moving = true;
}
function vPhysics(dt){
  const b = ball; let ax = 0, ay = 0;
  if ((bumps.length || tilt.x || tilt.y) && onSheet(b.x,b.y)){ const g = grad(b.x,b.y); ax = -SLOPE_K*g.x; ay = -SLOPE_K*g.y; }
  const aR = rollDecel(); let sp = Math.hypot(b.vx,b.vy);
  if (sp < 0.03 && Math.hypot(ax,ay) < aR){ b.vx = b.vy = 0; b.moving = false; return; }
  b.vx += ax*dt; b.vy += ay*dt; sp = Math.hypot(b.vx,b.vy);
  if (sp > 0){ const ns = Math.max(0, sp-aR*dt); b.vx *= ns/sp; b.vy *= ns/sp; }
  b.x += b.vx*dt; b.y += b.vy*dt;
  if (S.rails && b.y <= D+BALL_R){
    if (b.x < BALL_R && b.x > -0.2){ b.x = BALL_R; b.vx = Math.abs(b.vx)*E_RAIL; b.vy *= F_RAIL; }
    else if (b.x > W-BALL_R && b.x < W+0.2){ b.x = W-BALL_R; b.vx = -Math.abs(b.vx)*E_RAIL; b.vy *= F_RAIL; }
    if (b.y < BALL_R){ b.y = BALL_R; b.vy = Math.abs(b.vy)*E_RAIL; b.vx *= F_RAIL; }
  }
  if (b.x < WORLD.x0-0.3 || b.x > WORLD.x1+0.3 || b.y < WORLD.y0-0.3 || b.y > WORLD.y1+0.3){ b.moving = false; b.visible = false; }
}

