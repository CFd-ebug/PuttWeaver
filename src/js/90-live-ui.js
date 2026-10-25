// ================= live ball tracking: calibration, camera, panel, debug =================
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lpNote = (id, msg, tone) => { const el = $(id); if (!el) return; el.textContent = msg || ''; el.dataset.tone = tone || ''; };
function setCalibrating(on){ stageSec.classList.toggle('calibrating', on); }
async function settleFrames(n){ await sleep(Math.max(300, LIVE.latency*1000 + 220)); LIVE.waiters = []; return nextFrames(n); }

// ---- geometric calibration: the projector shows dots one at a time, the camera finds each ----
function findDot(base, cur){
  const pw = LIVE.pw, ph = LIVE.ph; let mx = 0, mi = -1;
  for (let i=0; i<cur.length; i++){ const d = cur[i]-base[i]; if (d > mx){ mx = d; mi = i; } }
  if (mx < 22) return null;
  const thr = mx*0.5, cx = mi % pw, cy = (mi-cx)/pw, R = Math.max(4, Math.round(pw*0.05));
  let sw = 0, sx = 0, sy = 0, n = 0;
  for (let y=Math.max(0,cy-R); y<Math.min(ph,cy+R+1); y++) for (let x=Math.max(0,cx-R); x<Math.min(pw,cx+R+1); x++){
    const d = cur[y*pw+x]-base[y*pw+x]; if (d >= thr){ const w = d-thr+1; sw += w; sx += w*(x+0.5); sy += w*(y+0.5); n++; }
  }
  return sw && n >= 2 ? {u:sx/sw/pw, v:sy/sw/ph, peak:mx, n} : null;
}
function fitWithRejection(pts){
  let use = pts.slice(), H = null, res = [];
  for (let it=0; it<3; it++){
    H = homFit(use.map(p => p.cam), use.map(p => p.sheet)); if (!H) return null;
    res = use.map(p => { const [x,y] = homApply(H, p.cam[0], p.cam[1]); return Math.hypot(x-p.sheet[0], y-p.sheet[1])*12; });
    const worst = Math.max(...res), wi = res.indexOf(worst);
    if (worst > 1.5 && use.length > 5){ llog(`Dropped a dot that was ${worst.toFixed(1)} in off`); use.splice(wi, 1); } else break;
  }
  return {H, use, res};
}
const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
async function runCalibration(){
  if (!LIVE.src){ lpNote('lpCalNote', 'Start the camera first.', 'bad'); return; }
  if (!proj) enterProj();
  projTest = false; stopLivePlay('Calibrating'); setCalibrating(true); lpNote('lpCalNote', 'Calibrating… keep the camera still.');
  llog('Calibration started');
  try {
    LIVE.calib = {phase:'black'}; const base = await settleFrames(4);
    const grid = [], pts = [];
    for (const fy of [0.1, 0.5, 0.9]) for (const fx of [0.07, 0.5, 0.93]) grid.push([fx*W, fy*D]);
    for (const fx of [0.28, 0.72]) for (const fy of [0.3, 0.7]) grid.push([fx*W, fy*D]);
    for (const g of grid){
      LIVE.calib = {phase:'dot', p:g}; const cur = await settleFrames(2); const f = findDot(base, cur);
      if (f) pts.push({cam:[f.u, f.v], sheet:g}); else llog(`Dot at ${g[0].toFixed(1)}, ${g[1].toFixed(1)} ft not seen`);
    }
    LIVE.calib = null;
    if (pts.length < 4){ lpNote('lpCalNote', `Only ${pts.length} of ${grid.length} dots were seen. Check that the camera can see the whole projection, then try again.`, 'bad'); llog('Calibration failed'); return; }
    const fit = fitWithRejection(pts);
    if (!fit){ lpNote('lpCalNote', 'The dots didn’t form a usable pattern. Move the camera so it sees the projection more squarely.', 'bad'); return; }
    setCal({Hcs:fit.H, n:fit.use.length, of:grid.length, fitAvg:avg(fit.res), fitMax:Math.max(...fit.res), at:Date.now(), W, D, src:LIVE.src, label:LIVE.label, pin:!!LIVE.pin});
    llog(`Calibrated with ${fit.use.length} of ${grid.length} dots: ${avg(fit.res).toFixed(2)} in average fit`);
    await checkAccuracy(true);
  } finally { LIVE.calib = null; setCalibrating(false); renderLiveStatus(); }
}
async function checkAccuracy(inner){
  if (!LIVE.Hcs){ lpNote('lpCalNote', 'Calibrate first.', 'bad'); return; }
  if (!inner){ stopLivePlay('Checking accuracy'); setCalibrating(true); }
  try {
    LIVE.calib = {phase:'black'}; const base = await settleFrames(3);
    const errs = [];
    for (let k=0; k<6; k++){
      const p = [rnd(0.15, 0.85)*W, rnd(0.15, 0.85)*D];
      LIVE.calib = {phase:'dot', p}; const cur = await settleFrames(2); const f = findDot(base, cur);
      if (f){ const [x,y] = homApply(LIVE.Hcs, f.u, f.v); errs.push(Math.hypot(x-p[0], y-p[1])*12); }
    }
    LIVE.calib = null;
    if (!errs.length){ lpNote('lpCalNote', 'No check dots were seen.', 'bad'); return; }
    LIVE.cal.checkAvg = avg(errs); LIVE.cal.checkMax = Math.max(...errs); liveSave();
    const good = LIVE.cal.checkMax < 1.5;
    lpNote('lpCalNote', `Accuracy check: ${LIVE.cal.checkAvg.toFixed(2)} in average, ${LIVE.cal.checkMax.toFixed(2)} in worst over ${errs.length} dots. ${good ? 'Good.' : 'Over 1.5 in: try the main 1× camera, a higher resolution, or a squarer view.'}`, good ? 'good' : 'bad');
    llog(`Accuracy check ${LIVE.cal.checkAvg.toFixed(2)} in avg, ${LIVE.cal.checkMax.toFixed(2)} in worst`);
  } finally { LIVE.calib = null; if (!inner) setCalibrating(false); renderLiveStatus(); }
}

// ---- delay: flash the sheet white and time how long until the camera sees it ----
function meanLuma(){
  const d = LIVE.frame; if (!d) return 0; let s = 0, n = 0;
  for (let i=0; i<LIVE.pw*LIVE.ph; i+=3){ if (LIVE.Hcs && !LIVE.valid[i]) continue; const k = i*4; s += 0.299*d[k] + 0.587*d[k+1] + 0.114*d[k+2]; n++; }
  return n ? s/n : 0;
}
function checkFlash(){ const f = LIVE.flash; if (f.drawnAt && !f.seenAt && meanLuma() > f.base + 30) f.seenAt = performance.now(); }
async function measureDelay(){
  if (!LIVE.src){ lpNote('lpCalNote', 'Start the camera first.', 'bad'); return; }
  if (!proj) enterProj();
  stopLivePlay('Measuring delay'); setCalibrating(true); const got = [];
  try {
    for (let k=0; k<5; k++){
      LIVE.calib = {phase:'black'}; await sleep(700); await nextFrames(1);
      LIVE.flash = {base:meanLuma(), drawnAt:null, seenAt:null}; LIVE.calib = {phase:'white'};
      const t0 = performance.now(); while (!LIVE.flash.seenAt && performance.now()-t0 < 1500) await sleep(5);
      if (LIVE.flash.seenAt) got.push(LIVE.flash.seenAt - LIVE.flash.drawnAt);
      LIVE.flash = null;
    }
  } finally { LIVE.calib = null; LIVE.flash = null; setCalibrating(false); }
  if (!got.length){ lpNote('lpCalNote', 'The camera never saw the flash. Is it pointed at the projection?', 'bad'); return; }
  got.sort((a,b)=>a-b); const med = got[Math.floor(got.length/2)];
  LIVE.latency = clamp(med/1000, 0.02, 0.6); liveSave();
  lpNote('lpCalNote', `Projector + camera delay: ${Math.round(med)} ms (median of ${got.length}). Path games use this to time each camera frame.`, 'good');
  llog(`Delay ${Math.round(med)} ms, from ${got.map(Math.round).join(', ')}`); renderLiveStatus();
}

