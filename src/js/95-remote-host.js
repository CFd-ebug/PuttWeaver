// ================= remote control of the Host =================
// Only a Host that has been paired talks to the network. Pairing makes a private room id (kept on this device) and shows a
// short-lived code as text and as a QR code. A Manager that joins writes a heartbeat; the Host then publishes its status and
// runs the commands the Manager sends, through REMOTE_CMDS below, which call the same functions the Host's own buttons call.
const REMOTE_ROOM_KEY = 'putt-lab-room';
const REMOTE = {room: '', on: false, hold: false, holdResume: false, rev: 0, key: '', busy: false, net: '', mgrs: 0, handled: new Set(), streams: [], timers: [], sync: false, pair: null, pairTimer: 0, want: {}, task: '', pvBusy: false, pvSent: false};

function remoteRoomSaved(){ try { const r = localStorage.getItem(REMOTE_ROOM_KEY); return r && r.length === 20 ? r : ''; } catch (e) { return ''; } }
function remoteHold(on){
  if (on === REMOTE.hold) return; REMOTE.hold = on;
  if (on){ REMOTE.holdResume = LIVE.on; if (LIVE.on) stopLivePlay('Held from the console'); }
  else if (REMOTE.holdResume){ REMOTE.holdResume = false; if (LIVE.src && LIVE.Hcs) startLivePlay(); }
}
function drawHold(){                                    // what the projector shows while the console holds the screen
  ctx.fillStyle = '#0f1430'; ctx.fillRect(0, 0, W, D);
  txt('PUTTWEAVER', W/2, D*0.42, 0.2*K, {font:'display', color:'#ffffff', maxW:W*0.9, ls:.05});
  txt('Back in a moment', W/2, D*0.62, 0.15*K, {weight:700, color:'#9fb3ff'});
}
// Which games the players are offered (Setup, Games shown). Saved on the Host. The Host's own panel and the Evaluator always list every game.
const SHOWN_KEY = 'putt-lab-shown';
const SHOWN_DEFAULT = ['map', 'timeline', 'periodic', 'ttt', 'bowling', 'gallery'];      // not shown by default: accuracy test, crowd search, star sweep, paint wars
function shownLoad(){
  let ids = null; try { const a = JSON.parse(localStorage.getItem(SHOWN_KEY)); if (Array.isArray(a)) ids = a; } catch (e) {}
  ids = (ids || SHOWN_DEFAULT).filter(id => GAMES.some(g => g.id === id));
  return ids.length ? ids : GAMES.map(g => g.id);
}
let shownIds = shownLoad();
function gameStep(d){                     // next or previous game that is shown; falls back to the plain neighbour
  let i = gameIdx;
  for (let n = 0; n < GAMES.length; n++){ i = (i + d + GAMES.length) % GAMES.length; if (shownIds.includes(GAMES[i].id)) break; }
  gameIdx = i; startGame(); if (LIVE.on) armReady();
}
const REMOTE_CMDS = {
  next(){ gameStep(1); },
  prev(){ gameStep(-1); },
  game(a){ const i = Number(a && a.idx); if (!(i >= 0 && i < GAMES.length)) throw new Error('No such game'); if (FLOW.phase === 'results'){ FLOW.queued = i; REMOTE.key = ''; return; } gameIdx = i; startGame(); if (LIVE.on) armReady(); },
  shown(a){
    const ids = a && Array.isArray(a.ids) ? a.ids.filter(id => GAMES.some(g => g.id === id)) : null;
    if (!ids || !ids.length) throw new Error('Show at least one game');
    shownIds = GAMES.map(g => g.id).filter(id => ids.includes(id));
    try { localStorage.setItem(SHOWN_KEY, JSON.stringify(shownIds)); } catch (e) {}
  },
  hover(a){ const i = Number(a && a.idx); FLOW.hover = i >= 0 && i < GAMES.length ? i : -1; FLOW.hoverAt = state.clock; },
  cfg(a){                                                                    // settings for what the players see
    if (a && a.banner != null){ const v = Number(a.banner); if (!isFinite(v)) throw new Error('Not a number'); FLOW.bannerSecs = clamp(Math.round(v), 0, 30); flowSave(); }
    if (a && a.results != null){ const v = Number(a.results); if (!isFinite(v)) throw new Error('Not a number'); FLOW.resultsSecs = clamp(Math.round(v), 0, 60); flowSave(); }
  },
  restart(){ startGame(); if (LIVE.on) armReady(); },
  skip(){ skipRound(); },
  rearm(){ if (!LIVE.on) throw new Error('Tracking is not running'); armReady(); llog('Retaking the empty-sheet photo (from the console)'); },
  track(a){ if (a && a.on){ if (!startLivePlay()) throw new Error('Start the camera and calibrate first'); } else stopLivePlay('Tracking paused (from the console)'); },
  hold(a){ remoteHold(!!(a && a.on)); },
  // setup: the same actions as the Host's live panel; long ones run in the background and report through the setup state
  cam(a){ const kind = a && a.kind === 'sim' ? 'sim' : 'camera'; remoteTask('Starting the camera', () => startSource(kind)); },
  camoff(){ remoteTaskCheck(); stopSource(); llog('Camera off (from the console)'); renderLiveStatus(); },
  lock(){ if (LIVE.src !== 'camera') throw new Error('Start the phone camera first'); remoteTask('Locking exposure and focus', lockCamera); },
  calibrate(){ if (!LIVE.src) throw new Error('Start the camera first'); remoteTask('Calibrating', runCalibration); },
  delay(){ if (!LIVE.src) throw new Error('Start the camera first'); remoteTask('Measuring the delay', measureDelay); },
  sample(){ if (!LIVE.Hcs) throw new Error('Calibrate first'); remoteTask('Sampling the ball', sampleBall); },
  sampleat(a){ if (!LIVE.frame || !LIVE.pw) throw new Error('No camera picture yet'); sampleAtPx(Math.round(clamp(Number(a && a.x), 0, 1) * LIVE.pw), Math.round(clamp(Number(a && a.y), 0, 1) * LIVE.ph)); },
  fit(a){ remoteTaskCheck(); const on = !!(a && a.on); if (on && !proj) enterProj(); toggleFit(on); },
  pin(a){ if (!LIVE.fitting) throw new Error('Corner adjusting is not on'); const i = Number(a && a.i); if (!(i >= 0 && i < 4)) throw new Error('No such corner'); setPinCorner(i, Number(a.x), Number(a.y)); },
  pinrot(){ rotatePin(); },
  pinreset(){ resetPin(); },
  // debug: overlays, tuning, camera controls and the report
  opt(a){ remoteOption(a && a.k, a && a.v); },
  tune(a){
    const sl = LIVE_SLIDERS.find(x => x[0] === (a && a.id)); if (!sl) throw new Error('No such setting');
    const v = Number(a.v); if (!isFinite(v)) throw new Error('Not a number');
    sl[6](clamp(v, sl[2], sl[3])); liveSave(); syncLiveInputs(); llog(`${sl[1]} set to ${sl[7](+sl[5]())} (from the console)`);
  },
  camset(a){ const k = a && a.k; if (!(k in CAM_CTL)) throw new Error('No such camera setting'); const rg = camCtlRange(k); if (!rg || !LIVE.track) throw new Error('This camera does not have that setting'); setCamCtl(k, clamp(Number(a.v), rg.min, rg.max)); },
  report(){ return {text: liveReport()}; },
  ping(){},
  resetstats(){ remoteStatsReset().catch(e => llog('Could not reset the stats: ' + (e && e.message || e))); }
};
function remoteOption(k, v){
  switch (k){
    case 'dbg': LIVE.dbg = !!v; buildPixMap(); if ($('lpDbg')) $('lpDbg').checked = LIVE.dbg; break;
    case 'fps': toggleFpsHud(!!v); break;
    case 'mark': LIVE.mark = !!v; if ($('lpMark')) $('lpMark').checked = LIVE.mark; break;
    case 'dbgmove': LIVE.dbgCorner = LIVE.dbgCorner === 'tr' ? 'tl' : 'tr'; buildPixMap(); liveSave(); break;
    case 'method': if (v !== 'ref' && v !== 'hue') throw new Error('Unknown method'); LIVE.method = v; liveSave(); llog(v === 'ref' ? 'Detection: compare to empty sheet' : 'Detection: color only'); renderLiveStatus(); break;
    case 'zone': if (v !== 'tee' && v !== 'anywhere') throw new Error('Unknown start zone'); LIVE.startZone = v; liveSave(); break;
    case 'proc': if (![320, 480, 640].includes(Number(v))) throw new Error('Unknown detail level'); LIVE.pwTarget = Number(v); liveSave(); break;
    case 'res': if (![640, 1280, 1920].includes(Number(v))) throw new Error('Unknown resolution'); LIVE.res = Number(v); liveSave(); if (LIVE.src === 'camera') remoteTask('Restarting the camera', () => startSource('camera')); break;
    default: throw new Error('Unknown option');
  }
  syncLiveInputs();
}
function remoteTaskCheck(){ if (REMOTE.task) throw new Error('Busy: ' + REMOTE.task.toLowerCase()); }
function remoteTask(name, fn){            // starts a long action and returns at once; the setup state shows it until it ends
  remoteTaskCheck(); if (LIVE.calib) throw new Error('Busy: calibrating on the Host');
  REMOTE.task = name; REMOTE.key = '';
  Promise.resolve().then(fn).catch(e => llog(name + ' failed: ' + (e && e.message || e))).finally(() => { REMOTE.task = ''; REMOTE.key = ''; });
}

