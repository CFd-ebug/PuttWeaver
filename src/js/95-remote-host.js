// ================= remote control of the Host =================
// Only a Host that has been paired talks to the network. Pairing makes a private room id (kept on this device) and shows a
// short-lived code as text and as a QR code. A Manager that joins writes a heartbeat; the Host then publishes its status and
// runs the commands the Manager sends, through REMOTE_CMDS below, which call the same functions the Host's own buttons call.
const REMOTE_ROOM_KEY = 'putt-lab-room';
const REMOTE = {room: '', on: false, hold: false, holdResume: false, rev: 0, key: '', busy: false, net: '', mgrs: 0, handled: new Set(), streams: [], timers: [], sync: false, pair: null, pairTimer: 0};

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
const gameStep = d => { gameIdx = (gameIdx + d + GAMES.length) % GAMES.length; startGame(); if (LIVE.on) armReady(); };
const REMOTE_CMDS = {
  next(){ gameStep(1); },
  prev(){ gameStep(-1); },
  game(a){ const i = Number(a && a.idx); if (!(i >= 0 && i < GAMES.length)) throw new Error('No such game'); gameIdx = i; startGame(); if (LIVE.on) armReady(); },
  restart(){ startGame(); if (LIVE.on) armReady(); },
  skip(){ skipRound(); },
  rearm(){ if (!LIVE.on) throw new Error('Tracking is not running'); armReady(); llog('Retaking the empty-sheet photo (from the console)'); },
  track(a){ if (a && a.on){ if (!startLivePlay()) throw new Error('Start the camera and calibrate first'); } else stopLivePlay('Tracking paused (from the console)'); },
  hold(a){ remoteHold(!!(a && a.on)); },
  ping(){}
};

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
function remoteSnapshot(){
  if (!game) return null;
  const h = game.hole ? game.hole() : null;
  return {
    ver: BUILD.label, sheet: {w: W, d: D}, proj, hold: REMOTE.hold, mode,
    game: {idx: gameIdx, id: game.id, name: game.name, status: mode === 'over' ? 'Hole complete' : game.status(), how: game.how},
    games: GAMES.map(g => g.name),
    hint: $('hint').textContent,
    result: mode === 'result' && lastResult ? {title: lastResult.title, detail: lastResult.detail || '', tone: lastResult.tone || ''} : null,
    hole: h ? {par: h.par, strokes: h.list.map(e => e.strokes == null ? null : e.strokes), final: !!h.final} : null,
    live: {src: LIVE.src || '', on: !!LIVE.on, state: LIVE.on ? LIVE.state : 'off', cal: !!LIVE.Hcs, fps: Math.round(LIVE.camFps || 0), ms: Math.round(LIVE.procMs || 0)},
    ball: remoteBall()
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
    fn(c.args || {}); ack = {ok: true};
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

// ---------- start, stop, reset ----------
function remoteStart(){
  if (ROLE !== 'host' || REMOTE.on) return;
  REMOTE.room = remoteRoomSaved(); if (!REMOTE.room) return;
  REMOTE.on = true; REMOTE.sync = false; REMOTE.key = ''; REMOTE.handled.clear();
  const base = 'rooms/' + REMOTE.room + '/';
  const live = s => s === 'live' ? remoteNet('live') : s === 'offline' ? remoteNet('offline', 'The relay is not reachable') : null;
  REMOTE.streams.push(relayStream(base + 'cmd', {onData: remoteOnCmds, onStatus: live}));
  REMOTE.streams.push(relayStream(base + 'hb/mgr', {onData: remoteOnMgrs}));
  const beat = () => relayPut(base + 'hb/host', RELAY_TS).catch(() => {});
  const sync = () => relaySyncClock(REMOTE.room).then(() => { REMOTE.sync = true; beat(); remotePublish(); }).catch(e => { remoteNet('offline', e.message); if (REMOTE.on) setTimeout(sync, 4000); });
  sync();
  REMOTE.timers.push(setInterval(beat, 5000), setInterval(remotePublish, 500), setInterval(() => remoteOnMgrs(REMOTE.streams[1] && REMOTE.streams[1].cache), 3000));
  remoteUi();
}
function remoteStop(){
  REMOTE.on = false; REMOTE.streams.forEach(s => s.close()); REMOTE.streams = []; REMOTE.timers.forEach(clearInterval); REMOTE.timers = [];
  REMOTE.mgrs = 0; REMOTE.net = ''; remoteUi();
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
  if (REMOTE.pair){ const c = REMOTE.pair.code; REMOTE.pair = null; relayDelete('pair/' + c).catch(() => {}); }     // an unused code should not linger
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
    const p = await pairOpen(REMOTE.room); REMOTE.pair = p;
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