// ---- ball color ----
const SAMPLE_AT = () => ({x:W*0.74, y:D*0.5});
const median = a => { if (!a.length) return 0; const b = a.slice().sort((x,y)=>x-y); return b[Math.floor(b.length/2)]; };
const pctl = (a, p) => { if (!a.length) return 0; const b = a.slice().sort((x,y)=>x-y); return b[Math.min(b.length-1, Math.floor(b.length*p))]; };
function fitColor(all){ // color-only match
  // keep only the dominant hue cluster, so a ring, shadow or nearby graphic can't skew the sample
  const bins = new Array(36).fill(0); for (const p of all) bins[Math.floor(p.h/10) % 36] += p.s*p.v;
  let pk = 0; for (let i=1; i<36; i++) if (bins[i] > bins[pk]) pk = i;
  const px = all.filter(p => Math.abs(((p.h - (pk*10+5) + 540) % 360) - 180) <= 30);
  if (px.length < 3) return false;
  let cs = 0, sn = 0; for (const p of px){ cs += Math.cos(p.h*Math.PI/180)*p.s; sn += Math.sin(p.h*Math.PI/180)*p.s; }
  let h = Math.atan2(sn, cs)*180/Math.PI; if (h < 0) h += 360;
  const dev = px.map(p => Math.abs(((p.h-h+540) % 360) - 180)).sort((a,b)=>a-b), p90 = dev[Math.floor(dev.length*0.9)];
  LIVE.color = {h:Math.round(h), dh:Math.round(clamp(p90*1.8+8, 16, 45)), s:+clamp(median(px.map(p=>p.s))*0.45, 0.15, 0.6).toFixed(2), v:+clamp(median(px.map(p=>p.v))*0.45, 0.12, 0.6).toFixed(2), sampled:true};
  return true;
}
function fitSig(rat){ // empty-sheet comparison: how much red, green and blue the ball keeps compared with the bare sheet
  if (rat.length < 3) return false;
  const bm = rat.map(r => r.bm), med = median(bm);
  LIVE.sig = {bm:+med.toFixed(3), q:+median(rat.map(r => r.q)).toFixed(3), m:+median(rat.map(r => r.m)).toFixed(3),
    cut:+clamp(Math.max(med*1.5 + 0.1, pctl(bm, 0.75) + 0.06), 0.25, 0.55).toFixed(2), sampled:true};
  return true;
}
function ratioOf(d, k, r0, g0, b0){
  const rr = (d[k]+4)/(r0+4), gr = (d[k+1]+4)/(g0+4), br = (d[k+2]+4)/(b0+4), mm = (rr+gr)/2;
  return mm > 0.2 && br < 0.6*mm ? {bm:br/mm, q:gr/rr, m:mm} : null;   // soaks up blue: ball, not sheet
}
function finishSample(rat, px, hsvPx, where){
  const okR = fitSig(rat), okC = fitColor(px.length >= 3 ? px : hsvPx);
  if (!okR && !okC){ lpNote('lpColorNote', `No ball found ${where}. Make sure it’s there and lit by the projector, then try again.`, 'bad'); llog('Ball sample failed'); return false; }
  liveSave(); syncLiveInputs(); renderLiveStatus();
  const g = LIVE.sig, c = LIVE.color, pc = v => Math.round(v*100) + '%';
  const a = okR ? `Ball sampled from ${rat.length} pixels. Against the bare sheet it reflects ${pc(g.m)} of the red and green light, and blue at only ${pc(g.bm)} of that level. Anything reflecting more than ${pc(g.cut)} is ignored.`
                : 'Couldn’t compare the ball with the bare sheet here, so the empty-sheet match keeps its defaults.';
  lpNote('lpColorNote', `${a} Color-only match: hue ${c.h}° ±${c.dh}°.`, okR ? 'good' : 'bad');
  llog(`Ball sample ${where}: ${okR ? `keeps ${pc(g.m)} red/green, blue ${pc(g.bm)} of that, limit ${pc(g.cut)}, green/red ${g.q.toFixed(2)} (${rat.length} px)` : 'empty-sheet comparison failed'} · hue ${c.h}° ±${c.dh}°`);
  return true;
}
async function sampleBall(){
  if (!LIVE.Hcs){ lpNote('lpColorNote', 'Calibrate first, so the page knows where the ring is in the camera view.', 'bad'); return; }
  const T = SAMPLE_AT();
  if (LIVE.src === 'sim'){ resetBall(); ball.x = T.x; ball.y = T.y; ball.visible = true; }
  LIVE.sampling = 'ball'; await sleep(450 + LIVE.latency*1000); await nextFrames(2);
  const d = LIVE.frame, inner = [], ring = [[],[],[]];
  for (let i=0; i<LIVE.pw*LIVE.ph; i++){
    const r = Math.hypot(LIVE.pixSX[i]-T.x, LIVE.pixSY[i]-T.y);
    if (r <= 0.27) inner.push(i); else if (r >= 0.38 && r <= 0.47){ const k = i*4; ring[0].push(d[k]); ring[1].push(d[k+1]); ring[2].push(d[k+2]); }
  }
  LIVE.sampling = false;
  if (LIVE.src === 'sim') resetBall();   // the virtual ball goes back to the tee, as a player would pick the real one up
  // the white disc around the ring shows what the sheet looks like here without the ball
  const wr = ring.map(median), rat = [], px = [], hsvPx = [];
  for (const i of inner){
    const k = i*4, hv = hsv(d[k], d[k+1], d[k+2]), dist = Math.hypot(LIVE.pixSX[i]-T.x, LIVE.pixSY[i]-T.y);
    const q = ring[0].length > 8 ? ratioOf(d, k, wr[0], wr[1], wr[2]) : null;
    if (q){ rat.push(q); px.push({h:hv[0], s:hv[1], v:hv[2]}); }
    if (dist <= 0.24 && hv[1] >= 0.3 && hv[2] >= 0.3) hsvPx.push({h:hv[0], s:hv[1], v:hv[2]});
  }
  finishSample(rat, px, hsvPx, 'in the ring');
}
function sampleAtPx(x, y){
  const d = LIVE.frame; if (!d) return; const rat = [], px = [], hsvPx = [];
  const ref = LIVE.ref && LIVE.refPw === LIVE.pw && LIVE.refPh === LIVE.ph ? LIVE.ref : null;
  for (let yy=Math.max(0,y-4); yy<Math.min(LIVE.ph,y+5); yy++) for (let xx=Math.max(0,x-4); xx<Math.min(LIVE.pw,x+5); xx++){
    const k = (yy*LIVE.pw+xx)*4, hv = hsv(d[k], d[k+1], d[k+2]);
    const q = ref ? ratioOf(d, k, ref[k], ref[k+1], ref[k+2]) : null;
    if (q){ rat.push(q); px.push({h:hv[0], s:hv[1], v:hv[2]}); }
    if (hv[1] >= 0.3 && hv[2] >= 0.3) hsvPx.push({h:hv[0], s:hv[1], v:hv[2]});
  }
  finishSample(rat, px, hsvPx, 'where you tapped');
}
async function runSweep(){
  if (!LIVE.Hcs){ lpNote('lpColorNote', 'Calibrate and sample the ball first.', 'bad'); return; }
  stopLivePlay('Background sweep'); const keep = gameIdx, out = [], T = SAMPLE_AT();
  lpNote('lpColorNote', 'Sweeping… leave the ball in the ring.');
  if (LIVE.src === 'sim'){ resetBall(); ball.x = T.x; ball.y = T.y; }
  LIVE.sampling = 'sweep'; $('livePanel').hidden = true;
  try {
    for (let i=0; i<GAMES.length; i++){
      gameIdx = i; startGame(); if (LIVE.src === 'sim'){ ball.x = T.x; ball.y = T.y; ball.visible = true; }
      await sleep(600); LIVE.sweep = {frames:[]}; await sleep(900);
      const fr = LIVE.sweep.frames; LIVE.sweep = null;
      const hits = fr.filter(Boolean), rate = fr.length ? hits.length/fr.length : 0;
      const mx = avg(hits.map(h=>h.x)), my = avg(hits.map(h=>h.y)), spread = hits.length ? Math.max(...hits.map(h => Math.hypot(h.x-mx, h.y-my)))*12 : 0;
      out.push(`${GAMES[i].name}: ${Math.round(rate*100)}%${hits.length ? `, wobble ${spread.toFixed(1)} in` : ''}`);
    }
  } finally { LIVE.sweep = null; LIVE.sampling = false; gameIdx = keep; startGame(); $('livePanel').hidden = !LIVE.panel; }
  const weak = out.filter(s => parseInt(s.split(': ')[1]) < 90);
  lpNote('lpColorNote', `Color-only detection with each game projected under the ball: ${out.join(' · ')}.` + (weak.length ? ' Games under 90% need a wider color match or different colors near the ball' + (LIVE.method === 'ref' ? ' if you use Color only. The empty-sheet comparison doesn’t depend on the color under the ball as much.' : '.') : ' All good.'), weak.length ? 'bad' : 'good');
  llog('Sweep ' + out.join(' · '));
}