// ---------- setup details and camera stills (only while a Manager has the Setup tab open) ----------
const remoteWants = () => typeof REMOTE.want.preview === 'number' && relayNow() - REMOTE.want.preview < 12000;
const r3 = v => Math.round(v * 1000) / 1000;
function remoteSetup(){
  const c = LIVE.cal, st = LIVE.settings || {}, note = id => { const e = $(id); return e ? {t: e.textContent, tone: e.dataset.tone || ''} : {t: '', tone: ''}; };
  const quad = LIVE.Hsc && LIVE.pw ? [[0, 0], [W, 0], [W, D], [0, D]].map(([x, y]) => { const [u, v] = camPx(x, y); return [r3(u / LIVE.pw), r3(v / LIVE.ph)]; }) : null;
  const b = LIVE.det && LIVE.det.best;
  return {
    src: LIVE.src || '', label: LIVE.label || '', res: st.width ? st.width + '×' + st.height : '', lock: LIVE.lockNote || '',
    cal: c ? {n: c.n, of: c.of, avg: r3(c.checkAvg != null ? c.checkAvg : c.fitAvg), max: c.checkMax != null ? r3(c.checkMax) : null} : null,
    pin: LIVE.pin ? LIVE.pin.map(p => [r3(p[0]), r3(p[1])]) : null, fit: !!LIVE.fitting,
    method: LIVE.method, sampled: !!(LIVE.method === 'ref' ? LIVE.sig.sampled : LIVE.color.sampled), lat: Math.round(LIVE.latency * 1000),
    task: REMOTE.task || (LIVE.calib ? 'Working on the Host' : ''),
    notes: {cam: note('lpCamNote'), cal: note('lpCalNote'), color: note('lpColorNote')},
    quad, det: b && LIVE.pw ? [r3(b.px / LIVE.pw), r3(b.py / LIVE.ph)] : null, log: LIVE.log.slice(-4).map(e => e.msg)
  };
}
const remoteWantsDebug = () => typeof REMOTE.want.debug === 'number' && relayNow() - REMOTE.want.debug < 12000;
function remoteDebug(){
  const f = LIVE.stats, sw = LIVE.seenWin, seen = sw.length ? Math.round(sw.filter(e => e.hit).length / sw.length * 100) : 0, d = LIVE.det, b = d && d.best;
  const pwr = LIVE.pw || 1, phr = LIVE.ph || 1, r1 = v => Math.round(v * 10) / 10;
  const t0 = LIVE.log.length ? LIVE.log[0].t : 0;
  const cam = {};
  for (const k in CAM_CTL){ const rg = camCtlRange(k); if (rg) cam[k] = {label: CAM_CTL[k][0], min: rg.min, max: rg.max, step: rg.step, v: rg.v, t: CAM_CTL[k][1](rg.v)}; }
  return {
    rates: {disp: r1(rateOf(LIVE.rafTimes)), cam: r1(rateOf(LIVE.camTimes)), ana: r1(LIVE.camFps), ms: r1(LIVE.frameMs), proc: r1(LIVE.procMs)},
    seen, frames: f.frames, weak: f.weak, starts: [f.moveStarts, f.restStarts], pw: LIVE.pw, ph: LIVE.ph,
    det: d ? {count: d.count, blobs: d.blobs.length, note: d.note || '', weak: !!d.weak, best: b ? {x: r1(b.x * 100) / 100, y: r1(b.y * 100) / 100, area: b.area, exp: r1(b.exp), fill: Math.round(b.fill * 100) / 100, aspect: r1(b.aspect)} : null} : null,
    blobs: d ? d.blobs.slice(0, 8).map(x => [r3(x.px / pwr), r3(x.py / phr), r1(x.ratio || 0)]) : [],
    motion: {now: r1(LIVE.motion * 100), floor: r1(LIVE.floor * 100), thr: r1(LIVE.busyThr * 100), busy: !!LIVE.busy},
    refAge: LIVE.ref ? r1(state.clock - LIVE.refAt) : null,
    sliders: LIVE_SLIDERS.map(([id, label, mn, mx, step, get, , fmt]) => ({id, label, min: mn, max: mx, step, v: +get(), t: fmt(+get())})),
    opts: {dbg: !!LIVE.dbg, fps: !!LIVE.fpsHud, mark: !!LIVE.mark, method: LIVE.method, zone: LIVE.startZone, proc: LIVE.pwTarget, res: LIVE.res},
    cam, lock: LIVE.lockNote || '', canCam: LIVE.src === 'camera', wake: {on: WAKE.on, why: WAKE.why},
    log: LIVE.log.slice(-40).map(e => ((e.t - t0) / 1000).toFixed(1) + ' s  ' + e.msg)
  };
}
async function remotePreview(){
  if (!REMOTE.on || !REMOTE.sync || REMOTE.pvBusy) return;
  if (!remoteWants()){ if (REMOTE.pvSent){ REMOTE.pvSent = false; relayDelete('rooms/' + REMOTE.room + '/preview').catch(() => {}); } return; }     // nobody is looking: do not leave a picture in the database
  if (!LIVE.src || !LIVE.proc || !LIVE.pw) return;
  let q = 0.6, url = '';
  for (;;){ url = LIVE.proc.toDataURL('image/jpeg', q); if (url.length < 100000 || q <= 0.3) break; q -= 0.15; }
  if (url.length >= 119000) return;                                   // the database rules refuse anything bigger
  REMOTE.pvBusy = true;
  try { await relayPut('rooms/' + REMOTE.room + '/preview', url); REMOTE.pvSent = true; } catch (e) {} finally { REMOTE.pvBusy = false; }
}

