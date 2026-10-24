// ================= Manager console (and pairing helpers shared with the Host) =================
// The Manager never starts the game engine: this file ends by running the console and returning from the script.
// It talks to the Host only through the relay (07-relay.js); docs/console-plan.md has the data model.
const MGR_KEY = 'putt-lab-mgr';                          // {room, id} for a paired Manager
const PAIR_WINDOW_MS = 120000;                           // a pairing code works for two minutes, once
const HOST_ALIVE_MS = 20000;                             // the Host writes a heartbeat every 5 s

function pairLink(code){ return location.href.split('#')[0] + '#manage=' + code; }
// Writes a short-lived pairing code for a room and resolves {code, exp, link}. Used by the Host and by a paired Manager.
async function pairOpen(room){
  if (!relayState.synced) await relaySyncClock(room);
  const code = relayRandom(8), exp = relayNow() + PAIR_WINDOW_MS;
  await relayPut('pair/' + code, {room, exp});
  return {code, exp, link: pairLink(code)};
}
function pairPaint(canvas, link){ qrDraw(canvas, qrMake(link), 6); }
function pairSteps(ul, rows){          // test results as a list: dot, name, detail
  ul.textContent = '';
  for (const r of rows){
    const li = document.createElement('li'), dot = document.createElement('span'), name = document.createElement('span'), det = document.createElement('small');
    dot.className = 'dot'; dot.dataset.s = r.ok ? 'ok' : 'bad'; name.textContent = r.name; det.textContent = r.detail;
    li.append(dot, name, det); ul.append(li);
  }
}