// ---- camera ----
function camEnvProblem(){
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) return null;
  return `Chrome won’t let this page use the camera the way it was opened (opened as ${location.protocol}//, secure context: ${window.isSecureContext ? 'yes' : 'no'}). ` +
    'Try one of these: 1) In Chrome’s address bar, open the file by its path, for example file:///sdcard/Download/projector-putt-lab.html (Chrome may ask for file access). ' +
    '2) Serve it from the phone with any local web-server app and open http://localhost:PORT/projector-putt-lab.html, which Chrome treats as secure. ' +
    '3) Host it on your server over HTTPS. Until then, the simulated camera and recorded clips still work.';
}
function camErrorText(e){
  const n = e && e.name;
  if (n === 'NotAllowedError') return 'Camera permission is blocked. In Chrome, tap the icon to the left of the address, open Permissions, and allow Camera. Also check Android Settings › Apps › Chrome › Permissions › Camera. Then press Start camera again.';
  if (n === 'NotFoundError') return 'No camera matched. Pick a different camera in the list.';
  if (n === 'NotReadableError') return 'The camera is busy. Close other apps that use it, including the Camera app, and try again.';
  if (n === 'OverconstrainedError') return 'This camera can’t do that resolution. Pick a lower one.';
  if (n === 'SecurityError' || n === 'TypeError') return camEnvProblem() || `Camera blocked (${n}).`;
  return `Camera error: ${n || ''} ${e && e.message || e}`;
}
async function listCameras(){
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'), sel = $('lpDevice');
    sel.innerHTML = '<option value="">Rear camera (default)</option>' + devs.map((d,i) => `<option value="${esc(d.deviceId)}">${esc(d.label || `Camera ${i+1}`)}</option>`).join('');
    sel.value = devs.some(d => d.deviceId === LIVE.devId) ? LIVE.devId : '';
  } catch (e) {}
}
function stopSource(){
  stopLivePlay();
  if (LIVE.stream) LIVE.stream.getTracks().forEach(t => t.stop());
  const v = $('camVideo'); if (v){ v.pause(); v.srcObject = null; v.removeAttribute('src'); }
  LIVE.stream = null; LIVE.track = null; LIVE.src = null; LIVE.caps = {}; LIVE.frame = null; LIVE.camFps = 0;
  LIVE.ref = null; LIVE.refWant = 0; LIVE.prevL = null; LIVE.motionHist = []; LIVE.motionRaw = []; LIVE.motion = 0; LIVE.busy = false; LIVE.camTimes = []; LIVE.seenWin = []; LIVE.hud = null;
  resumeSave();
}
// Keeping the Host screen on: a ceiling-mounted phone must not dim or lock. A Host asks from the moment the page opens (not only
// once the camera is on), asks again whenever the page comes back to the front or the system took the lock away, and reports the
// result to the console. WAKE.why says why it is off.
const WAKE = {on: false, why: ''};
let wakeLockObj = null;
async function keepAwake(){
  if (!navigator.wakeLock){ WAKE.on = false; WAKE.why = 'this browser has no wake lock'; return; }
  if (wakeLockObj && !wakeLockObj.released && WAKE.on) return;
  try {
    const lock = await navigator.wakeLock.request('screen'); wakeLockObj = lock; WAKE.on = true; WAKE.why = '';
    lock.addEventListener('release', () => { if (wakeLockObj === lock){ WAKE.on = false; WAKE.why = 'released by the system'; } });
  } catch (e) { WAKE.on = false; WAKE.why = e.name || 'refused'; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (LIVE.src || ROLE === 'host')) keepAwake(); });