// ---------- what the Host tells the Manager ----------
function remoteBall(){
  let p = null;
  if (LIVE.src){
    if (LIVE.on && mode === 'roll' && LIVE.samples.length) p = LIVE.samples[LIVE.samples.length - 1];
    else if (shot && shot.rest && (mode === 'read' || mode === 'result')) p = shot.rest;
    else if (LIVE.on && LIVE.det && LIVE.det.best && state.clock - LIVE.detT < 0.6) p = LIVE.det.best;
  } else if (ball && ball.visible && onSheet(ball.x, ball.y)) p = ball;
  return p ? {x: Math.round(p.x * 50) / 50, y: Math.round(p.y * 50) / 50} : null;
}
function remoteUse(){ const u = relayUse(), q = 262144; return {m: u.m, up: Math.round(u.up / q) * q, down: Math.round(u.down / q) * q}; }
function remoteSnapshot(){
  if (!game) return null;
  const h = game.hole ? game.hole() : null;
  return {
    ver: BUILD.label, sheet: {w: W, d: D}, proj, hold: REMOTE.hold, mode,
    game: {idx: gameIdx, id: game.id, name: game.name, status: mode === 'over' ? 'Hole complete' : game.status(), how: game.how},
    games: GAMES.map(g => g.name),
    gids: GAMES.map(g => g.id),
    phase: FLOW.phase,                       // 'play'; 'results' while the hole's results show; 'select' while the projector asks the players to pick the next game
    banner: FLOW.bannerSecs, results: FLOW.resultsSecs,
    pj: flowLabel(),                         // what the projector shows, for the controller's status chip
    shown: GAMES.map((g, i) => shownIds.includes(g.id) ? i : -1).filter(i => i >= 0),
    hint: $('hint').textContent,
    result: mode === 'result' && lastResult ? {title: lastResult.title, detail: lastResult.detail || '', tone: lastResult.tone || ''} : null,
    hole: h ? {par: h.par, strokes: h.list.map(e => e.strokes == null ? null : e.strokes), final: !!h.final} : null,
    live: {src: LIVE.src || '', on: !!LIVE.on, state: LIVE.on ? LIVE.state : 'off', cal: !!LIVE.Hcs, fps: Math.round(LIVE.camFps || 0), ms: Math.round(LIVE.procMs || 0)},
    ball: remoteBall(),
    use: remoteUse(),                             // this device's own relay traffic this month, in 256 KB steps (see 07-relay.js)
    sr: [SHOTS.rev, statsRev],                    // changes when new shots or totals are in the database (96-remote-shots.js)
    setup: remoteWants() ? remoteSetup() : undefined,
    debug: remoteWantsDebug() ? remoteDebug() : undefined
  };
}
async function remotePublish(){
  if (!REMOTE.on || REMOTE.busy || !REMOTE.sync || (!REMOTE.mgrs && !REMOTE.pair)) return;       // nobody is watching: stay quiet
  const snap = remoteSnapshot(); if (!snap) return;
  const key = JSON.stringify(snap); if (key === REMOTE.key) return;
  REMOTE.busy = true;
  try { snap.rev = ++REMOTE.rev; snap.t = RELAY_TS; await relayPut('rooms/' + REMOTE.room + '/state', snap); REMOTE.key = key; remoteNet('live'); }
  catch (e) { REMOTE.key = ''; remoteNet('offline', e.message); }
  finally { REMOTE.busy = false; }
}
function remoteNet(s, why){ if (REMOTE.net !== s){ REMOTE.net = s; remoteUi(); } REMOTE.why = why || ''; }