function runManager(){
  const el = id => document.getElementById(id);
  const root = el('mgr'); root.hidden = false;
  let room = '', myId = '', acks = {}, streams = [], pending = new Map(), timers = [], lastState = null, hostBeat = 0, relayLive = false, chipsKey = '', addTimer = 0;
  const say = (id, msg) => { el(id).textContent = msg; };

  function load(){ try { const v = JSON.parse(localStorage.getItem(MGR_KEY) || 'null'); if (v && v.room && v.room.length === 20) return v; } catch (e) {} return null; }
  function save(v){ try { if (v) localStorage.setItem(MGR_KEY, JSON.stringify(v)); else localStorage.removeItem(MGR_KEY); } catch (e) {} }

  // ---------- joining ----------
  async function join(codeRaw){
    const code = relayCleanCode(codeRaw);
    if (code.length !== 8) throw new Error('A pairing code has 8 letters and numbers.');
    const rec = await relayGet('pair/' + code);
    if (!rec || typeof rec.room !== 'string') throw new Error('That code is not valid. Check it, or ask the Host for a new one.');
    await relaySyncClock(rec.room);
    if (!(rec.exp > relayNow())){ relayDelete('pair/' + code).catch(() => {}); throw new Error('That code has expired. Tap Add a controller on the Host for a new one.'); }
    relayDelete('pair/' + code).catch(() => {});                      // a code works once
    save({room: rec.room, id: relayRandom(6)});
  }
  async function tryJoin(code){
    const btn = el('mgrJoinBtn'); btn.disabled = true; say('mgrJoinMsg', 'Connecting…');
    try { await join(code); say('mgrJoinMsg', ''); start(); }
    catch (e) { say('mgrJoinMsg', e.status === 0 ? 'Could not reach the relay. Check this phone’s connection and try again. (' + e.message + ')' : e.message); }
    finally { btn.disabled = false; }
  }
  el('mgrJoinBtn').addEventListener('click', () => tryJoin(el('mgrCodeIn').value));
  el('mgrCodeIn').addEventListener('keydown', e => { if (e.key === 'Enter') tryJoin(el('mgrCodeIn').value); });
  el('mgrCodeIn').addEventListener('input', e => {
    const c = relayCleanCode(e.target.value).slice(0, 8); e.target.value = relayShowCode(c);
  });

  // ---------- running ----------
  function start(){
    stop(); const v = load(); if (!v){ showJoin(); return; }
    room = v.room; myId = v.id || relayRandom(6);
    el('mgrJoin').hidden = true; el('mgrRun').hidden = false; el('mgrAdd').hidden = false; el('mgrUnpair').hidden = false;
    streams.push(relayStream('rooms/' + room + '/state', {
      onData: c => { lastState = c; render(); },
      onStatus: s => { relayLive = s === 'live'; strip(); }
    }));
    streams.push(relayStream('rooms/' + room + '/hb', {onData: c => { hostBeat = c && typeof c.host === 'number' ? c.host : 0; strip(); }}));
    streams.push(relayStream('rooms/' + room + '/ack', {onData: onAcks}));
    const beat = () => relayPut('rooms/' + room + '/hb/mgr/' + myId, RELAY_TS).catch(() => {});
    relaySyncClock(room).catch(() => {}).then(beat);
    timers.push(setInterval(beat, 5000), setInterval(strip, 2000));
    strip(); render();
  }
  function stop(){ streams.forEach(s => s.close()); streams = []; timers.forEach(clearInterval); timers = []; pending.clear(); lastState = null; hostBeat = 0; relayLive = false; chipsKey = ''; }
  function showJoin(){ stop(); room = ''; el('mgrJoin').hidden = false; el('mgrRun').hidden = true; el('mgrAdd').hidden = true; el('mgrUnpair').hidden = true; el('mgrCodeIn').focus(); }

  function setDot(id, s){ el(id).dataset.s = s; }
  function strip(){
    if (!room) return;
    setDot('mgrDotRelay', relayLive ? 'ok' : 'bad'); say('mgrRelayTxt', relayLive ? 'Relay connected' : 'Relay offline, retrying…');
    const age = hostBeat ? relayNow() - hostBeat : Infinity;
    if (!relayLive) { setDot('mgrDotHost', 'warn'); say('mgrHostTxt', 'Host: unknown'); }
    else if (age < HOST_ALIVE_MS) { setDot('mgrDotHost', 'ok'); say('mgrHostTxt', 'Host online'); }
    else { setDot('mgrDotHost', 'bad'); say('mgrHostTxt', hostBeat ? 'Host not responding (last seen ' + Math.round(age / 1000) + ' s ago)' : 'Host has not checked in yet'); }
    const l = lastState && lastState.live;
    say('mgrTrack', l ? (l.on ? 'Tracking: ' + l.state + (l.fps ? ' · ' + l.fps + ' fps' : '') : (l.src ? 'Tracking paused' : 'No camera on the Host')) : '');
  }

  function render(){
    const st = lastState;
    if (!st || !st.game){ say('mgrGame', 'Waiting for the Host…'); say('mgrStatus', ''); say('mgrHint', 'The Host sends its status as soon as it sees this console.'); el('mgrResult').hidden = true; say('mgrHole', ''); drawMap(null); return; }
    say('mgrGame', st.game.name); say('mgrStatus', st.game.status || ''); say('mgrHint', st.hint || '');
    const r = el('mgrResult');
    if (st.result){ r.hidden = false; r.dataset.tone = st.result.tone || ''; say('mgrResTitle', st.result.title || ''); say('mgrResDetail', st.result.detail || ''); } else r.hidden = true;
    if (st.hole){ const done = st.hole.strokes.filter(x => x != null); say('mgrHole', 'Par ' + st.hole.par + ' · score ' + (done.length ? done.join(' / ') : '—') + (st.hole.final ? ' · hole complete' : '')); } else say('mgrHole', '');
    const key = (st.games || []).join('|');
    if (key !== chipsKey){
      chipsKey = key; const box = el('mgrChips'); box.textContent = '';
      (st.games || []).forEach((name, i) => { const b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.textContent = name; b.dataset.idx = String(i); box.append(b); });
    }
    el('mgrChips').querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(Number(c.dataset.idx) === st.game.idx)));
    const l = st.live || {}, tb = el('mgrTrackBtn');
    tb.textContent = l.on ? 'Pause tracking' : 'Start tracking'; tb.setAttribute('aria-pressed', String(!!l.on)); tb.disabled = !l.src || !l.cal;
    el('mgrHoldBtn').setAttribute('aria-pressed', String(!!st.hold)); el('mgrHoldBtn').textContent = st.hold ? 'Resume game' : 'Hold screen';
    el('mgrBall').textContent = st.ball ? 'x ' + st.ball.x.toFixed(2) + ' ft · y ' + st.ball.y.toFixed(2) + ' ft' : 'No ball in view';
    drawMap(st); strip();
  }
  function drawMap(st){
    const c = el('mgrMap'), g = c.getContext('2d'), w = c.width, h = c.height;
    g.clearRect(0, 0, w, h); if (!st || !st.sheet) return;
    const sw = st.sheet.w, sd = st.sheet.d, s = Math.min((w - 20) / sw, (h - 40) / sd), ox = (w - sw * s) / 2, oy = 10;
    g.fillStyle = '#f8f8f5'; g.fillRect(ox, oy, sw * s, sd * s); g.strokeStyle = '#8b94a8'; g.lineWidth = 2; g.strokeRect(ox, oy, sw * s, sd * s);
    g.fillStyle = '#8b94a8'; g.font = '600 12px sans-serif'; g.textAlign = 'center'; g.fillText('TEE EDGE', w / 2, oy + sd * s + 14);
    if (st.ball){ g.fillStyle = '#2343d6'; g.beginPath(); g.arc(ox + st.ball.x * s, oy + st.ball.y * s, 8, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
  }

  // ---------- commands ----------
  async function send(type, args){
    if (!room) return;
    say('mgrCmdMsg', 'Sending…');
    try {
      const r = await relayPost('rooms/' + room + '/cmd', {type, args: args || {}, ts: RELAY_TS, ttl: 8000});
      const done = new Promise(res => { pending.set(r.name, res); setTimeout(() => { if (pending.delete(r.name)) res({ok: false, error: 'No answer from the Host. Is it on and online?'}); }, 8000); });
      onAcks(acks);                       // the answer may already have arrived while this request was still finishing
      const ack = await done;
      say('mgrCmdMsg', ack.ok ? 'Done.' : 'The Host said: ' + ack.error);
    } catch (e) { say('mgrCmdMsg', 'Could not send: ' + e.message); }
  }
  function onAcks(c){
    acks = c || {};
    if (!c) return;
    for (const id of Object.keys(c)) if (pending.has(id)) {
      const res = pending.get(id); pending.delete(id); res(c[id]);
      relayDelete('rooms/' + room + '/ack/' + id).catch(() => {});
    }
  }
  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.cmd) send(b.dataset.cmd);
    else if (b.classList.contains('chip') && b.dataset.idx !== undefined) send('game', {idx: Number(b.dataset.idx)});
  });
  el('mgrTrackBtn').addEventListener('click', () => send('track', {on: !(lastState && lastState.live && lastState.live.on)}));
  el('mgrHoldBtn').addEventListener('click', () => send('hold', {on: !(lastState && lastState.hold)}));

  // ---------- footer: add a controller, test, unpair ----------
  el('mgrAdd').addEventListener('click', async () => {
    const dlg = el('mgrAddDlg'); say('mgrAddNote', 'Creating a code…'); el('mgrAddCode').textContent = '';
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    try {
      const p = await pairOpen(room); pairPaint(el('mgrAddQr'), p.link); el('mgrAddCode').textContent = relayShowCode(p.code);
      const tick = () => { const left = Math.round((p.exp - relayNow()) / 1000); say('mgrAddNote', left > 0 ? 'Scan with the other phone’s camera, or type the code. Works once, for ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') + ' more.' : 'This code has expired. Close this and tap Add a controller again.'); };
      clearInterval(addTimer); tick(); addTimer = setInterval(tick, 1000);
    } catch (e) { say('mgrAddNote', 'Could not create a code: ' + e.message); }
  });
  el('mgrAddClose').addEventListener('click', () => { clearInterval(addTimer); const d = el('mgrAddDlg'); if (d.close) d.close(); else d.removeAttribute('open'); });
  el('mgrTest').addEventListener('click', async () => {
    const box = el('mgrTestBox'), ul = el('mgrSteps'), rows = []; box.hidden = false; ul.textContent = ''; el('mgrTest').disabled = true;
    try { await relaySelfTest(r => { rows.push(r); pairSteps(ul, rows); }); } finally { el('mgrTest').disabled = false; }
  });
  let unpairArm = 0;
  el('mgrUnpair').addEventListener('click', () => {            // two taps, so it can't happen by accident
    const b = el('mgrUnpair');
    if (!unpairArm){ b.textContent = 'Tap again to unpair'; unpairArm = setTimeout(() => { unpairArm = 0; b.textContent = 'Unpair'; }, 4000); return; }
    clearTimeout(unpairArm); unpairArm = 0; b.textContent = 'Unpair'; save(null); showJoin();
  });

  // ---------- go ----------
  function joinFromAddress(){
    const code = (location.hash.match(/^#manage=([A-Za-z0-9-]+)/) || [])[1]; if (!code) return false;
    try { history.replaceState(null, '', location.href.split('#')[0] + '#manage'); } catch (e) {}      // do not leave the code in the address
    el('mgrCodeIn').value = relayShowCode(relayCleanCode(code));
    tryJoin(code); return true;
  }
  window.addEventListener('hashchange', joinFromAddress);       // a pairing link opened on a page that is already showing
  if (!joinFromAddress()){ if (load()) start(); else showJoin(); }
}

// The Manager does not run the games or touch the camera.
if (ROLE === 'manage'){ runManager(); return; }