// What the Host was doing, so a phone that restarts (power cut, crash, reboot) gets back to work on its own. The camera and tracking
// switch on again only if they were on; "Camera off" from the console or the panel clears it. A calibration made with another
// camera is not trusted, so tracking waits for a new calibration.
const RESUME_KEY = 'putt-lab-resume';
function resumeSave(){
  if (ROLE !== 'host') return;
  try { localStorage.setItem(RESUME_KEY, JSON.stringify({cam: LIVE.src === 'camera', track: !!LIVE.on || (typeof REMOTE !== 'undefined' && REMOTE.holdResume)})); } catch (e) {}
}
async function resumeAfterRestart(){
  let r = null; try { r = JSON.parse(localStorage.getItem(RESUME_KEY) || 'null'); } catch (e) {}
  if (!r || !r.cam || LIVE.src) return;
  try {
    if (navigator.permissions && navigator.permissions.query){
      const p = await navigator.permissions.query({name: 'camera'});
      if (p.state === 'denied'){ llog('Camera not resumed after the restart: camera permission is blocked for this page'); return; }
    }
  } catch (e) {}
  llog('Phone restarted: switching the camera back on');
  if (!await startSource('camera')) return;
  if (!r.track) return;
  if (!LIVE.Hcs){ llog('Tracking not resumed: not calibrated'); return; }
  if (LIVE.cal && LIVE.cal.label && LIVE.cal.label !== LIVE.label){ llog('Tracking not resumed: the calibration was made with another camera'); return; }
  startLivePlay();
}
if (ROLE === 'host'){
  keepAwake();
  setInterval(() => { if (document.visibilityState === 'visible' && !WAKE.on) keepAwake(); }, 30000);
  setTimeout(resumeAfterRestart, 1500);
}
async function startSource(kind){
  stopSource(); lpNote('lpCamNote', '');
  if (kind === 'sim'){
    if (!proj) enterProj();
    if (!simRender()){ lpNote('lpCamNote', 'The simulated camera needs WebGL, which isn’t available here.', 'bad'); return false; }
    LIVE.src = 'sim'; LIVE.label = 'Simulated camera'; simCam.last = 0;
    llog('Simulated camera on. It watches the projection from an angle; drag to putt a virtual ball.');
    renderLiveStatus(); return true;
  }
  if (kind === 'file'){ $('lpFile').click(); return false; }
  const prob = camEnvProblem(); if (prob){ lpNote('lpCamNote', prob, 'bad'); llog('Camera unavailable: ' + location.protocol + ' page, secure=' + window.isSecureContext); return false; }
  const size = {640:[640,480], 1280:[1280,720], 1920:[1920,1080]}[LIVE.res] || [1280,720];
  const video = {width:{ideal:size[0]}, height:{ideal:size[1]}, frameRate:{ideal:60}};
  if (LIVE.devId) video.deviceId = {exact:LIVE.devId}; else video.facingMode = {ideal:'environment'};
  try {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({audio:false, video}); }
    catch (e) {
      if (LIVE.devId && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')){ LIVE.devId = ''; delete video.deviceId; video.facingMode = {ideal:'environment'}; stream = await navigator.mediaDevices.getUserMedia({audio:false, video}); }
      else throw e;
    }
    const v = $('camVideo'); LIVE.video = v; LIVE.stream = stream; LIVE.track = stream.getVideoTracks()[0];
    v.srcObject = stream; v.muted = true; v.playsInline = true; await v.play();
    LIVE.caps = LIVE.track.getCapabilities ? LIVE.track.getCapabilities() : {}; LIVE.settings = LIVE.track.getSettings ? LIVE.track.getSettings() : {};
    LIVE.label = LIVE.track.label || 'Camera'; LIVE.src = 'camera'; LIVE.lockNote = '';
    watchVideoFrames(); await listCameras(); buildCamControls(); keepAwake();
    llog(`Camera on: ${LIVE.label}, ${LIVE.settings.width}×${LIVE.settings.height} at ${LIVE.settings.frameRate ? Math.round(LIVE.settings.frameRate) : '?'} fps`);
    if (LIVE.cal && LIVE.cal.label !== LIVE.label) lpNote('lpCamNote', 'This calibration was made with a different camera. Calibrate again.', 'bad');
    resumeSave(); renderLiveStatus(); return true;
  } catch (e) { lpNote('lpCamNote', camErrorText(e), 'bad'); llog(`Camera failed: ${e.name}: ${e.message}`); renderLiveStatus(); return false; }
}
async function loadClip(file){
  stopSource(); const v = $('camVideo'); LIVE.video = v;
  v.srcObject = null; v.src = URL.createObjectURL(file); v.loop = true; v.muted = true; v.playsInline = true;
  try { await v.play(); } catch (e) { lpNote('lpCamNote', `Couldn’t play that clip (${e.name}).`, 'bad'); return; }
  LIVE.src = 'file'; LIVE.label = file.name; watchVideoFrames();
  llog(`Playing clip ${file.name} as the camera`); renderLiveStatus();
}
// the camera settings that can be changed live: label and how the value reads
const CAM_CTL = {zoom:['Zoom', v => `${(+v).toFixed(1)}×`], exposureTime:['Exposure time', v => `${(v/10).toFixed(1)} ms`], exposureCompensation:['Brightness', v => (+v).toFixed(1)]};
function camCtlRange(k){        // {min, max, step, v} for a control this camera has, otherwise null
  const c = (LIVE.caps || {})[k]; if (!c || !(c.max > c.min)) return null;
  let mx = c.max; if (k === 'exposureTime') mx = Math.min(mx, 500);   // over 50 ms only adds blur
  return {min:c.min, max:mx, step:c.step || 0.1, v:clamp((LIVE.settings || {})[k] ?? c.min, c.min, mx)};
}
async function setCamCtl(k, v){
  const adv = k === 'exposureTime' ? {exposureMode:'manual', exposureTime:+v} : {[k]: +v};
  try { await LIVE.track.applyConstraints({advanced:[adv]}); LIVE.settings = LIVE.track.getSettings(); } catch (e) { llog(`${k} change refused: ${e.name}`); }
}
function buildCamControls(){
  const c = LIVE.caps || {}, box = $('lpCamCtl'), rows = [];
  const can = k => Array.isArray(c[k]) && c[k].includes('manual');
  const CTL = CAM_CTL;
  for (const [k, [label, f]] of Object.entries(CTL)){
    const rg = camCtlRange(k);
    if (rg){
      const mx = rg.max, v = rg.v;
      rows.push(`<label class="lp-sl"><span>${label}</span><input type="range" id="lpCam-${k}" min="${c[k].min}" max="${mx}" step="${c[k].step || 0.1}" value="${v}"><b id="lpCam-${k}-v">${f(v)}</b></label>`);
    }
  }
  if (c.exposureTime) rows.push('<p class="lp-note">If a rolling ball isn’t seen, shorten the exposure time until the ball is crisp mid-roll. 8 ms or less usually works; the picture gets darker, which is fine. If the preview shows rolling stripes or flickering color, the shutter is beating against the projector: try exactly 8.3 or 16.7 ms.</p>');
  rows.push(`<p class="lp-note">Can lock: exposure ${can('exposureMode') ? 'yes' : 'no'}, white balance ${can('whiteBalanceMode') ? 'yes' : 'no'}, focus ${can('focusMode') ? 'yes' : 'no'}.${LIVE.lockNote ? ' ' + LIVE.lockNote : ''}</p>`);
  box.innerHTML = rows.join('');
  for (const [k, [, f]] of Object.entries(CTL)){
    const el = $(`lpCam-${k}`); if (!el) continue;
    el.addEventListener('input', () => { $(`lpCam-${k}-v`).textContent = f(+el.value); setCamCtl(k, el.value); });
  }
}
async function lockCamera(){
  const t = LIVE.track; if (!t || !t.getCapabilities){ lpNote('lpCamNote', LIVE.src === 'camera' ? 'This browser can’t control the camera settings.' : 'Only the phone camera has settings to lock.', 'bad'); return; }
  const c = t.getCapabilities(), st = t.getSettings(), done = [], failed = [];
  const tryOne = async (name, adv) => { try { await t.applyConstraints({advanced:[adv]}); done.push(name); } catch (e) { failed.push(name); } };
  if ((c.exposureMode||[]).includes('manual')) await tryOne('exposure', Object.assign({exposureMode:'manual'}, st.exposureTime ? {exposureTime:st.exposureTime} : {}));
  if ((c.whiteBalanceMode||[]).includes('manual')) await tryOne('white balance', Object.assign({whiteBalanceMode:'manual'}, st.colorTemperature ? {colorTemperature:st.colorTemperature} : {}));
  if ((c.focusMode||[]).includes('manual')) await tryOne('focus', Object.assign({focusMode:'manual'}, st.focusDistance != null ? {focusDistance:st.focusDistance} : {}));
  LIVE.lockNote = done.length ? `Locked: ${done.join(', ')}.` : 'Nothing could be locked on this camera.';
  if (failed.length) LIVE.lockNote += ` Refused: ${failed.join(', ')}.`;
  LIVE.settings = t.getSettings(); buildCamControls(); llog(LIVE.lockNote);
}
async function recordClip(){
  const btn = $('lpRec'), stream = LIVE.src === 'sim' && simCam.canvas ? simCam.canvas.captureStream(30) : LIVE.stream;
  if (!stream || !window.MediaRecorder){ lpNote('lpCamNote', 'Recording needs the phone camera or the simulated camera running.', 'bad'); return; }
  const type = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, type ? {mimeType:type, videoBitsPerSecond:6e6} : undefined), chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    const blob = new Blob(chunks, {type: type.split(';')[0] || 'video/webm'}), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `putt-lab-clip-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
    document.body.appendChild(a); a.click(); a.remove(); btn.textContent = 'Record 15 s clip'; btn.disabled = false;
    llog(`Saved a ${(blob.size/1e6).toFixed(1)} MB clip`);
  };
  rec.start(500); btn.disabled = true; llog('Recording a 15 s clip');
  for (let s=15; s>0; s--){ btn.textContent = `Recording… ${s}`; await sleep(1000); }
  rec.stop();
}

// ---- report for debugging ----
function liveReport(){
  const c = LIVE.cal, st = LIVE.settings || {}, f = LIVE.stats, b = LIVE.det && LIVE.det.best;
  const lines = [
    'Projector Putt Lab · live tracking report', new Date().toString(), '',
    `Page: ${location.protocol}// · secure context ${window.isSecureContext ? 'yes' : 'no'} · camera API ${navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? 'yes' : 'no'}`,
    `Browser: ${navigator.userAgent}`,
    `Screen: ${innerWidth}×${innerHeight} at ${devicePixelRatio}x · projector mode ${proj ? 'on' : 'off'} · corner fit ${LIVE.pin ? 'on' : 'off'}`,
    `Sheet: ${W} × ${+D.toFixed(2)} ft · game ${game.name} · mode ${mode} · tracking ${LIVE.on ? LIVE.state : 'off'}`,
    `Source: ${LIVE.src || 'none'} · ${LIVE.label || ''} · ${st.width || '?'}×${st.height || '?'} at ${st.frameRate ? (+st.frameRate).toFixed(0) : '?'} fps requested settings · measured ${LIVE.camFps.toFixed(1)} fps`,
    `Camera controls: ${Object.keys(LIVE.caps || {}).join(', ') || 'none reported'} · ${LIVE.lockNote || 'not locked'}`,
    `Processing: ${LIVE.pw}×${LIVE.ph} · ${LIVE.procMs.toFixed(1)} ms per frame · ball found in ${f.frames ? Math.round(f.hits/f.frames*100) : 0}% of ${f.frames} frames (${f.weak} by the loose match) · shots started ${f.moveStarts} while rolling, ${f.restStarts} at rest`,
    c ? `Calibration: ${c.n} of ${c.of} dots · fit ${c.fitAvg.toFixed(2)} in avg, ${c.fitMax.toFixed(2)} in worst · check ${c.checkAvg != null ? c.checkAvg.toFixed(2)+' in avg, '+c.checkMax.toFixed(2)+' in worst' : 'not run'} · ${new Date(c.at).toLocaleTimeString()} · camera→sheet ${c.Hcs.map(v=>+v.toPrecision(6)).join(', ')}` : 'Calibration: none',
    `Ball color: hue ${LIVE.color.h}° ±${LIVE.color.dh}° · sat ≥ ${LIVE.color.s} · bright ≥ ${LIVE.color.v} · ${LIVE.color.sampled ? 'sampled' : 'default'} · expected ball area at center ${LIVE.Hsc && LIVE.pw ? expectedArea(W/2, D/2).toFixed(1) : '?'} px`,
    `Detection: ${LIVE.method === 'ref' ? 'compare to empty sheet' : 'color only'} · ball keeps ${LIVE.sig.m} of red/green, blue ${LIVE.sig.bm} of that, limit ${LIVE.sig.cut}, green/red ${LIVE.sig.q} · ${LIVE.sig.sampled ? 'sampled' : 'default'} · empty-sheet photo ${LIVE.ref ? (state.clock - LIVE.refAt).toFixed(1) + ' s old' : 'none'}`,
    `Movement guard: ${(LIVE.busyThr*100).toFixed(1)}% · now ${(LIVE.motion*100).toFixed(1)}% changing, usual ${(LIVE.floor*100).toFixed(1)}% · ${LIVE.busy ? 'moving' : 'still'}`,
    `Rates: display ${rateOf(LIVE.rafTimes).toFixed(1)} fps · camera ${rateOf(LIVE.camTimes).toFixed(1)} fps · analyzed ${LIVE.camFps.toFixed(1)} fps · ${LIVE.frameMs.toFixed(1)} ms per analyzed frame`,
    `Last detection: ${b ? `${b.x.toFixed(2)}, ${b.y.toFixed(2)} ft, area ${b.area} px (expected ${b.exp.toFixed(1)}), fill ${b.fill.toFixed(2)}, aspect ${b.aspect.toFixed(1)}${LIVE.det.weak ? ', loose match' : ''}` : 'none'} · ${LIVE.det ? `${LIVE.det.count} matching px, ${LIVE.det.blobs.length} blobs${LIVE.det.note ? ', ' + LIVE.det.note : ''}` : ''}`,
    `Shot rules: still ${LIVE.rest.t} s within ${LIVE.rest.r} in · sheet clear ${LIVE.clearT} s · start ${LIVE.startZone} · delay ${Math.round(LIVE.latency*1000)} ms`,
    '', 'Log:'
  ];
  const t0 = LIVE.log.length ? LIVE.log[0].t : 0;
  for (const e of LIVE.log.slice(-120)) lines.push(`${((e.t-t0)/1000).toFixed(1).padStart(7)} s  ${e.msg}`);
  return lines.join('\n');
}
function copyReport(){
  const text = liveReport(), ta = $('lpReportText');
  const fallback = () => { ta.hidden = false; ta.value = text; ta.focus(); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) {} lpNote('lpDbgNote', ok ? 'Report copied.' : 'Copying is blocked here. The report is selected below, so press Ctrl+C.', ok ? 'good' : 'bad'); };
  try { navigator.clipboard.writeText(text).then(() => { ta.hidden = true; lpNote('lpDbgNote', 'Report copied to the clipboard.', 'good'); }, fallback); } catch (e) { fallback(); }
}
function saveReport(){
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([liveReport()], {type:'text/plain'}));
  a.download = `putt-lab-report-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.txt`; document.body.appendChild(a); a.click(); a.remove();
  lpNote('lpDbgNote', 'Report saved to Downloads.', 'good');
}
window.addEventListener('error', e => llog(`Script error: ${e.message} (line ${e.lineno})`));
window.addEventListener('unhandledrejection', e => llog(`Script error: ${e.reason && e.reason.message || e.reason}`));