// ---------- commands from the Manager ----------
async function remoteRun(id, c){
  let ack;
  try {
    if (!c || !c.type) throw new Error('Bad command');
    const age = relayNow() - Number(c.ts), ttl = Number(c.ttl) || 8000;
    if (!(age <= ttl)) throw new Error('Too old to run (' + (isFinite(age) ? Math.round(age / 1000) + ' s' : 'no time') + ')');   // a restart written while the Host was offline must not fire later
    const fn = REMOTE_CMDS[c.type]; if (!fn) throw new Error('Unknown command ' + c.type);
    const out = fn(c.args || {}); ack = {ok: true}; if (out && typeof out.text === 'string') ack.text = out.text;
  } catch (e) { ack = {ok: false, error: String(e.message || e)}; }
  ack.ts = RELAY_TS;
  try { await relayPut('rooms/' + REMOTE.room + '/ack/' + id, ack); await relayDelete('rooms/' + REMOTE.room + '/cmd/' + id); } catch (e) {}
}
function remoteOnCmds(cache){
  const ids = cache ? Object.keys(cache) : [];
  for (const id of ids) if (!REMOTE.handled.has(id)){ REMOTE.handled.add(id); remoteRun(id, cache[id]); }
  if (REMOTE.handled.size > 300) for (const id of REMOTE.handled) if (!ids.includes(id)) REMOTE.handled.delete(id);
}
function remoteOnMgrs(cache){
  const n = cache ? Object.values(cache).filter(t => typeof t === 'number' && relayNow() - t < HOST_ALIVE_MS).length : 0;
  if (n !== REMOTE.mgrs){ REMOTE.mgrs = n; REMOTE.key = ''; remoteUi(); remotePublish(); }
}