// ---- drawing on the projection ----
function drawLiveOverlay(){
  if (LIVE.calib){
    const ph = LIVE.calib.phase;
    ctx.fillStyle = ph === 'white' ? '#ffffff' : '#000000'; ctx.fillRect(-1, -1, W+2, D+2);
    if (ph === 'white' && LIVE.flash && !LIVE.flash.drawnAt) LIVE.flash.drawnAt = performance.now();
    if (ph === 'dot'){ circle(LIVE.calib.p[0], LIVE.calib.p[1], 0.16*K); ctx.fillStyle = '#ffffff'; ctx.fill(); }
    return;
  }
  if (LIVE.sampling){
    const T = SAMPLE_AT();
    if (LIVE.sampling !== 'ball'){ ctx.lineWidth = 0.02*K; ctx.strokeStyle = '#7a7a7a'; circle(T.x, T.y, 0.32); ctx.stroke(); }   // the ball sample draws its target under the ball
    txt('PLACE THE BALL HERE', T.x, T.y - (LIVE.sampling === 'ball' ? 0.6 : 0.45), 0.075*K, {font:'display', color:'#333333', halo:'rgba(255,255,255,0.9)'});
  }
  if (LIVE.mark && LIVE.src && !LIVE.sampling && !(LIVE.on && LIVE.state === 'arming')){   // never in the empty-sheet photo
    const hs = LIVE.hist.filter(h => state.clock - h.t < 1.2);
    ctx.fillStyle = 'rgba(35,67,214,0.35)'; for (const h of hs){ circle(h.x, h.y, 0.022*K); ctx.fill(); }
    if (state.clock - LIVE.detT < 0.3 && LIVE.det && LIVE.det.best){
      const b = LIVE.det.best; ctx.lineWidth = 0.022*K; ctx.strokeStyle = '#2343d6'; circle(b.x, b.y, 0.12*K); ctx.stroke();
      seg(b.x-0.2*K, b.y, b.x-0.13*K, b.y); ctx.stroke(); seg(b.x+0.13*K, b.y, b.x+0.2*K, b.y); ctx.stroke();
    }
  }
  if (LIVE.on){
    const hold = LIVE.busy && (LIVE.state === 'ready' || LIVE.state === 'arming');
    const lbl = hold ? 'HOLD ON · MOVEMENT ON THE SHEET' : {arming:'SETTING UP · KEEP THE SHEET CLEAR', ready:'READY · PUTT WHEN THE SHEET IS CLEAR', rolling:'TRACKING', stopped:'READING', collect: state.clock - LIVE.lastSeen > 0.5 ? 'NEXT UP…' : 'PICK UP YOUR BALL'}[LIVE.state] || '';
    if (ROLE === 'host' && !LIVE.dbg && !LIVE.fpsHud){            // players get the numbered banners; the status pill stays for debugging and for "hold on"
      flowDrawBanner();
      if (hold) pill(lbl, W/2, 0.28*K, 0.055*K, 'rgba(16,22,46,0.85)', '#ffffff', {font:'mono', weight:500});
    } else if (lbl) pill(lbl, W/2, 0.09*K, 0.055*K, 'rgba(16,22,46,0.85)', '#ffffff', {font:'mono', weight:500});
  }
  if (LIVE.dbg && LIVE.src && LIVE.sampling !== 'ball') drawDebug();
  if (LIVE.fpsHud) drawFpsHud();
}
// ---- frame-rate and tracking-health overlay ----
function toggleFpsHud(on){
  LIVE.fpsHud = on != null ? !!on : !LIVE.fpsHud; LIVE.hud = null; buildPixMap(); liveSave();
  const cb = $('lpFps'); if (cb) cb.checked = LIVE.fpsHud; refreshProjBar(); if (proj) wake();
}
function hudLines(){
  const now = performance.now();
  if (LIVE.hud && now - LIVE.hudAt < 500) return LIVE.hud;   // twice a second, so the numbers are readable
  LIVE.hudAt = now;
  const f = v => v >= 1 ? v.toFixed(0) : '–', sw = LIVE.seenWin, seen = sw.length ? Math.round(sw.filter(e => e.hit).length/sw.length*100) : 0;
  const lines = [`${f(rateOf(LIVE.rafTimes))} display · ${LIVE.src ? f(rateOf(LIVE.camTimes)) : '–'} camera · ${LIVE.src ? f(LIVE.camFps) : '–'} analyzed fps` + (LIVE.src ? ` · ${LIVE.frameMs.toFixed(0)} ms` : '')];
  if (!LIVE.src) lines.push('Camera off');
  else lines.push(`ball seen ${seen}% · ` + (LIVE.Hcs ? `${LIVE.busy ? 'MOVING' : 'still'} ${(LIVE.motion*100).toFixed(1)}%` : 'not calibrated') + ` · ${useRef() ? 'sheet match' : 'color match'} · ${LIVE.on ? LIVE.state : 'tracking off'}`);
  return (LIVE.hud = lines);
}
function drawFpsHud(){
  const r = hudRect(), pad = 0.025*K, lines = hudLines(), lh = (r.h - 2*pad)/2;
  rrect(r.x, r.y, r.w, r.h, 0.03*K); ctx.fillStyle = 'rgba(8,10,18,0.88)'; ctx.fill();
  lines.forEach((l, i) => txt(l, r.x + pad, r.y + pad + lh*(i+0.5), lh*0.68, {font:'mono', weight:500, align:'left', color: i ? '#c9d2e6' : '#ffffff', maxW:r.w - 2*pad, min:0}));
}
// ball sample target: a white disc (the bare sheet, for comparison) with a gray ring to aim the ball at
function drawSampleTarget(){
  const T = SAMPLE_AT(); circle(T.x, T.y, 0.5); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.lineWidth = 0.03; ctx.strokeStyle = '#7a7a7a'; circle(T.x, T.y, 0.32); ctx.stroke();
}
let dbgMaskCanvas = null;
function updateDbgMask(){
  if (!LIVE.mask || !LIVE.pw) return;
  if (!dbgMaskCanvas){ dbgMaskCanvas = document.createElement('canvas'); }
  if (dbgMaskCanvas.width !== LIVE.pw || dbgMaskCanvas.height !== LIVE.ph){ dbgMaskCanvas.width = LIVE.pw; dbgMaskCanvas.height = LIVE.ph; }
  const g = dbgMaskCanvas.getContext('2d'), img = g.createImageData(LIVE.pw, LIVE.ph), a = img.data, m = LIVE.mask, roi = LIVE.roi;
  if (roi) for (let y=roi.y0; y<=roi.y1; y++) for (let x=roi.x0; x<=roi.x1; x++){ const i = y*LIVE.pw+x; if (m[i]){ const k = i*4; a[k] = 255; a[k+1] = 40; a[k+2] = 110; a[k+3] = 230; } }
  g.putImageData(img, 0, 0);
}
function drawDebug(){
  const r = dbgRect(), pad = 0.05*K;
  rrect(r.x, r.y, r.w, r.h, 0.06*K); ctx.fillStyle = 'rgba(8,10,18,0.92)'; ctx.fill();
  if (LIVE.proc && LIVE.pw){
    let iw = r.w - 2*pad, ih = iw*LIVE.ph/LIVE.pw; if (ih > r.h*0.6){ ih = r.h*0.6; iw = ih*LIVE.pw/LIVE.ph; }
    const ix = r.x + (r.w-iw)/2, iy = r.y + pad;
    ctx.save(); ctx.filter = 'grayscale(1) brightness(0.75)'; ctx.drawImage(LIVE.proc, ix, iy, iw, ih); ctx.restore();
    if (dbgMaskCanvas) ctx.drawImage(dbgMaskCanvas, ix, iy, iw, ih);
    const toO = (px, py) => [ix + px/LIVE.pw*iw, iy + py/LIVE.ph*ih];
    if (LIVE.Hsc){
      ctx.strokeStyle = '#6f9bff'; ctx.lineWidth = 0.008*K; ctx.beginPath();
      [[0,0],[W,0],[W,D],[0,D]].forEach(([sx,sy], k) => { const [u,v] = toO(...camPx(sx, sy)); k ? ctx.lineTo(u,v) : ctx.moveTo(u,v); }); ctx.closePath(); ctx.stroke();
    }
    if (LIVE.det) for (const b of LIVE.det.blobs){ const [u,v] = toO(b.px, b.py); ctx.lineWidth = 0.008*K; ctx.strokeStyle = b === LIVE.det.best ? '#7dffb0' : '#ff9a9a'; circle(u, v, b === LIVE.det.best ? 0.05*K : 0.03*K); ctx.stroke(); }
  }
  const b = LIVE.det && LIVE.det.best, f = LIVE.stats, c = LIVE.cal;
  const lines = [
    `CAM ${LIVE.camFps.toFixed(1)} fps · ${LIVE.pw}×${LIVE.ph} · ${LIVE.procMs.toFixed(1)} ms`,
    `STATE ${LIVE.on ? LIVE.state.toUpperCase() : 'PAUSED'} · ${mode.toUpperCase()} · found ${f.frames ? Math.round(f.hits/f.frames*100) : 0}% · starts ${f.moveStarts} rolling, ${f.restStarts} at rest`,
    b ? `BALL ${b.x.toFixed(2)}, ${b.y.toFixed(2)} ft · ${b.area} px (exp ${b.exp.toFixed(0)})${LIVE.det.weak ? ' · loose match' : ''}` : `BALL none · ${LIVE.det ? LIVE.det.count : 0} px match${LIVE.det && LIVE.det.note ? ' · ' + LIVE.det.note : ''}`,
    c ? `CAL ${c.n} dots · check ${c.checkAvg != null ? c.checkAvg.toFixed(2) + ' in' : '—'} · DELAY ${Math.round(LIVE.latency*1000)} ms` : 'CAL none',
    `DETECT ${useRef() ? 'EMPTY SHEET' : 'COLOR'} · ${LIVE.busy ? 'MOVING' : 'still'} ${(LIVE.motion*100).toFixed(1)}% (usual ${(LIVE.floor*100).toFixed(1)}%) · photo ${LIVE.ref ? Math.max(0, state.clock - LIVE.refAt).toFixed(0) + ' s old' : 'none'}`,
    ...LIVE.log.slice(-4).map(e => '› ' + e.msg)
  ];
  const ty = r.y + r.h*0.6 + pad*1.6, lh = (r.h - (ty - r.y) - pad*0.5)/lines.length;
  lines.forEach((l, i) => txt(l, r.x+pad, ty + i*lh, Math.min(0.055*K, lh*0.75), {font:'mono', weight:500, align:'left', color: i < 5 ? '#e8ecf6' : '#9aa6c2', maxW:r.w-2*pad, min:0}));
}
function drawPreview(){
  const pc = $('lpPreview'); if (!pc || !LIVE.proc || !LIVE.pw) return;
  const w = pc.clientWidth || 320, h = Math.round(w*LIVE.ph/LIVE.pw);
  if (pc.width !== w || pc.height !== h){ pc.width = w; pc.height = h; }
  const g = pc.getContext('2d'); g.drawImage(LIVE.proc, 0, 0, w, h);
  if (LIVE.Hsc){ g.strokeStyle = '#6f9bff'; g.lineWidth = 2; g.beginPath(); [[0,0],[W,0],[W,D],[0,D]].forEach(([sx,sy],k) => { const [u,v] = camPx(sx, sy); const X = u/LIVE.pw*w, Y = v/LIVE.ph*h; k ? g.lineTo(X,Y) : g.moveTo(X,Y); }); g.closePath(); g.stroke(); }
  const b = LIVE.det && LIVE.det.best; if (b){ g.strokeStyle = '#2bff8a'; g.lineWidth = 2; g.beginPath(); g.arc(b.px/LIVE.pw*w, b.py/LIVE.ph*h, 7, 0, Math.PI*2); g.stroke(); }
}

// ---- panel ----
function renderLiveLog(){
  const ol = $('lpLog'); if (!ol || !LIVE.panel) return;
  const t0 = LIVE.log.length ? LIVE.log[0].t : 0;
  ol.innerHTML = LIVE.log.slice(-8).reverse().map(e => `<li><b>${((e.t-t0)/1000).toFixed(1)} s</b> ${esc(e.msg)}</li>`).join('');
}
function renderLiveStatus(){
  const box = $('lpStatus'); if (!box) return;
  const c = LIVE.cal, st = LIVE.settings || {};
  const rows = [
    ['Camera', LIVE.src === 'camera' ? `${LIVE.label} · ${st.width||'?'}×${st.height||'?'}` : LIVE.src === 'sim' ? 'Simulated camera' : LIVE.src === 'file' ? `Clip: ${LIVE.label}` : 'Off', LIVE.src ? 'ok' : 'no'],
    ['Projection', LIVE.pin ? 'Corners adjusted' : 'Square to the screen', 'ok'],
    ['Calibration', c ? `${c.n} dots · ${c.checkAvg != null ? `check ${c.checkAvg.toFixed(2)} in avg, ${c.checkMax.toFixed(2)} in worst` : `fit ${c.fitAvg.toFixed(2)} in`}` : 'Not calibrated', c ? (c.checkMax != null && c.checkMax > 1.5 ? 'warn' : 'ok') : 'no'],
    ['Ball', `${LIVE.method === 'ref' ? 'Empty-sheet match' : 'Color only'} · ${(LIVE.method === 'ref' ? LIVE.sig.sampled : LIVE.color.sampled) ? 'sampled' : 'not sampled yet'}`, (LIVE.method === 'ref' ? LIVE.sig.sampled : LIVE.color.sampled) ? 'ok' : 'warn'],
    ['Delay', `${Math.round(LIVE.latency*1000)} ms`, 'ok'],
    ['Tracking', LIVE.on ? `On · ${LIVE.state}` : 'Off', LIVE.on ? 'ok' : 'no']
  ];
  box.innerHTML = rows.map(([k, v, s]) => `<div class="lp-st" data-s="${s}"><span>${k}</span><b>${esc(v)}</b></div>`).join('');
  $('lpPlay').textContent = LIVE.on ? 'Pause tracking' : 'Start tracking';
}
function showLivePanel(on){
  LIVE.panel = on; $('livePanel').hidden = !on;
  if (on){ if (!proj) enterProj(); stopLivePlay('Tracking paused while the panel is open'); renderLiveStatus(); renderLiveLog(); syncLiveInputs(); }
}
const LIVE_SLIDERS = [
  ['lpHue', 'Hue width', 5, 60, 1, () => LIVE.color.dh, v => LIVE.color.dh = v, v => `±${v}°`],
  ['lpSat', 'Min saturation', 0.1, 0.9, 0.01, () => LIVE.color.s, v => LIVE.color.s = v, v => v.toFixed(2)],
  ['lpVal', 'Min brightness', 0.1, 0.9, 0.01, () => LIVE.color.v, v => LIVE.color.v = v, v => v.toFixed(2)],
  ['lpRestT', 'Still for', 0.3, 1.5, 0.05, () => LIVE.rest.t, v => LIVE.rest.t = v, v => `${v.toFixed(2)} s`],
  ['lpRestR', 'Within', 0.2, 2, 0.05, () => LIVE.rest.r, v => LIVE.rest.r = v, v => `${v.toFixed(2)} in`],
  ['lpClear', 'Sheet clear for', 0.5, 4, 0.1, () => LIVE.clearT, v => LIVE.clearT = v, v => `${v.toFixed(1)} s`],
  ['lpCut', 'Blue limit', 0.2, 0.7, 0.01, () => LIVE.sig.cut, v => LIVE.sig.cut = v, v => `${Math.round(v*100)}%`],
  ['lpGuard', 'Movement guard', 0.5, 10, 0.1, () => +(LIVE.busyThr*100).toFixed(1), v => LIVE.busyThr = v/100, v => `${v.toFixed(1)}%`]
];
function syncLiveInputs(){
  for (const [id, , , , , get, , f] of LIVE_SLIDERS){ const el = $(id); if (el){ el.value = get(); $(id+'-v').textContent = f(+get()); } }
  $('lpRes').value = String(LIVE.res); $('lpProc').value = String(LIVE.pwTarget); $('lpZone').value = LIVE.startZone;
  $('lpDbg').checked = LIVE.dbg; $('lpMark').checked = LIVE.mark; $('lpFps').checked = LIVE.fpsHud; $('lpMethod').value = LIVE.method;
}
function bindLivePanel(){
  for (const [id, label, mn, mx, step, , set, f] of LIVE_SLIDERS){
    const host = $(id+'-host'); if (!host) continue;
    host.innerHTML = `<label class="lp-sl" for="${id}"><span>${label}</span><input type="range" id="${id}" min="${mn}" max="${mx}" step="${step}"><b id="${id}-v"></b></label>`;
    $(id).addEventListener('input', () => { const v = +$(id).value; set(v); $(id+'-v').textContent = f(v); liveSave(); });
  }
  syncLiveInputs();
  $('lpStart').addEventListener('click', () => startSource($('lpSource').value));
  $('lpStop').addEventListener('click', () => { stopSource(); llog('Camera off'); renderLiveStatus(); });
  $('lpDevice').addEventListener('change', () => { LIVE.devId = $('lpDevice').value; liveSave(); if (LIVE.src === 'camera') startSource('camera'); });
  $('lpRes').addEventListener('change', () => { LIVE.res = +$('lpRes').value; liveSave(); if (LIVE.src === 'camera') startSource('camera'); });
  $('lpProc').addEventListener('change', () => { LIVE.pwTarget = +$('lpProc').value; liveSave(); });
  $('lpZone').addEventListener('change', () => { LIVE.startZone = $('lpZone').value; liveSave(); });
  $('lpFile').addEventListener('change', () => { const f = $('lpFile').files[0]; if (f) loadClip(f); $('lpFile').value = ''; });
  $('lpLock').addEventListener('click', lockCamera);
  $('lpCal').addEventListener('click', runCalibration);
  $('lpCheck').addEventListener('click', () => checkAccuracy(false));
  $('lpDelay').addEventListener('click', measureDelay);
  $('lpSample').addEventListener('click', sampleBall);
  $('lpSweep').addEventListener('click', runSweep);
  $('lpPlay').addEventListener('click', () => { if (LIVE.on){ stopLivePlay(); renderLiveStatus(); return; } if (startLivePlay()) showLivePanel(false); else lpNote('lpCalNote', LIVE.src ? 'Calibrate before tracking.' : 'Start the camera first.', 'bad'); renderLiveStatus(); });
  $('lpClose').addEventListener('click', () => showLivePanel(false));
  $('lpDbg').addEventListener('change', () => { LIVE.dbg = $('lpDbg').checked; buildPixMap(); });
  $('lpMark').addEventListener('change', () => { LIVE.mark = $('lpMark').checked; });
  $('lpFps').addEventListener('change', () => toggleFpsHud($('lpFps').checked));
  $('lpMethod').addEventListener('change', () => { LIVE.method = $('lpMethod').value; liveSave(); llog(LIVE.method === 'ref' ? 'Detection: compare to empty sheet' : 'Detection: color only'); renderLiveStatus(); });
  $('lpDbgMove').addEventListener('click', () => { LIVE.dbgCorner = LIVE.dbgCorner === 'tr' ? 'tl' : 'tr'; buildPixMap(); liveSave(); });
  $('lpRec').addEventListener('click', recordClip);
  $('lpCopy').addEventListener('click', copyReport);
  $('lpSave').addEventListener('click', saveReport);
  $('lpFit').addEventListener('click', () => toggleFit());
  $('lpRot').addEventListener('click', rotatePin);
  $('lpFitReset').addEventListener('click', resetPin);
  $('lpPreview').addEventListener('click', e => { if (!LIVE.pw) return; const r = $('lpPreview').getBoundingClientRect(); sampleAtPx(Math.round((e.clientX-r.left)/r.width*LIVE.pw), Math.round((e.clientY-r.top)/r.height*LIVE.ph)); });
  $('btnLive').addEventListener('click', () => showLivePanel(true));
}