// ---------- keeping the room tidy ----------
// Nothing in the database is ever listed or expired by the database itself, so the Host sweeps its own room: answers nobody picked
// up, heartbeats of controllers that went away, old picture requests, a leftover camera picture and an unused pairing code.
const REMOTE_PAIR_KEY = 'putt-lab-pair';
async function remoteTidy(){
  if (!REMOTE.on || !REMOTE.sync) return;
  const base = 'rooms/' + REMOTE.room + '/', now = relayNow(), drop = p => relayDelete(base + p).catch(() => {});
  try {
    const acks = await relayGet(base + 'ack') || {};
    for (const id in acks){ const a = acks[id]; if (!a || typeof a.ts !== 'number' || now - a.ts > 120000) drop('ack/' + id); }
    const mgrs = await relayGet(base + 'hb/mgr') || {};
    for (const id in mgrs) if (typeof mgrs[id] !== 'number' || now - mgrs[id] > 600000) drop('hb/mgr/' + id);
    const want = await relayGet(base + 'want') || {};
    for (const k in want) if (typeof want[k] !== 'number' || now - want[k] > 600000) drop('want/' + k);
    if (!remoteWants()) drop('preview');
  } catch (e) {}
}
function remoteForgetCode(){
  let c = ''; try { c = localStorage.getItem(REMOTE_PAIR_KEY) || ''; localStorage.removeItem(REMOTE_PAIR_KEY); } catch (e) {}
  if (c.length === 8) relayDelete('pair/' + c).catch(() => {});
}