// ---- projector corner fit: drag the four corners until the projected test card is a true rectangle ----
function rotatePin(){ if (!LIVE.pin) LIVE.pin = sheetCornersFrac(); LIVE.pin = [LIVE.pin[2], LIVE.pin[3], LIVE.pin[0], LIVE.pin[1]]; liveSave(); placeHandles(); llog('Projection rotated 180°; calibrate again'); renderLiveStatus(); }
function resetPin(){ LIVE.pin = null; if (LIVE.fitting) LIVE.pin = sheetCornersFrac(); liveSave(); placeHandles(); llog('Corner fit reset; calibrate again'); renderLiveStatus(); }
function setPinCorner(i, x, y){ if (!LIVE.pin) LIVE.pin = sheetCornersFrac(); LIVE.pin[i] = [clamp(x, -0.2, 1.2), clamp(y, -0.2, 1.2)]; placeHandles(); liveSave(); }
function toggleFit(force){
  LIVE.fitting = force != null ? force : !LIVE.fitting;
  if (LIVE.fitting && !LIVE.pin) LIVE.pin = sheetCornersFrac();
  projTest = LIVE.fitting;
  $('lpFit').textContent = LIVE.fitting ? 'Done adjusting' : 'Adjust corners';
  $('pinHandles').hidden = !LIVE.fitting; placeHandles();
  if (!LIVE.fitting){
    const id = sheetCornersFrac();
    if (LIVE.pin && LIVE.pin.every((p,i) => Math.hypot(p[0]-id[i][0], p[1]-id[i][1]) < 0.002)) LIVE.pin = null;
    liveSave(); llog(LIVE.pin ? 'Corner fit saved; calibrate again' : 'Corner fit unchanged'); renderLiveStatus();
  }
}
function placeHandles(){
  const box = $('pinHandles'); if (!box || box.hidden) return;
  const pts = LIVE.pin || sheetCornersFrac(), names = ['Top left','Top right','Bottom right','Bottom left'];
  if (!box.children.length) names.forEach((n, i) => {
    const h = document.createElement('div'); h.className = 'pin-h'; h.dataset.i = i; h.innerHTML = `<span>${n}</span>`; box.appendChild(h);
    h.addEventListener('pointerdown', e => { h.setPointerCapture(e.pointerId); h.dataset.drag = '1'; e.preventDefault(); });
    h.addEventListener('pointermove', e => { if (!h.dataset.drag) return; const r = box.getBoundingClientRect(); LIVE.pin[i] = [clamp((e.clientX-r.left)/r.width, -0.2, 1.2), clamp((e.clientY-r.top)/r.height, -0.2, 1.2)]; placeHandles(); });
    h.addEventListener('pointerup', () => { delete h.dataset.drag; liveSave(); });
  });
  [...box.children].forEach((h, i) => { h.style.left = (pts[i][0]*100) + '%'; h.style.top = (pts[i][1]*100) + '%'; });
}