// ---------- start, stop, reset ----------
function remoteStart(){
  if (ROLE !== 'host' || REMOTE.on) return;
  REMOTE.room = remoteRoomSaved(); if (!REMOTE.room) return;
  REMOTE.on = true; REMOTE.sync = false; REMOTE.key = ''; REMOTE.handled.clear();
  const base = 'rooms/' + REMOTE.room + '/';
  const live = s => s === 'live' ? remoteNet('live') : s === 'offline' ? remoteNet('offline', 'The relay is not reachable') : null;
  REMOTE.streams.push(relayStream(base + 'cmd', {onData: remoteOnCmds, onStatus: live}));
  REMOTE.streams.push(relayStream(base + 'hb/mgr', {onData: remoteOnMgrs}));
  REMOTE.streams.push(relayStream(base + 'want', {onData: c => { const was = remoteWants() + '' + remoteWantsDebug(); REMOTE.want = c || {}; if (remoteWants() + '' + remoteWantsDebug() !== was){ REMOTE.key = ''; remotePublish(); } }}));
  const beat = () => relayPut(base + 'hb/host', RELAY_TS).catch(() => {});
  const sync = () => relaySyncClock(REMOTE.room).then(() => { REMOTE.sync = true; beat(); remotePublish(); remoteTidy(); }).catch(e => { remoteNet('offline', e.message); if (REMOTE.on) setTimeout(sync, 4000); });
  remoteForgetCode(); sync();
  REMOTE.timers.push(setInterval(remoteTidy, 300000), setInterval(beat, 5000), setInterval(remotePublish, 500), setInterval(remotePreview, 1000), setInterval(() => remoteOnMgrs(REMOTE.streams[1] && REMOTE.streams[1].cache), 3000));
  remoteUi();
}
function remoteStop(){
  REMOTE.on = false; REMOTE.streams.forEach(s => s.close()); REMOTE.streams = []; REMOTE.timers.forEach(clearInterval); REMOTE.timers = [];
  REMOTE.mgrs = 0; REMOTE.net = ''; REMOTE.want = {}; remoteUi();
}
function remoteEnsureRoom(){
  if (!remoteRoomSaved()){ try { localStorage.setItem(REMOTE_ROOM_KEY, relayRandom(20)); } catch (e) {} }
  if (!remoteRoomSaved()) throw new Error('This browser will not save the pairing, so it cannot be paired. Is private browsing on?');
  remoteStart();
}
async function remoteReset(){            // a new room id: every paired Manager is cut off
  const old = remoteRoomSaved(); remoteStop(); remoteDropCode();
  if (old) relayDelete('rooms/' + old).catch(() => {});
  try { localStorage.removeItem(REMOTE_ROOM_KEY); } catch (e) {}
}

// ---------- pairing dialog ----------
function remoteUi(){
  const n = REMOTE.mgrs, label = n ? 'Controllers (' + n + ')' : REMOTE.on ? 'Controller' : 'Add a controller';
  if ($('btnPair')) $('btnPair').textContent = n ? 'Controllers (' + n + ')' : 'Add a controller';
  if ($('pbPair')) $('pbPair').textContent = label;
  const who = $('pairWho'), net = $('pairNet');
  if (who) who.textContent = n ? n + (n === 1 ? ' controller is' : ' controllers are') + ' connected.' : REMOTE.on ? 'No controller connected yet.' : '';
  if (net) net.textContent = REMOTE.net === 'live' ? 'Relay connected' : REMOTE.net === 'offline' ? 'Relay offline: ' + (REMOTE.why || 'retrying') : '';
}
function remoteDropCode(){
  clearInterval(REMOTE.pairTimer);
  if (REMOTE.pair){ const c = REMOTE.pair.code; REMOTE.pair = null; relayDelete('pair/' + c).catch(() => {}); try { localStorage.removeItem(REMOTE_PAIR_KEY); } catch (e) {} }     // an unused code should not linger
}
function remoteClosePair(){
  remoteDropCode();
  const d = $('pairDlg'); if (d && d.open){ if (d.close) d.close(); else d.removeAttribute('open'); }
}
async function remoteNewCode(){
  const note = $('pairNote'); $('pairCode').textContent = ''; note.textContent = 'Creating a code…';
  if (REMOTE.pair){ relayDelete('pair/' + REMOTE.pair.code).catch(() => {}); REMOTE.pair = null; }
  try {
    remoteEnsureRoom();
    if (!REMOTE.sync) await relaySyncClock(REMOTE.room);
    const p = await pairOpen(REMOTE.room); REMOTE.pair = p; try { localStorage.setItem(REMOTE_PAIR_KEY, p.code); } catch (e) {}
    pairPaint($('pairQr'), p.link); $('pairCode').textContent = relayShowCode(p.code);
    clearInterval(REMOTE.pairTimer);
    const tick = () => {
      if (!REMOTE.pair) return;
      const left = Math.round((p.exp - relayNow()) / 1000);
      note.textContent = left > 0 ? 'Scan with the other phone’s camera, or open the Manager page and type the code. It works once, for ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') + ' more.' : 'This code has expired. Tap New code.';
    };
    tick(); REMOTE.pairTimer = setInterval(tick, 1000); remotePublish();
  } catch (e) { note.textContent = 'Could not create a code: ' + e.message; }
}
function remoteOpenPair(){
  if (ROLE !== 'host') return;
  const d = $('pairDlg'); $('pairSteps').textContent = '';
  if (d.showModal){ if (!d.open) d.showModal(); } else d.setAttribute('open', '');
  remoteUi(); remoteNewCode();
}
(function bindRemoteUi(){
  if (ROLE !== 'host') return;
  $('btnPair').addEventListener('click', remoteOpenPair);
  $('pbPair').addEventListener('click', remoteOpenPair);
  $('pairClose').addEventListener('click', remoteClosePair);
  $('pairDlg').addEventListener('close', remoteDropCode);
  $('pairNew').addEventListener('click', remoteNewCode);
  let armed = 0;
  $('pairReset').addEventListener('click', async () => {                  // two taps: this disconnects every controller
    const b = $('pairReset');
    if (!armed){ b.textContent = 'Tap again to disconnect all'; armed = setTimeout(() => { armed = 0; b.textContent = 'Reset pairing'; }, 4000); return; }
    clearTimeout(armed); armed = 0; b.textContent = 'Reset pairing';
    await remoteReset(); $('pairCode').textContent = ''; $('pairNote').textContent = 'All controllers were disconnected. Tap New code to pair again.';
    const c = $('pairQr'); c.getContext('2d').clearRect(0, 0, c.width, c.height);
  });
  $('pairTest').addEventListener('click', async () => {
    const rows = [], b = $('pairTest'); b.disabled = true;
    try { await relaySelfTest(r => { rows.push(r); pairSteps($('pairSteps'), rows); }); } finally { b.disabled = false; }
  });
  document.addEventListener('keydown', e => { if (proj && (e.key === 'p' || e.key === 'P') && !$('pairDlg').open && !e.ctrlKey && !e.metaKey){ remoteOpenPair(); e.preventDefault(); } });
  setTimeout(() => remoteStart(), 0);          // a Host that was paired before reconnects on its own
})();