// sizing
let lastW = -1;
function resize(){
  dpr = Math.min(window.devicePixelRatio||1, 2.5);
  if (proj){
    // fit the sheet to the whole screen; anything outside it stays black (projector off)
    const sw = $('stageSec').clientWidth || window.innerWidth, sh = $('stageSec').clientHeight || window.innerHeight;
    view.tee = teeShown();
    const R = view.tee ? {x0:WORLD.x0, y0:WORLD.y0+0.2, x1:WORLD.x1, y1:WORLD.y1} : {x0:0, y0:0, x1:W, y1:D};
    const rw = R.x1-R.x0, rh = R.y1-R.y0, s = Math.min(sw/rw, sh/rh);
    view.css=s; view.T=s*dpr; view.ox = R.x0 - (sw/s - rw)/2; view.oy = R.y0 - (sh/s - rh)/2;
    cvs.style.width=sw+'px'; cvs.style.height=sh+'px';
    cvs.width=Math.max(1,Math.round(sw*dpr)); cvs.height=Math.max(1,Math.round(sh*dpr));
    return;
  }
  view.ox = WORLD.x0; view.oy = WORLD.y0;
  const box=$('stageBox'), avail=box.clientWidth;
  const ww=WORLD.x1-WORLD.x0, wh=WORLD.y1-WORLD.y0;
  let s = avail/ww;
  if (window.innerWidth > 1000){ const maxH=Math.max(320, window.innerHeight-230); s=Math.min(s, maxH/wh); }
  view.css=s; view.T=s*dpr;
  cvs.style.width=(ww*s)+'px'; cvs.style.height=(wh*s)+'px';
  cvs.width=Math.max(1,Math.round(ww*s*dpr)); cvs.height=Math.max(1,Math.round(wh*s*dpr));
}
new ResizeObserver(() => { const w=$('stageBox').clientWidth; if (w!==lastW){ lastW=w; resize(); } }).observe($('stageBox'));
window.addEventListener('resize', () => { lastW=-1; resize(); });
new ResizeObserver(() => { if (proj) resize(); }).observe(stageSec);

// boot
setGeometry(); resize(); makeFloor(); renderLog();
